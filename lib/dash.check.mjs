// node lib/dash.check.mjs — a base de palestrantes do Dash.
//
// Só a parte pura: escolher quem é o palestrante do ticket entre os
// resultados, e resolver por onde falar com ele. A chamada à API fica de
// fora, que ela precisa de chave e de rede.
//
// O que isto protege: escolher o palestrante errado manda a cobrança da NF
// para outra pessoa, e o erro só aparece do outro lado.
const { escolhePalestrante, termosDeBusca, contatoDoPerfil } = await import("./dash.js");

let falhou = false;
const ok = (cond, msg) => {
  if (!cond) falhou = true;
  console.log((cond ? "ok: " : "FALHOU: ") + msg);
};

const p = (id, nome, ativo = true) => ({ id, nome, email: `${id}@x.com`, ativo });

// ------------------------------------------------------------ quem é quem
ok(escolhePalestrante([p(1, "Giva Pereira")], "Giva Pereira")?.id === 1, "nome igual é o cara");
ok(
  escolhePalestrante([p(1, "Giva Pereira")], "Giva Pereira (Giva-Pereira)")?.id === 1,
  "o parêntese da propriedade não atrapalha"
);
ok(
  escolhePalestrante([p(1, "Nathan Barros Osipe")], "NATHAN BARROS OSIPE")?.id === 1,
  "caixa alta não atrapalha"
);
ok(
  escolhePalestrante([p(1, "Nathan Barros Osipe")], "Nathan Osipe")?.id === 1,
  "nome curto cabe dentro do longo"
);
ok(
  escolhePalestrante([p(1, "Dr. Drauzio Varella")], "Dr. Drauzio  Varella (Dr.-Drauzio-Varella)")?.id === 1,
  "título, espaço dobrado e hífen juntos"
);

// Ativo manda sobre desativado quando os dois casam.
ok(
  escolhePalestrante([p(1, "Dado Schneider", false), p(2, "Dado Schneider")], "Dado Schneider")?.id === 2,
  "entre o ativo e o desativado, vale o ativo"
);
ok(
  escolhePalestrante([p(1, "Dado Schneider", false)], "Dado Schneider")?.id === 1,
  "só desativado ainda é melhor do que nada, e a tela mostra quem é"
);

// ------------------------------------------- quando não dá para ter certeza
// Dois iguais é o caso perigoso: escolher um no par ou ímpar manda a cobrança
// da NF para o palestrante errado, e ninguém descobre deste lado.
ok(
  escolhePalestrante([p(1, "Dado Schneider"), p(2, "Dado Schneider")], "Dado Schneider") === null,
  "dois com o mesmo nome não são desempatados por conta própria"
);
ok(escolhePalestrante([], "Giva Pereira") === null, "busca vazia não inventa ninguém");
ok(escolhePalestrante([p(1, "Outra Pessoa")], "Giva Pereira") === null, "nome que não casa não vale");
ok(escolhePalestrante([p(1, "Marco Souza")], "Marco Aurélio") === null, "primeiro nome igual não basta");
ok(escolhePalestrante([p(1, "Giva Pereira")], "") === null, "sem nome no ticket não há quem procurar");

// ------------------------------------------------------- o termo da busca
ok(termosDeBusca("Giva Pereira").join("|") === "Giva Pereira|pereira", "nome inteiro e depois o maior token");
ok(termosDeBusca("Clovis de Barros Filho (Clovis-de-Barros-Filho)")[0] === "Clovis de Barros Filho", "limpa antes de buscar");
ok(termosDeBusca("Ilson-Júnior")[0] === "Ilson Júnior", "hífen vira espaço na busca");
ok(termosDeBusca("")  .length === 0, "sem nome não há termo");
ok(termosDeBusca("Madonna").length === 1, "nome de um token só busca uma vez");

// ------------------------------------------------ por onde falar com ele
const proprio = contatoDoPerfil(
  {
    usuario: { nome: "Giva", sobrenome: "Pereira", email: "giva@x.com", telefone: "+5511951376778" },
    contatarPor: "whatsapp",
    contatoPrincipal: "proprio",
  },
  42
);
ok(proprio.nome === "Giva Pereira", "nome e sobrenome viram um nome só");
ok(proprio.email === "giva@x.com" && proprio.telefone === "+5511951376778", "e-mail e telefone do próprio");
ok(proprio.contatarPor === "whatsapp", "a preferência vem do Dash");
ok(proprio.tipo === "palestrante" && proprio.fonte === "dash", "entra na lista marcado como do Dash");
ok(proprio.id === "dash:42", "o id não colide com id de contato do HubSpot");
ok(!proprio.porAssessoria, "sem assessoria no caminho");

// Assessoria: quem atende é o escritório, e falar direto com o palestrante
// fura o combinado que ele fez com a PSA.
const viaAssessoria = contatoDoPerfil(
  {
    usuario: { nome: "Leandro", sobrenome: "Karnal", email: "leandro@x.com", telefone: "+5511111111111" },
    contatarPor: "email",
    contatoPrincipal: "assessoria",
    adminFields: { assessoria: { nome: "Agência Kratos", email: "atendimento@kratos.com", telefone: "+5511999999999" } },
  },
  7
);
ok(viaAssessoria.email === "atendimento@kratos.com", "o e-mail é o da assessoria");
ok(viaAssessoria.telefone === "+5511999999999", "o telefone é o da assessoria");
ok(viaAssessoria.email !== "leandro@x.com", "o do palestrante não vaza no lugar do dela");
ok(/assessoria de Leandro Karnal/.test(viaAssessoria.nome), "o nome diz de quem ela é assessoria");
ok(viaAssessoria.porAssessoria, "fica marcado que passa pela assessoria");

// Preferência que o Diário não sabe fazer não vira canal inventado.
for (const v of ["telegram", "carta", "", null, undefined]) {
  ok(
    contatoDoPerfil({ usuario: {}, contatarPor: v }, 1).contatarPor === "",
    `preferência "${v}" fora dos três canais fica vazia`
  );
}
for (const v of ["whatsapp", "email", "ligacao"]) {
  ok(contatoDoPerfil({ usuario: {}, contatarPor: v }, 1).contatarPor === v, `preferência "${v}" passa`);
}

// Perfil vazio não derruba nada: a tela é que dirá que falta contato.
const vazio = contatoDoPerfil({}, 9);
ok(vazio.email === "" && vazio.telefone === "", "perfil sem nada devolve vazio, não undefined");

console.log(falhou ? "\nFALHOU" : "\ntudo certo");
process.exit(falhou ? 1 : 0);
