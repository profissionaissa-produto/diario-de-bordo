import { auth } from "../../../../auth";
import {
  getOwnerByEmail,
  getTicketCS,
  contatosDosTickets,
  criarNotaNoTicket,
} from "../../../../lib/hubspot";
import {
  listarEstrategias,
  listarOcultas,
  tentativasPorTicket,
  registraTentativa,
  resolveTentativasDoTicket,
  lerTexto,
  chaveContexto,
  dbReady,
} from "../../../../lib/db";
import { montaEstrategias, semOcultas, indexaPorId } from "../../../../lib/estrategias";
import { montaPromptFinanceiro } from "../../../../lib/prompt-financeiro";
import { geraMensagem } from "../../../../lib/ia";
import { enviar, envioConfigurado, bccDeLog, separaAssunto, paraHtml } from "../../../../lib/gmail";
import { paraWhatsApp } from "../../../../lib/telefone";
import { CANAL_VALIDO, canaisLiberados, rotuloCanal, tentativasNo, LIMITE_POR_CANAL } from "../../../../lib/canal";
import { classificaContatos, nomeDoPalestrante } from "../../../../lib/contato-ticket";
import { palestranteDoDash, dashPronto } from "../../../../lib/dash";
import {
  ehEtapaFinanceira,
  abordagensDa,
  destinoDa,
  labelDaEtapa,
  situacaoFinanceira,
  parcelas,
  DESTINOS,
} from "../../../../lib/financeiro";
import { SEG_FINANCEIRO, ticketUrl } from "../../../../lib/config";
import { clienteDo, palestranteDo } from "../../../../lib/tramitacoes";
import { dayKey } from "../../../../lib/week";
import { podeVerFinanceiro } from "../../../../lib/permissoes";

const quem = (session) => session.user.name || session.user.email;
const primeiroNome = (s) => String(s || "").trim().split(/\s+/)[0] || "";

// Quem dá para falar neste ticket.
//
// Do lado do palestrante quem manda é o Dash, não o HubSpot. O contato do
// palestrante no ticket é incerto: medido em 09/11/2026, parte dos tickets da
// etapa de NF não tem o palestrante associado, e quando tem pode ser o
// escritório, com grafia diferente da propriedade. No Dash está o cadastro que
// ele mesmo fez, com telefone, e-mail e por qual canal quer ser procurado.
//
// Os contatos do HubSpot continuam vindo atrás, marcados como tal: o Dash pode
// não achar, e aí a pessoa escolhe sabendo de onde o dado veio.
async function montaContatos(ticket) {
  const doHub = classificaContatos(
    (await contatosDosTickets([ticket.id]).catch((e) => {
      console.error("[financeiro] falha ao ler os contatos do ticket:", e?.message);
      return {};
    }))[String(ticket.id)] || [],
    ticket.palestrantePrincipal
  ).map((c) => ({ ...c, fonte: "hubspot" }));

  if (!dashPronto()) {
    return {
      contatos: doHub,
      dash: { configurado: false, motivo: "PSA_API_KEY não está no ambiente, então o Dash não foi consultado." },
    };
  }

  try {
    const { contato, motivo } = await palestranteDoDash(ticket.palestrantePrincipal);
    // O do Dash entra na frente dos do HubSpot do mesmo lado: é a fonte.
    return {
      contatos: contato ? [contato, ...doHub] : doHub,
      dash: { configurado: true, motivo },
    };
  } catch (e) {
    // Dash fora do ar não pode derrubar a tela inteira: a cobrança do cliente
    // não depende dele. O motivo aparece na tela em vez de sumir no log.
    console.error("[financeiro] falha ao consultar o Dash:", e?.message);
    return { contatos: doHub, dash: { configurado: true, motivo: e.message || "Falha ao consultar o Dash." } };
  }
}

