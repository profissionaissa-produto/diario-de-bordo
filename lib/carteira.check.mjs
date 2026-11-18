// node lib/carteira.check.mjs — baldes, cotas, ordem, descanso e cascata.
// Errar aqui entrega ao farmer a lista errada e o dia inteiro sai torto.
const {
  classifica, emDescanso, precisaAuxilio, montaListaDoDia, montaHistorico,
  COTA_DIARIA, EMPRESAS_DO_DIA, contatadaHaPouco, JANELA_SEM_CONTATO,
} = await import("./carteira.js");

let falhou = false;
const ok = (cond, msg) => {
  console[cond ? "log" : "error"](cond ? "ok:" : "FALHOU:", msg);
  if (!cond) falhou = true;
};

const HOJE = "2026-09-23";
const haMeses = (n) => {
  const d = new Date(HOJE + "T12:00:00Z");
  d.setUTCMonth(d.getUTCMonth() - n);
  return d.toISOString().slice(0, 10);
};
let seq = 0;
const emp = (over = {}) => ({ id: String(++seq), nome: "Empresa " + seq, ...over });
const balde = (e) => classifica(e, HOJE).balde;

// --- baldes
ok(balde(haMeses(1)) === "extra", "1 mês é entre eventos (extra)");
ok(balde(haMeses(3)) === "nutricao", "3 meses já é nutrição");
ok(balde(haMeses(7)) === "nutricao", "7 meses é nutrição");
ok(balde(haMeses(8)) === "recompra", "8 meses é recompra");
ok(balde(haMeses(11)) === "recompra", "11 meses é recompra");
ok(balde(haMeses(12)) === "reativacao", "12 meses é reativação");
ok(balde(haMeses(30)) === "reativacao", "muito antiga é reativação");
ok(balde(null) === "primeiro_contato", "sem compra é primeiro contato");

// --- descanso por resultado
const hist = (r, data) => new Map([["1", { ultimaData: data, ultimoResultado: r, tentativasSeguidas: 0 }]]);
// A regra do dia seguinte: a lista de amanhã nunca repete a de hoje, mesmo
// quando nada foi registrado. É o que mais se nota na tela, então é o que
// mais precisa de teste.
ok(emDescanso({ ultimaData: "2026-09-22", ultimoResultado: "nao_abordei" }, HOJE) === true, "não abordei ontem não volta hoje");
ok(emDescanso({ ultimaData: "2026-09-21", ultimoResultado: "nao_abordei" }, HOJE) === false, "pula um dia e volta");
ok(emDescanso({ ultimaData: "2026-09-23", ultimoResultado: "nao_abordei" }, HOJE) === true, "no mesmo dia ainda descansa");
ok(emDescanso({ ultimaData: "2026-09-22", ultimoResultado: null }, HOJE) === true, "listada ontem sem fechar também não repete");
ok(emDescanso({ ultimaData: "2026-09-21", ultimoResultado: "tentativa" }, HOJE) === true, "tentativa ainda descansa com 2 dias");
ok(emDescanso({ ultimaData: "2026-09-20", ultimoResultado: "tentativa" }, HOJE) === false, "tentativa volta com 3 dias");
ok(emDescanso({ ultimaData: "2026-09-01", ultimoResultado: "efetivo" }, HOJE) === true, "efetivo descansa 30 dias");
ok(emDescanso({ ultimaData: "2026-08-20", ultimoResultado: "efetivo" }, HOJE) === false, "passados 30 dias, efetivo volta");
ok(emDescanso({ ultimaData: "2026-09-21", ultimoResultado: null }, HOJE) === false, "dia sem fechamento volta depois de pular um");

// --- auxílio do líder
ok(precisaAuxilio({ tentativasSeguidas: 3 }) === true, "3 tentativas seguidas pedem auxílio");
ok(precisaAuxilio({ tentativasSeguidas: 2 }) === false, "2 ainda não");

// --- carteira farta: as cotas são respeitadas
const farta = [
  ...Array.from({ length: 20 }, () => emp({ ultimaCompra: haMeses(9) })),
  ...Array.from({ length: 20 }, () => emp({ ultimaCompra: haMeses(5) })),
  ...Array.from({ length: 40 }, () => emp({ ultimaCompra: haMeses(20) })),
  ...Array.from({ length: 10 }, () => emp({ ultimaCompra: haMeses(1) })),
];
const lista = montaListaDoDia(farta, HOJE);
const conta = (b) => lista.filter((e) => e.balde === b).length;

ok(lista.filter((e) => !e.extra).length === EMPRESAS_DO_DIA, "o compromisso são 20 empresas");
ok(conta("recompra") === COTA_DIARIA.recompra, "5 de recompra");
ok(conta("nutricao") === COTA_DIARIA.nutricao, "3 de nutrição");
ok(conta("reativacao") === COTA_DIARIA.reativacao, "12 de reativação");
ok(conta("extra") === COTA_DIARIA.extra, "3 entre eventos como extras");
ok(lista.filter((e) => e.extra).every((e) => e.balde === "extra"), "só entre eventos é extra");
ok(new Set(lista.map((e) => e.id)).size === lista.length, "nenhuma empresa repetida no dia");

