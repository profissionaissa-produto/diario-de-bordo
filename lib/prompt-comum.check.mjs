// node lib/prompt-comum.check.mjs — a abertura das mensagens.
//
// Existe porque a regra anterior proibia cumprimentar, e as mensagens saíam
// secas. O time reclamou. Este arquivo trava o contrário: cumprimentar é
// obrigatório, e no horário certo.
const { saudacaoDoDia, regraDeAbertura, PROIBIDO_ENROLAR } = await import("./prompt-comum.js");
const { montaPrompt } = await import("./prompt.js");
const { montaPromptFinanceiro } = await import("./prompt-financeiro.js");
const { montaPromptCloser } = await import("./prompt-closer.js");

let falhou = false;
const ok = (cond, msg) => {
  if (!cond) falhou = true;
  console.log((cond ? "ok: " : "FALHOU: ") + msg);
};

// Horário de Brasília, não o do servidor. Em UTC, 11h em São Paulo é 14h, e
// um servidor que olhasse o próprio relógio diria "boa tarde" de manhã.
const emSP = (h) => new Date(Date.UTC(2026, 10, 10, h + 3, 0, 0));
ok(saudacaoDoDia(emSP(8)) === "Bom dia", "8h em São Paulo é bom dia");
ok(saudacaoDoDia(emSP(11)) === "Bom dia", "11h ainda é bom dia");
ok(saudacaoDoDia(emSP(12)) === "Boa tarde", "meio-dia vira boa tarde");
ok(saudacaoDoDia(emSP(17)) === "Boa tarde", "17h ainda é boa tarde");
ok(saudacaoDoDia(emSP(18)) === "Boa tarde" || saudacaoDoDia(emSP(18)) === "Boa noite", "18h é a virada");
ok(saudacaoDoDia(emSP(19)) === "Boa noite", "19h é boa noite");
ok(saudacaoDoDia(emSP(23)) === "Boa noite", "23h é boa noite");

// A regra em si.
const rw = regraDeAbertura("whatsapp", emSP(15));
ok(/Boa tarde/.test(rw), "a saudação entra na regra");
ok(/TEM que começar cumprimentando/.test(rw), "e é obrigatória, não sugestão");
ok(/tudo bem\?/.test(rw), "o 'tudo bem?' passa a ser permitido");
ok(/coloquial e respeitoso/i.test(rw), "o tom pedido está dito");

const rl = regraDeAbertura("ligacao", emSP(9));
ok(/Bom dia/.test(rl), "a ligação também cumprimenta");
ok(/se identifica pelo nome/.test(rl), "e quem liga se identifica");

ok(/PROIBIDO enrolar/.test(PROIBIDO_ENROLAR), "enrolação continua proibida");
ok(!/\"tudo bem\?\"/.test(PROIBIDO_ENROLAR), "mas o cumprimento saiu da lista de proibidos");

// Os três prompts têm que carregar a regra, nos três canais. É o que garante
// que ninguém mexa em um e esqueça dos outros dois.
const BASES = {
  carteira: (canal, agora) =>
    montaPrompt({ empresa: "Acme", contato: { nome: "Ana" }, canal, tentativa: 1, ultimaCompra: "2024-03-02", agora }),
  financeiro: (canal, agora) =>
    montaPromptFinanceiro({ cliente: "Acme", contato: { nome: "Ana" }, canal, tentativa: 1, destino: "contratante", agora }),
  closer: (canal, agora) =>
    montaPromptCloser({ negocio: "Acme", contato: { nome: "Ana" }, canal, tentativa: 1, agora }),
};

for (const [nome, monta] of Object.entries(BASES)) {
  for (const canal of ["whatsapp", "email", "ligacao"]) {
    const p = monta(canal, emSP(15));
    ok(/Boa tarde/.test(p), `${nome}/${canal} leva a saudação do horário`);
    ok(/TEM que começar cumprimentando|TEM que começar cumprimentando a pessoa/.test(p), `${nome}/${canal} exige o cumprimento`);
    ok(/PROIBIDO enrolar/.test(p), `${nome}/${canal} mantém a proibição de enrolar`);
    ok(!/Sem saudação formal/.test(p), `${nome}/${canal} não proíbe mais saudação`);
  }
  // A saudação acompanha o relógio, não fica congelada no texto.
  ok(/Bom dia/.test(monta("whatsapp", emSP(9))), `${nome} de manhã diz bom dia`);
  ok(/Boa noite/.test(monta("whatsapp", emSP(20))), `${nome} à noite diz boa noite`);
}

console.log(falhou ? "\nFALHOU" : "\ntudo certo");
process.exit(falhou ? 1 : 0);
