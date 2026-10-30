import { auth } from "../../../auth";
import { criarEstrategia, listarEstrategias, dbReady } from "../../../lib/db";
import { podeCriarEstrategia } from "../../../lib/permissoes";
import { montaEstrategias, proximoId } from "../../../lib/estrategias";

const quem = (s) => s.user.name || s.user.email;

const MIN_TITULO = 5;
const MIN_DESC = 20;

// Cadastro de estratégia nova. O id é calculado aqui, no servidor: é ele que
// vai gravado em todo briefing daqui pra frente e não pode vir do cliente.
export async function POST(req) {
  const session = await auth();
  if (!session?.user?.email) return Response.json({ error: "Não autenticado." }, { status: 401 });
  if (!dbReady()) return Response.json({ error: "Banco não configurado." }, { status: 503 });

  const { seg, titulo, desc } = await req.json().catch(() => ({}));
  if (!podeCriarEstrategia(session.user, seg)) {
    return Response.json({ error: "Você não cadastra estratégia nesse segmento." }, { status: 403 });
  }

  const t = String(titulo || "").trim();
  const d = String(desc || "").trim();
  // Estratégia sem explicação vira um item de lista que ninguém sabe usar.
  if (t.length < MIN_TITULO) {
    return Response.json({ error: `O título precisa de pelo menos ${MIN_TITULO} caracteres.` }, { status: 400 });
  }
  if (d.length < MIN_DESC) {
    return Response.json({ error: `Explique a estratégia em pelo menos ${MIN_DESC} caracteres.` }, { status: 400 });
  }

  try {
    const atuais = montaEstrategias(await listarEstrategias())[seg] || [];
    if (atuais.some((e) => e.titulo.toLowerCase() === t.toLowerCase())) {
      return Response.json({ error: "Já existe uma estratégia com esse título." }, { status: 409 });
    }
    const id = proximoId(seg, atuais);
    if (!id) return Response.json({ error: "Segmento inválido." }, { status: 400 });

    const nova = await criarEstrategia({ id, seg, titulo: t, desc: d, criadoPor: quem(session) });
    return Response.json({ ok: true, estrategia: nova });
  } catch (e) {
    console.error("[estrategias] falha ao cadastrar:", e);
    return Response.json({ error: e.message || "Falha ao cadastrar." }, { status: 500 });
  }
}
