import { auth } from "../../../auth";
import { getDayBriefings, dbReady } from "../../../lib/db";
import { dayKey } from "../../../lib/week";
import { NOME_CLOSER, SEG_CLOSER } from "../../../lib/config";
import { diagnosticoTarefas, historicoDeProps } from "../../../lib/hubspot";

// Diagnóstico: o que está gravado para o dia, exatamente como o banco devolve.
// ponytail: rota de apoio; remover quando o fluxo estiver estável.
export async function GET(req) {
  const session = await auth();
  if (!session?.user?.isAdmin) {
    return Response.json({ error: "Apenas admin." }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);

  // ?deal=<id> responde só sobre a criação de tarefa naquele negócio.
  const deal = searchParams.get("deal");
  if (deal) return Response.json(await diagnosticoTarefas(deal));

  // ?hist=<id>&props=a,b — quem alterou cada propriedade, e por qual fonte.
  const hist = searchParams.get("hist");
  if (hist) {
    const props = (searchParams.get("props") || "temperatura_atual,estrategia,observacoes")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    return Response.json(await historicoDeProps(hist, props));
  }

  // ?env responde só quais integrações estão configuradas. Booleano, nunca o
  // valor: a chave não sai do ambiente nem para o admin.
  if (searchParams.has("env")) {
    return Response.json({
      GEMINI_API_KEY: !!process.env.GEMINI_API_KEY,
      GEMINI_MODELO: process.env.GEMINI_MODELO || "gemini-2.5-flash (padrão)",
      GOOGLE_SA_EMAIL: !!process.env.GOOGLE_SA_EMAIL,
      GOOGLE_SA_KEY: !!process.env.GOOGLE_SA_KEY,
      HUBSPOT_BCC: !!process.env.HUBSPOT_BCC,
      HUBSPOT_TOKEN: !!process.env.HUBSPOT_TOKEN,
      DATABASE_URL: !!(process.env.DATABASE_URL || process.env.POSTGRES_URL),
    });
  }

  const dia = searchParams.get("dia") || dayKey();
  const briefings = await getDayBriefings(dia);

  return Response.json({
    diaConsultado: dia,
    diaDoServidor: dayKey(),
    horaDoServidor: new Date().toISOString(),
    bancoConfigurado: dbReady(),
    total: briefings.length,
    briefings: briefings.map((b) => ({
      ownerId: b.ownerId,
      closer: NOME_CLOSER[b.ownerId] || "(fora da lista de closers)",
      segmento: SEG_CLOSER[b.ownerId] || "(sem segmento)",
      status: b.status,
      negocios: Object.keys(b.items).length,
      itens: b.items,
    })),
  });
}
