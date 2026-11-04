// node lib/gemini.check.mjs — leitura do erro de cota. O prompt é testado em
// lib/prompt.check.mjs, porque não é do provedor.
const { leErroDeCota } = await import("./gemini.js");

let falhou = false;
const ok = (cond, msg) => {
  if (!cond) falhou = true;
  console.log((cond ? "ok: " : "FALHOU: ") + msg);
};
// O 429 do Google diz o motivo e o tempo de espera. A tela precisa disso em
// português, não de um "veja o log".
const porMinuto = leErroDeCota(JSON.stringify({ error: { code: 429, details: [
  { "@type": "type.googleapis.com/google.rpc.QuotaFailure", violations: [{ quotaId: "GenerateRequestsPerMinutePerProjectPerModel" }] },
  { "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "18s" },
] } }));
ok(porMinuto.segundos === 18, "o tempo de espera é lido do erro");
ok(!porMinuto.porDia, "limite por minuto não é confundido com cota do dia");
ok(porMinuto.mensagem.includes("18 segundos"), "a espera aparece na mensagem da tela");

const porDia = leErroDeCota(JSON.stringify({ error: { details: [
  { "@type": "type.googleapis.com/google.rpc.QuotaFailure", violations: [{ quotaId: "GenerateRequestsPerDayPerProjectPerModel" }] },
] } }));
ok(porDia.porDia, "cota do dia é reconhecida");
ok(porDia.mensagem.includes("cota diária"), "a mensagem do dia fala em cota diária");
ok(!porDia.mensagem.includes("segundos"), "cota do dia não promete espera curta");

ok(leErroDeCota("<html>502</html>").mensagem.length > 0, "corpo que não é JSON ainda vira mensagem");
ok(leErroDeCota("").segundos === 0, "sem RetryInfo não inventa tempo");

console.log(falhou ? "gemini: tem falha." : "gemini: tudo certo.");
process.exit(falhou ? 1 : 0);
