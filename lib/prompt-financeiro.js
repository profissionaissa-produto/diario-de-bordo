// O prompt da mensagem do seguimento financeiro.
//
// Separado de lib/prompt.js porque é outra conversa. Lá é prospecção: fala de
// última compra, de fase na carteira e termina propondo uma reunião. Aqui é
// dinheiro combinado e não pago, ou prestes a vencer, e o que o texto precisa
// carregar é o valor, a data, a parcela e o tom da tentativa.
//
// Os critérios são os que o time pediu: abordagem, estratégia, etapa, se vai
// para o contratante ou para o palestrante, e se a parcela está vencida ou
// prevista. Nada aqui toca rede.

const FORMATO = {
  whatsapp: [
    "FORMATO: mensagem de WhatsApp, 3 a 5 linhas curtas.",
    "Abre chamando a pessoa pelo primeiro nome e já diz do que se trata na mesma linha ou na seguinte.",
    "Termina com uma pergunta fechada, que se responde com sim, não ou uma data.",
    "Sem saudação formal, sem assinatura, sem emoji. No máximo uma expressão em *negrito*.",
  ].join(" "),
  email: [
    "FORMATO: e-mail.",
    "Primeira linha exatamente 'Assunto: ...', citando o cliente e o que está sendo tratado, nunca genérico como 'Cobrança'.",
    "Depois, nesta ordem: saudação com o primeiro nome; um parágrafo que situa de que evento e de que valor se trata;",
    "um parágrafo com o pedido concreto; uma pergunta fechada de fechamento; despedida com o seu primeiro nome e 'Financeiro PSA'.",
    "Entre 6 e 12 linhas no total.",
  ].join(" "),
  ligacao: [
    "FORMATO: roteiro para falar ao telefone, não texto para enviar.",
    "Quatro blocos, cada um com o rótulo na frente e uma ou duas linhas:",
    "'Abertura:' como se apresentar e situar de que evento se trata;",
    "'Situação:' a frase que diz o valor, a parcela e a data, sem rodeio;",
    "'Pedido:' o que você quer sair da ligação com;",
    "'Se não puder pagar agora:' a saída que combina uma data em vez de encerrar sem nada.",
  ].join(" "),
};

const TOM = {
  1: "TOM: primeira tentativa neste canal. Cordial e sem cobrança no tom, mesmo que a data já tenha passado. Não mencione tentativa anterior.",
  2: "TOM: segunda tentativa neste canal. Firme e objetiva, deixando claro que a data passou, sem acusar e sem reclamar do silêncio.",
  3: "TOM: terceira e última tentativa neste canal. Direta, curta, e já propondo uma data concreta para resolver.",
};

const dataBR = (iso) =>
  iso ? `${String(iso).slice(8, 10)}/${String(iso).slice(5, 7)}/${String(iso).slice(0, 4)}` : "";

const emReais = (n) =>
  Number(n || 0) > 0
    ? Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    : "";

// Como a situação da parcela entra no texto. É o que separa lembrete de
// cobrança, e sem isto o modelo escreve "está em atraso" para quem ainda tem
// cinco dias, ou "lembrete" para quem deve há um ano.
function situacaoEmTexto({ situacao, dias, parcela, totalParcelas, data }) {
  const qual =
    totalParcelas > 1 ? `a ${parcela}ª parcela de ${totalParcelas}` : "o pagamento";
  if (situacao === "vencida") {
    const d = Math.abs(Number(dias) || 0);
    return `${qual} venceu em ${dataBR(data)}, há ${d} dia${d === 1 ? "" : "s"}, e não foi identificado.`;
  }
  if (situacao === "hoje") return `${qual} vence hoje, ${dataBR(data)}.`;
  if (situacao === "prevista") {
    const d = Math.abs(Number(dias) || 0);
    return `${qual} vence em ${dataBR(data)}, daqui a ${d} dia${d === 1 ? "" : "s"}.`;
  }
  return `não há data de pagamento combinada no ticket para ${qual}.`;
}

// O palestrante não tem parcela a vencer: ele não deve nada. O que existe do
// lado dele é a PSA esperando a nota fiscal para poder pagar o cachê. Falar da
// parcela do cliente numa mensagem para ele mistura duas contas diferentes.
function situacaoDoPalestrante(pagamentoPalestrante) {
  return pagamentoPalestrante
    ? `a PSA tem o pagamento do cachê previsto para ${dataBR(pagamentoPalestrante)} e está esperando a nota fiscal para liberar.`
    : "a PSA está esperando a nota fiscal para liberar o pagamento do cachê.";
}

