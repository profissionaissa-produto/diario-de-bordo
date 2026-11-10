import { auth } from "../../../../auth";
import {
  getOwnerByEmail,
  getDealById,
  contatosDosNegocios,
  criarNotaNoNegocio,
} from "../../../../lib/hubspot";
import {
  listarEstrategias,
  listarOcultas,
  tentativasPorNegocio,
  registraTentativa,
  lerTexto,
  chaveContexto,
  dbReady,
} from "../../../../lib/db";
import { montaEstrategias, semOcultas, indexaPorId } from "../../../../lib/estrategias";
import { montaPromptCloser } from "../../../../lib/prompt-closer";
import { geraMensagem } from "../../../../lib/ia";
import { enviar, envioConfigurado, bccDeLog, separaAssunto, paraHtml } from "../../../../lib/gmail";
import { paraWhatsApp } from "../../../../lib/telefone";
import { CANAL_VALIDO, canaisLiberados, rotuloCanal, tentativasNo, LIMITE_POR_CANAL } from "../../../../lib/canal";
import { SEG_CLOSER, dealUrl } from "../../../../lib/config";
import { dayKey } from "../../../../lib/week";
import { podeGerirCloser } from "../../../../lib/permissoes";

const quem = (session) => session.user.name || session.user.email;
const primeiroNome = (s) => String(s || "").trim().split(/\s+/)[0] || "";

// Tudo que a geração e o envio precisam, conferido uma vez só.
async function contexto(req, body) {
  const session = await auth();
  if (!session?.user?.email) return { erro: "Não autenticado.", status: 401 };
  if (!dbReady()) return { erro: "Banco não configurado.", status: 503 };
  if (!body.dealId) return { erro: "Informe o negócio.", status: 400 };
  if (!CANAL_VALIDO(body.canal)) return { erro: "Canal inválido.", status: 400 };

  // De quem é o negócio. O líder gera pelo closer dele, como já faz no resto
  // do painel; closer comum só pelos próprios.
  let ownerId = null;
  try {
    const owner = await getOwnerByEmail(session.user.email.toLowerCase());
    ownerId = owner ? String(owner.ownerId) : null;
  } catch (e) {
    console.error("[closer] HubSpot falhou ao identificar:", e);
    return { erro: "Não foi possível falar com o HubSpot agora.", status: 503 };
  }

  const [negocio, porNegocio, contagem] = await Promise.all([
    getDealById(body.dealId).catch((e) => {
      console.error("[closer] falha ao ler o negócio:", e?.message);
      return null;
    }),
    contatosDosNegocios([body.dealId]).catch((e) => {
      console.error("[closer] falha ao ler os contatos do negócio:", e?.message);
      return {};
    }),
    tentativasPorNegocio([body.dealId]),
  ]);

  if (!negocio) return { erro: "Negócio não encontrado no HubSpot.", status: 404 };

  // O dono do negócio decide quem pode falar por ele. Sem isto qualquer closer
  // mandaria mensagem no negócio de outro.
  const dono = String(negocio.ownerId || "");
  if (dono !== ownerId && !podeGerirCloser(session.user, dono)) {
    return { erro: "Este negócio não é seu.", status: 403 };
  }

  const contatos = porNegocio[String(body.dealId)] || [];
  const contato = contatos.find((c) => String(c.id) === String(body.contatoId)) || contatos[0] || null;
  if (!contato) return { erro: "Este negócio não tem contato vinculado no HubSpot.", status: 400 };

  const tentativas = contagem[String(body.dealId)] || {};
  if (!canaisLiberados(tentativas).includes(body.canal)) {
    return {
      erro: `O ${rotuloCanal(body.canal)} já teve ${LIMITE_POR_CANAL} tentativas sem resposta neste negócio.`,
      status: 409,
    };
  }

  return { session, body, ownerId, negocio, contato, contatos, tentativas };
}

