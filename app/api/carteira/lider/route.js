import { auth } from "../../../../auth";
import { decidirTroca, salvarOrientacao, comentarDia, marcarRevisado, getListaDia, listarEstrategias, dbReady } from "../../../../lib/db";
import { podeGerirCloser } from "../../../../lib/permissoes";
import { propriedadeEmpresa, updateCompany } from "../../../../lib/hubspot";
import { montaEstrategias, indexaPorId, valorDaEstrategia, valorNaOpcao } from "../../../../lib/estrategias";

const quem = (s) => s.user.name || s.user.email;

// O aval do líder é o que manda o plano do dia para o CRM, como a aprovação do
// briefing faz no B2B. Grava na empresa o que o farmer definiu de manhã.
// Devolve o que foi escrito e o que não foi, com o motivo — um dia marcado
// como revisado sem nada ter chegado ao HubSpot é pior do que um erro visível.
async function gravarNoHubspot(ownerId, dia) {
  const itens = (await getListaDia(ownerId, dia)).filter((e) => e.abordagem || e.estrategia);
  if (itens.length === 0) return { gravadas: 0, falhas: [], semPropriedade: [] };

  const [propAbordagem, propEstrategia] = await Promise.all([
    propriedadeEmpresa("abordagem"),
    propriedadeEmpresa("estrategia"),
  ]);
  const idx = indexaPorId(montaEstrategias(await listarEstrategias()));

  const semPropriedade = [];
  if (!propAbordagem) semPropriedade.push("abordagem");
  if (!propEstrategia) semPropriedade.push("estrategia");
  for (const nome of semPropriedade) {
    console.error(`[carteira] a conta não tem a propriedade "${nome}" em empresas — nada foi gravado nesse campo`);
  }

  let gravadas = 0;
  const falhas = [];
  for (const e of itens) {
    const props = {};
    if (e.abordagem) {
      const v = valorNaOpcao(propAbordagem, [e.abordagem], `[carteira] abordagem "${e.abordagem}"`);
      if (v !== undefined) props.abordagem = v;
    }
    if (e.estrategia) {
      const v = valorDaEstrategia(propEstrategia, e.estrategia, idx);
      if (v !== undefined) props.estrategia = v;
    }
    if (Object.keys(props).length === 0) continue;
    try {
      await updateCompany(e.id, props);
      gravadas++;
    } catch (err) {
      console.error(`[carteira] falha ao gravar a empresa ${e.id}:`, err);
      falhas.push(e.nome || e.id);
    }
  }
  return { gravadas, falhas, semPropriedade };
}

// Decisões que só o líder toma sobre a carteira de um farmer: resolver um
// pedido de troca de segmento e escrever a orientação de uma empresa travada.
export async function POST(req) {
  const session = await auth();
  if (!session?.user?.email) return Response.json({ error: "Não autenticado." }, { status: 401 });
  if (!dbReady()) return Response.json({ error: "Banco não configurado." }, { status: 503 });

  const body = await req.json().catch(() => ({}));
  const { acao, ownerId, companyId, decisao, texto, dia } = body;
  if (!ownerId) return Response.json({ error: "Dados incompletos." }, { status: 400 });
  // Comentar e revisar são sobre o dia inteiro, não sobre uma empresa.
  if (!["comentario", "revisado"].includes(acao) && !companyId) {
    return Response.json({ error: "Dados incompletos." }, { status: 400 });
  }
  if (!podeGerirCloser(session.user, ownerId)) {
    return Response.json({ error: "Esse farmer não é do seu time." }, { status: 403 });
  }

  try {
    if (acao === "troca") {
      // "trocado": saiu da carteira no HubSpot. "mantido": volta ao rodízio.
      if (!["trocado", "mantido"].includes(decisao)) {
        return Response.json({ error: "Decisão inválida." }, { status: 400 });
      }
      await decidirTroca(ownerId, companyId, decisao, quem(session));
      return Response.json({ ok: true });
    }

    if (acao === "orientacao") {
      const t = String(texto || "").trim();
      // Orientação vazia não ajuda ninguém e ocuparia espaço no card.
      if (t.length < 10) {
        return Response.json({ error: "Escreva a orientação." }, { status: 400 });
      }
      await salvarOrientacao(ownerId, companyId, t, quem(session));
      return Response.json({ ok: true });
    }

    if (acao === "comentario") {
      const t = String(texto || "").trim();
      if (!t) return Response.json({ error: "Escreva o comentário." }, { status: 400 });
      await comentarDia(ownerId, dia, t, quem(session));
      return Response.json({ ok: true });
    }

    if (acao === "revisado") {
      await marcarRevisado(ownerId, dia, quem(session));
      // O dia fica revisado mesmo se o HubSpot recusar: o aval é do líder, não
      // do CRM. O que falhou volta na resposta em vez de sumir no log.
      const hub = await gravarNoHubspot(ownerId, dia).catch((e) => {
        console.error("[carteira] falha ao gravar o dia no HubSpot:", e);
        return { gravadas: 0, falhas: ["todas"], semPropriedade: [] };
      });
      return Response.json({ ok: true, hubspot: hub });
    }

    return Response.json({ error: "Ação desconhecida." }, { status: 400 });
  } catch (e) {
    console.error("[carteira] falha na ação do líder:", e);
    return Response.json({ error: "Falha ao registrar." }, { status: 500 });
  }
}
