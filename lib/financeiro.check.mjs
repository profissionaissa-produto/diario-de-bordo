// node lib/financeiro.check.mjs — as parcelas e a situação do dinheiro.
//
// O que este arquivo protege: a conta de parcela vencida, que é o que separa
// as colunas do board, e o prefixo do tipo, que é o que impede o registro do
// financeiro de sobrescrever o do farmer no mesmo ticket.
const {
  ETAPAS_FINANCEIRO,
  ehEtapaFinanceira,
  PREFIXO_TIPO,
  tipoDe,
  etapaDoTipo,
  ehTipoFinanceiro,
  abordagensDa,
  TODAS_ABORDAGENS,
  ABORDAGEM_DO_ONBOARDING,
  ESTRATEGIA_POR_TENTATIVA,
  estrategiaDaTentativa,
  DESTINO_DA_ABORDAGEM,
  DESTINOS,
  destinoDa,
  geraMensagemPara,
  parcelas,
  situacaoFinanceira,
  cartaoFinanceiro,
  NIVEL_DA_SITUACAO,
  SITUACOES,
  porSituacao,
  placarFinanceiro,
  somaCache,
  emReais,
  labelDaEtapa,
} = await import("./financeiro.js");

const { ETAPAS_TICKET } = await import("./tramitacoes.js");

let falhou = false;
const ok = (cond, msg) => {
  if (!cond) falhou = true;
  console.log((cond ? "ok: " : "FALHOU: ") + msg);
};

const HOJE = "2026-11-08";

// As etapas existem mesmo no funil de CS. Id solto aqui que não exista lá
// abriria uma coluna que nunca enche, e ninguém descobriria.
for (const id of ETAPAS_FINANCEIRO) {
  ok(!!ETAPAS_TICKET[id], `a etapa ${id} existe no funil de CS`);
  ok(labelDaEtapa(id) === ETAPAS_TICKET[id].label, `o rótulo de ${id} vem de ETAPAS_TICKET`);
}
ok(ETAPAS_FINANCEIRO.length === 4, "são quatro etapas financeiras");
ok(!ehEtapaFinanceira("1450325173"), "contratar logística não é etapa financeira");

// O prefixo é o que separa o diário do financeiro do diário do farmer.
ok(tipoDe("1450683393") === "fin:1450683393", "o tipo sai prefixado");
ok(etapaDoTipo("fin:1450683393") === "1450683393", "a etapa volta do tipo");
ok(etapaDoTipo("1450683393") === "", "tipo sem prefixo não devolve etapa");
ok(ehTipoFinanceiro("fin:1088361911"), "tipo financeiro é reconhecido");
ok(!ehTipoFinanceiro("1088361911"), "a etapa crua não passa por tipo financeiro");
ok(!ehTipoFinanceiro("fin:1450325173"), "etapa fora da lista não vira tipo financeiro");
ok(PREFIXO_TIPO === "fin:", "o prefixo é fin:");

// Abordagem é por etapa: pedir NF não aparece para quem cobra o cliente.
ok(abordagensDa("1333136740").some((a) => /NF ao palestrante/.test(a)), "a etapa da NF oferece pedir a NF");
ok(!abordagensDa("1088361911").some((a) => /NF ao palestrante/.test(a)), "cobrança não oferece pedir NF");
ok(abordagensDa("1450683393").includes("Emitir a nota fiscal"), "faturar oferece emitir a nota");
ok(abordagensDa("9999").length === 0, "etapa desconhecida não oferece abordagem");
ok(
  TODAS_ABORDAGENS.length === new Set(TODAS_ABORDAGENS).size,
  "a lista achatada não repete abordagem"
);
ok(TODAS_ABORDAGENS.includes("Cobrar o pagamento"), "a lista achatada traz a cobrança");

// O Diário é a primeira coisa do dia: marcar é dizer o que vai ser feito, não
// relatar o feito. Por isso toda abordagem começa no infinitivo. Estavam no
// passado até 09/11/2026 e diziam a mesma coisa que o resultado.
for (const a of TODAS_ABORDAGENS) {
  ok(/^\p{Lu}\p{Ll}*(ar|er|ir)\s/u.test(a), `"${a}" começa no infinitivo`);
}
ok(
  ABORDAGEM_DO_ONBOARDING === "Acionar o onboarding para cobrar a NF" &&
    abordagensDa("1333136740").includes(ABORDAGEM_DO_ONBOARDING),
  "a abordagem que desvia a tarefa para o onboarding está na lista da etapa dela"
);

