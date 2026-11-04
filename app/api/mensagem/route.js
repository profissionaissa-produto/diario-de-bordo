import { auth } from "../../../auth";
import { getOwnerByEmail, criarNotaNaEmpresa } from "../../../lib/hubspot";
import {
  getListaDia,
  listarEstrategias,
  tentativasPorEmpresa,
  registraTentativa,
  dbReady,
} from "../../../lib/db";
import { montaEstrategias, indexaPorId } from "../../../lib/estrategias";
import { BALDES } from "../../../lib/carteira";
import { CANAL_VALIDO, canaisLiberados, rotuloCanal, tentativasNo, LIMITE_POR_CANAL } from "../../../lib/canal";
import { geraMensagem } from "../../../lib/gemini";
import { paraWhatsApp } from "../../../lib/telefone";
import { dayKey } from "../../../lib/week";
import { podeGerirCloser } from "../../../lib/permissoes";

// De quem é o dia. O líder pode gerar pelo farmer, como já faz na carteira.
async function resolveOwner(session, bodyOwnerId) {
  if (bodyOwnerId && podeGerirCloser(session.user, bodyOwnerId)) return String(bodyOwnerId);
  const owner = await getOwnerByEmail(session.user.email.toLowerCase());
  return owner ? String(owner.ownerId) : null;
}

// A empresa precisa estar na lista do dia de quem está gerando: é a lista que
// define o compromisso, e sem isso qualquer id de empresa serviria.
async function daLista(ownerId, dia, companyId) {
  const itens = await getListaDia(ownerId, dia);
  return itens.find((e) => String(e.id) === String(companyId)) || null;
}

async function contexto(req) {
  const session = await auth();
  if (!session?.user?.email) return { erro: "Não autenticado.", status: 401 };
  if (!dbReady()) return { erro: "Banco não configurado.", status: 503 };

  const body = await req.json().catch(() => ({}));
  const ownerId = await resolveOwner(session, body.ownerId);
  if (!ownerId) return { erro: "Farmer não encontrado.", status: 403 };

  const dia = body.dia || dayKey();
  const empresa = await daLista(ownerId, dia, body.companyId);
  if (!empresa) return { erro: "Essa empresa não está na lista de hoje.", status: 400 };

  if (!CANAL_VALIDO(body.canal)) return { erro: "Canal inválido.", status: 400 };

  const tentativas = (await tentativasPorEmpresa([body.companyId]))[String(body.companyId)] || {};
  if (!canaisLiberados(tentativas).includes(body.canal)) {
    return {
      erro: `O ${rotuloCanal(body.canal)} já teve ${LIMITE_POR_CANAL} tentativas sem resposta nesta empresa.`,
      status: 409,
    };
  }

  return { session, body, ownerId, dia, empresa, tentativas };
}

// Gera o texto. Não conta tentativa nem grava nada: contar aqui queimaria uma
// chance toda vez que alguém pedisse outra versão do texto.
export async function POST(req) {
  const c = await contexto(req);
  if (c.erro) return Response.json({ error: c.erro }, { status: c.status });

  const porSeg = montaEstrategias(await listarEstrategias());
  const idx = indexaPorId(porSeg);
  const estrategia = idx[c.empresa.estrategia] || null;

  try {
    const texto = await geraMensagem({
      empresa: c.empresa.nome,
      contato: c.body.contato || null,
      canal: c.body.canal,
      tentativa: tentativasNo(c.tentativas, c.body.canal) + 1,
      estrategia,
      fase: BALDES[c.empresa.balde]?.label || c.empresa.balde,
      ultimaCompra: c.empresa.ultimaCompra,
      observacao: c.empresa.contexto,
    });
    return Response.json({ ok: true, texto, tentativa: tentativasNo(c.tentativas, c.body.canal) + 1 });
  } catch (e) {
    console.error("[mensagem] falha ao gerar:", e);
    return Response.json({ error: e.message || "Falha ao gerar a mensagem." }, { status: 502 });
  }
}

// O envio: conta a tentativa, grava o registro da conversa no HubSpot e
// devolve o link do WhatsApp já montado. É aqui que a cascata anda.
export async function PUT(req) {
  const c = await contexto(req);
  if (c.erro) return Response.json({ error: c.erro }, { status: c.status });

  const texto = String(c.body.texto || "").trim();
  if (!texto) return Response.json({ error: "Sem texto para registrar." }, { status: 400 });

  const contato = c.body.contato || {};
  const numero = paraWhatsApp(contato.telefone);
  if (c.body.canal === "whatsapp" && !numero) {
    return Response.json(
      { error: "Esse contato não tem um telefone que dê para abrir no WhatsApp." },
      { status: 400 }
    );
  }

  const tentativa = tentativasNo(c.tentativas, c.body.canal) + 1;
  try {
    await registraTentativa({
      companyId: c.body.companyId,
      canal: c.body.canal,
      ownerId: c.ownerId,
      contatoId: contato.id || null,
      dia: c.dia,
      texto,
    });
  } catch (e) {
    console.error("[mensagem] falha ao contar a tentativa:", e);
    return Response.json({ error: "Falha ao registrar a tentativa." }, { status: 500 });
  }

  // A nota é o registro da conversa no CRM. Se ela falhar, a tentativa já
  // contou e isso precisa aparecer, não virar silêncio.
  let aviso = "";
  try {
    await criarNotaNaEmpresa(c.body.companyId, {
      corpo:
        `<p><b>Diário de bordo · ${rotuloCanal(c.body.canal)} · tentativa ${tentativa}</b></p>` +
        `<p>Para: ${contato.nome || "contato não identificado"}</p>` +
        `<p>${texto.replace(/\n/g, "<br>")}</p>`,
      ownerId: c.ownerId,
    });
  } catch (e) {
    console.error("[mensagem] falha ao gravar a nota no HubSpot:", e);
    aviso = "A tentativa foi contada, mas o registro não chegou ao HubSpot. Veja o log.";
  }

  return Response.json({
    ok: true,
    tentativa,
    aviso,
    url: numero ? `https://wa.me/${numero}?text=${encodeURIComponent(texto)}` : "",
  });
}
