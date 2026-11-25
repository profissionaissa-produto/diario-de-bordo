import { auth } from "../../../../auth";
import { salvarOrientacao, comentarDia, marcarRevisado, dbReady } from "../../../../lib/db";
import { podeGerirCloser } from "../../../../lib/permissoes";
import { gravarNoHubspot } from "../../../../lib/carteira-hubspot";

const quem = (s) => s.user.name || s.user.email;

// Decisões que só o líder toma sobre a carteira de um farmer: escrever a
// orientação de uma empresa travada, comentar e revisar o dia.
//
// A ação "troca" saiu em 25/11/2026 junto com o painel que a chamava. Ela
// resolvia um pedido de troca de segmento, e ninguém resolvia: a fila parada
// mantinha 44 empresas fora do rodízio. Agora elas voltam a ser listadas, com
// o mesmo portão de todas, que é não ter contato nos últimos 30 dias.
export async function POST(req) {
  const session = await auth();
  if (!session?.user?.email) return Response.json({ error: "Não autenticado." }, { status: 401 });
  if (!dbReady()) return Response.json({ error: "Banco não configurado." }, { status: 503 });

  const body = await req.json().catch(() => ({}));
  const { acao, ownerId, companyId, texto, dia } = body;
  if (!ownerId) return Response.json({ error: "Dados incompletos." }, { status: 400 });
  // Comentar e revisar são sobre o dia inteiro, não sobre uma empresa.
  if (!["comentario", "revisado"].includes(acao) && !companyId) {
    return Response.json({ error: "Dados incompletos." }, { status: 400 });
  }
  if (!podeGerirCloser(session.user, ownerId)) {
    return Response.json({ error: "Esse farmer não é do seu time." }, { status: 403 });
  }

  try {
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

    // Revisar é o líder dizendo que leu o dia. Não é aprovação: o farmer já
    // iniciou o dia sozinho e o plano já está no CRM. Regravar aqui é de
    // propósito, como rede para o caso de a gravação do farmer ter falhado em
    // parte, e é inofensivo porque escrever o mesmo valor não muda nada.
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
