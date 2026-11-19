// O prompt da mensagem do seguimento financeiro.
//
// Segue o prompt-base escrito pelo time em 19/11/2026: tom, destaques,
// fluidez, regras e nota interna ao Mattheus. O que não veio dele e continua
// aqui é o que a tela sabe e o texto-base não tinha como saber: a situação da
// parcela, a diferença entre falar com o contratante e falar com o
// palestrante, e o teto de três tentativas por canal.
//
// Separado de lib/prompt.js porque é outra conversa. Lá é prospecção. Aqui é
// dinheiro combinado e não pago, ou prestes a vencer.
//
// Nada aqui toca rede.
import { regraDeAbertura, PROIBIDO_ENROLAR } from "./prompt-comum.js";

// A saída de cada canal. Um canal por geração, porque é assim que a tela
// funciona: a pessoa escolhe WhatsApp, e-mail ou ligação e recebe aquele
// texto. A nota interna vem junto nos três e é separada antes do envio.
const FORMATO = {
  whatsapp: [
    "FORMATO DA SAÍDA, nesta ordem e com estes rótulos:",
    "'WHATSAPP:' e, na linha seguinte, a mensagem, até 500 caracteres.",
    "Abre com 'Olá, [primeiro nome]' e diz do que se trata na linha seguinte.",
    "Termina com uma pergunta fechada, que se responde com sim, não ou uma data.",
    "Sem gírias, sem emoji e sem assinatura.",
    "Negrito com *asterisco* em no máximo 3 informações-chave.",
    "Depois, 'NOTA INTERNA:' e uma linha.",
  ].join(" "),
  email: [
    "FORMATO DA SAÍDA, nesta ordem e com estes rótulos:",
    "'ASSUNTO:' e o assunto na mesma linha, citando o cliente e o que está sendo tratado, nunca genérico como 'Cobrança'.",
    "Depois 'E-MAIL:' e, a partir da linha seguinte, o corpo:",
    "saudação 'Prezado(a) [Nome]'; um parágrafo que situa de que evento e de que valor se trata;",
    "um parágrafo com o pedido concreto e o porquê dele; uma pergunta fechada de fechamento;",
    "despedida e, nas últimas linhas, a assinatura.",
    "Negrito em no máximo 5 informações-chave.",
    "Depois, 'NOTA INTERNA:' e uma linha.",
  ].join(" "),
  ligacao: [
    "FORMATO DA SAÍDA, nesta ordem e com estes rótulos:",
    "'LIGAÇÃO:' e, nas linhas seguintes, um roteiro para falar ao telefone, não texto para enviar.",
    "Quatro blocos, cada um com o rótulo na frente e uma ou duas linhas:",
    "'Abertura:' o cumprimento, como se apresentar e situar de que evento se trata;",
    "'Situação:' a frase que diz o valor, a parcela e a data, sem rodeio;",
    "'Pedido:' o que você quer sair da ligação com;",
    "'Se não puder pagar agora:' a saída que combina uma data em vez de encerrar sem nada.",
    "Depois, 'NOTA INTERNA:' e uma linha.",
  ].join(" "),
};

const TOM = {
  1: "TOM DESTA TENTATIVA: primeira neste canal. Cordial e sem cobrança no tom, mesmo que a data já tenha passado. Não mencione tentativa anterior.",
  2: "TOM DESTA TENTATIVA: segunda neste canal. Firme e objetiva, deixando claro que a data passou, sem acusar e sem reclamar do silêncio.",
  3: "TOM DESTA TENTATIVA: terceira e última neste canal. Direta, curta, e já propondo uma data concreta para resolver.",
};

// Tom, destaques e fluidez vêm do prompt-base e valem em todo canal.
const BASE = [
  "TOM",
  "Português formal e cordial. No e-mail trate por 'Prezado(a) [Nome]'. No WhatsApp, 'Olá, [Nome]', sem gírias e sem emoji.",
  "Firme nos fatos, gentil na forma. Nunca use linguagem ameaçadora, irônica ou de culpa.",
  "Texto cordial e explicativo: contextualize cada pedido, explique por que ele importa e o que acontece em seguida. Quem lê tem que entender sem precisar perguntar nada.",
  "Parágrafos de até 5 linhas e um pedido principal por mensagem.",
  "Vocabulário profissional e sóbrio. Evite alegria, prazer, adorei, excelente, incrível e pontos de exclamação. Prefira Agradecemos, Registramos, Reforçamos, Ficamos à disposição.",
  "",
  "DESTAQUES",
  "Destaque nesta ordem de prioridade: nome do evento, palestrante, valor, vencimento, número da nota fiscal.",
  "Destaque só o dado, nunca a frase inteira.",
  "",
  "FLUIDEZ",
  "Escreva em frases corridas e conectadas, com ligações como Na sequência, Com isso, Após a assinatura.",
  "Use lista apenas para dados objetivos: valores, datas, itens e documentos.",
  "Próximo passo, explicação e combinado vão em parágrafo, nunca no formato 'Rótulo: item, item e item'.",
].join("\n");

