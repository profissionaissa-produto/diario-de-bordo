import { auth } from "../../../auth";
import { getOwnerByEmail } from "../../../lib/hubspot";
import { salvarAbordagem, salvarResultadoCarteira, pedirTroca, cancelarTrocaPendente, listarEstrategias, listarOcultas, dbReady } from "../../../lib/db";
import { ABORDAGENS, RESULTADOS, EXIGE_OBSERVACAO, MINIMO_OBSERVACAO } from "../../../lib/carteira";
import { montaEstrategias, semOcultas } from "../../../lib/estrategias";
import { SEG_TRAMITACOES } from "../../../lib/config";
import { dayKey } from "../../../lib/week";
import { podeGerirCloser } from "../../../lib/permissoes";

// De quem é o dia e quem está mexendo nele. Quando o líder edita o dia de um
// farmer, o nome dele fica registrado: a alteração precisa aparecer para quem
// planejou, com o autor.
async function resolveOwner(session, bodyOwnerId) {
  let meu = null;
  try {
    const owner = await getOwnerByEmail(session.user.email.toLowerCase());
    meu = owner ? String(owner.ownerId) : null;
  } catch (e) {
    console.error("[carteira] HubSpot falhou ao identificar o farmer:", e);
    // Sem o próprio owner ainda dá para o líder agir sobre um farmer do time;
    // só não dá para o farmer agir sobre o próprio dia.
    if (!bodyOwnerId) throw new Error("Não foi possível falar com o HubSpot para identificar você.");
  }

  if (bodyOwnerId && podeGerirCloser(session.user, bodyOwnerId)) {
    const dono = String(bodyOwnerId);
    return { ownerId: dono, editor: dono === meu ? null : session.user.name || session.user.email };
  }
  return { ownerId: meu, editor: null };
}

export async function POST(req) {
  const session = await auth();
  if (!session?.user?.email) return Response.json({ error: "Não autenticado." }, { status: 401 });
  if (!dbReady()) return Response.json({ error: "Banco não configurado." }, { status: 503 });

  const body = await req.json().catch(() => ({}));
  let ownerId, editor;
  try {
    ({ ownerId, editor } = await resolveOwner(session, body.ownerId));
  } catch (e) {
    return Response.json({ error: e.message }, { status: 503 });
  }
  if (!ownerId) return Response.json({ error: "Farmer não encontrado." }, { status: 403 });

  const { companyId, abordagem, contexto, estrategia } = body;
  if (!companyId) return Response.json({ error: "Informe a empresa." }, { status: 400 });
  if (abordagem && !ABORDAGENS.includes(abordagem)) {
    return Response.json({ error: "Abordagem inválida." }, { status: 400 });
  }
  // "" é desmarcar; qualquer outro valor tem que ser uma estratégia do Farmer,
  // senão o id gravado no dia não resolve para nada depois.
  if (estrategia) {
    const porSeg = montaEstrategias(await listarEstrategias());
    const doFarmer = semOcultas(porSeg, await listarOcultas())[SEG_TRAMITACOES] || [];
    if (!doFarmer.some((e) => e.id === estrategia)) {
      return Response.json({ error: "Estratégia inválida." }, { status: 400 });
    }
  }

  try {
    const achou = await salvarAbordagem(
      ownerId,
      body.dia || dayKey(),
      companyId,
      { abordagem, contexto, estrategia },
      editor
    );
    if (!achou) {
      return Response.json({ error: "Essa empresa não está na lista de hoje." }, { status: 400 });
    }
  } catch (e) {
    console.error("[carteira] falha ao salvar a abordagem:", e);
    return Response.json({ error: "Falha ao salvar." }, { status: 500 });
  }
  return Response.json({ ok: true });
}

// Fechamento: o que aconteceu na empresa. Observação é exigida onde o CRM não
// tem a resposta — em tentativa a ligação registrada já é a evidência.
export async function PATCH(req) {
  const session = await auth();
  if (!session?.user?.email) return Response.json({ error: "Não autenticado." }, { status: 401 });
  if (!dbReady()) return Response.json({ error: "Banco não configurado." }, { status: 503 });

  const body = await req.json().catch(() => ({}));
  let ownerId, editor;
  try {
    ({ ownerId, editor } = await resolveOwner(session, body.ownerId));
  } catch (e) {
    return Response.json({ error: e.message }, { status: 503 });
  }
  if (!ownerId) return Response.json({ error: "Farmer não encontrado." }, { status: 403 });

  const { companyId, resultado } = body;
  const observacao = String(body.observacao || "").trim();
  if (!companyId) return Response.json({ error: "Informe a empresa." }, { status: 400 });
  if (!RESULTADOS.some((r) => r.key === resultado)) {
    return Response.json({ error: "Resultado inválido." }, { status: 400 });
  }
  if (EXIGE_OBSERVACAO.includes(resultado) && observacao.length < MINIMO_OBSERVACAO) {
    const faltam = MINIMO_OBSERVACAO - observacao.length;
    return Response.json(
      { error: `Este resultado precisa de observação com pelo menos ${MINIMO_OBSERVACAO} caracteres (faltam ${faltam}).` },
      { status: 400 }
    );
  }

  try {
    const achou = await salvarResultadoCarteira(ownerId, body.dia || dayKey(), companyId, resultado, observacao, editor);
    if (!achou) return Response.json({ error: "Essa empresa não está na lista de hoje." }, { status: 400 });
    // O pedido é o que segura a empresa fora do rodízio até o líder decidir.
    if (resultado === "trocar_segmento") {
      await pedirTroca(ownerId, companyId, body.nome || null, observacao);
    } else {
      // Mudou de ideia: o pedido em aberto some e a empresa volta ao rodízio.
      // Pedido já decidido pelo líder fica como está.
      await cancelarTrocaPendente(ownerId, companyId);
    }
  } catch (e) {
    console.error("[carteira] falha ao salvar o resultado:", e);
    return Response.json({ error: "Falha ao salvar." }, { status: 500 });
  }
  return Response.json({ ok: true });
}