// Para quem vai a mensagem: quem decide é a ação, não a etapa.
for (const a of TODAS_ABORDAGENS) {
  ok(
    ["contratante", "palestrante", "ambos", "nenhum"].includes(DESTINO_DA_ABORDAGEM[a]),
    `"${a}" tem destinatário definido`
  );
}
ok(
  Object.keys(DESTINO_DA_ABORDAGEM).every((a) => TODAS_ABORDAGENS.includes(a)),
  "não há destinatário mapeado para abordagem que não existe"
);
ok(destinoDa("Cobrar o pagamento") === "contratante", "cobrança é com quem paga");
ok(destinoDa("Pedir o comprovante") === "contratante", "comprovante é com quem paga");
ok(
  destinoDa("Confirmar o pagamento com o cliente") === "contratante",
  "confirmar pagamento é com o cliente"
);
ok(destinoDa("Pedir a NF ao palestrante") === "palestrante", "a NF é com o palestrante");
ok(
  destinoDa("Negociar nova data de pagamento") === "ambos",
  "renegociar prazo pode ser dos dois lados, então a tela pergunta"
);
// Ação interna não oferece gerar mensagem: não há para quem mandar.
for (const a of ["Emitir a nota fiscal", "Conferir a NF recebida", "Acionar o onboarding para cobrar a NF"]) {
  ok(!geraMensagemPara(a), `"${a}" não gera mensagem`);
}
ok(
  TODAS_ABORDAGENS.filter((a) => /^Aguardar/.test(a)).every((a) => !geraMensagemPara(a)),
  "aguardar retorno não gera mensagem"
);
ok(!geraMensagemPara("abordagem que não existe"), "abordagem desconhecida não gera mensagem");
ok(geraMensagemPara("Cobrar o pagamento"), "cobrança gera mensagem");
ok(!!DESTINOS.contratante && !!DESTINOS.palestrante, "os dois lados têm rótulo para a tela");

// Estratégia pela tentativa. As três vêm do documento do processo: lembrete
// cordial, aviso de atraso com multa e juros, escalonamento.
const { SEMENTES } = await import("./estrategias.js");
const LISTA = SEMENTES.Financeiro;
ok(LISTA.length === 3, "o Financeiro nasce com as três estratégias do documento");
ok(
  LISTA.map((e) => e.id).join() === ESTRATEGIA_POR_TENTATIVA.join(),
  "a ordem da lista é a ordem das tentativas"
);
ok(/multa/i.test(LISTA[1].desc) && /juros/i.test(LISTA[1].desc), "a 2ª estratégia cita multa e juros");
ok(/vencimento/i.test(LISTA[0].desc), "a 1ª estratégia fala do vencimento");
ok(/escalon|gestor/i.test(LISTA[2].titulo + LISTA[2].desc), "a 3ª estratégia escala para o gestor");
ok(
  LISTA.every((e) => e.desc.length > 40),
  "toda estratégia diz o que fazer, não só o nome"
);

ok(estrategiaDaTentativa(1, LISTA) === "fin-1", "1ª tentativa sugere o lembrete cordial");
ok(estrategiaDaTentativa(2, LISTA) === "fin-2", "2ª tentativa sugere o aviso de atraso");
ok(estrategiaDaTentativa(3, LISTA) === "fin-3", "3ª tentativa sugere o escalonamento");
ok(estrategiaDaTentativa(9, LISTA) === "fin-3", "da 3ª para cima continua o escalonamento");
ok(estrategiaDaTentativa(0, LISTA) === "fin-1", "tentativa zero cai na primeira, não quebra");
// A curadoria pode remover qualquer uma em Configurações. Sugerir uma que
// sumiu deixaria o campo com valor que a rota recusa.
ok(estrategiaDaTentativa(2, []) === "", "lista vazia não sugere nada");
ok(
  estrategiaDaTentativa(2, LISTA.filter((e) => e.id !== "fin-2")) === "",
  "estratégia removida pela curadoria não é sugerida"
);