// Tudo que a geração e o envio precisam, conferido uma vez só. Quem chama
// recebe o ticket, o contato escolhido e a situação da parcela já prontos.
async function contexto(req) {
  const session = await auth();
  if (!session?.user?.email) return { erro: "Não autenticado.", status: 401 };
  if (!dbReady()) return { erro: "Banco não configurado.", status: 503 };

  const body = await req.json().catch(() => ({}));
  if (!body.ticketId) return { erro: "Informe o ticket.", status: 400 };
  if (!CANAL_VALIDO(body.canal)) return { erro: "Canal inválido.", status: 400 };

  let ownerId = null;
  try {
    const owner = await getOwnerByEmail(session.user.email.toLowerCase());
    ownerId = owner ? String(owner.ownerId) : null;
  } catch (e) {
    console.error("[financeiro] HubSpot falhou ao identificar:", e);
    return { erro: "Não foi possível falar com o HubSpot agora.", status: 503 };
  }
  if (!podeVerFinanceiro(session.user, ownerId)) {
    return { erro: "Só o time financeiro gera mensagem aqui.", status: 403 };
  }

  // Vão juntas: nada aqui depende do resultado do outro.
  const [ticket, contagem] = await Promise.all([
    getTicketCS(body.ticketId).catch((e) => {
      console.error("[financeiro] falha ao ler o ticket:", e?.message);
      return null;
    }),
    tentativasPorTicket([body.ticketId]),
  ]);

  if (!ticket) return { erro: "Ticket não encontrado no HubSpot.", status: 404 };
  if (!ehEtapaFinanceira(ticket.etapa)) {
    return { erro: "Este ticket não está numa etapa do financeiro.", status: 400 };
  }

  // A abordagem decide para quem vai. Sem ela não há mensagem: o texto sairia
  // genérico e sem destinatário definido.
  const abordagem = String(body.abordagem || "").trim();
  if (!abordagensDa(ticket.etapa).includes(abordagem)) {
    return { erro: "Escolha o que vai fazer antes de gerar a mensagem.", status: 400 };
  }
  const previsto = destinoDa(abordagem);
  if (previsto === "nenhum") {
    return { erro: `"${abordagem}" é trabalho interno e não tem mensagem para enviar.`, status: 400 };
  }
  // Quando depende, quem escolhe é a tela. Nos outros casos o destino é o do
  // mapa, e um destino vindo do corpo que discorde dele é recusado em vez de
  // aceito calado: seria o caminho para a cobrança sair para o lado errado.
  const destino = previsto === "ambos" ? String(body.destino || "") : previsto;
  if (!DESTINOS[destino]) {
    return { erro: "Escolha se a mensagem é para o cliente ou para o palestrante.", status: 400 };
  }

  // A lista é montada do lado do servidor também aqui, e não recebida da tela:
  // confiar no corpo para saber o endereço do destinatário seria deixar o
  // cliente dizer para onde a cobrança vai.
  const { contatos } = await montaContatos(ticket);
  const contato = contatos.find((c) => String(c.id) === String(body.contatoId)) || null;
  if (!contato) return { erro: "Escolha para quem a mensagem vai.", status: 400 };
  if (contato.tipo !== destino) {
    return { erro: `${contato.nome} não é o lado ${DESTINOS[destino].toLowerCase()} desta conversa.`, status: 400 };
  }

  const tentativas = contagem[String(body.ticketId)] || {};
  if (!canaisLiberados(tentativas).includes(body.canal)) {
    return {
      erro: `O ${rotuloCanal(body.canal)} já teve ${LIMITE_POR_CANAL} tentativas sem resposta neste ticket.`,
      status: 409,
    };
  }

  return { session, body, ownerId, ticket, contato, contatos, destino, abordagem, tentativas };
}

