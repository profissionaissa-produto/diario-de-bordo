// node lib/canal.check.mjs — a cascata de canais, com os dois exemplos que o
// usuário deu quando pediu a regra.
const {
  CANAIS,
  LIMITE_POR_CANAL,
  canaisLiberados,
  canalSugerido,
  canalEsgotado,
  restamNo,
  semCanal,
  rotuloCanal,
  CANAL_VALIDO,
} = await import("./canal.js");

let falhou = false;
const ok = (cond, msg) => {
  if (!cond) falhou = true;
  console.log((cond ? "ok: " : "FALHOU: ") + msg);
};

ok(LIMITE_POR_CANAL === 3, "o teto é de 3 tentativas por canal");
ok(CANAIS.map((c) => c.key).join() === "whatsapp,email,ligacao", "a ordem é WhatsApp, e-mail, ligação");

// Empresa nova: nada tentado, tudo disponível, e o WhatsApp vem primeiro.
ok(canaisLiberados({}).join() === "whatsapp,email,ligacao", "sem tentativa, os três estão liberados");
ok(canalSugerido({}) === "whatsapp", "o primeiro oferecido é o WhatsApp");
ok(restamNo({}, "whatsapp") === 3, "começa com 3 chances no canal");

// Duas tentativas não fecham nada: o teto é no terceiro.
ok(!canalEsgotado({ whatsapp: 2 }, "whatsapp"), "2 tentativas não esgotam o canal");
ok(restamNo({ whatsapp: 2 }, "whatsapp") === 1, "sobra 1 chance depois de 2 tentativas");
ok(canalSugerido({ whatsapp: 2 }) === "whatsapp", "com chance sobrando, segue no mesmo canal");

// "tentou 3x pelo WhatsApp e não teve sucesso, só libera e-mail e ligação"
ok(canaisLiberados({ whatsapp: 3 }).join() === "email,ligacao", "3x no WhatsApp libera e-mail e ligação");
ok(canalSugerido({ whatsapp: 3 }) === "email", "depois do WhatsApp, o oferecido é o e-mail");
ok(canalEsgotado({ whatsapp: 3 }, "whatsapp"), "o WhatsApp fecha no terceiro");
ok(restamNo({ whatsapp: 3 }, "whatsapp") === 0, "canal fechado não tem chance sobrando");

// "tentou 3x por e-mail e não teve sucesso, só libera ligação"
ok(canaisLiberados({ whatsapp: 3, email: 3 }).join() === "ligacao", "3x no e-mail deixa só a ligação");
ok(canalSugerido({ whatsapp: 3, email: 3 }) === "ligacao", "o último oferecido é a ligação");

// Fim da linha: não é caso de mandar mensagem, é caso de levar para o líder.
ok(semCanal({ whatsapp: 3, email: 3, ligacao: 3 }), "os três estourados não deixam canal nenhum");
ok(canalSugerido({ whatsapp: 3, email: 3, ligacao: 3 }) === null, "sem canal, nada é sugerido");

// Passar do teto não quebra a conta, e canal desconhecido não entra.
ok(canaisLiberados({ whatsapp: 9 }).join() === "email,ligacao", "contagem acima do teto não reabre o canal");
ok(canaisLiberados({ fax: 3 }).join() === "whatsapp,email,ligacao", "canal desconhecido não mexe na lista");
ok(!CANAL_VALIDO("fax") && CANAL_VALIDO("email"), "só os três canais são aceitos");
ok(rotuloCanal("ligacao") === "Ligação" && rotuloCanal("fax") === "", "rótulo sai dos canais cadastrados");

console.log(falhou ? "canal: tem falha." : "canal: tudo certo.");
process.exit(falhou ? 1 : 0);
