import { auth } from "../../../auth";
import { getOwnerByEmail, getDealsByIds, updateDeal, propriedadeDeal, criarTarefaNoDeal } from "../../../lib/hubspot";
import { valorDaEstrategia, montaEstrategias, indexaPorId } from "../../../lib/estrategias";
import { saveBriefing, reviewBriefing, getBriefing, dbReady, dealsComTarefa, registraTarefa, listarEstrategias } from "../../../lib/db";
import { dayKey, prazoDoDia } from "../../../lib/week";
import { ehGestor, podeGerirCloser } from "../../../lib/permissoes";

// Closer só mexe no próprio briefing; admin mexe no de qualquer closer.
// O closer sempre cai na consulta ao HubSpot: se ela falhar (cota diária),
// o envio inteiro morria em 500 sem dizer o motivo a ninguém.
async function resolveOwner(session, bodyOwnerId) {
  if (bodyOwnerId && podeGerirCloser(session.user, bodyOwnerId)) return String(bodyOwnerId);
  try {
    const owner = await getOwnerByEmail(session.user.email.toLowerCase());
    return owner ? String(owner.ownerId) : null;
  } catch (e) {
    console.error("[briefing] HubSpot falhou ao identificar o closer:", e);
    throw new Error(
      /429|daily limit/i.test(String(e?.message))
        ? "Limite diário do HubSpot atingido — o envio não pôde ser identificado. Tente de novo mais tarde."
        : "Não foi possível falar com o HubSpot para identificar você."
    );
  }
}

// Aceita { [dealId]: { de, para } } e descarta qualquer coisa fora do formato.
function normalizar(items) {
  const out = {};
  if (!items || typeof items !== "object") return out;
  for (const [id, v] of Object.entries(items)) {
    out[String(id)] = {
      de: typeof v?.de === "string" ? v.de : "",
      para: typeof v?.para === "string" ? v.para : "",
      estrategia: typeof v?.estrategia === "string" ? v.estrategia : "",
      // Só o gestor escreve aqui; o closer nunca manda este campo.
      obsGestor: typeof v?.obsGestor === "string" ? v.obsGestor : "",
    };
  }
  return out;
}

// Conteúdo de um briefing (usado ao expandir uma linha do histórico).
// Carregado sob demanda para não buscar dezenas de negócios de uma vez.
export async function GET(req) {
  const session = await auth();
  if (!ehGestor(session?.user)) {
    return Response.json({ error: "Sem permissão." }, { status: 403 });
  }
  const { searchParams } = new URL(req.url);
  const ownerId = searchParams.get("owner");
  const dia = searchParams.get("dia");
  if (!ownerId || !dia) return Response.json({ error: "Informe closer e dia." }, { status: 400 });
  if (!podeGerirCloser(session.user, ownerId)) {
    return Response.json({ error: "Closer fora do seu time." }, { status: 403 });
  }

  const briefing = await getBriefing(ownerId, dia);
  const ids = Object.keys(briefing?.items || {});
  const deals = ids.length ? await getDealsByIds(ids) : {};

  return Response.json({
    status: briefing?.status || "rascunho",
    motivo: briefing?.motivo || "",
    revisadoPor: briefing?.revisadoPor || "",
    itens: ids.map((id) => ({
      id,
      nome: deals[id]?.name || `Negócio ${id}`,
      valor: deals[id]?.amount ?? null,
      ...briefing.items[id],
    })),
  });
}

export async function POST(req) {
  const session = await auth();
  if (!session?.user?.email) return Response.json({ error: "Não autenticado." }, { status: 401 });
  if (!dbReady()) return Response.json({ error: "Banco não configurado." }, { status: 503 });

  const body = await req.json().catch(() => ({}));
  let ownerId;
  try {
    ownerId = await resolveOwner(session, body.ownerId);
  } catch (e) {
    return Response.json({ error: e.message }, { status: 503 });
  }
  if (!ownerId) return Response.json({ error: "Closer não encontrado." }, { status: 403 });

  const dia = body.dia || dayKey();
  // Admin ajustando preserva a situação; closer enviando manda para aprovação.
  const status = body.manterStatus && ehGestor(session.user) ? null : "enviado";

  // Estratégia e evolução são obrigatórias: um briefing sem elas não diz nada
  // ao gestor. Validado aqui também, não só na tela.
  const items = normalizar(body.items);

  // Briefing sem nenhum negócio não é briefing: com a lista vazia, a checagem
  // de campos obrigatórios abaixo não acusa nada e o envio passava zerado.
  if (Object.keys(items).length === 0) {
    return Response.json(
      { error: "Marque ao menos um negócio para atuar hoje." },
      { status: 400 }
    );
  }

  const incompletos = Object.values(items).filter((v) => !v.para || !v.estrategia).length;
  if (incompletos > 0) {
    return Response.json(
      {
        error: `${incompletos} negócio(s) sem estratégia ou evolução pretendida.`,
      },
      { status: 400 }
    );
  }

  // O closer não manda a observação do gestor, e salvar apaga e reinsere os
  // itens: sem isto, um reenvio dele limparia a orientação que o gestor
  // escreveu. O gestor continua podendo apagar a própria observação.
  if (!ehGestor(session.user)) {
    const atual = await getBriefing(ownerId, dia).catch(() => null);
    for (const [id, v] of Object.entries(items)) {
      v.obsGestor = atual?.items?.[id]?.obsGestor || "";
    }
  }

  try {
    await saveBriefing(ownerId, dia, items, status);
  } catch (e) {
    console.error("[briefing] falha ao salvar:", e);
    return Response.json({ error: "Falha ao salvar o briefing." }, { status: 500 });
  }
  return Response.json({ ok: true });
}