// --- ordem dentro do balde
const ordemRecompra = montaListaDoDia(
  [emp({ id: "r-nova", ultimaCompra: haMeses(8) }), emp({ id: "r-velha", ultimaCompra: haMeses(11) })],
  HOJE
);
ok(ordemRecompra[0].id === "r-velha", "em recompra vem primeiro quem está mais perto de estourar a janela");

const ordemReativacao = montaListaDoDia(
  [emp({ id: "v-fria", ultimaCompra: haMeses(40) }), emp({ id: "v-morna", ultimaCompra: haMeses(13) })],
  HOJE
);
ok(ordemReativacao[0].id === "v-morna", "em reativação vem primeiro a mais morna");

const ordemExtra = montaListaDoDia(
  [emp({ id: "x-antiga", ultimaCompra: haMeses(2) }), emp({ id: "x-recente", ultimaCompra: haMeses(0) })],
  HOJE
);
ok(ordemExtra[0].id === "x-recente", "nos extras vem primeiro quem comprou mais recentemente");

// --- desempate por tempo sem contato efetivo
const empate = montaListaDoDia(
  [
    emp({ id: "falou-ontem", ultimaCompra: haMeses(9), ultimoContato: "2026-09-22" }),
    emp({ id: "sumida", ultimaCompra: haMeses(9), ultimoContato: "2026-01-10" }),
    emp({ id: "nunca", ultimaCompra: haMeses(9) }),
  ],
  HOJE
);
ok(empate[0].id === "nunca", "empate: quem nunca foi contactada vem primeiro");
ok(empate[1].id === "sumida", "empate: depois quem está há mais tempo sem contato");

// --- auxílio vai na frente do próprio balde
const comAuxilio = montaListaDoDia(
  [emp({ id: "normal", ultimaCompra: haMeses(11) }), emp({ id: "travada", ultimaCompra: haMeses(8) })],
  HOJE,
  new Map([["travada", { ultimaData: "2026-01-01", ultimoResultado: "tentativa", tentativasSeguidas: 3 }]])
);
ok(comAuxilio[0].id === "travada", "empresa com auxílio do líder vem na frente");

// --- exclusões
ok(montaListaDoDia([emp({ id: "no-funil", ultimaCompra: haMeses(9), noFunil: true })], HOJE).length === 0,
  "empresa com negócio aberto fica de fora");
ok(montaListaDoDia([emp({ id: "trocando", ultimaCompra: haMeses(9) })], HOJE, new Map(), new Set(["trocando"])).length === 0,
  "empresa com troca de segmento em aberto não volta");
ok(montaListaDoDia([emp({ id: "1", ultimaCompra: haMeses(9) })], HOJE, hist("efetivo", "2026-09-20")).length === 0,
  "empresa em descanso não volta antes da hora");

// --- a janela de 30 dias sem contato
// Regra de negócio, veio de cliente reclamando de contato excessivo. Vale por
// cima de tudo: nem o descanso cumprido nem a carteira vazia a furam.
ok(JANELA_SEM_CONTATO === 30, "a janela é de 30 dias");
ok(contatadaHaPouco("2026-09-22", HOJE) === true, "contato de ontem bloqueia");
ok(contatadaHaPouco("2026-08-25", HOJE) === true, "29 dias ainda bloqueia");
ok(contatadaHaPouco("2026-08-24", HOJE) === false, "30 dias libera");
ok(contatadaHaPouco(null, HOJE) === false, "sem contato registrado não bloqueia");
ok(
  montaListaDoDia([emp({ id: "x", ultimaCompra: haMeses(9), ultimoContato: "2026-09-10" })], HOJE).length === 0,
  "empresa procurada há 13 dias não entra na lista"
);
ok(
  montaListaDoDia([emp({ id: "y", ultimaCompra: haMeses(9), ultimoContato: "2026-07-01" })], HOJE).length === 1,
  "empresa parada há meses entra"
);
// O caso que gerou a regra: a lista preferia deixar vaga vazia a repetir
// contato. Carteira inteira procurada esta semana devolve dia vazio.
const recem = Array.from({ length: 40 }, () =>
  emp({ ultimaCompra: haMeses(20), ultimoContato: "2026-09-15" })
);
ok(montaListaDoDia(recem, HOJE).length === 0, "carteira toda contatada há pouco devolve dia vazio");

