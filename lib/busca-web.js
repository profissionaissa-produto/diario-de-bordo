// Busca de notícia na web, para a estratégia que manda falar do setor do
// cliente com uma matéria na mão.
//
// Usa a busca embutida da OpenAI, pela mesma chave que já escreve as mensagens
// do Diário. É o caminho que não pede nada novo: sem conta nova, sem cartão
// novo, sem chave que expira.
//
// O caminho anterior era o Custom Search do Google e morreu por fora: ele foi
// fechado para clientes novos, e projeto que nunca usou recebe 403
// PERMISSION_DENIED mesmo com tudo configurado certo. Medido em 23/11/2026,
// com a API ativada e as duas variáveis no lugar.
//
// Existe pelo mesmo motivo do lib/youtube.js: o modelo não navega sozinho na
// geração da mensagem. Pedir a notícia a ele devolvia manchete plausível e
// inexistente. Aqui a busca é um passo separado, e o que volta é link citado.

// Não chamar de URL: isso sombreia o construtor URL do runtime, e a extração
// do domínio passa a falhar calada dentro do try.
const ENDERECO = "https://api.openai.com/v1/responses";
// Busca não é escrita: o modelo pequeno basta e custa menos. Separado do
// OPENAI_MODELO de propósito, para trocar o modelo das mensagens não mexer
// aqui sem querer.
const MODELO = process.env.OPENAI_MODELO_BUSCA || "gpt-5-mini";

export const buscaWebPronta = () => !!(process.env.OPENAI_API_KEY || "").trim();

// O que procurar. Notícia de setor envelhece rápido, e matéria de dois anos
// atrás numa mensagem de nutrição é pior do que não mandar nada.
export const termoDaNoticia = (segmento) => {
  const s = String(segmento || "").trim();
  return s ? `notícias recentes do setor ${s} no Brasil, dos últimos três meses` : "";
};

// As citações da resposta viram o que o prompt usa. Função pura: é aqui que
// mora o formato, e testar isso não pode depender de rede nem de saldo.
//
// A busca devolve as fontes como anotações de url dentro do texto. Link
// repetido acontece quando o modelo cita a mesma matéria duas vezes, e entrar
// duas vezes na lista faria o closer escolher entre dois itens iguais.
export function noticiasDaResposta(json, max = 3) {
  const saida = Array.isArray(json?.output) ? json.output : [];
  const vistos = new Set();
  const fora = [];

  for (const bloco of saida) {
    for (const parte of Array.isArray(bloco?.content) ? bloco.content : []) {
      for (const a of Array.isArray(parte?.annotations) ? parte.annotations : []) {
        const url = String(a?.url || "").trim();
        if (!url || a?.type !== "url_citation" || vistos.has(url)) continue;
        vistos.add(url);
        fora.push({
          titulo: String(a.title || "").trim() || url,
          // O domínio é o que diz ao closer se a fonte presta antes de ele
          // mandar o link para um cliente.
          fonte: dominioDe(url),
          resumo: "",
          url,
        });
      }
    }
  }
  return fora.slice(0, max);
}

const dominioDe = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};

// A chave do cache. Notícia de setor é a mesma para todo closer e todo negócio
// daquele setor no mesmo dia: buscar de novo a cada mensagem gastava um minuto
// e uma chamada paga para repetir a resposta anterior.
export const chaveDaNoticia = (segmento, dia) =>
  `noticias:${String(segmento || "").trim().toLowerCase()}:${dia}`;

export async function buscaNoticias(segmento, max = 3) {
  const chave = (process.env.OPENAI_API_KEY || "").trim();
  if (!chave) throw new Error("OPENAI_API_KEY não está definida no ambiente.");
  const termo = termoDaNoticia(segmento);
  if (!termo) return [];

  const res = await fetch(ENDERECO, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${chave}` },
    body: JSON.stringify({
      model: MODELO,
      tools: [{ type: "web_search" }],
      // Força a busca: sem isto o modelo às vezes responde de memória, e
      // memória não tem link.
      tool_choice: { type: "web_search" },
      // Aqui não se pensa, se procura. O raciocínio longo dobrava o tempo
      // sem melhorar a lista de matérias.
      reasoning: { effort: "low" },
      input:
        `Busque ${termo}. Liste ${max} matérias de veículos de imprensa diferentes, ` +
        "só o título e o veículo, sem resumo. Nada de blog de empresa, release ou página de produto.",
    }),
  });

  const texto = await res.text();
  let corpo = null;
  try {
    corpo = texto ? JSON.parse(texto) : null;
  } catch {
    // Resposta que não é JSON não tem o que extrair; o status diz o bastante.
  }
  if (!res.ok) {
    console.error(`[busca-web] ${res.status}: ${corpo?.error?.message || res.statusText}`);
    const e = new Error(corpo?.error?.message || `A busca na web respondeu ${res.status}.`);
    e.bruto = corpo?.error || { status: res.status };
    throw e;
  }
  return noticiasDaResposta(corpo, max);
}
