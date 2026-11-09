// node lib/gmail.check.mjs — montagem do e-mail. O envio em si não entra:
// depende de rede e de credencial, e o que quebra calado é o MIME.
process.env.GOOGLE_SA_EMAIL ||= "x@y.iam.gserviceaccount.com";
process.env.GOOGLE_SA_KEY ||= "chave-falsa";
const { mime, cabecalhoUtf8 } = await import("./gmail.js");
const { separaAssunto, paraHtml , semTravessao } = await import("./gmail-texto.js");

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

// -------------------------------------------------- a forma da chave privada
// O Node só diz "DECODER routines::unsupported" quando o PEM chega deformado,
// e isso aconteceu de verdade em 09/11/2026 ao ligar o envio no Diário. Estes
// casos são as formas erradas que a chave pode ter ao sair do painel.
const { formaDaChave, diagnosticoDaChave } = await import("./gmail.js");

// Uma chave de verdade vem em ~28 linhas de 64 caracteres, do jeito que o
// painel entrega: com \n literal entre elas.
const LINHAS = Array.from({ length: 28 }, (_, i) => (i === 0 ? "MIIEvgIBADANBgkq" : "A".repeat(64)));
const CORPO = LINHAS.join("\\n");
const boa = `-----BEGIN PRIVATE KEY-----\\n${CORPO}\\n-----END PRIVATE KEY-----\\n`;

const fBoa = formaDaChave(boa);
ok(fBoa.comecaComBegin && fBoa.terminaComEnd, "chave boa começa e termina certo");
ok(fBoa.temBarraNLiteral, "o painel entrega com \\n literal, e isso é o esperado");
ok(fBoa.quebrasDeLinha >= 28, "as ~28 quebras aparecem depois da troca");
ok(diagnosticoDaChave(fBoa) === "", "chave bem formada não acusa nada");

ok(diagnosticoDaChave(formaDaChave("")) === "GOOGLE_SA_KEY está vazia no ambiente.", "vazia é dita como vazia");
ok(
  /aspas do JSON/.test(diagnosticoDaChave(formaDaChave(`"${boa}"`))),
  "colada com as aspas do JSON é apontada"
);
ok(
  /numa linha só/.test(
    diagnosticoDaChave(
      formaDaChave(`-----BEGIN PRIVATE KEY-----${LINHAS.join("")}-----END PRIVATE KEY-----`)
    )
  ),
  "sem as quebras é apontada"
);
ok(
  /não começa com/.test(diagnosticoDaChave(formaDaChave(`${CORPO}\\n-----END PRIVATE KEY-----`))),
  "sem o BEGIN é apontada"
);
ok(
  /não termina com/.test(diagnosticoDaChave(formaDaChave(`-----BEGIN PRIVATE KEY-----\\n${CORPO}`))),
  "sem o END é apontada"
);
// Nada do que sai daqui pode conter a chave.
const serial = JSON.stringify(fBoa);
ok(!serial.includes(LINHAS[1].slice(0, 40)), "a forma não carrega pedaço da chave");
ok(!/[A-Za-z0-9+/]{40,}/.test(serial), "nem nada que pareça base64 longo");

// ------------------------------------------------------------- travessão
// O caso real: saiu numa mensagem de WhatsApp gerada em 09/11/2026, mesmo com
// a regra no prompt desde o começo.
ok(
  semTravessao("valor R$ 30.000,00 — falta a nota fiscal") === "valor R$ 30.000,00, falta a nota fiscal",
  "o travessão da mensagem real vira vírgula"
);
ok(semTravessao("a – b") === "a, b", "meia-risca também sai");
ok(semTravessao("a—b") === "a, b", "sem espaço em volta também sai");
ok(semTravessao("Oi, Ana — tudo certo") === "Oi, Ana, tudo certo", "vírgula seguida de travessão não dobra");
ok(semTravessao("sem nada disso aqui") === "sem nada disso aqui", "texto limpo passa igual");
ok(semTravessao("") === "" && semTravessao(null) === "", "vazio não vira lixo");
ok(!semTravessao("um — dois – três").includes("—"), "não sobra nenhum");
// O hífen comum é pontuação legítima e fica: "e-mail", "pós-palestra".
ok(semTravessao("e-mail pós-palestra") === "e-mail pós-palestra", "hífen comum não é travessão");

console.log(falhou ? "gmail: tem falha." : "gmail: tudo certo.");
process.exit(falhou ? 1 : 0);