// --- cota maior, para a equipe que precisa de mais empresas por dia
const muitas = Array.from({ length: 300 }, () => emp({ ultimaCompra: haMeses(20) }));
const dia50 = montaListaDoDia(muitas, HOJE, new Map(), new Set(), 50).filter((e) => !e.extra);
ok(dia50.length === 50, "cota de 50 entrega 50");
ok(new Set(dia50.map((e) => e.id)).size === 50, "sem repetir nenhuma");
const dia20 = montaListaDoDia(muitas, HOJE).filter((e) => !e.extra);
ok(dia20.length === EMPRESAS_DO_DIA, "sem cota, continua o padrão");
// Dobrar o dia não pode virar reativação pura: a mistura dos baldes acompanha.
const mistas = [
  ...Array.from({ length: 100 }, () => emp({ ultimaCompra: haMeses(9) })),
  ...Array.from({ length: 100 }, () => emp({ ultimaCompra: haMeses(5) })),
  ...Array.from({ length: 100 }, () => emp({ ultimaCompra: haMeses(20) })),
];
const m50 = montaListaDoDia(mistas, HOJE, new Map(), new Set(), 50);
const fator = 50 / EMPRESAS_DO_DIA;
ok(
  m50.filter((e) => e.balde === "recompra").length === Math.round(COTA_DIARIA.recompra * fator),
  "a cota de recompra acompanha o tamanho do dia"
);
ok(
  m50.filter((e) => e.balde === "nutricao").length === Math.round(COTA_DIARIA.nutricao * fator),
  "a de nutrição também"
);

// --- cascata
const semRecompra = [
  ...Array.from({ length: 40 }, () => emp({ ultimaCompra: haMeses(20) })),
  ...Array.from({ length: 10 }, () => emp({ ultimaCompra: haMeses(5) })),
];
const cascata = montaListaDoDia(semRecompra, HOJE).filter((e) => !e.extra);
ok(cascata.length === EMPRESAS_DO_DIA, "sem recompra, a cascata ainda fecha as 20");
ok(cascata.filter((e) => e.balde === "recompra").length === 0, "não inventa recompra que não existe");

const pequena = Array.from({ length: 7 }, () => emp({ ultimaCompra: haMeses(20) }));
const curta = montaListaDoDia(pequena, HOJE);
ok(curta.length === 7, "carteira menor que a cota entrega o que tem");
ok(new Set(curta.map((e) => e.id)).size === 7, "e não repete empresa para completar");

// --- histórico: sequência de tentativas só conta enquanto não é interrompida
const h1 = montaHistorico([
  { companyId: "a", data: "2026-09-22", resultado: "tentativa" },
  { companyId: "a", data: "2026-09-18", resultado: "tentativa" },
  { companyId: "a", data: "2026-09-15", resultado: "tentativa" },
]);
ok(h1.get("a").tentativasSeguidas === 3, "três tentativas seguidas contam");
const h2 = montaHistorico([
  { companyId: "b", data: "2026-09-22", resultado: "tentativa" },
  { companyId: "b", data: "2026-09-18", resultado: "efetivo" },
  { companyId: "b", data: "2026-09-15", resultado: "tentativa" },
]);
ok(h2.get("b").tentativasSeguidas === 1, "um contato efetivo no meio zera a sequência");
ok(h2.get("b").ultimoResultado === "tentativa", "o último resultado é o do dia mais recente");
ok(h2.get("b").aparicoes === 3, "conta todas as aparições");

// --- placar do dia: o que entra e o que fica de fora
const { placarDoDia, situacaoDoDia } = await import("./carteira.js");
const dia = [
  { id: "1", resultado: "efetivo" },
  { id: "2", resultado: "tentativa" },
  { id: "3", resultado: "nao_abordei" },
  { id: "4", resultado: null },
  { id: "5", resultado: "trocar_segmento" },
  { id: "6", resultado: "efetivo", extra: true },
];
const p = placarDoDia(dia);
ok(p.total === 4, "o placar conta só o compromisso, sem extras nem trocas");
ok(p.efetivo === 1 && p.tentativa === 1 && p.nao_abordei === 1 && p.sem_registro === 1, "as quatro faixas somam o compromisso");
ok(p.efetivo + p.tentativa + p.nao_abordei + p.sem_registro === p.total, "nada some do placar");
ok(p.trocas === 1, "as trocas são contadas à parte");
ok(p.pct === 25, "o percentual é sobre o compromisso, não sobre o preenchido");

// --- situação do dia
ok(situacaoDoDia([]).chave === "sem_lista", "sem lista");
ok(situacaoDoDia([{ abordagem: null }]).chave === "nao_iniciado", "nada mapeado é dia não iniciado");
ok(situacaoDoDia([{ abordagem: "X" }, { abordagem: null }]).chave === "mapeando", "parcialmente mapeado");
ok(situacaoDoDia([{ abordagem: "X" }]).chave === "iniciado", "tudo mapeado e nada fechado é dia iniciado");
ok(situacaoDoDia([{ abordagem: "X", resultado: "efetivo" }]).chave === "fechado", "tudo com resultado é dia fechado");

process.exit(falhou ? 1 : 0);
