// O prompt da mensagem de abordagem. Vive longe do provedor de propósito:
// ele é a parte que custou a ficar boa, e trocar de modelo não pode obrigar
// a reescrevê-lo. Gemini e OpenAI consomem este mesmo texto.
import { tempoDesde } from "./tempo.js";

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
