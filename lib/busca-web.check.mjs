// node lib/busca-web.check.mjs — o que se procura e o que volta da busca.
// Sem rede: depender de saldo para rodar teste é teste que ninguém roda.
const { noticiasDaResposta, termoDaNoticia, objetivoUtil, chaveDaNoticia } = await import("./busca-web.js");

let falhou = false;
const ok = (cond, msg) => {
  if (!cond) falhou = true;
  console.log((cond ? "ok: " : "FALHOU: ") + msg);
};

// O que o time digita quando não tem o que digitar. Medido em 23/11/2026: de
// 200 negócios abertos com a propriedade preenchida, 33 traziam só isto.
ok(objetivoUtil(".") === "", "ponto sozinho não é objetivo");
ok(objetivoUtil("NA") === "", "NA não é objetivo");
ok(objetivoUtil("  n/a ") === "", "n/a não é objetivo");
ok(objetivoUtil("---") === "", "traço não é objetivo");
ok(objetivoUtil("A definir") === "", "a definir não é objetivo");
ok(objetivoUtil("SIPAT") === "SIPAT", "tema de uma palavra vale");
ok(objetivoUtil(" Palestra sobre   Fake News ") === "Palestra sobre Fake News", "espaço em volta sai e no meio junta");

// Com objetivo, quem acha o ponto chave é a busca: o texto do cliente mistura
// motivo, sentimento e formato, e o ponto pesquisável está no meio disso.
const OBJETIVO =
  "Realizar um evento de encerramento de ano após a reestruturação administrativa no órgão pela Lei nº 15.367. " +
  "Como você gostaria que os espectadores se sentissem: acolhidos e motivados";
const comObjetivo = termoDaNoticia(OBJETIVO, "Público / Governo");
ok(comObjetivo.includes("Lei nº 15.367"), "o texto do cliente vai inteiro para a busca");
ok(/ponto concreto e pesquis/i.test(comObjetivo), "e a busca é mandada achar o ponto chave ali dentro");
ok(!comObjetivo.includes("setor Público / Governo"), "com objetivo preenchido o setor não manda");
ok(/sentimento/i.test(comObjetivo), "a parte de sentimento é mandada fora: não é assunto de notícia");

// Sem objetivo, cai para o setor.
ok(
  termoDaNoticia("", "Financeiro") === "Busque notícias recentes do setor Financeiro no Brasil, dos últimos três meses.",
  "sem objetivo o termo amarra setor, país e recorte de tempo"
);
ok(termoDaNoticia(".", "  Agronegócio  ").includes("Agronegócio"), "objetivo lixo cai para o setor, com espaço aparado");
ok(termoDaNoticia("", "") === "", "sem objetivo e sem setor não monta termo");

// O texto longo não pode estourar o prompt da busca.
ok(termoDaNoticia("x".repeat(5000), "").length < 1500, "objetivo gigante entra cortado");

// A chave do cache segue o que foi buscado: pelo objetivo a resposta é daquele
// negócio, pelo setor ela serve a todo negócio do setor naquele dia.
ok(
  chaveDaNoticia({ dealId: "681", objetivo: OBJETIVO, segmento: "Público" }, "2026-11-23") ===
    "noticias:negocio:681:2026-11-23",
  "com objetivo a chave é o negócio"
);
ok(
  chaveDaNoticia({ dealId: "681", objetivo: "NA", segmento: "Financeiro" }, "2026-11-23") ===
    "noticias:financeiro:2026-11-23",
  "sem objetivo a chave é o setor, e dois negócios do mesmo setor compartilham"
);

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
            // A busca carimba o link com utm_source=openai, e ele ia inteiro
            // para o cliente dentro da mensagem.
            {
              type: "url_citation",
              url: "https://diariodocomercio.com.br/legislacao/lei-x/?id=7&utm_source=openai&utm_medium=x",
              title: "Lei reestrutura carreiras",
            },
          ],
        },
      ],
    },
  ],
};

const n = noticiasDaResposta(RESPOSTA, 3);
ok(n.length === 3, "respeita o máximo pedido");

// O rastreio sai; o que a página precisa para abrir fica.
const todas = noticiasDaResposta(RESPOSTA, 10);
const comUtm = todas.find((x) => x.url.includes("diariodocomercio"));
ok(!/utm_/.test(comUtm.url), "o carimbo da busca não vai para o cliente");
ok(comUtm.url.includes("id=7"), "e o parâmetro que a página usa fica");
ok(comUtm.fonte === "diariodocomercio.com.br", "a fonte segue sendo o domínio");
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
