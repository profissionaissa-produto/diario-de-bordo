// Sem "server-only": ele impede o lib/gemini.check.mjs de importar o prompt
// direto no Node, e o prompt é justamente o que saiu errado. A chave só é
// lida de process.env, que no navegador vem vazio.

// Geração do texto da mensagem pelo Gemini. A chave vive só na Vercel, como o
// token do HubSpot: nunca no repositório.
import { tempoDesde } from "./tempo.js";
export { tempoDesde };

const CHAVE = process.env.GEMINI_API_KEY || "";
const MODELO = process.env.GEMINI_MODELO || "gemini-2.5-flash";

export const geminiPronto = () => !!CHAVE;

const FORMATO = {
  whatsapp: [
    "FORMATO: mensagem de WhatsApp, 3 a 5 linhas curtas.",
    "Abre chamando a pessoa pelo primeiro nome e já entra no assunto na mesma linha ou na seguinte.",
    "Termina com uma pergunta fechada, que se responde com sim ou não ou com uma data.",
    "Sem saudação formal, sem assinatura, sem emoji. No máximo uma expressão em *negrito*.",
  ].join(" "),
  email: [
    "FORMATO: e-mail.",
    "Primeira linha exatamente 'Assunto: ...', com um assunto específico desta empresa, nunca genérico como 'Retomada de contato'.",
    "Depois, nesta ordem: saudação com o primeiro nome; um parágrafo que amarra o tempo desde a última compra ao objetivo de hoje; um parágrafo com o que você está propondo em concreto; uma pergunta fechada de fechamento; despedida com o seu primeiro nome e 'PSA'.",
    "Entre 6 e 12 linhas no total.",
  ].join(" "),
  ligacao: [
    "FORMATO: roteiro para o farmer falar ao telefone, não texto para enviar.",
    "Quatro blocos, cada um com o rótulo na frente e uma ou duas linhas:",
    "'Abertura:' como se apresentar e lembrar quem é;",
    "'Contexto:' a frase que amarra o tempo desde a última compra;",
    "'Proposta:' o que você quer oferecer ou marcar;",
    "'Se disser não:' uma saída que mantém a porta aberta.",
  ].join(" "),
};

const TOM = {
  1: "TOM: primeira tentativa neste canal. Leve, sem cobrança, e não mencione tentativa anterior.",
  2: "TOM: segunda tentativa neste canal. Retoma por um ângulo diferente do óbvio, sem soar insistente e sem reclamar do silêncio.",
  3: "TOM: terceira e última tentativa neste canal. Direta e curta, dando uma saída fácil para a pessoa responder sim ou não.",
};


const dataBR = (iso) =>
  iso ? `${String(iso).slice(8, 10)}/${String(iso).slice(5, 7)}/${String(iso).slice(0, 4)}` : "";

// O prompt é a soma do que o time pediu: tentativa, canal, estratégia, fase da
// carteira, e a abordagem escolhida para o dia, que é o que diz a que a
// mensagem serve. Sai texto puro, sem explicação em volta.
export function montaPrompt({
  contextoBase,
  empresa,
  contato,
  canal,
  tentativa,
  estrategia,
  abordagem,
  objetivoAbordagem,
  fase,
  faseFaixa,
  ultimaCompra,
  observacao,
}) {
  const desde = tempoDesde(ultimaCompra);

  const dados = [
    `Empresa: ${empresa || "não informada"}`,
    `Pessoa: ${contato?.nome || "não informada"}${contato?.cargo ? `, ${contato.cargo}` : ""}`,
    ultimaCompra
      ? `Última compra: ${dataBR(ultimaCompra)}, ou seja, ${desde}.`
      : "Nunca comprou: é uma empresa que ainda não contratou nada com a PSA.",
    fase ? `Fase na carteira: ${fase}${faseFaixa ? ` (${faseFaixa} desde a última compra)` : ""}.` : "",
    abordagem
      ? `Abordagem definida para hoje: ${abordagem}. O objetivo dela é ${objetivoAbordagem || "o que o próprio nome diz"}.`
      : "Sem abordagem definida: trate como retomada de relacionamento.",
    estrategia
      ? `Estratégia escolhida: ${estrategia.titulo}. Quando ela se aplica: ${estrategia.desc}`
      : "",
    observacao ? `O farmer anotou sobre esta empresa: ${observacao}` : "",
    `Canal: ${canal}. Tentativa ${tentativa} de 3 neste canal.`,
  ];

  const regras = [
    desde
      ? `A mensagem TEM que deixar claro que você sabe há quanto tempo foi a última vez. Escreva "${desde}", nunca a data crua.`
      : "A mensagem TEM que deixar claro que esta empresa ainda não contratou nada, sem soar como abordagem fria de quem nunca falou com ela.",
    abordagem
      ? `A mensagem TEM que servir ao objetivo da abordagem de hoje (${abordagem}). Se ela pudesse ter sido escrita para qualquer outra abordagem, está errada.`
      : "",
    "PROIBIDO abertura vazia: nada de \"tudo bem?\", \"espero que esteja tudo certo\", \"passando para saber\", \"fico pensando aqui\", \"faz tempo que não nos falamos\" sem dizer quanto tempo.",
    "PROIBIDO inventar: nome de palestrante, evento, data, valor, resultado, case ou promessa que não esteja nos dados acima.",
    "Não use travessão.",
    "Devolva apenas o texto final, sem comentário, sem aspas em volta e sem título.",
  ];

  return [
    "Você escreve para o time de Customer Success da PSA, que conecta empresas a palestrantes para eventos corporativos.",
    "Você é o farmer que cuida desta conta e está falando na primeira pessoa, em português do Brasil.",
    "",
    // O que o time escreveu uma vez e vale para toda mensagem. Vem antes dos
    // dados da empresa de propósito: é o chão que o modelo pisa quando o caso
    // concreto não diz o suficiente.
    ...(contextoBase ? ["CONTEXTO DA PSA E DO PROCESSO", contextoBase.trim(), ""] : []),
    "DADOS DESTA EMPRESA",
    ...dados.filter(Boolean),
    "",
    "REGRAS",
    ...regras.filter(Boolean),
    "",
    FORMATO[canal] || FORMATO.whatsapp,
    TOM[Math.min(3, Math.max(1, Number(tentativa) || 1))],
  ].join("\n");
}

