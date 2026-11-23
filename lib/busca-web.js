// Busca de notícia na web, para a estratégia que manda falar do setor do
// cliente com uma matéria na mão.
//
// Usa o Custom Search API do Google, que é o nome antigo do Programmable
// Search Engine. Mesma chave do YouTube, porque é a mesma conta e as duas APIs
// cabem numa chave só, mais o identificador do mecanismo de busca, o cx, que
// não é segredo e diz em que recorte da web procurar.
//
// Grátis até 100 buscas por dia, cota separada da do YouTube. Como ela só roda
// nesta estratégia e só na hora de gerar, 100 sobra.
//
// Existe pelo mesmo motivo do lib/youtube.js: o modelo não navega. Pedir a
// notícia a ele devolvia manchete plausível e inexistente.

const BASE = "https://www.googleapis.com/customsearch/v1";

// A chave é a mesma do YouTube por padrão. GOOGLE_CSE_KEY existe para o dia em
// que alguém quiser separar as duas sem mexer no código.
const chaveDaBusca = () =>
  (process.env.GOOGLE_CSE_KEY || process.env.YOUTUBE_API_KEY || "").trim();

export const buscaWebPronta = () => !!chaveDaBusca() && !!(process.env.GOOGLE_CSE_ID || "").trim();

// O que procurar. Notícia de setor envelhece rápido, e matéria de dois anos
// atrás numa mensagem de nutrição é pior do que não mandar nada: o recorte de
// tempo vai no parâmetro, não no termo.
export const termoDaNoticia = (segmento) => {
  const s = String(segmento || "").trim();
  return s ? `notícias do setor ${s} no Brasil` : "";
};

// A resposta da API vira o que o prompt usa. Função pura, testável sem rede.
export function noticiasDaResposta(json, max = 3) {
  const itens = Array.isArray(json?.items) ? json.items : [];
  return itens
    .map((i) => {
      const link = String(i?.link || "").trim();
      if (!link) return null;
      return {
        titulo: String(i?.title || "").trim(),
        // displayLink é o domínio: é ele que diz ao closer se a fonte presta
        // antes de ele mandar o link para um cliente.
        fonte: String(i?.displayLink || "").trim(),
        resumo: String(i?.snippet || "").replace(/\s+/g, " ").trim(),
        url: link,
      };
    })
    .filter(Boolean)
    .slice(0, max);
}

function erroDaBusca(status, corpo) {
  const motivo = corpo?.error?.errors?.[0]?.reason || "";
  if (status === 429 || /quota|rateLimit/i.test(motivo)) {
    return new Error("A cota diária de busca na web acabou. São 100 buscas por dia no plano grátis.");
  }
  if (status === 403 || status === 400) {
    return new Error(
      "A busca na web foi recusada. Confira se a Custom Search API está ativada, se a chave permite essa API e se GOOGLE_CSE_ID está certo."
    );
  }
  return new Error(`A busca na web respondeu ${status}.`);
}

export async function buscaNoticias(segmento, max = 3) {
  const chave = chaveDaBusca();
  const cx = (process.env.GOOGLE_CSE_ID || "").trim();
  if (!chave || !cx) throw new Error("Busca na web não configurada: falta a chave ou GOOGLE_CSE_ID.");
  const q = termoDaNoticia(segmento);
  if (!q) return [];

  const url =
    `${BASE}?key=${encodeURIComponent(chave)}&cx=${encodeURIComponent(cx)}` +
    `&q=${encodeURIComponent(q)}&num=${Math.min(10, Math.max(1, max))}` +
    // Últimos três meses, em português, com o Brasil como país de referência.
    `&dateRestrict=m3&lr=lang_pt&gl=br`;

  const res = await fetch(url);
  const texto = await res.text();
  let corpo = null;
  try {
    corpo = texto ? JSON.parse(texto) : null;
  } catch {
    // Resposta que não é JSON não tem o que extrair; o status diz o bastante.
  }
  if (!res.ok) {
    console.error(`[busca-web] ${res.status}: ${corpo?.error?.message || res.statusText}`);
    throw erroDaBusca(res.status, corpo);
  }
  return noticiasDaResposta(corpo, max);
}
