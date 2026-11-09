import { auth } from "../../../auth";
import { getOwnerByEmail } from "../../../lib/hubspot";
import { marcarTramitacao, decidirTramitacao, salvarEvolucaoTramitacao, dbReady } from "../../../lib/db";
import {
  ETAPAS_TICKET,
  RESULTADOS_TRAMITACAO,
  TRAMITACAO_EXIGE_OBSERVACAO,
  ABORDAGENS_TRAMITACAO,
  clienteDo,
} from "../../../lib/tramitacoes";
import {
  ehTipoFinanceiro,
  etapaDoTipo,
  abordagensDa,
  ABORDAGEM_DO_ONBOARDING,
} from "../../../lib/financeiro";
import { listarEstrategias, listarOcultas } from "../../../lib/db";
import { montaEstrategias, semOcultas, indexaPorId, rotuloDa } from "../../../lib/estrategias";
import { SEG_TRAMITACOES, SEG_FINANCEIRO, OWNER_ONBOARDING } from "../../../lib/config";
import { criarNotaNoTicket, criarTarefaNoTicket } from "../../../lib/hubspot";
import { dayKey } from "../../../lib/week";
import { ehGestor, podeVerFinanceiro } from "../../../lib/permissoes";

const quem = (session) => session.user.name || session.user.email;

// Um `tipo` é a etapa do funil, ou a mesma etapa prefixada quando quem
// registra é o financeiro. Resolver isso num lugar só evita que a validação e
// a gravação discordem sobre o que o tipo significa.
function leTipo(tipo) {
  const fin = ehTipoFinanceiro(tipo);
  const etapa = fin ? etapaDoTipo(tipo) : String(tipo || "");
  if (!(etapa in ETAPAS_TICKET)) return null;
  return {
    fin,
    etapa,
    label: ETAPAS_TICKET[etapa].label,
    seg: fin ? SEG_FINANCEIRO : SEG_TRAMITACOES,
    abordagens: fin ? abordagensDa(etapa) : ABORDAGENS_TRAMITACAO,
  };
}

