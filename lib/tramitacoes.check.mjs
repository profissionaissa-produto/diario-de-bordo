// node lib/tramitacoes.check.mjs — gravidade e ordenação do board.
//
// Os dois casos que o usuário nomeou quando pediu a tela nova entram aqui
// explicitamente: evento próximo com etapa de preparação pendente, e evento
// já passado com o ticket ainda aberto.
const {
  ETAPAS_TICKET,
  ETAPAS_ATIVAS,
  ETAPAS_POS_EVENTO,
  FORA_DO_BOARD,
  PRE_VERMELHO,
  PRE_AMARELO,
  POS_VERMELHO,
  POS_AMARELO,
  gravidade,
  pendenciaDoTicket,
  pendenciasDosTickets,
  placar,
  diasEntre,
  somaDias,
  labelDaEtapa,
} = await import("./tramitacoes.js");

let falhou = false;
const ok = (cond, msg) => {
  if (!cond) falhou = true;
  console.log((cond ? "ok: " : "FALHOU: ") + msg);
};

const HOJE = "2026-11-05";
const LOGISTICA = "1450325173";
const CONTRATO = "1450325174";
const BRIEFING = "1450325175";
const ESPERA = "1448673032";
const NPS = "1451268423";
const NF = "1333136740";

const t = (etapa, evento, id = "t1") => ({ id, etapa, evento });

// ---------------------------------------------------------------- cadastro
ok(ETAPAS_ATIVAS.length === 9, "o funil tem as 9 etapas abertas do CS");
ok(
  ETAPAS_ATIVAS.every((id) => /^\d+$/.test(id) && ETAPAS_TICKET[id].label && ETAPAS_TICKET[id].fase),
  "toda etapa tem id numérico, rótulo e fase"
);
ok(
  new Set(ETAPAS_ATIVAS.map((id) => ETAPAS_TICKET[id].ordem)).size === 9,
  "a ordem das etapas não repete"
);
ok(ETAPAS_POS_EVENTO.length === 3, "três etapas são de pós-evento");
ok(!ETAPAS_TICKET["1088360203"], "a etapa de conferência fica fora do board");
ok(labelDaEtapa("1088360203") === "Etapa de conferência", "mas continua nomeada se um ticket cair nela");
ok(labelDaEtapa("1450325173") === "Contratar logística", "etapa do board tem rótulo");
ok(labelDaEtapa("000") === "", "etapa desconhecida não inventa nome");

// As cinco etapas do funil antigo saíram: eram elas que deixavam 185 tickets
// invisíveis no Diário depois da reestruturação de 06/10/2026.
for (const velha of ["1088360204", "1088360205"]) {
  ok(!ETAPAS_TICKET[velha], `etapa antiga ${velha} não está mais no board`);
}

// ------------------------------------------------- antes do evento: quanto falta
ok(gravidade(t(LOGISTICA, "2026-11-30"), HOJE).nivel === "verde", "evento distante com logística pendente é verde");
ok(gravidade(t(LOGISTICA, somaDias(HOJE, PRE_AMARELO)), HOJE).nivel === "amarelo", "evento dentro da faixa amarela avisa");
ok(gravidade(t(LOGISTICA, somaDias(HOJE, PRE_VERMELHO)), HOJE).nivel === "vermelho", "evento dentro da faixa vermelha grita");
ok(gravidade(t(CONTRATO, HOJE), HOJE).nivel === "vermelho", "evento hoje com contrato por assinar é vermelho");
ok(gravidade(t(CONTRATO, HOJE), HOJE).motivo === "Evento é hoje", "e o motivo diz que é hoje");

// O caso que motivou a tela: evento amanhã e o contrato ainda não assinado.
const amanha = gravidade(t(CONTRATO, somaDias(HOJE, 1)), HOJE);
ok(amanha.nivel === "vermelho" && amanha.dias === 1, "evento amanhã com contrato pendente é vermelho");

// ------------------------------------------------ evento passado e ainda aberto
const passado = gravidade(t(LOGISTICA, somaDias(HOJE, -10)), HOJE);
ok(passado.nivel === "vermelho", "evento que já passou com etapa de preparação é vermelho");
ok(passado.motivo.includes("há 10 dias"), "o motivo diz há quantos dias o evento foi");
ok(
  passado.peso > gravidade(t(CONTRATO, HOJE), HOJE).peso,
  "evento passado e aberto pesa mais que evento de hoje"
);
ok(
  gravidade(t(BRIEFING, somaDias(HOJE, -60)), HOJE).peso >
    gravidade(t(BRIEFING, somaDias(HOJE, -5)), HOJE).peso,
  "entre dois eventos passados, o mais antigo sobe primeiro"
);

