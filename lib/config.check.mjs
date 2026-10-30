// node lib/config.check.mjs — coerência do cadastro de segmentos e permissões.
const { CLOSERS, SEGMENTOS, PIPELINES_POR_SEG, SEG_CLOSER, segLideradoPor, EQUIPES_DE, closersDe, semEquipe, OWNER_POR_EMAIL, NOME_CLOSER } =
  await import("./config.js");
const { ESTRATEGIAS } = await import("./estrategias.js");
const { ehGestor, segmentosDe, podeGerirCloser } = await import("./permissoes.js");

let falhou = false;
const ok = (cond, msg) => {
  console[cond ? "log" : "error"](cond ? "ok:" : "FALHOU:", msg);
  if (!cond) falhou = true;
};

// Um segmento sem funil abre a tabela vazia; sem estratégias, o closer não
// consegue enviar (o campo é obrigatório); e um ownerId repetido em dois
// segmentos torna SEG_CLOSER ambíguo, o que decide permissão de líder.
for (const seg of SEGMENTOS) {
  ok(PIPELINES_POR_SEG[seg]?.length > 0, `${seg} tem funil definido`);
  ok(ESTRATEGIAS[seg]?.length > 0, `${seg} tem estratégias`);
}

const ids = SEGMENTOS.flatMap((s) => CLOSERS[s].map((c) => c.id));
ok(ids.length === new Set(ids).size, "nenhum closer em dois segmentos");
ok(Object.keys(SEG_CLOSER).length === ids.length, "todo closer tem segmento");

// Quem aprova quem. Um erro aqui deixa alguém decidindo sobre time que não é
// seu, ou um briefing sem ninguém que possa aprová-lo.
const usuario = (email) => ({ lidera: segLideradoPor(email) });
const cesar = usuario("cesar.filho@profissionaissa.com");
const daniel = usuario("daniel.sias@profissionaissa.com");
const nicollas = usuario("nicollas.lenuzza@profissionaissa.com");
const closerComum = usuario("nao.e.lider@profissionaissa.com");
const admin = { isAdmin: true };
// Segmento pode estar vazio (Farmer, enquanto o time de CS não entra): nesses
// casos o teste é pulado e dito em voz alta, nunca dado como aprovado.
const umDe = (seg) => CLOSERS[seg][0]?.id;
const comTime = (seg, msg, fn) => {
  if (!umDe(seg)) {
    console.log(`pulado: ${msg} (${seg} está sem closers cadastrados)`);
    return;
  }
  ok(fn(), msg);
};

// Farmer virou o time de CS em 22/09/2026 e deixou de ser dele.
ok(segmentosDe(cesar).join() === "B2B", "Cesar lidera só o B2B");
comTime("Farmer", "Cesar não alcança o Farmer", () => !podeGerirCloser(cesar, umDe("Farmer")));
comTime("B2B", "Cesar aprova closer do B2B", () => podeGerirCloser(cesar, umDe("B2B")));
comTime("B2C", "Cesar não aprova closer do B2C", () => !podeGerirCloser(cesar, umDe("B2C")));
comTime("Farmer", "Daniel decide só no Farmer", () =>
  podeGerirCloser(daniel, umDe("Farmer")) && !podeGerirCloser(daniel, umDe("B2B"))
);
comTime("B2C", "Nicollas decide só no B2C", () => podeGerirCloser(nicollas, umDe("B2C")));
comTime("B2B", "closer comum não gere ninguém", () =>
  !ehGestor(closerComum) && !podeGerirCloser(closerComum, umDe("B2B"))
);
ok(
  SEGMENTOS.filter((s) => umDe(s)).every((s) => podeGerirCloser(admin, umDe(s))),
  "admin alcança todos os segmentos com time"
);

