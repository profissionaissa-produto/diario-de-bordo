// O prompt da mensagem de abordagem. Vive longe do provedor de propósito:
// ele é a parte que custou a ficar boa, e trocar de modelo não pode obrigar
// a reescrevê-lo. Gemini e OpenAI consomem este mesmo texto.
import { tempoDesde } from "./tempo.js";
import { regraDeAbertura, PROIBIDO_ENROLAR } from "./prompt-comum.js";

const FORMATO = {
  whatsapp: [
    "FORMATO: mensagem de WhatsApp, 3 a 5 linhas curtas.",
    "Abre cumprimentando pelo primeiro nome e entra no assunto na linha seguinte.",
    "Termina com uma pergunta fechada, que se responde com sim ou não ou com uma data.",
    "Sem assinatura e sem emoji. No máximo uma expressão em *negrito*.",
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
    "'Abertura:' o cumprimento, como se apresentar e lembrar quem é;",
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
  // A última contratação da empresa: tema e quem palestrou. É o que tira a
  // mensagem do genérico. Vem vazia em boa parte da base, e aí o prompt
  // proíbe inventar em vez de preencher com suposição.
  contratacao,
  observacao,
  // Só o teste passa: em produção vale a hora de agora, que é quando a
  // pessoa manda a mensagem.
  agora,
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
    // O que prova que a mensagem é sobre esta empresa e não sobre uma lista.
    contratacao?.palestrantes?.length
      ? `Na última contratação desta empresa, quem palestrou foi: ${contratacao.palestrantes.join(", ")}.`
      : "",
    contratacao?.tema ? `O tema daquele evento foi: ${contratacao.tema}.` : "",
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
    regraDeAbertura(canal, agora),
    PROIBIDO_ENROLAR,
    "PROIBIDO dizer \"faz tempo que não nos falamos\" sem dizer quanto tempo.",
    "PROIBIDO inventar: nome de palestrante, evento, data, valor, resultado, case ou promessa que não esteja nos dados acima.",
    // O farmer abre a conversa e descobre se há evento. Quem monta proposta é
    // o closer. A mensagem que saía oferecia palestra de 60 minutos com
    // roteiro pronto, que não é papel de quem manda.
    "VOCÊ NÃO FAZ PROPOSTA. PROIBIDO oferecer palestra, formato, duração, conteúdo, roteiro ou pacote, e PROIBIDO dizer que vai mandar proposta. Seu papel é reabrir a conversa e descobrir se existe evento no radar. Quem monta proposta é o closer, depois.",
    // O papel, escrito por inteiro. Sem isto o modelo se oferecia para
    // "ajudar com palestrante", que é dizer ao cliente que quem escreve vai
    // subir no palco ou escolher quem sobe. Visto em 27/11/2026 na Meta
    // Assessoria.
    "SEU PAPEL É DESCOBRIR TRÊS COISAS, e a mensagem existe para isso: se há evento nos próximos meses, sobre o que ele é, e quando. Nada além disso.",
    "VOCÊ NÃO INDICA PALESTRANTE. PROIBIDO se oferecer para ajudar com palestrante, sugerir nome, recomendar, orientar escolha ou dizer que tem alguém para o tema. Quem escolhe e oferece palestrante é a curadoria, depois que você levar a demanda. Você não palestra e não monta grade.",
    // A abordagem do dia é decisão interna. Dizer ao cliente que ele está numa
    // ação de reativação entrega que a mensagem saiu de uma lista.
    "PROIBIDO contar ao cliente a estratégia ou a abordagem que você está usando. Nada de falar em ação para reativar clientes parados, campanha de reativação ou qualquer frase que mostre que ele entrou numa lista. A mensagem tem que soar sobre ele, não sobre um lote.",
    // A proibição acima não bastava: o modelo tirava a palavra "campanha" e
    // escrevia "para a gente tentar reativar esse cliente", falando DO cliente
    // em terceira pessoa para o próprio cliente, como se ele fosse colega de
    // trabalho. Visto em 27/11/2026 na Meta Assessoria.
    "VOCÊ ESTÁ FALANDO COM O CLIENTE, não sobre ele. PROIBIDO escrever \"esse cliente\", \"o cliente\", \"essa conta\" ou qualquer terceira pessoa para se referir a quem vai ler. É sempre \"você\" e \"vocês\".",
    "PROIBIDO usar no texto o vocabulário interno do processo: reativar, reativação, retomada, carteira, nutrição, recompra, oportunidade, prospecção, abordagem, estratégia, follow. São palavras nossas e entregam que a mensagem saiu de um processo, não de uma lembrança.",
    // Citar quem já palestrou é LEMBRANÇA do que aconteceu. Oferecer
    // palestrante é proposta, e proposta não é sua. O modelo misturou as duas
    // e escreveu que ia "ajudar com palestrante"; a regra separa.
    contratacao?.palestrantes?.length
      ? `A mensagem TEM que citar pelo nome quem palestrou na última contratação: ${contratacao.palestrantes.join(", ")}. Isso entra como LEMBRANÇA do evento que já aconteceu, para mostrar que você conhece a conta. PROIBIDO usar esse nome como oferta, sugestão ou indicação para um próximo evento.`
      : "Não há registro de quem palestrou na última contratação. PROIBIDO inventar nome de palestrante e PROIBIDO escrever frase genérica de reativação: pergunte pelo que mudou na empresa desde então.",
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
