// O prompt da mensagem do closer, B2B e B2C.
//
// Terceiro prompt do painel, e separado pelo mesmo motivo dos outros dois: é
// outra conversa. O da carteira fala de última compra e fase; o do financeiro
// fala de parcela vencida. Aqui o assunto é um negócio em andamento, e o que
// move o texto é a distância entre onde ele está e onde o closer quer levá-lo.
//
// Os critérios são os que o time pediu: etapa atual, próxima atividade,
// estratégia, evolução pretendida, mais o que foi conversado na reunião.
//
// Nada aqui toca rede.

const FORMATO = {
  whatsapp: [
    "FORMATO: mensagem de WhatsApp, 3 a 5 linhas curtas.",
    "Abre chamando a pessoa pelo primeiro nome e já retoma o assunto na mesma linha ou na seguinte.",
    "Termina com uma pergunta fechada, que se responde com sim, não ou uma data.",
    "Sem saudação formal, sem assinatura, sem emoji. No máximo uma expressão em *negrito*.",
  ].join(" "),
  email: [
    "FORMATO: e-mail.",
    "Primeira linha exatamente 'Assunto: ...', específico deste cliente e deste momento, nunca genérico como 'Retomada'.",
    "Depois, nesta ordem: saudação com o primeiro nome; um parágrafo que retoma o que ficou combinado;",
    "um parágrafo com o que você está propondo agora; uma pergunta fechada de fechamento; despedida com o seu primeiro nome e 'PSA'.",
    "Entre 6 e 12 linhas no total.",
  ].join(" "),
  ligacao: [
    "FORMATO: roteiro para o closer falar ao telefone, não texto para enviar.",
    "Quatro blocos, cada um com o rótulo na frente e uma ou duas linhas:",
    "'Abertura:' como retomar sem parecer cobrança;",
    "'Contexto:' a frase que amarra o que ficou combinado na última conversa;",
    "'Proposta:' o que você quer sair da ligação com;",
    "'Se disser não:' uma saída que mantém a porta aberta e marca o próximo passo.",
  ].join(" "),
};

const TOM = {
  1: "TOM: primeira tentativa neste canal. Leve, sem cobrança, e não mencione tentativa anterior.",
  2: "TOM: segunda tentativa neste canal. Retoma por um ângulo diferente do óbvio, sem soar insistente e sem reclamar do silêncio.",
  3: "TOM: terceira e última tentativa neste canal. Direta e curta, dando uma saída fácil para a pessoa responder sim ou não.",
};

// O que cada temperatura quer dizer, e o que a mensagem tem que fazer para
// levar o negócio de uma para a outra. Sem isto o modelo lê dois rótulos de
// sistema e não sabe que distância está sendo pedida.
const TEMPERATURA = {
  "Forecast": "o cliente já decidiu comprar e o que falta é fechar",
  "Vou vender": "o closer tem confiança alta de que fecha, mas ainda falta o aceite",
  "Café com leite": "conversa morna, o cliente não se comprometeu com nada",
  "Não levo fé": "praticamente perdido, o closer já não aposta nele",
  "Larguei de mão": "praticamente perdido, o closer já não aposta nele",
};

const dataBR = (iso) =>
  iso ? `${String(iso).slice(8, 10)}/${String(iso).slice(5, 7)}/${String(iso).slice(0, 4)}` : "";

// O que foi conversado, na forma mais curta que existir.
//
// O resumo do Copiloto tem preferência sobre a transcrição crua: ele já vem
// destilado em Conexão, Diagnóstico, Solução e Combinado, com mediana de 890
// caracteres, enquanto a transcrição vai a 51 mil. Mandar a conversa inteira
// custa caro e piora, porque o modelo se perde no meio dela.
//
// Da transcrição vale o FIM, que é onde fica o combinado. O começo é
// apresentação e small talk.
export const TETO_TRANSCRICAO = 4000;
export function conversaEmTexto({ resumoReuniao, transcricao }) {
  const resumo = String(resumoReuniao || "").trim();
  if (resumo.length > 40) return { texto: resumo, fonte: "resumo" };

  const bruta = String(transcricao || "").trim();
  // Registro de 2 caracteres é sujeira, e existe: o mínimo medido foi 2.
  if (bruta.length < 200) return { texto: "", fonte: "" };
  return {
    texto: bruta.length > TETO_TRANSCRICAO ? bruta.slice(-TETO_TRANSCRICAO) : bruta,
    fonte: bruta.length > TETO_TRANSCRICAO ? "transcricao-fim" : "transcricao",
  };
}