export function montaPromptFinanceiro({
  contextoBase,
  cliente,
  palestrante,
  evento,
  etapa,
  destino,
  contato,
  porAssessoria,
  pagamentoPalestrante,
  canal,
  tentativa,
  abordagem,
  estrategia,
  situacao,
  dias,
  parcela,
  totalParcelas,
  data,
  valor,
  cache,
  observacao,
  remetente,
}) {
  const paraPalestrante = destino === "palestrante";
  const valorTexto = emReais(valor);
  const cacheTexto = emReais(cache);

  const dados = [
    `Cliente contratante: ${cliente || "não informado"}`,
    palestrante ? `Palestrante do evento: ${palestrante}` : "",
    evento ? `Data do evento: ${dataBR(evento)}` : "",
    `Etapa do ticket: ${etapa || "não informada"}.`,
    paraPalestrante && porAssessoria
      ? `Quem recebe: ${contato?.nome || "não informado"}, que é a ASSESSORIA do palestrante ${palestrante || ""}. Foi ele quem pediu que o contato passasse por ela.`
      : paraPalestrante
        ? `Quem recebe: ${contato?.nome || "não informado"}, do lado do PALESTRANTE. A PSA precisa da nota fiscal dele para liberar o pagamento do cachê.`
        : `Quem recebe: ${contato?.nome || "não informado"}${contato?.cargo ? `, ${contato.cargo}` : ""}, do lado do CLIENTE CONTRATANTE, que é quem paga a PSA.`,
    `Situação: ${
      paraPalestrante
        ? situacaoDoPalestrante(pagamentoPalestrante)
        : situacaoEmTexto({ situacao, dias, parcela, totalParcelas, data })
    }`,
    !paraPalestrante && valorTexto ? `Valor total do contrato: ${valorTexto}.` : "",
    paraPalestrante && cacheTexto ? `Cachê a pagar ao palestrante: ${cacheTexto}.` : "",
    `O que vai ser feito hoje: ${abordagem || "cobrança"}.`,
    estrategia
      ? `Estratégia desta tentativa: ${estrategia.titulo}. Como ela manda agir: ${estrategia.desc}`
      : "",
    observacao ? `Anotação de quem está tratando: ${observacao}` : "",
    `Canal: ${canal}. Tentativa ${tentativa} de 3 neste canal.`,
    remetente ? `Quem assina: ${remetente}, do Financeiro da PSA.` : "",
  ];

  const regras = [
    "A mensagem TEM que dizer de que evento se trata, com o nome do cliente e do palestrante, para quem recebe saber na primeira linha a que se refere.",
    paraPalestrante
      ? "PROIBIDO falar de parcela, de vencimento ou de atraso: quem deve é o cliente, e isso não é assunto do palestrante."
      : "",
    !paraPalestrante && situacao === "vencida"
      ? "A mensagem TEM que dizer que a data já passou e há quantos dias, com a data escrita. Não use rodeio como \"consta em aberto\" sem dizer desde quando."
      : "",
    !paraPalestrante && situacao === "prevista"
      ? "A data ainda não chegou: é lembrete, não cobrança. PROIBIDO escrever atraso, pendência, inadimplência ou qualquer palavra que acuse."
      : "",
    !paraPalestrante && situacao === "sem-data"
      ? "Não há data combinada no ticket: a mensagem serve para combinar uma, nunca para cobrar uma data que ninguém acordou."
      : "",
    paraPalestrante
      ? "Quem recebe é o palestrante ou o escritório dele. PROIBIDO tratá-lo como devedor: a PSA é quem vai pagar, e o que falta é a nota fiscal para isso acontecer."
      : "",
    paraPalestrante && porAssessoria
      ? "Fale com a assessoria na terceira pessoa sobre o palestrante, nunca como se ela fosse ele."
      : "",
    !paraPalestrante && !valorTexto
      ? "O valor não está preenchido no ticket. PROIBIDO inventar valor: escreva a mensagem sem citar quantia."
      : "",
    paraPalestrante && !cacheTexto
      ? "O cachê não está preenchido no ticket. PROIBIDO inventar valor."
      : "",
    "PROIBIDO citar multa, juros ou percentual: esses números não estão no sistema e inventá-los é compromisso que a PSA não assumiu.",
    "PROIBIDO inventar: número de nota, dados bancários, chave PIX, nome de banco, data de pagamento que não esteja acima.",
    "PROIBIDO abertura vazia: nada de \"tudo bem?\", \"espero que esteja tudo certo\", \"passando para saber\".",
    "Não use travessão.",
    "Não escreva nada entre parênteses: se a informação importa, ela entra na frase; se não importa, sai.",
    "Devolva apenas o texto final, sem comentário, sem aspas em volta e sem título.",
  ];

  return [
    "Você trabalha no Financeiro da PSA, que conecta empresas a palestrantes para eventos corporativos.",
    "Você está falando na primeira pessoa, em português do Brasil, com quem é responsável por este pagamento.",
    "",
    ...(contextoBase ? ["CONTEXTO DA PSA E DO PROCESSO", contextoBase.trim(), ""] : []),
    "DADOS DESTE TICKET",
    ...dados.filter(Boolean),
    "",
    "REGRAS",
    ...regras.filter(Boolean),
    "",
    FORMATO[canal] || FORMATO.whatsapp,
    TOM[Math.min(3, Math.max(1, Number(tentativa) || 1))],
  ].join("\n");
}
