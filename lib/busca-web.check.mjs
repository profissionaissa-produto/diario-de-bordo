// node lib/busca-web.check.mjs — o que o Custom Search devolve vira o que o
// prompt usa. Sem rede: depender de cota para rodar teste é teste que não roda.
const { noticiasDaResposta, termoDaNoticia } = await import("./busca-web.js");

let falhou = false;
const ok = (cond, msg) => {
  if (!cond) falhou = true;
  console.log((cond ? "ok: " : "FALHOU: ") + msg);
};

ok(termoDaNoticia("Financeiro") === "notícias do setor Financeiro no Brasil", "o termo amarra setor e país");
ok(termoDaNoticia("  Agronegócio  ") === "notícias do setor Agronegócio no Brasil", "espaço em volta sai");
ok(termoDaNoticia("") === "", "sem setor não monta termo");
ok(termoDaNoticia(null) === "", "nem com nulo");

const RESPOSTA = {
  items: [
    {
      title: "Bancos projetam alta do crédito em 2027",
      link: "https://valor.globo.com/financas/noticia/exemplo",
      displayLink: "valor.globo.com",
      snippet: "O setor   financeiro  espera\ncrescimento de dois dígitos",
    },
    // Item sem link acontece e viraria citação sem para onde ir.
    { title: "Sem link", displayLink: "exemplo.com" },
    { title: "Segunda", link: "https://exame.com/a", displayLink: "exame.com", snippet: "b" },
    { title: "Terceira", link: "https://infomoney.com.br/b", displayLink: "infomoney.com.br", snippet: "c" },
  ],
};

const n = noticiasDaResposta(RESPOSTA, 2);
ok(n.length === 2, "respeita o máximo pedido");
ok(n.every((x) => x.url), "item sem link é descartado");
ok(!n.some((x) => x.titulo === "Sem link"), "e não entra pelo título");
ok(n[0].fonte === "valor.globo.com", "a fonte é o domínio, que é o que diz se presta");
ok(n[0].resumo === "O setor financeiro espera crescimento de dois dígitos", "o resumo vem numa linha só");
ok(noticiasDaResposta(null).length === 0, "resposta vazia não quebra");
ok(noticiasDaResposta({ items: "nao e lista" }).length === 0, "nem items que não é lista");

console.log(falhou ? "\nFALHOU" : "\ntudo certo");
process.exit(falhou ? 1 : 0);