// Parcelas: a quantidade combinada manda, mesmo sem a data preenchida.
ok(parcelas({ pagamento1: "2026-11-10", parcelas: "1" }).length === 1, "uma parcela, uma linha");
ok(parcelas({ pagamento1: "2026-11-10", parcelas: "3" }).length === 3, "3 combinadas rendem 3 linhas");
ok(
  parcelas({ pagamento1: "2026-11-10", parcelas: "3" })[2].data === "",
  "parcela combinada sem data aparece vazia em vez de sumir"
);
ok(
  parcelas({ pagamento1: "2026-11-10", pagamento2: "2026-12-10" }).length === 2,
  "sem a quantidade, conta as datas que existem"
);
ok(parcelas({}).length === 0, "ticket sem nada não inventa parcela");
ok(parcelas({ parcelas: "9", pagamento1: "2026-11-10" }).length === 3, "o HubSpot só tem 3 campos de data");

// Situação: vencida, hoje, prevista, sem data.
const vencida = situacaoFinanceira({ pagamento1: "2026-10-27", parcelas: "1" }, HOJE);
ok(vencida.situacao === "vencida", "data passada é vencida");
ok(vencida.dias === 12, "12 dias de atraso");
ok(vencida.texto === "1ª venceu há 12 dias", "o texto da vencida conta os dias");

const hoje = situacaoFinanceira({ pagamento1: HOJE, parcelas: "1" }, HOJE);
ok(hoje.situacao === "hoje", "a data de hoje cai em vence hoje");
ok(hoje.texto === "1ª vence hoje", "o texto de hoje não fala em dias");

const prevista = situacaoFinanceira({ pagamento1: "2026-11-13", parcelas: "1" }, HOJE);
ok(prevista.situacao === "prevista", "data futura é prevista");
ok(prevista.texto === "1ª vence em 5 dias", "o texto da prevista conta o que falta");

const semData = situacaoFinanceira({ parcelas: "2" }, HOJE);
ok(semData.situacao === "sem-data", "combinado sem data cai em sem data");
ok(semData.parcela === null, "sem data não aponta parcela");

// Um dia de atraso e um dia para vencer falam no singular.
ok(
  situacaoFinanceira({ pagamento1: "2026-11-07", parcelas: "1" }, HOJE).texto === "1ª venceu há 1 dia",
  "um dia de atraso é singular"
);
ok(
  situacaoFinanceira({ pagamento1: "2026-11-09", parcelas: "1" }, HOJE).texto === "1ª vence em 1 dia",
  "um dia para vencer é singular"
);

// A mais atrasada manda, não a próxima: não há campo de pagamento confirmado,
// então supor que a 1ª foi paga porque a 2ª está no futuro seria inventar.
const mista = situacaoFinanceira(
  { pagamento1: "2026-10-27", pagamento2: "2026-12-10", parcelas: "2" },
  HOJE
);
ok(mista.situacao === "vencida", "parcela vencida manda mesmo com outra no futuro");
ok(mista.parcela === 1, "a parcela apontada é a atrasada");
ok(mista.texto === "1ª de 2 venceu há 12 dias", "o texto diz qual de quantas");

// Duas vencidas: a mais antiga é a que aparece.
const duasVencidas = situacaoFinanceira(
  { pagamento1: "2026-10-27", pagamento2: "2026-11-03", parcelas: "2" },
  HOJE
);
ok(duasVencidas.parcela === 1, "entre duas vencidas, a mais antiga manda");

// A 1ª no futuro e a 2ª mais longe: a próxima é a 1ª.
const futuras = situacaoFinanceira(
  { pagamento1: "2026-11-20", pagamento2: "2026-12-20", parcelas: "2" },
  HOJE
);
ok(futuras.parcela === 1, "entre duas futuras, a mais próxima manda");

// O cartão: só de etapa financeira, e a cor vem de fora.
const t = {
  id: "1",
  etapa: "1088361911",
  evento: "2026-10-01",
  pagamento1: "2026-10-27",
  parcelas: "1",
  cache: "45000",
};
const c = cartaoFinanceiro(t, HOJE, { gravidade: { nivel: "verde", motivo: "dentro do prazo da etapa" }, tentativas: 2 });
ok(c !== null, "etapa financeira vira cartão");
ok(c.tipo === "fin:1088361911", "o cartão carrega o tipo prefixado");
ok(c.tentativa === 3, "duas registradas fazem a próxima ser a terceira");
ok(cartaoFinanceiro({ ...t, etapa: "1450325173" }, HOJE) === null, "etapa não financeira não vira cartão");

