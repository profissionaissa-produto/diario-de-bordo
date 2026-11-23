// node lib/youtube.check.mjs — o que o YouTube devolve vira o que o prompt usa.
//
// Rede fica de fora: o que importa aqui é o formato e o termo de busca, e
// depender de cota para rodar teste é teste que ninguém roda.
const { videosDaResposta, termoDaBusca } = await import("./youtube.js");

let falhou = false;
const ok = (cond, msg) => {
  if (!cond) falhou = true;
  console.log((cond ? "ok: " : "FALHOU: ") + msg);
};

// --------------------------------------------------------- termo de busca
// Vídeo e corte não são a mesma coisa: um é a palestra inteira, o outro é o
// trecho curto que circula em rede social.
ok(termoDaBusca("Bruno Benites", "Vídeo do Palestrante") === "Bruno Benites palestra", "vídeo procura a palestra");
ok(
  termoDaBusca("Bruno Benites", "Short ou corte de palestra do nome indicado") === "Bruno Benites corte de palestra",
  "short procura o corte"
);
ok(
  termoDaBusca("Bruno Benites", "Nutrição - Short ou corte") === "Bruno Benites corte de palestra",
  "o prefixo de categoria não atrapalha"
);
ok(termoDaBusca("", "Vídeo do Palestrante") === "", "sem nome não monta termo");
ok(termoDaBusca("  Monja Coen  ", "") === "Monja Coen palestra", "espaço em volta sai");

// ------------------------------------------------------- resposta da API
const RESPOSTA = {
  items: [
    {
      id: { videoId: "abc123" },
      snippet: { title: "Palestra completa", channelTitle: "TEDx", publishedAt: "2026-03-14T10:00:00Z" },
    },
    // Sem videoId acontece: a busca devolve canal e playlist junto quando o
    // type não filtra, e um item desses viraria link quebrado.
    { id: { channelId: "xyz" }, snippet: { title: "Canal do palestrante" } },
    { id: { videoId: "def456" }, snippet: { title: "Corte", channelTitle: "Cortes" } },
    { id: { videoId: "ghi789" }, snippet: { title: "Outro", channelTitle: "Mais um" } },
    { id: { videoId: "jkl012" }, snippet: { title: "Quarto", channelTitle: "Quarto canal" } },
  ],
};

const v = videosDaResposta(RESPOSTA, 3);
ok(v.length === 3, "respeita o máximo pedido");
ok(v.every((x) => x.id), "item sem videoId é descartado");
ok(!v.some((x) => x.titulo === "Canal do palestrante"), "e o canal não entra como vídeo");
ok(v[0].url === "https://www.youtube.com/watch?v=abc123", "a url é montada pelo id");
ok(v[0].canal === "TEDx", "o canal entra, para o closer saber de onde veio");
ok(v[0].publicadoEm === "2026-03-14", "a data fica só no dia");
// A miniatura é o que deixa o closer conferir se o vídeo é do palestrante
// antes de mandar: título e canal enganam, existe homônimo e canal de cortes.
ok(v[0].thumb === "https://i.ytimg.com/vi/abc123/mqdefault.jpg", "sem thumbnail no snippet, o endereço vem do id");
const comThumb = videosDaResposta({
  items: [
    {
      id: { videoId: "abc123" },
      snippet: { title: "T", thumbnails: { medium: { url: "https://i.ytimg.com/vi/abc123/outra.jpg" } } },
    },
  ],
});
ok(comThumb[0].thumb.endsWith("outra.jpg"), "com thumbnail no snippet, vale o do snippet");

ok(videosDaResposta(null).length === 0, "resposta vazia não quebra");
ok(videosDaResposta({}).length === 0, "resposta sem items também não");
ok(videosDaResposta({ items: "nao e lista" }).length === 0, "nem items que não é lista");

console.log(falhou ? "\nFALHOU" : "\ntudo certo");
process.exit(falhou ? 1 : 0);