// Monta o prompt a partir do ticket. Fica aqui e não no prompt porque é
// tradução de dado do CRM, não regra de texto.
async function dadosDoPrompt(c) {
  const hoje = c.body.dia || dayKey();
  const s = situacaoFinanceira(c.ticket, hoje);
  const ps = parcelas(c.ticket);

  const [listadas, ocultas, contextoBase] = await Promise.all([
    listarEstrategias(),
    listarOcultas(),
    lerTexto(chaveContexto(SEG_FINANCEIRO)),
  ]);
  const porSeg = montaEstrategias(listadas);
  const visiveis = semOcultas(porSeg, ocultas)[SEG_FINANCEIRO] || [];
  const id = String(c.body.estrategia || "");
  // Estratégia que a curadoria removeu não entra no prompt, mas também não
  // derruba a geração: o texto sai sem ela e a tela segue.
  const estrategia = visiveis.some((e) => e.id === id) ? indexaPorId(porSeg)[id] : null;

  return {
    contextoBase,
    cliente: clienteDo(c.ticket.assunto) || c.ticket.assunto,
    // Normalizado, senão o texto sai com o nome hifenizado que a propriedade
    // guarda: "Arthur Igreja (Arthur-Igreja)" virava "palestrante Arthur-Igreja"
    // na mensagem que ia para o cliente.
    palestrante: nomeDoPalestrante(c.ticket.palestrantePrincipal) || palestranteDo(c.ticket.assunto),
    evento: c.ticket.evento,
    etapa: labelDaEtapa(c.ticket.etapa),
    destino: c.destino,
    contato: c.contato,
    // Quando o palestrante pediu que o contato passe pela assessoria, quem lê
    // a mensagem não é ele. Sem isto o texto sairia falando com a assessoria
    // como se ela fosse o palestrante.
    porAssessoria: !!c.contato.porAssessoria,
    canal: c.body.canal,
    tentativa: tentativasNo(c.tentativas, c.body.canal) + 1,
    abordagem: c.abordagem,
    estrategia,
    situacao: s.situacao,
    dias: s.dias,
    parcela: s.parcela,
    totalParcelas: ps.length,
    data: s.data,
    valor: c.ticket.valorContrato,
    cache: c.ticket.cache,
    observacao: String(c.body.observacao || "").trim(),
    remetente: primeiroNome(quem(c.session)),
  };
}

// Quem dá para falar neste ticket, e quantas tentativas cada canal já teve.
// É carregado quando a janela abre, e não junto com o board: contato de 128
// tickets são centenas de leituras no HubSpot para desenhar uma tela que a
// pessoa vai usar num ticket de cada vez.
export async function GET(req) {
  const session = await auth();
  if (!session?.user?.email) return Response.json({ error: "Não autenticado." }, { status: 401 });

  const ticketId = new URL(req.url).searchParams.get("ticketId");
  if (!ticketId) return Response.json({ error: "Informe o ticket." }, { status: 400 });

  let ownerId = null;
  try {
    const owner = await getOwnerByEmail(session.user.email.toLowerCase());
    ownerId = owner ? String(owner.ownerId) : null;
  } catch (e) {
    console.error("[financeiro] HubSpot falhou ao identificar:", e);
    return Response.json({ error: "Não foi possível falar com o HubSpot agora." }, { status: 503 });
  }
  if (!podeVerFinanceiro(session.user, ownerId)) {
    return Response.json({ error: "Sem acesso ao financeiro." }, { status: 403 });
  }

  try {
    const [ticket, contagem] = await Promise.all([getTicketCS(ticketId), tentativasPorTicket([ticketId])]);
    if (!ticket) return Response.json({ error: "Ticket não encontrado." }, { status: 404 });
    // Depois do ticket, não junto: a consulta ao Dash é pelo nome que está na
    // propriedade do ticket, então ela só existe depois de ler o ticket.
    const { contatos, dash } = await montaContatos(ticket);
    return Response.json({
      ok: true,
      contatos,
      dash,
      tentativas: contagem[String(ticketId)] || {},
      palestrante: nomeDoPalestrante(ticket.palestrantePrincipal),
    });
  } catch (e) {
    console.error("[financeiro] falha ao ler os contatos:", e);
    return Response.json({ error: "Falha ao ler os contatos do ticket." }, { status: 502 });
  }
}

// Gera o texto. Não conta tentativa nem grava nada: contar aqui queimaria uma
// chance toda vez que alguém pedisse outra versão.
export async function POST(req) {
  const c = await contexto(req);
  if (c.erro) return Response.json({ error: c.erro }, { status: c.status });

  try {
    // O prompt vai pronto: a cobrança não usa o de prospecção, que fala de
    // última compra e de fase na carteira.
    const texto = await geraMensagem({ prompt: montaPromptFinanceiro(await dadosDoPrompt(c)) });
    return Response.json({
      ok: true,
      texto,
      tentativa: tentativasNo(c.tentativas, c.body.canal) + 1,
      destino: c.destino,
      para: { id: c.contato.id, nome: c.contato.nome, tipo: c.contato.tipo },
    });
  } catch (e) {
    console.error("[financeiro] falha ao gerar:", e);
    return Response.json({ error: e.message || "Falha ao gerar a mensagem." }, { status: 502 });
  }
}