export function montaPromptCloser({
  contextoBase,
  negocio,
  etapa,
  contato,
  canal,
  tentativa,
  estrategia,
  temperaturaAtual,
  temperaturaPretendida,
  proximaAtividade,
  proximoPasso,
  observacao,
  resumoReuniao,
  transcricao,
  valor,
  eventoEm,
  remetente,
}) {
  const conversa = conversaEmTexto({ resumoReuniao, transcricao });
  const de = TEMPERATURA[temperaturaAtual];
  const para = TEMPERATURA[temperaturaPretendida];

  const dados = [
    `Negócio: ${negocio || "não informado"}`,
    `Etapa atual no funil: ${etapa || "não informada"}.`,
    `Pessoa: ${contato?.nome || "não informada"}${contato?.cargo ? `, ${contato.cargo}` : ""}${
      contato?.papel === "DECISION_MAKER" ? ", que é quem decide" : ""
    }`,
    eventoEm ? `Data prevista do evento: ${dataBR(eventoEm)}.` : "",
    valor ? `Valor em negociação: ${Number(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}.` : "",
    temperaturaAtual
      ? `Como está hoje: "${temperaturaAtual}"${de ? `, ou seja, ${de}` : ""}.`
      : "",
    temperaturaPretendida
      ? `Para onde o closer quer levar hoje: "${temperaturaPretendida}"${para ? `, ou seja, ${para}` : ""}.`
      : "",
    proximoPasso ? `Próximo passo anotado no CRM: ${proximoPasso}` : "",
    proximaAtividade ? `Próxima atividade marcada para ${dataBR(proximaAtividade)}.` : "",
    estrategia
      ? `Estratégia escolhida: ${estrategia.titulo}. Quando ela se aplica: ${estrategia.desc}`
      : "",
    observacao ? `O closer anotou sobre este negócio: ${observacao}` : "",
    `Canal: ${canal}. Tentativa ${tentativa} de 3 neste canal.`,
    remetente ? `Quem assina: ${remetente}.` : "",
  ];

  const regras = [
    conversa.texto
      ? "A mensagem TEM que retomar o que ficou combinado na última conversa, abaixo. É o que separa um follow de verdade de um \"passando para saber\"."
      : "Não há registro da última conversa. PROIBIDO inventar o que foi falado, prometido ou combinado.",
    temperaturaPretendida
      ? `A mensagem TEM que servir para mover este negócio para "${temperaturaPretendida}". Se ela pudesse ter sido escrita para qualquer outro negócio, está errada.`
      : "",
    estrategia
      ? `A mensagem TEM que executar a estratégia escolhida (${estrategia.titulo}), e não só mencioná-la.`
      : "",
    "PROIBIDO usar a linguagem interna do CRM: não escreva temperatura, forecast, funil, etapa, estratégia, pipeline nem nada que só faça sentido para quem trabalha aqui.",
    "PROIBIDO inventar: nome de palestrante, valor, data, desconto, disponibilidade ou promessa que não esteja nos dados acima.",
    "PROIBIDO abertura vazia: nada de \"tudo bem?\", \"espero que esteja tudo certo\", \"passando para saber\".",
    "Não use travessão.",
    "Não escreva nada entre parênteses: se a informação importa, ela entra na frase; se não importa, sai.",
    "Devolva apenas o texto final, sem comentário, sem aspas em volta e sem título.",
  ];

  return [
    "Você é closer da PSA, que conecta empresas a palestrantes para eventos corporativos.",
    "Você está falando na primeira pessoa, em português do Brasil, com um cliente que já conversou com você.",
    "",
    ...(contextoBase ? ["CONTEXTO DA PSA E DO PROCESSO", contextoBase.trim(), ""] : []),
    "DADOS DESTE NEGÓCIO",
    ...dados.filter(Boolean),
    "",
    ...(conversa.texto
      ? [
          conversa.fonte === "resumo"
            ? "RESUMO DA ÚLTIMA REUNIÃO"
            : conversa.fonte === "transcricao-fim"
              ? "TRECHO FINAL DA TRANSCRIÇÃO DA ÚLTIMA REUNIÃO, que é onde fica o combinado"
              : "TRANSCRIÇÃO DA ÚLTIMA REUNIÃO",
          conversa.texto,
          "",
        ]
      : []),
    "REGRAS",
    ...regras.filter(Boolean),
    "",
    FORMATO[canal] || FORMATO.whatsapp,
    TOM[Math.min(3, Math.max(1, Number(tentativa) || 1))],
  ].join("\n");
}
