// node lib/contato-ticket.check.mjs — quem recebe a mensagem de um ticket.
//
// Os casos são reais, lidos do HubSpot em 09/11/2026 na etapa de NF do
// palestrante. Entram nomeados porque o acerto aqui é o que impede a cobrança
// de sair para a pessoa errada, e o erro mais caro é mandar para dentro de casa.
const {
  nomeDoPalestrante,
  nomeBate,
  dominioBate,
  classificaContato,
  classificaContatos,
  escolheDestinatario,
  TIPOS,
} = await import("./contato-ticket.js");

let falhou = false;
const ok = (cond, msg) => {
  if (!cond) falhou = true;
  console.log((cond ? "ok: " : "FALHOU: ") + msg);
};

// ------------------------------------------- o nome como a propriedade manda
// A mesma conta grava o palestrante em três formatos.
ok(nomeDoPalestrante("Giva Pereira") === "Giva Pereira", "nome simples passa igual");
ok(
  nomeDoPalestrante("Clovis de Barros Filho (Clovis-de-Barros-Filho)") === "Clovis de Barros Filho",
  "o parêntese com o nome hifenizado sai fora"
);
ok(nomeDoPalestrante("Ilson-Júnior") === "Ilson Júnior", "hífen vira espaço");
ok(
  nomeDoPalestrante("Ilson Júnior (Ilson-Júnior)") === "Ilson Júnior",
  "nome com parêntese e hífen junto"
);
ok(
  nomeDoPalestrante("Dr. Drauzio  Varella (Dr.-Drauzio-Varella)") === "Dr. Drauzio Varella",
  "espaço dobrado some junto"
);
ok(nomeDoPalestrante("") === "" && nomeDoPalestrante(null) === "", "vazio não vira lixo");
// Este caso saiu numa mensagem de verdade em 09/11/2026: a rota mandava o
// valor cru para o prompt e o cliente recebeu "palestrante Arthur-Igreja".
ok(nomeDoPalestrante("Arthur Igreja (Arthur-Igreja)") === "Arthur Igreja", "nada de hífen no texto que sai");

// --------------------------------------------------------- casamento de nome
ok(nomeBate("Giva Pereira", "Giva Pereira"), "nome idêntico bate");
ok(nomeBate("Nathan Osipe", "NATHAN BARROS OSIPE"), "nome curto cabe dentro do longo");
ok(nomeBate("Dr. Drauzio Varella", "Dr. Drauzio  Varella"), "título e espaço não atrapalham");
ok(nomeBate("Marcos Troyjo", "Marcos Troyjo (Marcos-Troyjo)".replace(/\s*\(.*\)/, "")), "caso do Troyjo");
// O que NÃO pode bater: primeiro nome comum é chute, e chute aqui manda
// cobrança para a pessoa errada.
ok(!nomeBate("Marco Souza", "Marco Aurélio"), "só o primeiro nome igual não basta");
ok(!nomeBate("Camila Melo", "Nelson Freitas"), "nomes diferentes não batem");
ok(!nomeBate("Jessica", "Jessica Jackley"), "nome de um token só não decide");
ok(!nomeBate("", "Giva Pereira"), "contato sem nome não bate por nome");

// -------------------------------------------------------- casamento de domínio
// Palestrante costuma atender por endereço do próprio nome, e nesses o contato
// às vezes nem tem nome preenchido.
ok(dominioBate("contato@marikruger.com", "Mari Krüger"), "marikruger.com é da Mari Krüger");
ok(dominioBate("palestra@giovanegavio.com", "Giovane Gávio"), "giovanegavio.com é do Giovane Gávio");
ok(dominioBate("palestras@drauziovarella.com.br", "Dr. Drauzio Varella"), "drauziovarella.com.br bate");
ok(dominioBate("waldemar@niclevicz.com.br", "Waldemar Niclevicz"), "sobrenome longo sozinho serve");
ok(dominioBate("tati@fernandosegredo.com", "Fernando Segredo"), "assessoria no domínio do palestrante");
ok(dominioBate("comercial@arthurigreja.com", "Arthur Igreja"), "arthurigreja.com bate");
ok(!dominioBate("aline.ramos@loreal.com", "Felipe Costa"), "domínio de cliente não bate");
ok(!dominioBate("jaksonrfollmann@gmail.com", "Jackson Follmann"), "gmail não identifica ninguém");
ok(!dominioBate("", "Mari Krüger"), "sem e-mail não bate por domínio");

