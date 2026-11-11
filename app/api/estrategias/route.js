import { auth } from "../../../auth";
import {
  criarEstrategia,
  editarEstrategia,
  listarEstrategias,
  listarOcultas,
  ocultarEstrategia,
  restaurarEstrategia,
  dbReady,
} from "../../../lib/db";
import { podeCriarEstrategia } from "../../../lib/permissoes";
import { montaEstrategias, semOcultas, proximoId } from "../../../lib/estrategias";

const quem = (s) => s.user.name || s.user.email;

const MIN_TITULO = 5;
const MIN_DESC = 20;

// Autenticação, banco e permissão — as três checagens que toda ação daqui faz.
async function guarda(seg) {
  const session = await auth();
  if (!session?.user?.email) return { erro: "Não autenticado.", status: 401 };
  if (!dbReady()) return { erro: "Banco não configurado.", status: 503 };
  if (!podeCriarEstrategia(session.user, seg)) {
    return { erro: "Você não mexe nas estratégias desse segmento.", status: 403 };
  }
  return { session };
}

// A lista que vale para escolher: sem o que foi removido.
async function visiveis(seg) {
  const porSeg = montaEstrategias(await listarEstrategias());
  return semOcultas(porSeg, await listarOcultas())[seg] || [];
}

// Cadastro de estratégia nova. O id é calculado aqui, no servidor: é ele que
// vai gravado em todo briefing daqui pra frente e não pode vir do cliente.
export async function POST(req) {
  const { seg, titulo, desc } = await req.json().catch(() => ({}));
  const g = await guarda(seg);
  if (g.erro) return Response.json({ error: g.erro }, { status: g.status });

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
    // Contra a lista visível: um título removido pode voltar a ser cadastrado.
    const atuais = await visiveis(seg);
    if (atuais.some((e) => e.titulo.toLowerCase() === t.toLowerCase())) {
      return Response.json({ error: "Já existe uma estratégia com esse título." }, { status: 409 });
    }
    // Numera sobre a lista inteira, inclusive o que foi removido: reaproveitar
    // um número faria dois registros diferentes virarem o mesmo id.
    const todas = montaEstrategias(await listarEstrategias())[seg] || [];
    const id = proximoId(seg, todas);
    if (!id) return Response.json({ error: "Segmento inválido." }, { status: 400 });

    const nova = await criarEstrategia({ id, seg, titulo: t, desc: d, criadoPor: quem(g.session) });
    return Response.json({ ok: true, estrategia: nova });
  } catch (e) {
    console.error("[estrategias] falha ao cadastrar:", e);
    return Response.json({ error: e.message || "Falha ao cadastrar." }, { status: 500 });
  }
}

// Remover é tirar da lista, não apagar: o briefing já gravado continua
// mostrando o nome da estratégia que o closer escolheu na época.
export async function DELETE(req) {
  const { seg, id } = await req.json().catch(() => ({}));
  const g = await guarda(seg);
  if (g.erro) return Response.json({ error: g.erro }, { status: g.status });

  try {
    const atuais = await visiveis(seg);
    if (!atuais.some((e) => e.id === id)) {
      return Response.json({ error: "Essa estratégia não está na lista." }, { status: 404 });
    }
    if (atuais.length === 1) {
      return Response.json({ error: "É a última da lista — o time ficaria sem nenhuma opção." }, { status: 400 });
    }
    await ocultarEstrategia(seg, id, quem(g.session));
    return Response.json({ ok: true });
  } catch (e) {
    console.error("[estrategias] falha ao remover:", e);
    return Response.json({ error: e.message || "Falha ao remover." }, { status: 500 });
  }
}

// Edita o texto de uma estratégia, original ou cadastrada. O id não muda:
// é ele que está gravado nos briefings e no histórico, e trocá-lo apagaria o
// nome da estratégia de todo dia já fechado.
export async function PUT(req) {
  const { seg, id, titulo, desc } = await req.json().catch(() => ({}));
  const g = await guarda(seg);
  if (g.erro) return Response.json({ error: g.erro }, { status: g.status });

  const t = String(titulo || "").trim();
  const d = String(desc || "").trim();
  if (t.length < MIN_TITULO) {
    return Response.json({ error: `O título precisa de pelo menos ${MIN_TITULO} letras.` }, { status: 400 });
  }
  if (d.length < MIN_DESC) {
    return Response.json(
      { error: `O "quando usar" precisa de pelo menos ${MIN_DESC} letras: é ele que diz ao time em que situação aplicar.` },
      { status: 400 }
    );
  }

  try {
    // Só o que está na lista do segmento. Sem isto daria para editar a
    // estratégia de outro segmento mandando o id na mão.
    const porSeg = montaEstrategias(await listarEstrategias());
    if (!(porSeg[seg] || []).some((e) => e.id === id)) {
      return Response.json({ error: "Essa estratégia não é desse segmento." }, { status: 404 });
    }
    const e = await editarEstrategia({ id, seg, titulo: t, desc: d, por: quem(g.session) });
    return Response.json({ ok: true, estrategia: e });
  } catch (e) {
    console.error("[estrategias] falha ao editar:", e);
    return Response.json({ error: e.message || "Falha ao editar." }, { status: 500 });
  }
}

export async function PATCH(req) {
  const { seg, id } = await req.json().catch(() => ({}));
  const g = await guarda(seg);
  if (g.erro) return Response.json({ error: g.erro }, { status: g.status });

  try {
    await restaurarEstrategia(seg, id);
    return Response.json({ ok: true });
  } catch (e) {
    console.error("[estrategias] falha ao restaurar:", e);
    return Response.json({ error: e.message || "Falha ao restaurar." }, { status: 500 });
  }
}
