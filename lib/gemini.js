// Sem "server-only": ele impede o lib/gemini.check.mjs de importar o prompt
// direto no Node, e o prompt é justamente o que saiu errado. A chave só é
// lida de process.env, que no navegador vem vazio.

// Geração do texto da mensagem pelo Gemini. A chave vive só na Vercel, como o
// token do HubSpot: nunca no repositório.
import { montaPrompt } from "./prompt.js";

const CHAVE = process.env.GEMINI_API_KEY || "";
const MODELO = process.env.GEMINI_MODELO || "gemini-2.5-flash";

export const geminiPronto = () => !!CHAVE;

// O 429 do Google vem com o motivo dentro: se é limite por minuto ou cota
// do dia, e quanto esperar. Sem ler isso a tela dizia 'veja o log', que não
// serve para quem está com a janela aberta.
export function leErroDeCota(corpo) {
  let e = {};
  try {
    e = JSON.parse(corpo)?.error || {};
  } catch {
    // Corpo que não é JSON não tem o que extrair; segue com o padrão.
  }
  const detalhes = e.details || [];
  const retry = detalhes.find((d) => String(d["@type"]).endsWith("RetryInfo"))?.retryDelay || "";
  const segundos = Number(String(retry).replace(/[^0-9.]/g, "")) || 0;
  const violacoes = detalhes.find((d) => String(d["@type"]).endsWith("QuotaFailure"))?.violations || [];
  const ids = violacoes.map((v) => String(v.quotaId || "")).join(" ");
  const porDia = /PerDay/i.test(ids);
  return {
    segundos,
    porDia,
    mensagem: porDia
      ? "A cota diária do Gemini acabou. A geração volta amanhã, ou é preciso subir o plano da chave."
      : segundos
        ? `O Gemini bloqueou por excesso de chamadas seguidas. Tente de novo em ${Math.ceil(segundos)} segundos.`
        : "O Gemini bloqueou por excesso de chamadas seguidas. Espere alguns segundos e tente de novo.",
  };
}

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

export async function geraMensagem(dados) {
  if (!CHAVE) {
    throw new Error(
      "A chave do Gemini não está configurada. Defina GEMINI_API_KEY nas variáveis de ambiente da Vercel."
    );
  }
// Quando quem chama já traz o prompt pronto, ele manda. É o caminho do
// seguimento financeiro, que monta o dele em lib/prompt-financeiro.js: a
// cobrança não fala de última compra nem de fase na carteira.
  const prompt = dados.prompt || montaPrompt(dados);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODELO}:generateContent`;
  const pedido = {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": CHAVE },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.8,
          // Os modelos 2.5 raciocinam antes de responder, e esse raciocínio
          // gasta do mesmo teto da resposta. Com 700 o modelo pensava e a
          // mensagem era cortada no meio da frase. Desligar o raciocínio
          // resolve a causa; o teto maior é a rede de segurança.
          thinkingConfig: { thinkingBudget: 0 },
          maxOutputTokens: 2000,
        },
      }),
    };
  let res = await fetch(url, pedido);

  let corpo = await res.text();

  // 429 é limite de chamadas, não defeito do pedido. Quando o Google diz
  // quanto esperar e é pouco, esperar e repetir resolve sem a pessoa saber.
  if (res.status === 429) {
    const cota = leErroDeCota(corpo);
    console.error(`[gemini] 429 (${cota.porDia ? "cota do dia" : "limite por minuto"}): ${corpo.slice(0, 400)}`);
    if (!cota.porDia && cota.segundos > 0 && cota.segundos <= 30) {
      await espera(cota.segundos * 1000 + 500);
      res = await fetch(url, pedido);
      corpo = await res.text();
    }
    if (!res.ok) throw new Error(cota.mensagem);
  }

  if (!res.ok) {
    // O corpo do erro do Google diz o motivo (chave inválida, modelo
    // inexistente). Engolir isso devolveria "falhou" e ninguém saberia o quê.
    console.error(`[gemini] ${res.status}: ${corpo.slice(0, 500)}`);
    throw new Error(`O Gemini recusou a geração (HTTP ${res.status}). Veja o log para o motivo.`);
  }

  let json;
  try {
    json = JSON.parse(corpo);
  } catch {
    console.error("[gemini] resposta não é JSON:", corpo.slice(0, 500));
    throw new Error("O Gemini devolveu uma resposta que não dá para ler.");
  }

  const candidato = json.candidates?.[0];
  const motivo = candidato?.finishReason || json.promptFeedback?.blockReason || "";
  const texto = (candidato?.content?.parts || [])
    .map((p) => p.text || "")
    .join("")
    .trim();

  if (!texto) {
    console.error("[gemini] veio vazio:", motivo || "sem motivo informado", corpo.slice(0, 500));
    throw new Error(`O Gemini não devolveu texto (${motivo || "sem motivo informado"}). Tente de novo ou escreva à mão.`);
  }

  // Texto cortado no meio da frase é pior do que erro: ele parece pronto e
  // alguém manda assim para o cliente. STOP é o único fim que vale.
  if (motivo && motivo !== "STOP") {
    console.error(`[gemini] geração interrompida (${motivo}). Uso:`, JSON.stringify(json.usageMetadata || {}));
    if (motivo === "MAX_TOKENS") {
      throw new Error("O Gemini cortou a mensagem no meio por limite de tamanho. Clique em Gerar de novo.");
    }
    throw new Error(`O Gemini interrompeu a geração (${motivo}). Clique em Gerar de novo.`);
  }

  return texto;
}
