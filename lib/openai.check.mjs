// node lib/openai.check.mjs — leitura do erro de cota. O prompt é testado em
// lib/prompt.check.mjs, porque não é do provedor.
const { leErroDeCota } = await import("./openai.js");

let falhou = false;
const ok = (cond, msg) => {
  if (!cond) falhou = true;
  console.log((cond ? "ok: " : "FALHOU: ") + msg);
};

// Limite por minuto: o cabeçalho retry-after diz quanto esperar, e esperar
// resolve. É o caso que a tela não deve nem mostrar, porque a chamada repete.
const porMinuto = leErroDeCota(
  JSON.stringify({ error: { message: "Rate limit reached", type: "rate_limit_error" } }),
  "12"
);
ok(porMinuto.segundos === 12, "o retry-after vira segundos");
ok(!porMinuto.semSaldo, "limite por minuto não é confundido com falta de saldo");
ok(porMinuto.mensagem.includes("12 segundos"), "a espera aparece na mensagem da tela");

// Saldo acabado: esperar não adianta, e a mensagem tem que dizer o que fazer.
const semSaldo = leErroDeCota(
  JSON.stringify({ error: { code: "insufficient_quota", message: "You exceeded your current quota" } }),
  "30"
);
ok(semSaldo.semSaldo, "insufficient_quota é reconhecido");
ok(semSaldo.mensagem.includes("sem saldo"), "a mensagem fala em saldo");
ok(!semSaldo.mensagem.includes("segundos"), "sem saldo não promete espera curta");

ok(leErroDeCota("<html>502</html>", null).mensagem.length > 0, "corpo que não é JSON ainda vira mensagem");
ok(leErroDeCota("", null).segundos === 0, "sem retry-after não inventa tempo");
ok(leErroDeCota("", "1.5s").segundos === 1.5, "retry-after com unidade ainda é lido");

console.log(falhou ? "openai: tem falha." : "openai: tudo certo.");
process.exit(falhou ? 1 : 0);