// A cor do card é a da coluna. Era a da Sinaleira na primeira versão, e o
// board mostrou card escrito "venceu há 328 dias" com bolinha verde.
ok(c.situacao === "vencida", "a parcela está vencida");
ok(c.nivel === "vermelho", "parcela vencida pinta o card de vermelho");
ok(c.sinaleira.nivel === "verde", "o veredito da Sinaleira continua inteiro ao lado");
ok(c.sinaleira.motivo === "dentro do prazo da etapa", "o motivo da Sinaleira passa sem reescrita");

const prev = cartaoFinanceiro(
  { id: "2", etapa: "1450683393", pagamento1: "2026-11-20", parcelas: "1" },
  HOJE,
  { gravidade: { nivel: "vermelho", motivo: "4d depois do prazo" } }
);
ok(prev.nivel === "verde", "parcela prevista pinta de verde mesmo com a Sinaleira vermelha");
ok(prev.sinaleira.nivel === "vermelho", "e a Sinaleira vermelha segue visível");
ok(
  cartaoFinanceiro({ id: "3", etapa: "1450683393", parcelas: "1" }, HOJE).nivel === "cinza",
  "sem data combinada o card fica cinza, nunca verde"
);
ok(
  cartaoFinanceiro({ id: "4", etapa: "1450683393", pagamento1: HOJE, parcelas: "1" }, HOJE).nivel === "amarelo",
  "o que vence hoje fica amarelo"
);
ok(cartaoFinanceiro(t, HOJE, {}).sinaleira.nivel === "cinza", "cartão sem gravidade não inventa cor para a Sinaleira");

// Quando a régua de lá não tem frase, ela devolve o nome da etapa de reserva.
// Repetir isso no card não acrescenta nada, então a linha some.
const semFrase = cartaoFinanceiro(t, HOJE, {
  gravidade: { nivel: "cinza", motivo: "Solicitar NF Palestrante", etapaSinaleira: "Solicitar NF Palestrante" },
});
ok(semFrase.sinaleira.motivo === "", "motivo que é só o nome da etapa não vira linha");
ok(semFrase.sinaleira.nivel === "cinza", "mas a cor da Sinaleira continua guardada");
const comFrase = cartaoFinanceiro(t, HOJE, {
  gravidade: { nivel: "amarelo", motivo: "24d desde o evento", etapaSinaleira: "Confirmar PGTO Pós palestra" },
});
ok(comFrase.sinaleira.motivo === "24d desde o evento", "frase de verdade aparece inteira");

// Agrupamento e ordem.
const cartoes = [
  cartaoFinanceiro({ id: "a", etapa: "1088361911", pagamento1: "2026-11-03", parcelas: "1" }, HOJE),
  cartaoFinanceiro({ id: "b", etapa: "1088361911", pagamento1: "2026-10-20", parcelas: "1" }, HOJE),
  cartaoFinanceiro({ id: "c", etapa: "1450683393", pagamento1: "2026-11-20", parcelas: "1" }, HOJE),
  cartaoFinanceiro({ id: "d", etapa: "1450683393", parcelas: "1" }, HOJE),
];
const grupos = porSituacao(cartoes);
ok(grupos.vencida.map((x) => x.ticketId).join() === "b,a", "nas vencidas, a mais antiga vem primeiro");
ok(grupos.prevista.length === 1, "uma prevista");
ok(grupos["sem-data"].length === 1, "uma sem data");
ok(grupos.hoje.length === 0, "nenhuma vence hoje");

const pl = placarFinanceiro(cartoes);
ok(pl.total === 4 && pl.vencida === 2 && pl.prevista === 1 && pl["sem-data"] === 1, "o placar bate com os grupos");

ok(somaCache([{ cache: "45000" }, { cache: "15000,50" }, { cache: "" }]) === 60000.5, "o cachê soma com vírgula decimal");
ok(/45\.000/.test(emReais(45000)), "o valor sai em reais");

// Toda situação tem coluna e tem cor: faltar uma faria cards sumirem do board
// ou aparecerem sem borda, os dois calados.
for (const s of SITUACOES) {
  ok(!!NIVEL_DA_SITUACAO[s.key], `a situação ${s.key} tem cor`);
  ok(!!s.label && !!s.hint, `a situação ${s.key} tem rótulo e regra escrita`);
}
ok(
  Object.keys(NIVEL_DA_SITUACAO).length === SITUACOES.length,
  "não há cor sobrando para situação que não existe"
);

console.log(falhou ? "\nFALHOU" : "\ntudo certo");
process.exit(falhou ? 1 : 0);
