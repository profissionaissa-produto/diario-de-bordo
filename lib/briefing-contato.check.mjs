// node lib/briefing-contato.check.mjs — o texto do registro de contato.
const { briefingDoContato } = await import("./briefing-contato.js");

let falhou = false;
const ok = (cond, msg) => {
  if (!cond) falhou = true;
  console.log((cond ? "ok: " : "FALHOU: ") + msg);
};

const est = { id: "b2b-2", titulo: "Vulnerabilidade (história do Busch)", desc: "" };

ok(briefingDoContato({ contatos: [] }) === "", "sem contato não inventa texto");

const um = briefingDoContato({
  contatos: [{ canal: "email", dia: "2026-11-04", tentativaNoCanal: 1 }],
  abordagem: "OFERTA PARA REATIVAÇÃO",
  estrategia: est,
});
ok(
  um === "04/11: 1ª tentativa por e-mail. Usando a abordagem de oferta para reativação e a estratégia 2, Vulnerabilidade (história do Busch).",
  "um contato vira uma frase com dia, canal, abordagem e estratégia"
);
ok(!um.includes("OFERTA PARA REATIVAÇÃO"), "a abordagem em caixa alta não grita no meio da frase");

const dois = briefingDoContato({
  contatos: [
    { canal: "whatsapp", dia: "2026-11-03", tentativaNoCanal: 1 },
    { canal: "ligacao", dia: "2026-11-04", tentativaNoCanal: 2 },
  ],
  abordagem: "PRIMEIRO CONTATO",
});
ok(dois.startsWith("03/11: 1ª tentativa por whatsapp. 04/11: 2ª tentativa por ligação."), "vários contatos entram em ordem");
ok(dois.endsWith("Usando a abordagem de primeiro contato."), "sem estratégia, só a abordagem é citada");

const soEstrategia = briefingDoContato({
  contatos: [{ canal: "email", dia: "2026-11-04", tentativaNoCanal: 3 }],
  estrategia: est,
});
ok(soEstrategia.endsWith("Usando a estratégia 2, Vulnerabilidade (história do Busch)."), "sem abordagem, só a estratégia");

const nu = briefingDoContato({ contatos: [{ canal: "email", dia: "2026-11-04", tentativaNoCanal: 1 }] });
ok(nu === "04/11: 1ª tentativa por e-mail.", "sem abordagem nem estratégia a frase fecha sozinha");

// Título que já vem em caixa mista não pode ser rebaixado.
const misto = briefingDoContato({
  contatos: [{ canal: "email", dia: "2026-11-04", tentativaNoCanal: 1 }],
  abordagem: "Agendar PSA First",
});
ok(misto.includes("abordagem de Agendar PSA First"), "abordagem em caixa mista é preservada");

console.log(falhou ? "briefing-contato: tem falha." : "briefing-contato: tudo certo.");
process.exit(falhou ? 1 : 0);