// Quem dá para falar neste negócio, e quantas tentativas cada canal já teve.
export async function GET(req) {
  const session = await auth();
  if (!session?.user?.email) return Response.json({ error: "Não autenticado." }, { status: 401 });

  const dealId = new URL(req.url).searchParams.get("dealId");
  if (!dealId) return Response.json({ error: "Informe o negócio." }, { status: 400 });

  try {
    const [porNegocio, contagem] = await Promise.all([
      contatosDosNegocios([dealId]),
      tentativasPorNegocio([dealId]),
    ]);
    return Response.json({
      ok: true,
      contatos: porNegocio[String(dealId)] || [],
      tentativas: contagem[String(dealId)] || {},
      remetente: { nome: quem(session), email: session.user.email },
    });
  } catch (e) {
    console.error("[closer] falha ao ler os contatos:", e);
    return Response.json({ error: "Falha ao ler os contatos do negócio." }, { status: 502 });
  }
}

// Monta o prompt a partir do negócio. Os critérios que vêm da tela, estratégia
// e evolução pretendida, chegam no corpo: eles são estado do briefing do dia e
// ainda não foram gravados quando a pessoa pede a mensagem.
async function dadosDoPrompt(c) {
  const seg = SEG_CLOSER[String(c.negocio.ownerId)] || "B2B";
  const [listadas, ocultas, contextoBase] = await Promise.all([
    listarEstrategias(),
    listarOcultas(),
    lerTexto(chaveContexto(seg)),
  ]);
  const porSeg = montaEstrategias(listadas);
  const visiveis = semOcultas(porSeg, ocultas)[seg] || [];
  const id = String(c.body.estrategia || "");
  const estrategia = visiveis.some((e) => e.id === id) ? indexaPorId(porSeg)[id] : null;

  return {
    contextoBase,
    negocio: c.negocio.name,
    etapa: c.negocio.stageLabel,
    contato: c.contato,
    canal: c.body.canal,
    tentativa: tentativasNo(c.tentativas, c.body.canal) + 1,
    estrategia,
    // A atual vem do CRM; a pretendida é a decisão do closer na tela de hoje.
    temperaturaAtual: c.negocio.temperatura,
    temperaturaPretendida: String(c.body.para || ""),
    proximaAtividade: c.negocio.nextActivity,
    proximoPasso: c.negocio.nextStep,
    observacao: String(c.body.observacao || c.negocio.observacoes || "").trim(),
    resumoReuniao: c.negocio.resumoReuniao,
    transcricao: c.negocio.transcricao,
    valor: c.negocio.amount,
    eventoEm: c.negocio.eventoEm,
    remetente: primeiroNome(quem(c.session)),
  };
}

// Gera o texto. Não conta tentativa nem grava nada.
export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const c = await contexto(req, body);
  if (c.erro) return Response.json({ error: c.erro }, { status: c.status });

  try {
    const texto = await geraMensagem({ prompt: montaPromptCloser(await dadosDoPrompt(c)) });
    return Response.json({
      ok: true,
      texto,
      tentativa: tentativasNo(c.tentativas, c.body.canal) + 1,
      para: { id: c.contato.id, nome: c.contato.nome },
    });
  } catch (e) {
    console.error("[closer] falha ao gerar:", e);
    return Response.json({ error: e.message || "Falha ao gerar a mensagem." }, { status: 502 });
  }
}