// -------------------------------------------------------------- classificação
const psa = { nome: "Ana Machado", email: "ana.machado@profissionaissa.com" };
ok(classificaContato(psa, "Gabriel Carneiro") === "psa", "funcionário da PSA é PSA");
// Mesmo que o nome batesse, o e-mail da casa manda: ninguém daqui recebe cobrança.
ok(
  classificaContato({ nome: "Ana Machado", email: "ana.machado@profissionaissa.com" }, "Ana Machado") === "psa",
  "e-mail da casa manda mesmo com o nome batendo"
);
ok(
  classificaContato({ nome: "Giva Pereira", email: "giva.pereira@fbxpress.com.br" }, "Giva Pereira") ===
    "palestrante",
  "Giva Pereira é o palestrante do ticket dele"
);
ok(
  classificaContato({ nome: "Pedro Montiel", email: "pedro.montiel@atitus.edu.br" }, "Giva Pereira") ===
    "contratante",
  "o outro contato do mesmo ticket é o contratante"
);
ok(
  classificaContato({ nome: "", email: "contato@marikruger.com" }, "Mari Krüger") === "palestrante",
  "sem nome, o domínio resolve"
);
// ponytail: o que este palpite não pega. "Jakson" e "Jackson" diferem numa
// letra e o e-mail é gmail, então cai como contratante. É por isso que a tela
// mostra o seletor com os três tipos em vez de esconder o que não casou.
ok(
  classificaContato({ nome: "Jakson Follmann", email: "jaksonrfollmann@gmail.com" }, "Jackson Follmann") ===
    "contratante",
  "grafia diferente no nome não é adivinhada, e o seletor existe para isso"
);

// ------------------------------------------------------------------- a lista
const lista = classificaContatos(
  [
    { id: "1", nome: "Ana Machado", email: "ana.machado@profissionaissa.com", telefone: "6665321321" },
    { id: "2", nome: "Giva Pereira", email: "giva.pereira@fbxpress.com.br", telefone: "+5511951376778" },
    { id: "3", nome: "Pedro Montiel", email: "pedro.montiel@atitus.edu.br", telefone: "+5551991898346" },
    { id: "4", nome: "Sem Contato Algum", email: "", telefone: "" },
  ],
  "Giva Pereira"
);
ok(lista.map((c) => c.id).join() === "3,4,2,1", "contratante primeiro, depois palestrante, PSA por último");
ok(lista[0].tipoLabel === TIPOS.contratante.label, "a lista traz o rótulo pronto para a tela");
ok(
  classificaContatos(
    [
      { id: "a", nome: "Sem Alcance Aqui", email: "", telefone: "" },
      { id: "b", nome: "Tem Tudo Aqui", email: "b@cliente.com", telefone: "+5511999999999" },
    ],
    "Fulano de Tal"
  )[0].id === "b",
  "dentro do tipo, quem dá para contatar vem primeiro"
);

// -------------------------------------------------------- escolha do destino
ok(escolheDestinatario(lista, "contratante").id === "3", "cobrança vai para o contratante");
ok(escolheDestinatario(lista, "palestrante").id === "2", "pedido de NF vai para o palestrante");
// Sem ninguém do lado pedido, não cai no outro lado calado.
const soCliente = classificaContatos([{ id: "9", nome: "Alguém", email: "a@cliente.com" }], "Giva Pereira");
ok(escolheDestinatario(soCliente, "palestrante") === null, "sem palestrante no ticket, devolve nada");
ok(escolheDestinatario(lista, "ambos") === null, "quando depende, ninguém é escolhido sozinho");
ok(escolheDestinatario([], "contratante") === null, "ticket sem contato devolve nada");

console.log(falhou ? "\nFALHOU" : "\ntudo certo");
process.exit(falhou ? 1 : 0);
