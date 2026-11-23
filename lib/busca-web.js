// Busca de notícia na web, para a estratégia que manda chegar no cliente com
// uma matéria na mão.
//
// O que se procura vem, por ordem, de duas fontes:
//
// 1. "Objetivos do evento" do negócio, que é o que o próprio cliente escreveu
//    sobre o que o levou a procurar o tema. É ali que mora o ponto concreto:
//    uma lei, uma reestruturação, uma categoria profissional, um momento do
//    ano. Notícia sobre ESSE ponto fala da vida dele, não do mercado em geral.
// 2. O setor da empresa, quando o campo acima vem vazio ou com lixo.
//
// Medido em 23/11/2026, em 200 negócios abertos com a propriedade preenchida:
// 134 têm texto de 30 caracteres ou mais, 33 têm tema curto porém válido, e 33
// trazem só ".", "NA" ou traço. Daí o filtro de lixo e a queda para o setor.
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

// O que o time digita quando não tem o que digitar. Mandar isso para a busca
// gastava a chamada para voltar manchete aleatória, que é pior do que cair
// para o setor.
const LIXO = /^(\.+|-+|_+|x|na|n\/a|nada|n[ãa]o informado|a definir|indefinido)$/i;

// O texto do cliente, limpo, ou vazio quando não dá para usar. Texto de uma ou
// duas palavras ainda serve: "SIPAT" e "Fake News" são tema de busca.
export function objetivoUtil(texto) {
  const t = String(texto || "").trim().replace(/\s+/g, " ");
  return t.length >= 4 && !LIXO.test(t) ? t : "";
}

// O que procurar. Com o objetivo do evento na mão, a extração do ponto chave é
// trabalho da própria busca: o texto do cliente é corrido e mistura motivo,
// sentimento e logística, e regex nenhuma acha "Lei nº 15.367" ali dentro sem
// errar na frase seguinte.
//
// Sem o objetivo, cai para o setor. Notícia de setor envelhece rápido, e
// matéria de dois anos atrás numa mensagem de nutrição é pior do que nada.
export function termoDaNoticia(objetivo, segmento) {
  const o = objetivoUtil(objetivo);
  if (o) {
    return (
      "Leia o que o cliente escreveu sobre o evento dele e identifique o ponto concreto e pesquisável que está ali, " +
      "como uma lei, uma reestruturação, um setor, uma categoria profissional, uma data ou um momento do ano. " +
      "Depois busque notícias brasileiras recentes sobre ESSE ponto, dos últimos seis meses. " +
      "Ignore a parte que fala de sentimento e de formato do evento: ela não é assunto de notícia. " +
      `O que o cliente escreveu: "${o.slice(0, 900)}"`
    );
  }
  const s = String(segmento || "").trim();
  return s ? `Busque notícias recentes do setor ${s} no Brasil, dos últimos três meses.` : "";
}

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

// A chave do cache, e ela segue o que foi buscado.
//
// Pelo objetivo do evento, a busca é daquele negócio e de mais nenhum: a chave
// é o negócio. Pelo setor, a resposta serve a todo closer e todo negócio
// daquele setor hoje, e a chave é o setor. Sem cache, cada mensagem gastava
// perto de um minuto e uma chamada paga para repetir a resposta anterior.
export const chaveDaNoticia = ({ dealId, objetivo, segmento }, dia) =>
  objetivoUtil(objetivo)
    ? `noticias:negocio:${String(dealId || "")}:${dia}`
    : `noticias:${String(segmento || "").trim().toLowerCase()}:${dia}`;

export async function buscaNoticias({ objetivo, segmento }, max = 3) {
  const chave = (process.env.OPENAI_API_KEY || "").trim();
  if (!chave) throw new Error("OPENAI_API_KEY não está definida no ambiente.");
  const termo = termoDaNoticia(objetivo, segmento);
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
        `${termo}\n\nListe ${max} matérias de veículos de imprensa diferentes, ` +
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
