import "server-only";

// Geração do texto da mensagem pelo Gemini. A chave vive só na Vercel, como o
// token do HubSpot: nunca no repositório.
const CHAVE = process.env.GEMINI_API_KEY || "";
const MODELO = process.env.GEMINI_MODELO || "gemini-2.5-flash";

export const geminiPronto = () => !!CHAVE;

const FORMATO = {
  whatsapp:
    "Mensagem de WhatsApp. No máximo 4 linhas curtas. Tom de conversa, sem saudação formal, sem assinatura, sem emoji. Pode usar *negrito* do WhatsApp em no máximo uma expressão.",
  email:
    "E-mail. Devolva a primeira linha como 'Assunto: ...' e depois o corpo, com saudação e despedida. No máximo 8 linhas.",
  ligacao:
    "Roteiro de ligação para o farmer falar, não para enviar. Em 3 a 5 tópicos curtos, começando pela abertura e terminando pela pergunta que destrava a conversa.",
};

const TOM = {
  1: "Primeira tentativa neste canal: leve, sem cobrança, sem mencionar tentativa anterior.",
  2: "Segunda tentativa neste canal: retoma o assunto com um ângulo novo, sem soar insistente e sem reclamar do silêncio.",
  3: "Terceira e última tentativa neste canal: direta e curta, dá uma saída fácil para a pessoa responder sim ou não.",
};

// O prompt é a soma dos quatro itens que o time pediu: tentativa, canal,
// estratégia e fase da carteira. Sai texto puro, sem explicação em volta.
export function montaPrompt({ empresa, contato, canal, tentativa, estrategia, fase, ultimaCompra, observacao }) {
  const partes = [
    "Você escreve mensagens de relacionamento para o time de Customer Success da PSA, uma empresa que conecta clientes a palestrantes para eventos corporativos.",
    "Escreva em português do Brasil, na primeira pessoa do farmer que está mandando.",
    "Nunca invente fato, data, nome, número ou promessa que não esteja nos dados abaixo.",
    "Nunca use travessão.",
    "Devolva apenas o texto final, sem comentário, sem aspas em volta e sem título.",
    "",
    `Empresa: ${empresa || "não informada"}`,
    `Pessoa: ${contato?.nome || "não informada"}${contato?.cargo ? `, ${contato.cargo}` : ""}`,
    `Fase da carteira: ${fase || "não informada"}`,
    ultimaCompra ? `Última compra: ${ultimaCompra}` : "Nunca comprou",
    `Canal: ${canal}`,
    `Tentativa número ${tentativa} neste canal.`,
    estrategia ? `Estratégia a usar: ${estrategia.titulo}. Quando ela se aplica: ${estrategia.desc}` : "Sem estratégia definida: faça uma retomada de relacionamento.",
    observacao ? `Contexto que o farmer escreveu: ${observacao}` : "",
    "",
    FORMATO[canal] || FORMATO.whatsapp,
    TOM[Math.min(3, Math.max(1, Number(tentativa) || 1))],
  ];
  return partes.filter(Boolean).join("\n");
}

export async function geraMensagem(dados) {
  if (!CHAVE) {
    throw new Error(
      "A chave do Gemini não está configurada. Defina GEMINI_API_KEY nas variáveis de ambiente da Vercel."
    );
  }
  const prompt = montaPrompt(dados);
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODELO}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": CHAVE },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.8, maxOutputTokens: 700 },
      }),
    }
  );

  const corpo = await res.text();
  if (!res.ok) {
    // O corpo do erro do Google diz o motivo (chave inválida, cota, modelo
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

  const texto = (json.candidates?.[0]?.content?.parts || [])
    .map((p) => p.text || "")
    .join("")
    .trim();
  if (!texto) {
    const motivo = json.candidates?.[0]?.finishReason || json.promptFeedback?.blockReason || "sem motivo informado";
    console.error("[gemini] veio vazio:", motivo, corpo.slice(0, 500));
    throw new Error(`O Gemini não devolveu texto (${motivo}). Tente de novo ou escreva à mão.`);
  }
  return texto;
}
