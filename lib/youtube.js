// Busca de vídeo no YouTube, para as estratégias que mandam o closer mostrar
// um vídeo ou um corte de palestra do palestrante.
//
// Existe porque o modelo não navega na internet. Pedir o link a ele devolvia
// URL plausível e inexistente, e o cliente clicava e caía em lugar nenhum. Aqui
// o link vem da API do YouTube, então ou é real ou não existe.
//
// Chave de API simples, sem OAuth: busca no YouTube é dado público. A cota
// grátis é 10 mil unidades por dia e cada busca custa 100, então são 100 buscas
// diárias. Estourou, a API responde 403 com quotaExceeded, e isso vira recado
// na tela em vez de falha calada.

const BASE = "https://www.googleapis.com/youtube/v3/search";

export const youtubePronto = () => !!(process.env.YOUTUBE_API_KEY || "").trim();

// O que procurar, conforme a estratégia. Vídeo e corte não são a mesma coisa:
// um é a palestra, o outro é o trecho curto que circula em rede social.
export function termoDaBusca(nome, estrategia) {
  const quem = String(nome || "").trim();
  if (!quem) return "";
  const t = String(estrategia || "").toLowerCase();
  if (t.includes("short") || t.includes("corte")) return `${quem} corte de palestra`;
  return `${quem} palestra`;
}

// A resposta da API vira o que o prompt precisa. Função pura: é aqui que mora
// o formato, e testar isso não deve depender de rede nem de cota.
export function videosDaResposta(json, max = 3) {
  const itens = Array.isArray(json?.items) ? json.items : [];
  return itens
    .map((i) => {
      const id = i?.id?.videoId || "";
      const s = i?.snippet || {};
      if (!id) return null;
      return {
        id,
        titulo: String(s.title || "").trim(),
        canal: String(s.channelTitle || "").trim(),
        // Data só do dia: hora do publishedAt não serve para nada aqui.
        publicadoEm: String(s.publishedAt || "").slice(0, 10),
        url: `https://www.youtube.com/watch?v=${id}`,
        // A miniatura é o que deixa o closer conferir se o vídeo é mesmo do
        // palestrante antes de mandar. Título e canal enganam: existe canal de
        // cortes com nome de palestrante e vídeo de homônimo.
        //
        // Vem do snippet quando vem, e o endereço previsível do i.ytimg entra
        // como reserva: ele é derivado do id, então existe sempre que o vídeo
        // existe.
        thumb:
          s?.thumbnails?.medium?.url ||
          s?.thumbnails?.default?.url ||
          `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
      };
    })
    .filter(Boolean)
    .slice(0, max);
}

// Erro de cota tem resposta própria: mandar "falhou" faria alguém procurar
// defeito no código quando o problema é a cota do dia ter acabado.
function erroDoYoutube(status, corpo) {
  const motivo = corpo?.error?.errors?.[0]?.reason || "";
  if (status === 403 && /quota/i.test(motivo)) {
    return new Error("A cota diária de busca no YouTube acabou. Ela volta à meia-noite no horário do Pacífico.");
  }
  if (status === 403 || status === 400) {
    return new Error("O YouTube recusou a chave. Confira YOUTUBE_API_KEY e se a YouTube Data API v3 está ativada.");
  }
  return new Error(`O YouTube respondeu ${status}.`);
}

export async function buscaVideos(termo, max = 3) {
  const chave = (process.env.YOUTUBE_API_KEY || "").trim();
  if (!chave) throw new Error("YOUTUBE_API_KEY não está definida no ambiente.");
  const q = String(termo || "").trim();
  if (!q) return [];

  const url =
    `${BASE}?part=snippet&type=video&maxResults=${Math.min(10, Math.max(1, max))}` +
    `&regionCode=BR&relevanceLanguage=pt&q=${encodeURIComponent(q)}&key=${encodeURIComponent(chave)}`;

  const res = await fetch(url);
  const texto = await res.text();
  let corpo = null;
  try {
    corpo = texto ? JSON.parse(texto) : null;
  } catch {
    // Resposta que não é JSON não tem o que extrair; o status abaixo diz tudo.
  }
  if (!res.ok) {
    console.error(`[youtube] ${res.status}: ${corpo?.error?.message || res.statusText}`);
    throw erroDoYoutube(res.status, corpo);
  }
  return videosDaResposta(corpo, max);
}
