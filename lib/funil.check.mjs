// node lib/funil.check.mjs — a regra da lista do dia do closer, sem CRM.
process.env.TZ = "UTC";
const { classifica, montaListaDoDia, emDescanso, COTA_DIARIA, NEGOCIOS_DO_DIA } =
  await import("./funil.js");

const ok = (cond, msg) => {
  if (!cond) {
    console.error("FALHOU:", msg);
    process.exit(1);
  }
  console.log("ok:", msg);
};

const HOJE = "2026-09-24";
const haDias = (n) => {
  const d = new Date(`${HOJE}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};
const emDias = (n) => haDias(-n);
const haMeses = (n) => {
  const d = new Date(`${HOJE}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - n);
  return d.toISOString().slice(0, 10);
};

let seq = 0;
const neg = (over = {}) => ({ id: `n${++seq}`, nome: "Negócio", ultimaAtividade: HOJE, ...over });

// ---------------------------------------------------------------- classificação
ok(classifica(neg({ reuniaoEm: HOJE }), HOJE) === "proposta_hoje",
  "reunião hoje sem proposta cai em proposta de hoje");
ok(classifica(neg({ reuniaoEm: HOJE, propostaEm: HOJE }), HOJE) !== "proposta_hoje",
  "proposta enviada no mesmo dia da reunião sai do grupo");

ok(classifica(neg({ reuniaoEm: haDias(3) }), HOJE) === "fup",
  "reunião há 3 dias sem proposta é FUP");
ok(classifica(neg({ reuniaoEm: haDias(3), propostaEm: haDias(2) }), HOJE) !== "fup",
  "proposta enviada depois da reunião tira do FUP");
ok(classifica(neg({ reuniaoEm: haDias(8), ultimaAtividade: haDias(8) }), HOJE) === "sem_atividade",
  "passados os 7 dias a janela de FUP fecha");

ok(classifica(neg({ eventoEm: emDias(10) }), HOJE) === "evento_30d",
  "evento em 10 dias entra");
ok(classifica(neg({ eventoEm: emDias(45) }), HOJE) !== "evento_30d",
  "evento em 45 dias não entra");
ok(classifica(neg({ eventoEm: haDias(1) }), HOJE) !== "evento_30d",
  "evento que já passou não entra");

ok(classifica(neg({ ultimaAtividade: haDias(8) }), HOJE) === "sem_atividade",
  "8 dias sem atividade entra em parado");
ok(classifica(neg({ ultimaAtividade: haDias(7) }), HOJE) !== "sem_atividade",
  "exatamente 7 dias ainda não é parado: o critério é mais de 7");
ok(classifica(neg({ ultimaAtividade: null }), HOJE) === "sem_atividade",
  "negócio sem nenhuma atividade conta como parado");

ok(classifica(neg({ ultimaCompra: haMeses(6) }), HOJE) === "compra_18m",
  "compra há 6 meses entra em cliente recente");
ok(classifica(neg({ ultimaCompra: haMeses(20) }), HOJE) !== "compra_18m",
  "compra há 20 meses não entra");

ok(classifica(neg({ budget: "41k à 60k" }), HOJE) === "budget_alto",
  "faixa acima de 30k entra em budget alto");
ok(classifica(neg({ budget: "21k à 40k" }), HOJE) !== "budget_alto",
  'a faixa exibida como "21k à 30k" fica de fora do corte de 30k');
ok(classifica(neg({ budget: "11k à 20k" }), HOJE) === null,
  "negócio que não bate critério nenhum fica fora da lista");

// Prioridade: um negócio ocupa uma vaga só, a do critério mais urgente.
ok(classifica(neg({ reuniaoEm: HOJE, eventoEm: emDias(5), ultimaAtividade: haDias(30), budget: "+ de 80k" }), HOJE) === "proposta_hoje",
  "quem bate vários critérios entra pelo mais urgente");