// O 429 do Google vem com o motivo dentro: se é limite por minuto ou cota
// do dia, e quanto esperar. Sem ler isso a tela dizia 'veja o log', que não
// serve para quem está com a janela aberta.
export function leErroDeCota(corpo) {
  let e = {};
  try {
    e = JSON.parse(corpo)?.error || {};
  } catch {
    // Corpo que não é JSON não tem o que extrair; segue com o padrão.
  }
  const detalhes = e.details || [];
  const retry = detalhes.find((d) => String(d["@type"]).endsWith("RetryInfo"))?.retryDelay || "";
  const segundos = Number(String(retry).replace(/[^0-9.]/g, "")) || 0;
  const violacoes = detalhes.find((d) => String(d["@type"]).endsWith("QuotaFailure"))?.violations || [];
  const ids = violacoes.map((v) => String(v.quotaId || "")).join(" ");
  const porDia = /PerDay/i.test(ids);
  return {
    segundos,
    porDia,
    mensagem: porDia
      ? "A cota diária do Gemini acabou. A geração volta amanhã, ou é preciso subir o plano da chave."
      : segundos
        ? `O Gemini bloqueou por excesso de chamadas seguidas. Tente de novo em ${Math.ceil(segundos)} segundos.`
        : "O Gemini bloqueou por excesso de chamadas seguidas. Espere alguns segundos e tente de novo.",
  };
}

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

export async function geraMensagem(dados) {
  if (!CHAVE) {
    throw new Error(
      "A chave do Gemini não está configurada. Defina GEMINI_API_KEY nas variáveis de ambiente da Vercel."
    );
  }
  const prompt = montaPrompt(dados);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODELO}:generateContent`;
  const pedido = {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": CHAVE },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.8,
          // Os modelos 2.5 raciocinam antes de responder, e esse raciocínio
          // gasta do mesmo teto da resposta. Com 700 o modelo pensava e a
          // mensagem era cortada no meio da frase. Desligar o raciocínio
          // resolve a causa; o teto maior é a rede de segurança.
          thinkingConfig: { thinkingBudget: 0 },
          maxOutputTokens: 2000,
        },
      }),
    };
  let res = await fetch(url, pedido);

  let corpo = await res.text();

  // 429 é limite de chamadas, não defeito do pedido. Quando o Google diz
  // quanto esperar e é pouco, esperar e repetir resolve sem a pessoa saber.
  if (res.status === 429) {
    const cota = leErroDeCota(corpo);
    console.error(`[gemini] 429 (${cota.porDia ? "cota do dia" : "limite por minuto"}): ${corpo.slice(0, 400)}`);
    if (!cota.porDia && cota.segundos > 0 && cota.segundos <= 30) {
      await espera(cota.segundos * 1000 + 500);
      res = await fetch(url, pedido);
      corpo = await res.text();
    }
    if (!res.ok) throw new Error(cota.mensagem);
  }

  if (!res.ok) {
    // O corpo do erro do Google diz o motivo (chave inválida, modelo
    // inexistente). Engolir isso devolveria "falhou" e ninguém saberia o quê.
    console.error(`[gemini] ${res.status}: ${corpo.slice(0, 500)}`);
    throw new Error(`O Gemini recusou a geração (HTTP ${res.status}). Veja o log para o motivo.`);
  }

  let json;
  try {
    json = JSON.parse(corpo);
  } catch {
    console.error("[gemini] resposta não é JSON:", corpo.slice(0, 500));
    throw new Error("O Gemini devolveu uma resposta que não dá para ler.");
  }

  const candidato = json.candidates?.[0];
  const motivo = candidato?.finishReason || json.promptFeedback?.blockReason || "";
  const texto = (candidato?.content?.parts || [])
    .map((p) => p.text || "")
    .join("")
    .trim();

  if (!texto) {
    console.error("[gemini] veio vazio:", motivo || "sem motivo informado", corpo.slice(0, 500));
    throw new Error(`O Gemini não devolveu texto (${motivo || "sem motivo informado"}). Tente de novo ou escreva à mão.`);
  }

  // Texto cortado no meio da frase é pior do que erro: ele parece pronto e
  // alguém manda assim para o cliente. STOP é o único fim que vale.
  if (motivo && motivo !== "STOP") {
    console.error(`[gemini] geração interrompida (${motivo}). Uso:`, JSON.stringify(json.usageMetadata || {}));
    if (motivo === "MAX_TOKENS") {
      throw new Error("O Gemini cortou a mensagem no meio por limite de tamanho. Clique em Gerar de novo.");
    }
    throw new Error(`O Gemini interrompeu a geração (${motivo}). Clique em Gerar de novo.`);
  }

  return texto;
}
