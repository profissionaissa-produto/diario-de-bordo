// node lib/tramitacoes.check.mjs — o board e a ponte para a régua da Sinaleira.
//
// A régua em si é testada no painel-tramitacao, de onde foi copiada. O que
// este arquivo cobre é o que é nosso: o cadastro das etapas, a tradução do
// ticket para o formato dela, a ordenação e a baixa pelo líder.
//
// Os dois casos reais que motivaram a troca entram nomeados: logística com o
// negócio ganho há semanas, que a régua antiga pintava de verde porque o
// evento era longe, e evento já passado com a etapa ainda de preparação.
const {
  ETAPAS_TICKET,
  ETAPAS_ATIVAS,
  ETAPAS_POS_EVENTO,
  ETAPA_LOGISTICA,
  gravidade,
  pendenciaDoTicket,
  pendenciasDosTickets,
  placar,
  diasEntre,
  somaDias,
  labelDaEtapa,
  clienteDo,
  palestranteDo,
} = await import("./tramitacoes.js");
const { SLA } = await import("./sinaleira/sinaleira.ts");

let falhou = false;
const ok = (cond, msg) => {
  if (!cond) falhou = true;
  console.log((cond ? "ok: " : "FALHOU: ") + msg);
};

const HOJE = "2026-11-05";
const CONTRATO = "1450325174";
const BRIEFING = "1450325175";
const NF = "1333136740";

const t = (etapa, evento, extra = {}) => ({
  id: "t1",
  etapa,
  evento,
  assunto: "Cliente X - Palestrante Y - 01/01/2027 - Presencial - ID 1",
  ...extra,
});

// ----------------------------------------------- o cadastro é o mesmo de lá
ok(ETAPAS_ATIVAS.length === 9, "o board tem as 9 etapas abertas do CS");
ok(ETAPAS_ATIVAS.every((id) => SLA[id]), "toda etapa do board existe na régua da Sinaleira");
ok(
  ETAPAS_ATIVAS.every((id) => ETAPAS_TICKET[id].label && ETAPAS_TICKET[id].fase),
  "toda etapa tem rótulo e fase"
);
ok(new Set(ETAPAS_ATIVAS.map((id) => ETAPAS_TICKET[id].ordem)).size === 9, "a ordem não repete");
// A ordem das colunas é a do funil, e isso não é automático: id de etapa é
// numérico, e Object.keys devolve chave numérica em ordem crescente. O quadro
// já abriu em Confirmar PGTO Pós por causa disso.
ok(
  ETAPAS_ATIVAS.map((id) => ETAPAS_TICKET[id].label).join(" | ") ===
    [
      "Contratar logística",
      "Assinar contrato",
      "Faturar",
      "Realizar briefing",
      "Confirmar pagamento pré-palestra",
      "Aguardando evento",
      "Coletar NPS e fotos",
      "Confirmar pagamento pós-palestra",
      "Solicitar NF do palestrante",
    ].join(" | "),
  "as colunas saem na ordem do funil, não na ordem do id"
);
ok(
  ETAPAS_ATIVAS.every((id, i, lista) => i === 0 || SLA[lista[i - 1]].ordem < SLA[id].ordem),
  "e essa ordem é a que a Sinaleira declara"
);
ok(ETAPAS_POS_EVENTO.length === 3, "três etapas são de pós-evento");
ok(!ETAPAS_TICKET["1088360203"], "a etapa de conferência fica fora do board");
ok(labelDaEtapa("1088360203") === "Etapa de conferência", "mas continua nomeada");
ok(labelDaEtapa("000") === "", "etapa desconhecida não inventa nome");
for (const velha of ["1088360204", "1088360205"]) {
  ok(!ETAPAS_TICKET[velha], `etapa do funil antigo ${velha} não está no board`);
}

// ------------------------------- o caso que motivou trocar de régua
// Logística com o negócio ganho em 02/10 e evento só em maio de 2027. A régua
// anterior media distância até o evento e dava verde; a de verdade mede 5 dias
// após o ganho, e dá vermelho.
const logAtrasada = gravidade(
  t(ETAPA_LOGISTICA, "2027-05-22", {
    ganhoNegocio: "2026-10-02",
    logistica: "Sim, com custo para PSA",
  }),
  HOJE
);
ok(logAtrasada.nivel === "vermelho", "logística com ganho há 34 dias é vermelha mesmo com evento longe");
ok(/aquisi/i.test(logAtrasada.motivo), "e o motivo nomeia a aquisição");
ok(logAtrasada.dias > 0, "o evento ainda está no futuro, o que antes bastava para dar verde");