// O responsável marca como feito. A pendência fica aguardando o líder — não
// sai do board sozinha, senão marcar viraria atalho para fazer sumir.
export async function POST(req) {
  const session = await auth();
  if (!session?.user?.email) return Response.json({ error: "Não autenticado." }, { status: 401 });
  if (!dbReady()) return Response.json({ error: "Banco não configurado." }, { status: 503 });

  const { ticketId, tipo } = await req.json().catch(() => ({}));
  if (!ticketId || !leTipo(tipo)) {
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
  if (!ticketId || !leTipo(tipo) || !["confirmado", "devolvido"].includes(decisao)) {
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
// o que depende de terceiro e o que depende do farmer. O financeiro passa pela
// mesma rota, com o tipo prefixado e a lista de abordagem da etapa dele.
export async function PUT(req) {
  const session = await auth();
  if (!session?.user?.email) return Response.json({ error: "Não autenticado." }, { status: 401 });
  if (!dbReady()) return Response.json({ error: "Banco não configurado." }, { status: 503 });

  const body = await req.json().catch(() => ({}));
  const { ticketId } = body;
  // Vazio no financeiro, onde o campo não existe. A coluna é NOT NULL, então
  // tem que ser texto vazio e não undefined.
  const resultado = String(body.resultado || "");
  const observacao = String(body.observacao || "").trim();
  const abordagem = String(body.abordagem || "").trim();
  const estrategiaId = String(body.estrategia || "").trim();

  const t = leTipo(body.tipo);
  if (!ticketId || !t) {
    return Response.json({ error: "Tramitação inválida." }, { status: 400 });
  }
  // Resolvi, avancei e travado são da Tramitação, onde a pendência é baixada
  // em duas mãos. No financeiro não existe baixa, então o campo não é pedido
  // na tela e não é cobrado aqui.
  if (t.fin) {
    if (resultado && !RESULTADOS_TRAMITACAO.some((r) => r.key === resultado)) {
      return Response.json({ error: "Resultado inválido." }, { status: 400 });
    }
  } else if (!RESULTADOS_TRAMITACAO.some((r) => r.key === resultado)) {
    return Response.json({ error: "Resultado inválido." }, { status: 400 });
  }
  if (abordagem && !t.abordagens.includes(abordagem)) {
    return Response.json({ error: "Abordagem inválida para esta etapa." }, { status: 400 });
  }

  // O seguimento financeiro não é da carteira de ninguém: quem entra é o time
  // financeiro, o admin ou quem lidera o CS. Sem esta porta, qualquer farmer
  // gravaria cobrança em ticket que não opera.
  let ownerId = null;
  if (t.fin) {
    try {
      const owner = await getOwnerByEmail(session.user.email.toLowerCase());
      ownerId = owner ? String(owner.ownerId) : null;
    } catch (e) {
      console.error("[financeiro] HubSpot falhou ao identificar:", e);
      return Response.json({ error: "Não foi possível falar com o HubSpot agora." }, { status: 503 });
    }
    if (!podeVerFinanceiro(session.user, ownerId)) {
      return Response.json({ error: "Só o time financeiro registra aqui." }, { status: 403 });
    }
  }

  // A estratégia é a mesma lista que a curadoria cadastra em Configurações, no
  // segmento da tela. Id que não está nela não entra no registro.
  let estrategia = null;
  if (estrategiaId) {
    const porSeg = montaEstrategias(await listarEstrategias());
    const visiveis = semOcultas(porSeg, await listarOcultas())[t.seg] || [];
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
    await salvarEvolucaoTramitacao(ticketId, body.tipo, body.dia || dayKey(), {
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
  // ficar mudo, senão quem registrou acha que evidenciou e não evidenciou.
  const avisos = [];
  const rotulo = RESULTADOS_TRAMITACAO.find((r) => r.key === resultado)?.label || "";
  const titulo = t.fin ? `Financeiro · ${t.label}` : `Diário de bordo · ${t.label}`;
  const tentativa = Number(body.tentativa) || 0;

  try {
    await criarNotaNoTicket(ticketId, {
      corpo:
        `<p><b>${titulo}${rotulo ? ` · ${rotulo}` : ""}</b></p>` +
        (t.fin && tentativa ? `<p><b>Tentativa:</b> ${tentativa}</p>` : "") +
        (abordagem ? `<p><b>Abordagem:</b> ${abordagem}</p>` : "") +
        (estrategia ? `<p><b>Estratégia:</b> ${estrategia}</p>` : "") +
        `<p>${(observacao || "sem observação").replace(/\n/g, "<br>")}</p>` +
        `<p><i>registrado por ${quem(session)}</i></p>`,
      ownerId,
    });
  } catch (e) {
    console.error("[tramitacoes] falha ao gravar a tratativa no ticket:", e);
    avisos.push("Registrado aqui, mas a observação não chegou ao ticket no HubSpot.");
  }

  // A tarefa é o que cobra alguém de volta numa data. Só sai se foi pedida na
  // tela: criar sempre encheria o HubSpot de tarefa que ninguém abriu.
  if (t.fin && body.tarefa) {
    const paraOnboarding = abordagem === ABORDAGEM_DO_ONBOARDING;
    const dono = paraOnboarding ? OWNER_ONBOARDING : ownerId;
    try {
      await criarTarefaNoTicket(ticketId, {
        titulo: `${abordagem || t.label} · ${clienteDo(body.assunto || "") || `ticket ${ticketId}`}`,
        corpo:
          (observacao || "") +
          (tentativa ? `\n\nTentativa ${tentativa}.` : "") +
          `\n\nAberta pelo Diário de bordo por ${quem(session)}.`,
        vence: body.vence || "",
        ownerId: dono,
      });
    } catch (e) {
      console.error("[financeiro] falha ao criar a tarefa:", e);
      avisos.push("A tarefa não foi criada no HubSpot. Veja o log.");
    }
    if (paraOnboarding && !OWNER_ONBOARDING) {
      avisos.push("A tarefa ficou sem dono: falta o owner do onboarding no cadastro.");
    }
  }

  return Response.json({ ok: true, aviso: avisos.join(" ") });
}