const dataBR = (iso) =>
  iso ? `${String(iso).slice(8, 10)}/${String(iso).slice(5, 7)}/${String(iso).slice(0, 4)}` : "";

const emReais = (n) =>
  Number(n || 0) > 0
    ? Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    : "";

// Campos sem os quais a mensagem não deve ser escrita, pela regra 2 do
// prompt-base. A conta é feita aqui e não pelo modelo: dá para recusar antes
// de gastar a chamada, e o resultado é sempre o mesmo para os mesmos dados.
//
// O que é obrigatório muda com o destinatário. Cobrar o cliente sem valor e
// sem vencimento é mandar ele adivinhar quanto e quando. Já a mensagem ao
// palestrante não fala de parcela nenhuma, então nada disso faz falta nela.
export function faltamCampos({ ticket, cliente, palestrante, evento, destino, valor, data }) {
  const falta = [];
  if (!ticket) falta.push("número do ticket");
  if (!cliente) falta.push("cliente");
  if (!palestrante) falta.push("palestrante");
  if (!evento) falta.push("data do evento");
  if (destino !== "palestrante") {
    if (!(Number(valor) > 0)) falta.push("valor do contrato");
    if (!data) falta.push("data de vencimento");
  }
  return falta;
}

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
  ticket,
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
  notaFiscal,
  observacao,
  remetente,
  remetenteEmail,
  // Só o teste passa: em produção vale a hora de agora.
  agora,
}) {
  const paraPalestrante = destino === "palestrante";
  const valorTexto = emReais(valor);
  const cacheTexto = emReais(cache);

  const dados = [
    `Número do ticket: ${ticket || "não informado"}`,
    `Cliente contratante: ${cliente || "não informado"}`,
    palestrante ? `Palestrante do evento: ${palestrante}` : "",
    evento ? `Data do evento: ${dataBR(evento)}` : "",
    notaFiscal ? `Número da nota fiscal: ${notaFiscal}` : "",
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
    remetenteEmail ? `E-mail de quem assina: ${remetenteEmail}` : "",
  ];

  const regras = [
    // As do prompt-base.
    "Use somente os dados da FICHA acima. PROIBIDO inventar valor, data, número de nota fiscal, percentual ou dado bancário.",
    "A mensagem TEM que citar o número do ticket, o evento, o palestrante e a data. Sendo financeira, cita também valor e vencimento.",
    "PROIBIDO citar multa, juros ou percentual: não estão no sistema, e inventá-los é compromisso que a PSA não assumiu.",
    "Antes de falar de dinheiro, ancore no valor entregue: o evento que aconteceu e o palestrante que esteve lá.",
    "Feche com um próximo passo claro e uma porta aberta.",
    // A assinatura sai aqui porque o telefone do Financeiro não existe no
    // sistema, e o prompt-base o pedia: sem esta regra o modelo inventaria um.
    canal === "email"
      ? `A assinatura tem exatamente três linhas: o primeiro nome de quem assina, depois "Financeiro · PSA", depois o e-mail de quem assina. PROIBIDO inventar telefone: não há telefone cadastrado.`
      : "",
    "A NOTA INTERNA é endereçada ao Mattheus, não vai para o cliente, e diz o risco ou o cuidado deste caso e com quem ele precisa confirmar antes do envio.",
    // As que vêm da tela e o prompt-base não tinha como saber.
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
    paraPalestrante && !cacheTexto ? "O cachê não está no ticket. PROIBIDO inventar valor." : "",
    regraDeAbertura(canal, agora),
    PROIBIDO_ENROLAR,
    "Não use travessão.",
    "Não escreva nada entre parênteses: se a informação importa, ela entra na frase; se não importa, sai.",
    "Devolva apenas os blocos pedidos, sem comentário e sem aspas em volta.",
  ];

  return [
    "Você é o assistente de comunicação do Diário de Bordo da PSA, que conecta empresas a palestrantes para eventos corporativos.",
    "O cliente contratou uma palestra, e a comunicação financeira faz parte da experiência que ele teve com a PSA.",
    "Você escreve na primeira pessoa, em português do Brasil, para quem é responsável por este pagamento.",
    "",
    BASE,
    "",
    ...(contextoBase ? ["CONTEXTO DA PSA E DO PROCESSO", contextoBase.trim(), ""] : []),
    "FICHA DESTE TICKET",
    ...dados.filter(Boolean),
    "",
    "REGRAS",
    ...regras.filter(Boolean),
    "",
    FORMATO[canal] || FORMATO.whatsapp,
    TOM[Math.min(3, Math.max(1, Number(tentativa) || 1))],
  ].join("\n");
}