// ------------------------------------------------------------ aguardando evento
ok(gravidade(t(ESPERA, somaDias(HOJE, 20)), HOJE).nivel === "verde", "esperar o evento não é problema antes da data");
ok(gravidade(t(ESPERA, somaDias(HOJE, -2)), HOJE).nivel === "amarelo", "evento passou e o ticket não saiu da espera");
ok(gravidade(t(ESPERA, somaDias(HOJE, -40)), HOJE).nivel === "vermelho", "parado na espera muito depois do evento é vermelho");

// ----------------------------------------------------------------- pós-evento
ok(gravidade(t(NPS, somaDias(HOJE, 5)), HOJE).nivel === "verde", "pós-evento antes da palestra não está atrasado");
ok(gravidade(t(NPS, somaDias(HOJE, -3)), HOJE).nivel === "verde", "poucos dias após o evento ainda é verde");
ok(gravidade(t(NPS, somaDias(HOJE, -POS_AMARELO)), HOJE).nivel === "amarelo", "quinze dias após o evento avisa");
ok(gravidade(t(NF, somaDias(HOJE, -POS_VERMELHO)), HOJE).nivel === "vermelho", "trinta dias após o evento grita");

// ------------------------------------------------------------- dado faltando
const semData = gravidade(t(LOGISTICA, null), HOJE);
ok(semData.nivel === "cinza", "ticket sem data de evento fica cinza");
ok(semData.peso < gravidade(t(LOGISTICA, "2026-12-30"), HOJE).peso, "cinza pesa menos que o que dá para medir");
ok(semData.motivo.includes("Sem data"), "e o motivo diz o que falta");
ok(gravidade(t("000", HOJE), HOJE).nivel === "cinza", "etapa fora do board não é medida");

// --------------------------------------------------------------- a pendência
const p = pendenciaDoTicket(t(CONTRATO, somaDias(HOJE, 1)), HOJE);
ok(p.label === "Assinar contrato", "a pendência é a própria etapa");
ok(p.atrasada === true && p.eventoPassado === false, "vermelho por proximidade não é evento passado");
ok(pendenciaDoTicket(t("1088360203", HOJE), HOJE) === null, "etapa fora do board não vira pendência");
// Baixada pelo líder não some: afunda. Sumir faria o farmer ver menos
// tickets do que tem na mão, que foi o defeito da versão anterior.
const baixada = pendenciaDoTicket(t(CONTRATO, HOJE), HOJE, {
  [`t1|${CONTRATO}`]: { status: "confirmado", decididoPor: "Ana" },
});
ok(baixada !== null, "pendência baixada continua no board");
ok(baixada.nivel === "cinza" && baixada.peso === 1, "mas vai para o fim da lista");
ok(baixada.motivo.includes("Ana"), "e diz quem baixou");

// ------------------------------------------------------------- a ordenação
const board = pendenciasDosTickets(
  [
    t(NPS, somaDias(HOJE, -2), "tranquilo"),
    t(LOGISTICA, somaDias(HOJE, -20), "atrasadissimo"),
    t(CONTRATO, somaDias(HOJE, 1), "amanha"),
    t(BRIEFING, somaDias(HOJE, 30), "longe"),
    t(LOGISTICA, null, "semdata"),
  ],
  HOJE
);
ok(board[0].ticketId === "atrasadissimo", "o evento passado e aberto vem primeiro");
ok(board[1].ticketId === "amanha", "depois o evento de amanhã com pendência");
ok(board[board.length - 1].ticketId === "semdata", "o sem data de evento fica por último");
ok(board.length === 5, "nenhum ticket se perde na ordenação");

const pl = placar(board);
ok(pl.total === 5 && pl.vermelho === 2 && pl.cinza === 1, "o placar conta por nível");

// -------------------------------------------------------------------- datas
ok(diasEntre("2026-11-05", "2026-11-08") === 3, "diferença de dias em dias corridos");
ok(diasEntre("2026-11-08", "2026-11-05") === -3, "data anterior devolve negativo");
ok(somaDias("2026-11-30", 1) === "2026-12-01", "soma de dias vira o mês");
ok(somaDias("2026-03-01", -1) === "2026-02-28", "e volta o mês também");

console.log(falhou ? "tramitacoes: tem falha." : "tramitacoes: tudo certo.");
process.exit(falhou ? 1 : 0);