// Equipes: uma equipe escrita errado no cadastro esconderia o closer de todos
// os filtros sem dar erro nenhum.
for (const seg of SEGMENTOS) {
  const validas = EQUIPES_DE(seg);
  if (validas.length === 0) continue; // segmento sem equipes não tem o que conferir
  const erradas = CLOSERS[seg].filter((c) => c.equipe && !validas.includes(c.equipe));
  ok(erradas.length === 0, `equipes válidas em ${seg}${erradas.length ? ": " + erradas.map((c) => c.nome).join(", ") : ""}`);
  const soma = validas.reduce((n, e) => n + closersDe(seg, e).length, 0);
  ok(soma + semEquipe(seg) === CLOSERS[seg].length, `ninguém some dos filtros de equipe em ${seg}`);
}

// Texto que vai para o HubSpot na aprovação. b2b-3 e b2c-3 são estratégias
// diferentes: sem o segmento no rótulo, o CRM não distingue as duas.
const { rotuloDa } = await import("./estrategias.js");
ok(rotuloDa("b2b-3") === "B2B 3. Pré-briefing", "rótulo da estratégia leva segmento e número");
ok(rotuloDa("b2c-3") !== rotuloDa("b2b-3"), "b2c-3 não se confunde com b2b-3");
ok(rotuloDa("nao-existe") === "", "estratégia desconhecida não inventa texto");

// Num dropdown o HubSpot descarta valor fora da lista sem dar erro, então o
// valor enviado tem de ser resolvido contra as opções reais da propriedade.
const { valorDaEstrategia } = await import("./estrategias.js");
const texto = { tipo: "string", opcoes: [] };
const dropIds = { tipo: "enumeration", opcoes: [{ value: "b2b-3", label: "B2B 3. Pré-briefing" }] };
// Como a propriedade "estrategia" existe hoje na conta: valor = rótulo = só o
// título, sem prefixo nem número. Conferido com get_properties.
const comoEstaNaConta = {
  tipo: "enumeration",
  opcoes: [...ESTRATEGIAS.B2B, ...ESTRATEGIAS.B2C].map((e) => ({ value: e.titulo, label: e.titulo })),
};

ok(valorDaEstrategia(null, "b2b-3") === undefined, "propriedade inexistente: não envia nada");
ok(valorDaEstrategia(texto, "b2b-3") === "B2B 3. Pré-briefing", "campo de texto recebe o rótulo");
ok(valorDaEstrategia(dropIds, "b2b-3") === "b2b-3", "dropdown com o id casa direto");
ok(valorDaEstrategia(comoEstaNaConta, "b2b-3") === "Pré-briefing", "casa com a opção da conta (só o título)");
ok(
  valorDaEstrategia(comoEstaNaConta, "b2c-1") === "Demanda do B2B que ele poderia ser indicado",
  "estratégia de B2C também casa"
);
// A garantia que importa: toda estratégia do sistema encontra sua opção.
const semOpcao = [...ESTRATEGIAS.B2B, ...ESTRATEGIAS.B2C].filter(
  (e) => valorDaEstrategia(comoEstaNaConta, e.id) === undefined
);
ok(semOpcao.length === 0, "as 20 estratégias casam com as opções da propriedade");
// Se os rótulos ganharem o prefixo B2B/B2C depois, o valor interno continua
// sendo o título — a gravação não pode quebrar por causa disso.
const rotuloRenomeado = {
  tipo: "enumeration",
  opcoes: [{ value: "Pré-briefing", label: "B2B 3. Pré-briefing" }],
};
ok(valorDaEstrategia(rotuloRenomeado, "b2b-3") === "Pré-briefing", "renomear o rótulo não quebra a gravação");
ok(valorDaEstrategia(dropIds, "b2c-9") === undefined, "sem opção correspondente: não envia nada");

