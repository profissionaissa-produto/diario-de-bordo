// Seguimento financeiro: os mesmos tickets de CS, olhados pelo que o cliente
// combinou pagar.
//
// Por que não é só mais uma coluna da Tramitação: as duas telas fazem
// perguntas diferentes. A Tramitação pergunta qual etapa falta fechar, e
// colore pela régua da Sinaleira, que mede o pagamento contra a data do
// evento. Aqui a pergunta é outra: o que já venceu. A data combinada com o
// cliente mora em data_prevista_de_pagamento, preenchida em 99 de 100 tickets
// medidos em 08/11/2026, dentro dos 128 abertos nas quatro etapas financeiras.
//
// A cor do card continua vindo da Sinaleira, sem exceção. Duas réguas pintando
// o mesmo ticket de cores diferentes foi exatamente o defeito que apareceu em
// 05/11/2026, quando a logística ficava verde aqui e vermelha lá. O que esta
// tela acrescenta é a situação da parcela, que é outro eixo e fica ao lado.
//
// Nada aqui toca rede: recebe o ticket já lido e devolve o que dizer dele.

import { ETAPAS_TICKET, diasEntre } from "./tramitacoes.js";

// As quatro etapas do funil de CS onde o dinheiro é o assunto. Os rótulos não
// são copiados: saem de ETAPAS_TICKET, senão um dia divergem.
export const ETAPAS_FINANCEIRO = ["1450683393", "1452885000", "1088361911", "1333136740"];

export const labelDaEtapa = (id) => ETAPAS_TICKET[String(id)]?.label || "";
export const ehEtapaFinanceira = (id) => ETAPAS_FINANCEIRO.includes(String(id));

// O registro do financeiro é gravado em tramitacao_dia, a mesma tabela da
// Tramitação, com o tipo prefixado. Sem o prefixo, Yas registrando cobrança e
// o farmer registrando a tratativa no mesmo ticket, na mesma etapa e no mesmo
// dia se sobrescreveriam: a chave primária é ticket mais tipo mais dia.
export const PREFIXO_TIPO = "fin:";
export const tipoDe = (etapa) => PREFIXO_TIPO + String(etapa);
export const etapaDoTipo = (tipo) =>
  String(tipo || "").startsWith(PREFIXO_TIPO) ? String(tipo).slice(PREFIXO_TIPO.length) : "";
export const ehTipoFinanceiro = (tipo) => ehEtapaFinanceira(etapaDoTipo(tipo));

// ponytail: primeira redação, tirada das quatro ações do documento do
// financeiro. Quem toca o processo precisa revisar antes de virar rotina: é o
// que vai ser marcado todo dia e o que vai virar observação no ticket de CS.
//
// A lista é por etapa, e não uma só para tudo, porque pedir a NF do palestrante
// não é opção de quem está cobrando o cliente. Lista achatada era o defeito da
// versão da Tramitação.
const COBRANCA = [
  "Confirmei o pagamento",
  "Cobrei o pagamento",
  "Recebi o comprovante",
  "Cliente pediu nova data",
  "Escalei para o gestor",
  "Aguardando retorno do cliente",
];

export const ABORDAGENS_FINANCEIRO = {
  "1450683393": [
    "Enviei o faturamento ao cliente",
    "Emiti a nota fiscal",
    "Pedi os dados de faturamento ao cliente",
    "Aguardando retorno do cliente",
  ],
  "1452885000": COBRANCA,
  "1088361911": COBRANCA,
  "1333136740": [
    "Pedi a NF ao palestrante",
    "Acionei o onboarding para cobrar a NF",
    "Recebi a NF do palestrante",
    "Aguardando retorno do palestrante",
  ],
};

export const abordagensDa = (etapa) => ABORDAGENS_FINANCEIRO[String(etapa)] || [];

// A única abordagem cuja tarefa não é para quem registrou: a NF do palestrante
// é cobrada pelo onboarding, que é quem fala com ele. Comparação por igualdade
// e não por regex, senão renomear a opção quebra o desvio calado.
export const ABORDAGEM_DO_ONBOARDING = "Acionei o onboarding para cobrar a NF";

// Toda abordagem válida, para a rota conferir sem precisar saber a etapa.
export const TODAS_ABORDAGENS = [
  ...new Set(Object.values(ABORDAGENS_FINANCEIRO).flat()),
];

// As parcelas combinadas. quantidade_de_parcelas diz quantas são, e cada data
// tem campo próprio no HubSpot. Quando a quantidade diz 3 e só há 2 datas, a
// que falta aparece como sem data em vez de sumir: campo vazio escondido foi o
// que já fez 185 tickets desaparecerem do painel sem ninguém notar.
export function parcelas(t) {
  const datas = [t.pagamento1 || "", t.pagamento2 || "", t.pagamento3 || ""];
  const combinadas = Number(t.parcelas) || 0;
  const comData = datas.filter(Boolean).length;
  const total = Math.max(combinadas, comData);
  if (total === 0) return [];
  return Array.from({ length: Math.min(total, 3) }, (_, i) => ({
    n: i + 1,
    data: datas[i] || "",
  }));
}

