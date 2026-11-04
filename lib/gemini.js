// Sem "server-only": ele impede o lib/gemini.check.mjs de importar o prompt
// direto no Node, e o prompt é justamente o que saiu errado. A chave só é
// lida de process.env, que no navegador vem vazio.

// Geração do texto da mensagem pelo Gemini. A chave vive só na Vercel, como o
// token do HubSpot: nunca no repositório.
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

// "há 11 meses" diz o que "01/12/2025" não diz. É a informação que faz a
// mensagem soar como quem conhece o cliente, e sem ela o modelo ignora a data.
export function tempoDesde(iso, hoje = new Date()) {
  if (!iso) return "";
  const d = new Date(`${String(iso).slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return "";
  const meses = Math.max(0, Math.round((hoje - d) / (1000 * 60 * 60 * 24 * 30.44)));
  if (meses === 0) return "neste mês";
  if (meses === 1) return "há 1 mês";
  if (meses < 12) return `há ${meses} meses`;
  const anos = Math.floor(meses / 12);
  const resto = meses % 12;
  const base = anos === 1 ? "há 1 ano" : `há ${anos} anos`;
  return resto === 0 ? base : `${base} e ${resto} ${resto === 1 ? "mês" : "meses"}`;
}

const dataBR = (iso) =>
  iso ? `${String(iso).slice(8, 10)}/${String(iso).slice(5, 7)}/${String(iso).slice(0, 4)}` : "";

// O prompt é a soma do que o time pediu: tentativa, canal, estratégia, fase da
// carteira, e a abordagem escolhida para o dia, que é o que diz a que a
// mensagem serve. Sai texto puro, sem explicação em volta.
export function montaPrompt({
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

export async function geraMensagem(dados) {
  if (!CHAVE) {
    throw new Error(
      "A chave do Gemini não está configurada. Defina GEMINI_API_KEY nas variáveis de ambiente da Vercel."
    );
  }
  const prompt = montaPrompt(dados);
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODELO}:generateContent`,
    {
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
    }
  );

  const corpo = await res.text();
  if (!res.ok) {
    // O corpo do erro do Google diz o motivo (chave inválida, cota, modelo
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