// ---------------------------------------------------------------- lista do dia
const cheio = [
  ...Array.from({ length: 5 }, () => neg({ reuniaoEm: HOJE })),
  ...Array.from({ length: 5 }, () => neg({ reuniaoEm: haDias(2) })),
  ...Array.from({ length: 5 }, () => neg({ eventoEm: emDias(9) })),
  ...Array.from({ length: 20 }, () => neg({ ultimaAtividade: haDias(40) })),
  ...Array.from({ length: 5 }, () => neg({ ultimaCompra: haMeses(4) })),
  ...Array.from({ length: 5 }, () => neg({ budget: "+ de 80k" })),
];
const lista = montaListaDoDia(cheio, HOJE);
ok(lista.length === NEGOCIOS_DO_DIA, `com funil cheio entrega ${NEGOCIOS_DO_DIA} negócios`);
ok(new Set(lista.map((n) => n.id)).size === lista.length, "nenhum negócio repetido na lista");

const conta = (g) => lista.filter((n) => n.grupo === g).length;
for (const [g, cota] of Object.entries(COTA_DIARIA)) {
  ok(conta(g) === cota, `${g} respeita a cota de ${cota}`);
}

// Grupo seco não encolhe o dia.
const soParados = Array.from({ length: 30 }, () => neg({ ultimaAtividade: haDias(40) }));
ok(montaListaDoDia(soParados, HOJE).length === NEGOCIOS_DO_DIA,
  "só um grupo com volume ainda fecha os 10 pela cascata");

// Funil menor que a cota entrega o que tem, sem inventar.
ok(montaListaDoDia(soParados.slice(0, 4), HOJE).length === 4,
  "funil pequeno entrega o que existe");

// ---------------------------------------------------------------- descanso
ok(emDescanso({ ultimaData: haDias(2), ultimoResultado: "tentativa" }, HOJE),
  "tentativa descansa 3 dias");
ok(!emDescanso({ ultimaData: haDias(3), ultimoResultado: "tentativa" }, HOJE),
  "no terceiro dia a tentativa volta");
ok(emDescanso({ ultimaData: haDias(5), ultimoResultado: "efetivo" }, HOJE),
  "contato efetivo descansa 7 dias, não 30: o FUP do critério 3 é em 7");
ok(!emDescanso({ ultimaData: haDias(7), ultimoResultado: "efetivo" }, HOJE),
  "no sétimo dia o efetivo volta para o follow-up");
ok(emDescanso({ ultimaData: haDias(0), ultimoResultado: null }, HOJE),
  "dia sem resultado registrado descansa 1: não fechar o dia não apaga o negócio");

const comDescanso = montaListaDoDia(
  [neg({ id: "fresco", ultimaAtividade: haDias(40) })],
  HOJE,
  new Map([["fresco", { ultimaData: haDias(1), ultimoResultado: "tentativa" }]])
);
ok(comDescanso.length === 0, "negócio em descanso não volta para a lista");

console.log("\nfunil: tudo certo.");

// ------------------------------------------- completar o dia sem critério
const { motivoForaDosCriterios } = await import("./funil.js");

const foraDeTudo = () => neg({ ultimaAtividade: haDias(2), budget: "11k à 20k" });
ok(classifica(foraDeTudo(), HOJE) === null, "segue sem bater critério nenhum");

const poucos = [
  ...Array.from({ length: 3 }, () => neg({ ultimaAtividade: haDias(40) })),
  ...Array.from({ length: 20 }, foraDeTudo),
];
const completada = montaListaDoDia(poucos, HOJE);
ok(completada.length === NEGOCIOS_DO_DIA, "completa as 10 mesmo com poucos negócios em critério");
ok(completada.filter((n) => n.grupo === "sem_atividade").length === 3, "os que batem critério entram primeiro");
ok(completada.filter((n) => n.grupo === "sem_criterio").length === 7, "o resto entra como fora dos critérios");
ok(completada.filter((n) => n.grupo === "sem_criterio").every((n) => n.porque), "todo fora-dos-critérios explica por quê");

// A cota não vaza: com funil cheio, ninguém fora de critério ocupa vaga.
ok(montaListaDoDia(cheio, HOJE).every((n) => n.grupo !== "sem_criterio"),
  "com critérios sobrando, ninguém entra fora de critério");

const texto = motivoForaDosCriterios(
  { ultimaAtividade: haDias(2), budget: "11k à 20k" }, HOJE
);
ok(/tocado há 2 dias/.test(texto), "o motivo diz há quantos dias foi tocado");
ok(/sem reunião/.test(texto) && /sem data de evento/.test(texto), "o motivo cobre reunião e evento");
ok(/budget 11k à 20k/.test(texto), "o motivo mostra o budget real");

console.log("\nfunil: tudo certo.");