// Tramitação é trabalho do CS: um closer de B2B não pode abrir o board, e um
// farmer sem liderança precisa poder.
const { podeVerTramitacoes } = await import("./permissoes.js");
const umFarmer = umDe("Farmer");
const umCloser = umDe("B2B");
ok(podeVerTramitacoes(admin, umCloser), "admin vê as tramitações");
ok(podeVerTramitacoes(daniel, null), "quem lidera o CS vê o board inteiro");
comTime("Farmer", "farmer vê as próprias tramitações", () => podeVerTramitacoes(closerComum, umFarmer));
comTime("B2B", "closer de B2B não vê tramitações", () => !podeVerTramitacoes(closerComum, umCloser));
ok(!podeVerTramitacoes(nicollas, umCloser), "líder de B2C não vê tramitações");

// Líder de equipe responde só pela própria equipe, não pelo segmento inteiro.
const { equipeLideradaPor, EQUIPE_CLOSER } = await import("./config.js");
const { equipeLiderada } = await import("./permissoes.js");
const liderEq = (email) => ({ lidera: null, lideraEquipe: equipeLideradaPor(email) });
const camila = liderEq("camila.fay@profissionaissa.com");
const katyeli = liderEq("katyeli.madril@profissionaissa.com");

const daEquipe = (eq) => CLOSERS.Farmer.find((c) => c.equipe === eq)?.id;
ok(ehGestor(camila), "líder de equipe é gestora");
ok(segmentosDe(camila).join() === "Farmer", "líder de equipe alcança só o segmento dela");
ok(podeGerirCloser(camila, daEquipe("Camila")), "Camila aprova a própria equipe");
ok(!podeGerirCloser(camila, daEquipe("Katyeli")), "Camila não aprova a equipe da Katyeli");
ok(!podeGerirCloser(camila, daEquipe("Leticia")), "Camila não aprova a equipe da Leticia");
comTime("B2B", "líder de equipe não alcança outro segmento", () => !podeGerirCloser(camila, umDe("B2B")));
ok(podeVerTramitacoes(camila, null), "líder de equipe do CS vê tramitações");
ok(equipeLiderada(camila)?.equipe === "Camila", "equipe liderada é reconhecida");

// A Katyeli lidera e também tem carteira: precisa aparecer nos dois papéis.
ok(EQUIPE_CLOSER["80454582"] === "Katyeli", "Katyeli está na própria equipe como farmer");
ok(podeGerirCloser(katyeli, daEquipe("Katyeli")), "Katyeli aprova a própria equipe");
ok(!podeGerirCloser(katyeli, daEquipe("Camila")), "Katyeli não aprova a equipe da Camila");

// Todo líder de equipe aponta para uma equipe que existe de verdade.
for (const [email, v] of Object.entries((await import("./config.js")).LIDERES_EQUIPE)) {
  ok(EQUIPES_DE(v.seg).includes(v.equipe), `equipe de ${email} existe em ${v.seg}`);
}

// Exceções de e-mail: o login não bate com o owner e sem o mapa o acesso morre.
for (const [email, id] of Object.entries(OWNER_POR_EMAIL)) {
  ok(!!NOME_CLOSER[id], `exceção de e-mail aponta para closer cadastrado: ${email}`);
}

// ---------------------------------------------- curadoria de estratégias
const { SEMENTES, montaEstrategias, indexaPorId, proximoId } = await import("./estrategias.js");
const { CURADORES_ESTRATEGIA, segCuradoPor } = await import("./config.js");
const { podeCriarEstrategia } = await import("./permissoes.js");

// O Farmer herdou as dez do B2B e os briefings antigos gravaram os ids b2b-*.
// Separar as listas sem manter esses ids apagaria o nome da estratégia em todo
// histórico do CS.
ok(
  SEMENTES.Farmer.map((e) => e.id).join() === SEMENTES.B2B.map((e) => e.id).join(),
  "Farmer parte dos mesmos ids do B2B (histórico continua legível)"
);
ok(SEMENTES.Farmer !== SEMENTES.B2B, "Farmer tem lista própria, não a mesma referência do B2B");