export const SITUACOES = [
  { key: "vencida", label: "Vencidas", hint: "a data combinada já passou" },
  { key: "hoje", label: "Vence hoje", hint: "é hoje que o pagamento cai" },
  { key: "prevista", label: "Previstas", hint: "data futura, nada a fazer ainda" },
  { key: "sem-data", label: "Sem data", hint: "ninguém combinou data de pagamento" },
];

const ordinal = (n) => `${n}ª`;

// Em que pé está o dinheiro deste ticket.
//
// Importante, e é a maior limitação desta tela: não existe no HubSpot campo
// que marque pagamento confirmado. status_de_pagamento está em branco nos 100
// tickets medidos. Então parcela paga continua contando como vencida até o
// ticket sair da etapa. Por isso a conta é feita pela parcela mais atrasada,
// nunca pela "próxima em aberto", que seria inventar um dado que não existe.
export function situacaoFinanceira(t, hoje) {
  const ps = parcelas(t);
  const comData = ps.filter((p) => p.data);

  if (comData.length === 0) {
    return {
      situacao: "sem-data",
      parcela: null,
      total: ps.length,
      data: "",
      dias: null,
      texto: "sem data de pagamento combinada",
    };
  }

  // Comparação de texto resolve: as duas pontas são AAAA-MM-DD, e assim não
  // entra fuso no meio de uma conta que é de calendário.
  const vencidas = comData.filter((p) => p.data < hoje).sort((a, b) => a.data.localeCompare(b.data));
  const deHoje = comData.filter((p) => p.data === hoje);
  const futuras = comData.filter((p) => p.data > hoje).sort((a, b) => a.data.localeCompare(b.data));

  // A mais atrasada manda. Só depois a de hoje, e por último a mais próxima.
  const alvo = vencidas[0] || deHoje[0] || futuras[0];
  const situacao = vencidas.length ? "vencida" : deHoje.length ? "hoje" : "prevista";
  const dias = diasEntre(alvo.data, hoje);
  const de = ps.length > 1 ? ` de ${ps.length}` : "";

  const texto =
    situacao === "vencida"
      ? `${ordinal(alvo.n)}${de} venceu há ${dias} dia${dias === 1 ? "" : "s"}`
      : situacao === "hoje"
        ? `${ordinal(alvo.n)}${de} vence hoje`
        : `${ordinal(alvo.n)}${de} vence em ${-dias} dia${dias === -1 ? "" : "s"}`;

  return { situacao, parcela: alvo.n, total: ps.length, data: alvo.data, dias, texto };
}

// A linha do board: um ticket vira um cartão. `gravidade` é a cor da Sinaleira,
// recebida pronta de quem chamou, para esta régua não disputar com aquela.
export function cartaoFinanceiro(ticket, hoje, { gravidade, evolucao, tentativas = 0 } = {}) {
  if (!ehEtapaFinanceira(ticket.etapa)) return null;
  const s = situacaoFinanceira(ticket, hoje);
  return {
    ticketId: ticket.id,
    etapa: String(ticket.etapa),
    tipo: tipoDe(ticket.etapa),
    label: labelDaEtapa(ticket.etapa),
    evento: ticket.evento || null,
    parcelas: parcelas(ticket),
    cache: ticket.cache || "",
    pagamentoPalestrante: ticket.pagamentoPalestrante || "",
    // Quantas vezes o financeiro já registrou algo neste ticket nesta etapa.
    // A próxima é esta mais um, e é ela que escolhe a estratégia da vez.
    tentativa: tentativas + 1,
    nivel: gravidade?.nivel || "cinza",
    motivo: gravidade?.motivo || "",
    evolucao: evolucao || null,
    ...s,
  };
}

// O board inteiro, agrupado pela situação da parcela. Dentro de cada grupo a
// ordem é a data: nas vencidas isso põe a mais antiga no topo, nas previstas a
// mais próxima. É a mesma ordenação para os dois casos, de propósito.
export function porSituacao(cartoes) {
  const out = Object.fromEntries(SITUACOES.map((s) => [s.key, []]));
  for (const c of cartoes) (out[c.situacao] ||= []).push(c);
  for (const k of Object.keys(out)) {
    out[k].sort(
      (a, b) =>
        String(a.data || "9999").localeCompare(String(b.data || "9999")) ||
        String(a.ticketId).localeCompare(String(b.ticketId))
    );
  }
  return out;
}

// Quanto dinheiro está parado em cada situação. Soma o cachê do palestrante,
// que é o único valor preenchido em 100% dos tickets medidos. Não é o valor da
// fatura do cliente: esse campo existe e está vazio, então somá-lo daria zero.
export function placarFinanceiro(cartoes) {
  const out = { total: cartoes.length };
  for (const s of SITUACOES) out[s.key] = cartoes.filter((c) => c.situacao === s.key).length;
  return out;
}

export function somaCache(cartoes) {
  return cartoes.reduce((s, c) => s + (Number(String(c.cache).replace(",", ".")) || 0), 0);
}

export const emReais = (n) =>
  Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
