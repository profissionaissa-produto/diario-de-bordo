// node lib/busca-web.check.mjs — as citações da busca viram o que o prompt usa.
// Sem rede: depender de saldo para rodar teste é teste que ninguém roda.
const { noticiasDaResposta, termoDaNoticia } = await import("./busca-web.js");

let falhou = false;
const ok = (cond, msg) => {
  if (!cond) falhou = true;
  console.log((cond ? "ok: " : "FALHOU: ") + msg);
};

ok(
  termoDaNoticia("Financeiro") === "notícias recentes do setor Financeiro no Brasil, dos últimos três meses",
  "o termo amarra setor, país e recorte de tempo"
);
ok(termoDaNoticia("  Agronegócio  ").includes("Agronegócio"), "espaço em volta sai");
ok(termoDaNoticia("") === "", "sem setor não monta termo");

// A busca devolve as fontes como anotações de url dentro do texto.
const RESPOSTA = {
  output: [
    {
      content: [
        {
          annotations: [
            { type: "url_citation", url: "https://valor.globo.com/a", title: "Bancos projetam alta" },
            // Repetida: o modelo cita a mesma matéria duas vezes e o closer
            // escolheria entre dois itens iguais.
            { type: "url_citation", url: "https://valor.globo.com/a", title: "Bancos projetam alta" },
            // Anotação que não é citação de url não tem link para mandar.
            { type: "file_citation", url: "https://exemplo.com/x", title: "Outra coisa" },
            { type: "url_citation", url: "https://www.exame.com/b", title: "Segunda" },
            { type: "url_citation", url: "https://infomoney.com.br/c", title: "Terceira" },
            { type: "url_citation", url: "https://estadao.com.br/d", title: "Quarta" },
          ],
        },
      ],
    },
  ],
};

const n = noticiasDaResposta(RESPOSTA, 3);
ok(n.length === 3, "respeita o máximo pedido");
ok(new Set(n.map((x) => x.url)).size === 3, "link repetido entra uma vez só");
ok(!n.some((x) => x.url.includes("exemplo.com")), "anotação que não é citação de url fica de fora");
ok(n[0].fonte === "valor.globo.com", "a fonte é o domínio, que é o que diz se presta");
ok(n[1].fonte === "exame.com", "e o www sai do domínio");
ok(n[0].titulo === "Bancos projetam alta", "o título vem da citação");
ok(noticiasDaResposta(null).length === 0, "resposta vazia não quebra");
ok(noticiasDaResposta({ output: "nao e lista" }).length === 0, "nem saída que não é lista");
ok(
  noticiasDaResposta({ output: [{ content: [{ annotations: [{ type: "url_citation" }] }] }] }).length === 0,
  "citação sem url é descartada"
);

console.log(falhou ? "\nFALHOU" : "\ntudo certo");
process.exit(falhou ? 1 : 0);
