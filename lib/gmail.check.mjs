// node lib/gmail.check.mjs — montagem do e-mail. O envio em si não entra:
// depende de rede e de credencial, e o que quebra calado é o MIME.
process.env.GOOGLE_SA_EMAIL ||= "x@y.iam.gserviceaccount.com";
process.env.GOOGLE_SA_KEY ||= "chave-falsa";
const { mime, cabecalhoUtf8, separaAssunto, paraHtml } = await import("./gmail.js");

let falhou = false;
const ok = (cond, msg) => {
  if (!cond) falhou = true;
  console.log((cond ? "ok: " : "FALHOU: ") + msg);
};

const de = { nome: "Talita Santos Cruz", email: "talita.cruz@profissionaissa.com" };
const base = { assunto: "Retomada", para: ["cliente@empresa.com"], cc: [], bcc: [], html: "<p>oi</p>" };

// A linha em branco entre cabeçalho e corpo é o que o Gmail usa para saber
// onde a mensagem começa. Sem ela o e-mail chega vazio.
const m = mime(de, base);
ok(m.includes("\r\n\r\n"), "o MIME separa cabeçalho e corpo com linha em branco");
ok(m.split("\r\n\r\n")[1].trim().length > 0, "o corpo não sai vazio");
ok(m.startsWith("From: "), "o From é o primeiro cabeçalho");
ok(m.includes("To: cliente@empresa.com"), "o destinatário entra");
ok(!m.includes("Cc:") && !m.includes("Bcc:"), "cabeçalho opcional vazio não é impresso");

const comBcc = mime(de, { ...base, bcc: ["log@portal.hubspot.com"] });
ok(comBcc.includes("Bcc: log@portal.hubspot.com"), "o BCC de log entra quando existe");

// Acento em cabeçalho precisa de RFC 2047, senão chega como caractere quebrado.
ok(cabecalhoUtf8("Retomada") === "Retomada", "assunto sem acento passa direto");
ok(cabecalhoUtf8("Reunião").startsWith("=?UTF-8?B?"), "assunto com acento é codificado");
ok(mime({ nome: "João Lucas", email: "j@x.com" }, base).includes("=?UTF-8?B?"), "nome com acento é codificado");

// base64 em linhas de 76: servidor recusa linha maior.
const longo = mime(de, { ...base, html: "<p>" + "a".repeat(5000) + "</p>" });
const corpo = longo.split("\r\n\r\n")[1];
ok(corpo.split("\r\n").every((l) => l.length <= 76), "o base64 do corpo quebra em 76 colunas");

// O Gemini devolve o assunto na primeira linha.
const s1 = separaAssunto("Assunto: Voltando a falar\n\nOi Maria, tudo bem?");
ok(s1.assunto === "Voltando a falar", "o assunto sai da primeira linha");
ok(s1.corpo === "Oi Maria, tudo bem?", "o corpo não leva a linha do assunto");
const s2 = separaAssunto("Oi Maria, tudo bem?");
ok(s2.assunto === "Contato da PSA" && s2.corpo === "Oi Maria, tudo bem?", "sem a linha, usa o assunto padrão");
ok(separaAssunto("").corpo === "", "texto vazio não inventa corpo");
ok(separaAssunto("ASSUNTO:  Oferta  ").assunto === "Oferta", "a etiqueta é reconhecida em caixa alta");

// O que a pessoa leu é o que o cliente recebe.
ok(paraHtml("a\nb") === "<p>a<br>b</p>", "quebra simples vira br");
ok(paraHtml("a\n\nb") === "<p>a</p>\n<p>b</p>", "linha em branco vira parágrafo novo");
ok(paraHtml("<script>x</script>").includes("&lt;script&gt;"), "HTML colado no texto é escapado");

console.log(falhou ? "gmail: tem falha." : "gmail: tudo certo.");
process.exit(falhou ? 1 : 0);