const logNova = gravidade(
  t(ETAPA_LOGISTICA, "2027-05-22", {
    ganhoNegocio: somaDias(HOJE, -2),
    logistica: "Sim, com custo para PSA",
  }),
  HOJE
);
ok(logNova.nivel === "verde", "logística ganha há 2 dias ainda está no prazo");

// Sem saber se a PSA organiza a logística, a régua não inventa: diz o campo.
const logSemDado = gravidade(t(ETAPA_LOGISTICA, "2027-05-22"), HOJE);
ok(logSemDado.nivel === "cinza", "sem o campo de logística o card fica cinza");
ok(/falta/i.test(logSemDado.motivo), "e diz que falta campo, em vez de dar verde");

// --------------------------------- evento passado com etapa de preparação
const passado = gravidade(t(CONTRATO, somaDias(HOJE, -10)), HOJE);
ok(passado.nivel === "vermelho", "evento que já passou com etapa de preparação é vermelho");
ok(passado.peso > logNova.peso, "e pesa mais que um verde");
ok(gravidade(t(BRIEFING, HOJE), HOJE).nivel === "vermelho", "evento hoje com briefing por realizar é vermelho");

// Pós-evento não é atraso por o evento ter passado: ali o prazo começa nele.
ok(gravidade(t(NF, somaDias(HOJE, -3)), HOJE).nivel !== "vermelho", "pós-evento logo após a palestra não é vermelho");

// ------------------------------------------------------------- a pendência
const p = pendenciaDoTicket(t(CONTRATO, somaDias(HOJE, 1)), HOJE);
ok(p.label === "Assinar contrato", "a pendência é a própria etapa");
ok(p.ticketId === "t1" && p.etapa === CONTRATO, "e carrega ticket e etapa");
ok(pendenciaDoTicket(t("1088360203", HOJE), HOJE) === null, "etapa fora do board não vira pendência");

// Baixada pelo líder não some: afunda. Sumir faria o farmer ver menos tickets
// do que tem na mão, que foi o defeito da versão anterior.
const baixada = pendenciaDoTicket(t(CONTRATO, HOJE), HOJE, {
  [`t1|${CONTRATO}`]: { status: "confirmado", decididoPor: "Ana" },
});
ok(baixada !== null, "pendência baixada continua no board");
ok(baixada.nivel === "cinza" && baixada.peso === 1, "mas vai para o fim da lista");
ok(baixada.motivo.includes("Ana"), "e diz quem baixou");

// ------------------------------------------------------------- a ordenação
const board = pendenciasDosTickets(
  [
    { ...t(NF, somaDias(HOJE, -2)), id: "tranquilo" },
    { ...t(CONTRATO, somaDias(HOJE, -20)), id: "atrasadissimo" },
    { ...t(BRIEFING, somaDias(HOJE, 200)), id: "longe" },
  ],
  HOJE
);
ok(board[0].ticketId === "atrasadissimo", "o evento passado e aberto vem primeiro");
ok(board.length === 3, "nenhum ticket se perde na ordenação");
const pl = placar(board);
ok(pl.total === 3, "o placar conta tudo");
ok(["vermelho", "amarelo", "verde", "cinza"].every((c) => typeof pl[c] === "number"), "e conta por nível");

// ------------------------------------------------------- leitura do assunto
const assunto = "Grupo Combo/Komatsu - Vilfredo Schurmann - 06/11/2026 - Presencial - ID 65155829923";
ok(clienteDo(assunto) === "Grupo Combo/Komatsu", "o cliente sai do assunto");
ok(palestranteDo(assunto) === "Vilfredo Schurmann", "o palestrante também");
ok(clienteDo("TOTVS | Everton Lima | 26/11/2026 | Presencial") === "TOTVS", "com | também funciona");
ok(clienteDo("") === "" && palestranteDo("") === "", "assunto vazio não inventa nome");

// -------------------------------------------------------------------- datas
ok(diasEntre("2026-11-05", "2026-11-08") === 3, "diferença em dias corridos");
ok(diasEntre("2026-11-08", "2026-11-05") === -3, "data anterior devolve negativo");
ok(somaDias("2026-11-30", 1) === "2026-12-01", "soma de dias vira o mês");
ok(somaDias("2026-03-01", -1) === "2026-02-28", "e volta o mês também");

console.log(falhou ? "tramitacoes: tem falha." : "tramitacoes: tudo certo.");
process.exit(falhou ? 1 : 0);
