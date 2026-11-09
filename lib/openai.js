// Geração do texto pela OpenAI. A chave vive só na Vercel, como as outras:
// nunca no repositório.
//
// O prompt é o mesmo do Gemini, em lib/prompt.js. Aqui só muda o transporte.
import { montaPrompt } from "./prompt.js";

const CHAVE = process.env.OPENAI_API_KEY || "";
// Trocável sem deploy: se o nome do modelo mudar ou for aposentado, basta a
// variável de ambiente. O erro da API diz o nome errado, não fica mudo.
const MODELO = process.env.OPENAI_MODELO || "gpt-5-mini";
// O raciocínio é o que faz a mensagem ter o que dizer. Baixar para "minimal"
// corta segundos e devolve texto raso, que é exatamente o que o farmer já
// escreveria sozinho. Fica em "low" e é trocável por ambiente, para calibrar
// qualidade contra espera sem mexer em código.
const ESFORCO = process.env.OPENAI_ESFORCO || "low";
const URL = "https://api.openai.com/v1/chat/completions";

export const openaiPronto = () => !!CHAVE;

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

// 429 da OpenAI é limite de requisições ou de tokens por minuto, e o cabeçalho
// retry-after diz quanto esperar. Saldo acabado vem com "insufficient_quota"
// no corpo, e aí não adianta esperar.
export function leErroDeCota(corpo, retryAfter) {
  let e = {};
  try {
    e = JSON.parse(corpo)?.error || {};
  } catch {
    // Corpo que não é JSON não tem o que extrair; segue com o padrão.
  }
  const semSaldo = e.code === "insufficient_quota" || /quota/i.test(e.type || "");
  const segundos = Number(String(retryAfter || "").replace(/[^0-9.]/g, "")) || 0;
  return {
    semSaldo,
    segundos,
    mensagem: semSaldo
      ? "A conta da OpenAI está sem saldo. É preciso recarregar ou revisar o limite de gasto."
      : segundos
        ? `A OpenAI bloqueou por excesso de chamadas seguidas. Tente de novo em ${Math.ceil(segundos)} segundos.`
        : "A OpenAI bloqueou por excesso de chamadas seguidas. Espere alguns segundos e tente de novo.",
  };
}

export async function geraMensagem(dados) {
  if (!CHAVE) {
    throw new Error(
      "A chave da OpenAI não está configurada. Defina OPENAI_API_KEY nas variáveis de ambiente da Vercel."
    );
  }

  const corpoBase = {
    model: MODELO,
  // Quando quem chama já traz o prompt pronto, ele manda. É o caminho do
  // seguimento financeiro, que monta o dele em lib/prompt-financeiro.js: a
  // cobrança não fala de última compra nem de fase na carteira.
    messages: [{ role: "user", content: dados.prompt || montaPrompt(dados) }],
  };
  // Escrever uma mensagem de três linhas não precisa de raciocínio longo, e
  // ele é o que faz a geração demorar. Vai separado porque modelo que não é
  // de raciocínio recusa o parâmetro, e aí a chamada é repetida sem ele.
  const monta = (comEsforco) => ({
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${CHAVE}` },
    body: JSON.stringify(comEsforco ? { ...corpoBase, reasoning_effort: ESFORCO } : corpoBase),
  });

  let pedido = monta(true);
  const t0 = Date.now();
  let res = await fetch(URL, pedido);
  let corpo = await res.text();

  if (res.status === 400 && /reasoning_effort/i.test(corpo)) {
    console.error(`[openai] ${MODELO} não aceita reasoning_effort; repetindo sem ele`);
    pedido = monta(false);
    res = await fetch(URL, pedido);
    corpo = await res.text();
  }

  if (res.status === 429) {
    const cota = leErroDeCota(corpo, res.headers.get("retry-after"));
    console.error(`[openai] 429 (${cota.semSaldo ? "sem saldo" : "limite por minuto"}): ${corpo.slice(0, 400)}`);
    // Esperar só faz sentido no limite por minuto, e só se for pouco.
    if (!cota.semSaldo && cota.segundos > 0 && cota.segundos <= 30) {
      await espera(cota.segundos * 1000 + 500);
      res = await fetch(URL, pedido);
      corpo = await res.text();
    }
    if (!res.ok) throw new Error(cota.mensagem);
  }

  if (!res.ok) {
    // O corpo do erro diz o motivo (chave inválida, modelo inexistente,
    // parâmetro recusado). Engolir isso devolveria "falhou" e ninguém saberia.
    console.error(`[openai] ${res.status}: ${corpo.slice(0, 500)}`);
    throw new Error(`A OpenAI recusou a geração (HTTP ${res.status}). Veja o log para o motivo.`);
  }

  let json;
  try {
    json = JSON.parse(corpo);
  } catch {
    console.error("[openai] resposta não é JSON:", corpo.slice(0, 500));
    throw new Error("A OpenAI devolveu uma resposta que não dá para ler.");
  }

  const escolha = json.choices?.[0];
  const texto = String(escolha?.message?.content || "").trim();
  const motivo = escolha?.finish_reason || "";

  if (!texto) {
    console.error("[openai] veio vazio:", motivo || "sem motivo informado", corpo.slice(0, 500));
    throw new Error(`A OpenAI não devolveu texto (${motivo || "sem motivo informado"}). Tente de novo ou escreva à mão.`);
  }

  // Texto cortado no meio da frase é pior do que erro: ele parece pronto e
  // alguém manda assim para o cliente. "stop" é o único fim que vale.
  if (motivo && motivo !== "stop") {
    console.error(`[openai] geração interrompida (${motivo}). Uso:`, JSON.stringify(json.usage || {}));
    throw new Error(`A OpenAI interrompeu a geração (${motivo}). Tente de novo.`);
  }

  console.log(
    `[openai] ${MODELO} esforco=${ESFORCO} ${Date.now() - t0}ms ` +
      `prompt=${json.usage?.prompt_tokens ?? "?"} saida=${json.usage?.completion_tokens ?? "?"}`
  );
  return texto;
}