// Cadastrar em um segmento não pode vazar para os outros.
const nova = { id: "farmer-11", seg: "Farmer", titulo: "Retomada pós-evento", desc: "x" };
const mix = montaEstrategias([nova]);
ok(mix.Farmer.some((e) => e.id === "farmer-11"), "cadastrada entra no segmento dela");
ok(!mix.B2B.some((e) => e.id === "farmer-11"), "cadastrada no Farmer não aparece no B2B");
ok(mix.B2B.length === SEMENTES.B2B.length, "B2B segue com as dez originais");
ok(montaEstrategias([{ ...nova, seg: "Inexistente" }]).Inexistente === undefined, "segmento desconhecido é descartado");

// O número aparece na tela e o closer fala dele na reunião: dois itens com o
// mesmo número seriam indistinguíveis.
ok(proximoId("B2B", SEMENTES.B2B) === "b2b-11", "próximo id do B2B continua a numeração");
ok(proximoId("Farmer", SEMENTES.Farmer) === "farmer-11", "Farmer numera a partir das herdadas");
ok(proximoId("Farmer", mix.Farmer) === "farmer-12", "duas cadastradas não repetem número");
ok(proximoId("Inexistente", []) === null, "segmento desconhecido não gera id");

// A nova precisa ser legível onde o briefing já foi gravado.
const idxMix = indexaPorId(mix);
ok(idxMix["farmer-11"]?.titulo === "Retomada pós-evento", "índice enxerga a cadastrada");
ok(rotuloDa("farmer-11", idxMix) === "FARMER 11. Retomada pós-evento", "rótulo da cadastrada leva segmento e número");
ok(rotuloDa("b2b-3", idxMix) === "B2B 3. Pré-briefing", "índice completo não muda o rótulo das originais");
// Opção que ainda não existe no HubSpot: não inventa valor para o dropdown.
ok(valorDaEstrategia(comoEstaNaConta, "farmer-11", idxMix) === undefined, "estratégia sem opção na conta não é enviada");

// Curar é mais estreito do que liderar: líder não mexe na lista do time.
const curador = (email) => ({ curaEstrategia: segCuradoPor(email) });
const cesarC = curador("cesar.filho@profissionaissa.com");
const anaC = curador("ana.machado@profissionaissa.com");
ok(podeCriarEstrategia(cesarC, "B2B"), "Cesar cadastra estratégia de B2B");
ok(!podeCriarEstrategia(cesarC, "Farmer"), "Cesar não cadastra no Farmer");
ok(podeCriarEstrategia(anaC, "Farmer"), "Ana cadastra estratégia de Farmer");
ok(!podeCriarEstrategia(anaC, "B2B"), "Ana não cadastra no B2B");
ok(!podeCriarEstrategia(daniel, "Farmer"), "liderar o Farmer não dá direito de cadastrar");
ok(!podeCriarEstrategia({ isAdmin: true }, "B2B"), "admin sem curadoria não cadastra");
ok(!podeCriarEstrategia(cesarC, ""), "segmento vazio não cadastra nada");
for (const [email, seg] of Object.entries(CURADORES_ESTRATEGIA)) {
  ok(SEGMENTOS.includes(seg), `curadoria de ${email} aponta para segmento que existe`);
}

// Ana entrou como líder do Farmer: precisa aprovar o time dela e ninguém mais.
const ana = usuario("ana.machado@profissionaissa.com");
ok(ehGestor(ana), "Ana é gestora");
ok(segmentosDe(ana).join() === "Farmer", "Ana alcança só o Farmer");
ok(podeGerirCloser(ana, CLOSERS.Farmer[0].id), "Ana aprova briefing de farmer");
ok(!podeGerirCloser(ana, CLOSERS.B2B[0].id), "Ana não aprova briefing de B2B");

process.exit(falhou ? 1 : 0);
