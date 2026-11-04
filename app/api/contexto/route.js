import { auth } from "../../../auth";
import { salvarTexto, chaveContexto, dbReady } from "../../../lib/db";
import { podeCriarEstrategia } from "../../../lib/permissoes";

const MIN = 40;
const MAX = 4000;

// O contexto institucional vale para o segmento inteiro e entra em toda
// mensagem gerada, então quem mexe nele é quem já cura a lista de estratégias.
export async function POST(req) {
  const session = await auth();
  if (!session?.user?.email) return Response.json({ error: "Não autenticado." }, { status: 401 });
  if (!dbReady()) return Response.json({ error: "Banco não configurado." }, { status: 503 });

  const { seg, texto } = await req.json().catch(() => ({}));
  if (!podeCriarEstrategia(session.user, seg)) {
    return Response.json({ error: "Você não configura esse segmento." }, { status: 403 });
  }

  const t = String(texto || "").trim();
  // Vazio é decisão válida: significa gerar só com o que está na tela.
  if (t.length > 0 && t.length < MIN) {
    return Response.json({ error: `Escreva pelo menos ${MIN} caracteres ou deixe vazio.` }, { status: 400 });
  }
  if (t.length > MAX) {
    return Response.json({ error: `O contexto passa de ${MAX} caracteres.` }, { status: 400 });
  }

  try {
    await salvarTexto(chaveContexto(seg), t, session.user.name || session.user.email);
    return Response.json({ ok: true });
  } catch (e) {
    console.error("[contexto] falha ao salvar:", e);
    return Response.json({ error: "Falha ao salvar." }, { status: 500 });
  }
}