// O envio: conta a tentativa, deixa o registro no CRM e devolve para onde a
// tela manda a pessoa. É aqui que a cascata de canais anda.
export async function PUT(req) {
  const c = await contexto(req);
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

  // O e-mail sai antes de contar: se o Gmail recusar, nada aconteceu e a
  // chance continua de pé.
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
        {
          assunto,
          para: [c.contato.email],
          cc: copias,
          bcc: bcc ? [bcc] : [],
          html: paraHtml(corpo),
        }
      );
    } catch (e) {
      console.error("[financeiro] falha ao enviar o e-mail:", e);
      return Response.json({ error: e.message || "Falha ao enviar o e-mail." }, { status: 502 });
    }
  }

  try {
    await registraTentativa({
      ticketId: c.body.ticketId,
      canal: c.body.canal,
      ownerId: c.ownerId,
      contatoId: c.contato.id,
      dia: c.body.dia || dayKey(),
      texto,
    });
  } catch (e) {
    console.error("[financeiro] falha ao contar a tentativa:", e);
    return Response.json({ error: "Falha ao registrar a tentativa." }, { status: 500 });
  }

  // Cada canal deixa o registro no CRM pelo caminho dele, e nenhum duplica:
  //   e-mail   -> o BCC de log já pôs na timeline
  //   ligação  -> quem registra é o discador do HubSpot, onde a chamada é feita
  //   WhatsApp -> não passa pelo CRM, então a nota é o único registro
  let aviso = "";
  if (c.body.canal === "whatsapp") {
    try {
      await criarNotaNoTicket(c.body.ticketId, {
        corpo:
          `<p><b>Financeiro · WhatsApp · tentativa ${tentativa}</b></p>` +
          `<p>Para: ${c.contato.nome} (${DESTINOS[c.destino]})</p>` +
          `<p><b>Ação:</b> ${c.abordagem}</p>` +
          `<p>${texto.replace(/\n/g, "<br>")}</p>` +
          `<p><i>enviado por ${quem(c.session)}</i></p>`,
        ownerId: c.ownerId,
      });
    } catch (e) {
      console.error("[financeiro] falha ao gravar a nota no HubSpot:", e);
      aviso = "A tentativa foi contada, mas o registro não chegou ao HubSpot. Veja o log.";
    }
  }

  const url =
    c.body.canal === "whatsapp"
      ? `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`
      : c.body.canal === "ligacao"
        ? ticketUrl(c.body.ticketId)
        : "";

  return Response.json({ ok: true, tentativa, aviso, url });
}

// Zera a cascata deste ticket: o cliente respondeu, ou a cobrança foi
// resolvida. Não apaga o log, marca como resolvido.
export async function DELETE(req) {
  const session = await auth();
  if (!session?.user?.email) return Response.json({ error: "Não autenticado." }, { status: 401 });
  if (!dbReady()) return Response.json({ error: "Banco não configurado." }, { status: 503 });

  const { ticketId } = await req.json().catch(() => ({}));
  if (!ticketId) return Response.json({ error: "Informe o ticket." }, { status: 400 });

  let ownerId = null;
  try {
    const owner = await getOwnerByEmail(session.user.email.toLowerCase());
    ownerId = owner ? String(owner.ownerId) : null;
  } catch (e) {
    console.error("[financeiro] HubSpot falhou ao identificar:", e);
    return Response.json({ error: "Não foi possível falar com o HubSpot agora." }, { status: 503 });
  }
  if (!podeVerFinanceiro(session.user, ownerId)) {
    return Response.json({ error: "Só o time financeiro zera aqui." }, { status: 403 });
  }

  try {
    const n = await resolveTentativasDoTicket(ticketId);
    return Response.json({ ok: true, zeradas: n });
  } catch (e) {
    console.error("[financeiro] falha ao zerar as tentativas:", e);
    return Response.json({ error: "Falha ao zerar." }, { status: 500 });
  }
}