// O envio: conta a tentativa, deixa o registro no CRM e devolve para onde a
// tela manda a pessoa.
export async function PUT(req) {
  const body = await req.json().catch(() => ({}));
  const c = await contexto(req, body);
  if (c.erro) return Response.json({ error: c.erro }, { status: c.status });

  const texto = String(c.body.texto || "").trim();
  if (!texto) return Response.json({ error: "Sem texto para registrar." }, { status: 400 });

  const numero = paraWhatsApp(c.contato.telefone);
  // Recusa antes de contar: tentativa queimada sem mensagem enviada é pior do
  // que erro na tela.
  if (c.body.canal === "whatsapp" && !numero) {
    return Response.json(
      { error: `${c.contato.nome} não tem um telefone que dê para abrir no WhatsApp.` },
      { status: 400 }
    );
  }
  if (c.body.canal === "ligacao" && !c.contato.telefone) {
    return Response.json({ error: `${c.contato.nome} não tem telefone no HubSpot.` }, { status: 400 });
  }
  if (c.body.canal === "email") {
    if (!c.contato.email) {
      return Response.json({ error: `${c.contato.nome} não tem e-mail no HubSpot.` }, { status: 400 });
    }
    if (!envioConfigurado()) {
      return Response.json(
        { error: "O envio de e-mail não está configurado. Faltam GOOGLE_SA_EMAIL e GOOGLE_SA_KEY no ambiente." },
        { status: 503 }
      );
    }
  }

  const tentativa = tentativasNo(c.tentativas, c.body.canal) + 1;

  // O e-mail sai antes de contar: se o Gmail recusar, nada aconteceu.
  if (c.body.canal === "email") {
    const temAssunto = String(c.body.assunto || "").trim();
    const assunto = temAssunto || separaAssunto(texto).assunto;
    const corpo = temAssunto ? texto : separaAssunto(texto).corpo;
    if (!assunto) return Response.json({ error: "O e-mail está sem assunto." }, { status: 400 });

    const copias = String(c.body.cc || "")
      .split(/[,;]/)
      .map((x) => x.trim())
      .filter(Boolean);
    const invalido = copias.find((x) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x));
    if (invalido) {
      return Response.json({ error: `"${invalido}" não é um e-mail válido na cópia.` }, { status: 400 });
    }

    const bcc = bccDeLog();
    try {
      await enviar(
        { nome: quem(c.session), email: c.session.user.email },
        { assunto, para: [c.contato.email], cc: copias, bcc: bcc ? [bcc] : [], html: paraHtml(corpo) }
      );
    } catch (e) {
      console.error("[closer] falha ao enviar o e-mail:", e);
      return Response.json({ error: e.message || "Falha ao enviar o e-mail." }, { status: 502 });
    }
  }

  try {
    await registraTentativa({
      dealId: c.body.dealId,
      canal: c.body.canal,
      ownerId: c.ownerId,
      contatoId: c.contato.id,
      dia: c.body.dia || dayKey(),
      texto,
    });
  } catch (e) {
    console.error("[closer] falha ao contar a tentativa:", e);
    return Response.json({ error: "Falha ao registrar a tentativa." }, { status: 500 });
  }

  // Cada canal deixa o registro no CRM pelo caminho dele, e nenhum duplica:
  //   e-mail   -> o BCC de log já pôs na timeline
  //   ligação  -> quem registra é o discador do HubSpot
  //   WhatsApp -> não passa pelo CRM, então a nota é o único registro
  let aviso = "";
  if (c.body.canal === "whatsapp") {
    try {
      await criarNotaNoNegocio(c.body.dealId, {
        corpo:
          `<p><b>Diário de bordo · WhatsApp · tentativa ${tentativa}</b></p>` +
          `<p>Para: ${c.contato.nome}</p>` +
          `<p>${texto.replace(/\n/g, "<br>")}</p>` +
          `<p><i>enviado por ${quem(c.session)}</i></p>`,
        ownerId: c.ownerId,
      });
    } catch (e) {
      console.error("[closer] falha ao gravar a nota no HubSpot:", e);
      aviso = "A tentativa foi contada, mas o registro não chegou ao HubSpot. Veja o log.";
    }
  }

  const url =
    c.body.canal === "whatsapp"
      ? `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`
      : c.body.canal === "ligacao"
        ? dealUrl(c.body.dealId)
        : "";

  return Response.json({ ok: true, tentativa, aviso, url });
}