export async function PATCH(req) {
  const session = await auth();
  if (!session?.user?.email) return Response.json({ error: "Não autenticado." }, { status: 401 });
  if (!ehGestor(session.user)) return Response.json({ error: "Sem permissão para aprovar." }, { status: 403 });
  if (!dbReady()) return Response.json({ error: "Banco não configurado." }, { status: 503 });

  const body = await req.json().catch(() => ({}));
  const { ownerId, status, motivo } = body;
  if (!ownerId || !["aprovado", "reprovado"].includes(status)) {
    return Response.json({ error: "Dados inválidos." }, { status: 400 });
  }
  if (!podeGerirCloser(session.user, ownerId)) {
    return Response.json({ error: "Closer fora do seu time." }, { status: 403 });
  }
  if (status === "reprovado" && !String(motivo || "").trim()) {
    return Response.json({ error: "Motivo é obrigatório ao reprovar." }, { status: 400 });
  }

  const dia = body.dia || dayKey();
  await reviewBriefing(String(ownerId), dia, status, motivo, session.user.name || session.user.email);

  // Aprovado, a evolução pretendida deixa de ser só intenção e vai para o
  // HubSpot: a temperatura de cada negócio do briefing passa a ser o "PARA".
  // Só na aprovação — reprovar não toca no CRM.
  if (status !== "aprovado") return Response.json({ ok: true });

  const briefing = await getBriefing(String(ownerId), dia);
  const alvos = Object.entries(briefing?.items || {}).filter(([, v]) => v.para);

  // A estratégia só vai junto se a propriedade já existir na conta, e o valor
  // é resolvido contra as opções reais dela — ver valorDaEstrategia.
  const propEstrategia = await propriedadeDeal("estrategia");
  // Índice completo: sem as cadastradas, uma estratégia nova não resolveria.
  const estratIdx = indexaPorId(montaEstrategias(await listarEstrategias()));

  // Tarefa só para quem ainda não tem: reaprovar não pode encher o negócio de
  // tarefas repetidas.
  const jaTemTarefa = await dealsComTarefa(String(ownerId), dia);
  const vence = prazoDoDia(dia);

  // O corpo da tarefa é a observação que o closer escreveu no diário, que mora
  // no próprio negócio. Falhar aqui não cancela a tarefa: ela nasce sem corpo.
  const dadosDosDeals = await getDealsByIds(alvos.map(([id]) => id)).catch((e) => {
    console.error("[briefing] não consegui ler as observações dos negócios:", e?.message);
    return {};
  });

  // Um de cada vez: rajada de escrita é o que derrubou os salvamentos antes.
  let aplicados = 0;
  let tarefas = 0;
  const falhas = [];
  const falhasTarefa = [];
  let erroTarefa = "";
  for (const [dealId, v] of alvos) {
    try {
      const patch = { temperatura_atual: v.para };
      const estrat = valorDaEstrategia(propEstrategia, v.estrategia, estratIdx);
      if (estrat !== undefined) patch.estrategia = estrat;
      await updateDeal(dealId, patch);
      aplicados++;
    } catch (e) {
      console.error(`[briefing] falha ao gravar o negócio ${dealId}:`, e);
      falhas.push(dealId);
    }

    // A estratégia aprovada vira tarefa no negócio: o plano do dia passa a
    // existir onde o closer trabalha, não só dentro do diário.
    if (jaTemTarefa.has(String(dealId))) continue;
    try {
      const taskId = await criarTarefaNoDeal(dealId, {
        corpo: dadosDosDeals[String(dealId)]?.observacoes || "",
        ownerId,
        vence,
      });
      await registraTarefa(String(ownerId), dia, dealId, taskId);
      tarefas++;
    } catch (e) {
      console.error(`[briefing] falha ao criar tarefa no negócio ${dealId}:`, e);
      falhasTarefa.push(dealId);
      erroTarefa ||= String(e?.message || e);
    }
  }

  // Falhar em silêncio aqui esconderia escopo faltando no App Privado: a
  // aprovação continua valendo, mas quem aprovou fica sabendo.
  const aviso = falhasTarefa.length
    ? `Briefing aprovado, mas ${falhasTarefa.length} tarefa(s) não foram criadas no HubSpot. ${erroTarefa}`
    : "";

  return Response.json({ ok: true, aplicados, falhas, tarefas, falhasTarefa, aviso });
}
