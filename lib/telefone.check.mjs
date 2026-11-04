// node lib/telefone.check.mjs — os formatos que o CRM realmente devolve.
const { paraWhatsApp, linkWhatsApp, telefoneLegivel } = await import("./telefone.js");

let falhou = false;
const ok = (cond, msg) => {
  if (!cond) falhou = true;
  console.log((cond ? "ok: " : "FALHOU: ") + msg);
};

// Formatos medidos nos contatos das carteiras dos farmers.
ok(paraWhatsApp("+5511961448410") === "5511961448410", "E-164 de celular perde só o mais");
ok(paraWhatsApp("+559433462141") === "559433462141", "E-164 de fixo continua válido");
ok(paraWhatsApp("61999540302") === "5561999540302", "celular sem DDI ganha o 55");
ok(paraWhatsApp("4733334444") === "554733334444", "fixo com DDD e sem DDI ganha o 55");
ok(paraWhatsApp("+4520234827") === "4520234827", "número de fora do Brasil passa inteiro");

// Sujeira comum de digitação.
ok(paraWhatsApp("(51) 99292-6551") === "5551992926551", "máscara brasileira é limpa");
ok(paraWhatsApp(" +55 11 96144-8410 ") === "5511961448410", "espaço e traço não atrapalham");
ok(paraWhatsApp("005511961448410") === "5511961448410", "prefixo 00 de discagem sai");

// O que não dá para salvar fica de fora: chutar DDD mandaria mensagem para
// desconhecido, que é pior do que não ter botão.
ok(paraWhatsApp("") === "", "vazio não vira número");
ok(paraWhatsApp(null) === "", "nulo não vira número");
ok(paraWhatsApp("ramal 204") === "", "texto sem dígito suficiente não vira número");
ok(paraWhatsApp("999540302") === "", "número sem DDD é recusado");
ok(paraWhatsApp("1234") === "", "ramal curto é recusado");

// O link carrega o texto já codificado.
const link = linkWhatsApp("+5511961448410", "Oi, tudo bem? Falo da PSA & cia");
ok(link.startsWith("https://wa.me/5511961448410?text="), "link aponta para o número do cliente");
ok(link.includes("%26") && !link.includes("& cia"), "o texto vai codificado na URL");
ok(linkWhatsApp("999540302", "oi") === "", "sem número confiável não há link");

ok(telefoneLegivel("+5511961448410") === "(11) 96144-8410", "celular aparece formatado");
ok(telefoneLegivel("+559433462141") === "(94) 3346-2141", "fixo aparece formatado");
ok(telefoneLegivel("+4520234827") === "+4520234827", "estrangeiro aparece com o mais");

console.log(falhou ? "telefone: tem falha." : "telefone: tudo certo.");
process.exit(falhou ? 1 : 0);
