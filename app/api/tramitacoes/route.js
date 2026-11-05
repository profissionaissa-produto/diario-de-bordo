import { auth } from "../../../auth";
import { getOwnerByEmail } from "../../../lib/hubspot";
import { marcarTramitacao, decidirTramitacao, salvarEvolucaoTramitacao, dbReady } from "../../../lib/db";
import {
  ETAPAS_TICKET,
  RESULTADOS_TRAMITACAO,
  TRAMITACAO_EXIGE_OBSERVACAO,
  ABORDAGENS_TRAMITACAO,
} from "../../../lib/tramitacoes";
import { listarEstrategias, listarOcultas } from "../../../lib/db";
import { montaEstrategias, semOcultas, indexaPorId, rotuloDa } from "../../../lib/estrategias";
import { SEG_TRAMITACOES } from "../../../lib/config";
import { criarNotaNoTicket } from "../../../lib/hubspot";
import { dayKey } from "../../../lib/week";
import { ehGestor } from "../../../lib/permissoes";

const quem = (session) => session.user.name || session.user.email;

// O responsável marca como feito. A pendência fica aguardando o líder — não
// sai do board sozinha, senão marcar viraria atalho para fazer sumir.
export async function POST(req) {
  const session = await auth();
  if (!session?.user?.email) return Response.json({ error: "Não autenticado." }, { status: 401 });
  if (!dbReady()) return Response.json({ error: "Banco não configurado." }, { status: 503 });

  const { ticketId, tipo } = await req.json().catch(() => ({}));
  if (!ticketId || !(tipo in ETAPAS_TICKET)) {
    return Response.json({ error: "Tramitação inválida." }, { status: 400 });
  }

  // Quem marca precisa estar vinculado a um owner: é o registro de autoria.
  try {
    if (!ehGestor(session.user)) {
      const owner = await getOwnerByEmail(session.user.email.toLowerCase());
      if (!owner) return Response.json({ error: "Seu e-mail não está vinculado a um owner do HubSpot." }, { status: 403 });
    }
  } catch (e) {
    console.error("[tramitacoes] HubSpot falhou ao identificar:", e);
    return Response.json({ error: "Não foi possível falar com o HubSpot agora." }, { status: 503 });
  }

  try {
    await marcarTramitacao(ticketId, tipo, quem(session));
  } catch (e) {
    console.error("[tramitacoes] falha ao marcar:", e);
    return Response.json({ error: "Falha ao registrar." }, { status: 500 });
  }
  return Response.json({ ok: true });
}

// O líder confirma ou devolve. Devolver exige motivo: sem ele, a pendência
// volta ao board e ninguém sabe o que corrigir.
export async function PATCH(req) {
  const session = await auth();
  if (!session?.user?.email) return Response.json({ error: "Não autenticado." }, { status: 401 });
  if (!ehGestor(session.user)) return Response.json({ error: "Só o líder confirma." }, { status: 403 });
  if (!dbReady()) return Response.json({ error: "Banco não configurado." }, { status: 503 });

  const { ticketId, tipo, decisao, motivo } = await req.json().catch(() => ({}));
  if (!ticketId || !(tipo in ETAPAS_TICKET) || !["confirmado", "devolvido"].includes(decisao)) {
    return Response.json({ error: "Dados inválidos." }, { status: 400 });
  }
  if (decisao === "devolvido" && !String(motivo || "").trim()) {
    return Response.json({ error: "Escreva o motivo da devolução." }, { status: 400 });
  }

  try {
    await decidirTramitacao(ticketId, tipo, decisao, quem(session), motivo);
  } catch (e) {
    console.error("[tramitacoes] falha ao decidir:", e);
    return Response.json({ error: "Falha ao registrar a decisão." }, { status: 500 });
  }
  return Response.json({ ok: true });
}

// Evolução do dia: resolvi, avancei ou travado. É o que o líder lê para saber
// o que depende de terceiro e o que depende do farmer.
export async function PUT(req) {
  const session = await auth();
  if (!session?.user?.email) return Response.json({ error: "Não autenticado." }, { status: 401 });
  if (!dbReady()) return Response.json({ error: "Banco não configurado." }, { status: 503 });

  const body = await req.json().catch(() => ({}));
  const { ticketId, tipo, resultado } = body;
  const observacao = String(body.observacao || "").trim();
  const abordagem = String(body.abordagem || "").trim();
  const estrategiaId = String(body.estrategia || "").trim();

  if (!ticketId || !(tipo in ETAPAS_TICKET)) {
    return Response.json({ error: "Tramitação inválida." }, { status: 400 });
  }
  if (!RESULTADOS_TRAMITACAO.some((r) => r.key === resultado)) {
    return Response.json({ error: "Resultado inválido." }, { status: 400 });
  }
  if (abordagem && !ABORDAGENS_TRAMITACAO.includes(abordagem)) {
    return Response.json({ error: "Abordagem inválida." }, { status: 400 });
  }

  // A estratégia é a mesma lista que a curadoria cadastra em Configurações,
  // no segmento Farmer. Id que não está nela não entra no registro.
  let estrategia = null;
  if (estrategiaId) {
    const porSeg = montaEstrategias(await listarEstrategias());
    const visiveis = semOcultas(porSeg, await listarOcultas())[SEG_TRAMITACOES] || [];
    if (!visiveis.some((e) => e.id === estrategiaId)) {
      return Response.json({ error: "Estratégia inválida." }, { status: 400 });
    }
    estrategia = rotuloDa(estrategiaId, indexaPorId(porSeg));
  }

  // Travado sem explicação não vira pedido de ajuda: vira número.
  if (TRAMITACAO_EXIGE_OBSERVACAO.includes(resultado) && observacao.length < 10) {
    return Response.json(
      { error: "Diga o que travou — é o que mostra ao líder o que depende de terceiro." },
      { status: 400 }
    );
  }

  try {
    await salvarEvolucaoTramitacao(ticketId, tipo, body.dia || dayKey(), {
      resultado,
      observacao,
      abordagem,
      estrategia: estrategiaId,
    }, quem(session));
  } catch (e) {
    console.error("[tramitacoes] falha ao registrar a evolução:", e);
    return Response.json({ error: "Falha ao registrar." }, { status: 500 });
  }

  // A tratativa vai para o ticket de CS: é o que evidencia no CRM que houve
  // ação hoje. Falhar aqui não desfaz o registro no Diário, mas não pode
  // ficar mudo, senão o farmer acha que evidenciou e não evidenciou.
  let aviso = "";
  try {
    const rotulo = RESULTADOS_TRAMITACAO.find((r) => r.key === resultado)?.label || resultado;
    await criarNotaNoTicket(ticketId, {
      corpo:
        `<p><b>Diário de bordo · ${ETAPAS_TICKET[tipo].label} · ${rotulo}</b></p>` +
        (abordagem ? `<p><b>Abordagem:</b> ${abordagem}</p>` : "") +
        (estrategia ? `<p><b>Estratégia:</b> ${estrategia}</p>` : "") +
        `<p>${(observacao || "sem observação").replace(/\n/g, "<br>")}</p>` +
        `<p><i>registrado por ${quem(session)}</i></p>`,
      ownerId: session.user.ownerId || null,
    });
  } catch (e) {
    console.error("[tramitacoes] falha ao gravar a tratativa no ticket:", e);
    aviso = "Registrado aqui, mas a observação não chegou ao ticket no HubSpot.";
  }

  return Response.json({ ok: true, aviso });
}
