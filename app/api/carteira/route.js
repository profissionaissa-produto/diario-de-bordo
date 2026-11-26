import { auth } from "../../../auth";
import { getOwnerByEmail, getCarteira, criarNotaNaEmpresa, registrarContatoNaEmpresa, canalGravaAtividade } from "../../../lib/hubspot";
import { salvarAbordagem, salvarResultadoCarteira, incluirNaLista, pedirTroca, cancelarTrocaPendente, resolveTentativas, listarEstrategias, listarOcultas, getListaDia, iniciarDiaCarteira, mensagensDoDia, dbReady } from "../../../lib/db";
import { gravarNoHubspot } from "../../../lib/carteira-hubspot";
import { ABORDAGENS, RESULTADOS, EXIGE_OBSERVACAO, MINIMO_OBSERVACAO, CONTATO_FEITO, classifica, VERSAO_REGRAS } from "../../../lib/carteira";
import { montaEstrategias, semOcultas } from "../../../lib/estrategias";
import { SEG_TRAMITACOES } from "../../../lib/config";
import { dayKey } from "../../../lib/week";
import { podeGerirCloser } from "../../../lib/permissoes";

// De quem é o dia e quem está mexendo nele. Quando o líder edita o dia de um
// farmer, o nome dele fica registrado: a alteração precisa aparecer para quem
// planejou, com o autor.
async function resolveOwner(session, bodyOwnerId) {
  let meu = null;
  try {
    const owner = await getOwnerByEmail(session.user.email.toLowerCase());
    meu = owner ? String(owner.ownerId) : null;
  } catch (e) {
    console.error("[carteira] HubSpot falhou ao identificar o farmer:", e);
    // Sem o próprio owner ainda dá para o líder agir sobre um farmer do time;
    // só não dá para o farmer agir sobre o próprio dia.
    if (!bodyOwnerId) throw new Error("Não foi possível falar com o HubSpot para identificar você.");
  }

  if (bodyOwnerId && podeGerirCloser(session.user, bodyOwnerId)) {
    const dono = String(bodyOwnerId);
    return { ownerId: dono, editor: dono === meu ? null : session.user.name || session.user.email };
  }
  return { ownerId: meu, editor: null };
}

const RESULTADO_LABEL = {
  efetivo: "falou com a empresa",
  tentativa: "tentou, sem sucesso",
  nao_abordei: "não abordou",
  trocar_segmento: "pediu troca de segmento",
};

// Grava no HubSpot o contato que o farmer acabou de registrar aqui.
//
// Nunca derruba o registro: o resultado já está salvo no Diário quando isto
// roda, e perder a nota é menos grave do que perder o dia do farmer. A falha
// vai para o log e volta como aviso na resposta.
async function registraContatoNoCrm({ companyId, dia, resultado, observacao, ownerId, quem }) {
  try {
    // Resultado que não é contato não vira atividade: ninguém falou com
    // ninguém. Vira nota, com a observação que o farmer escreveu, que é a
    // informação que antes ficava presa no Diário.
    if (!CONTATO_FEITO.includes(resultado)) {
      const corpo = [
        `<p><b>Diário de bordo · ${RESULTADO_LABEL[resultado] || resultado}</b></p>`,
        observacao ? `<p>${observacao.replace(/\n/g, "<br>")}</p>` : "",
        `<p><i>registrado por ${quem}</i></p>`,
      ]
        .filter(Boolean)
        .join("");
      await criarNotaNaEmpresa(companyId, { corpo, ownerId });
      return "";
    }

    const msgs = await mensagensDoDia(companyId, dia);

    // Cada mensagem que saiu pelo Diário vira a ATIVIDADE do canal dela:
    // WhatsApp e e-mail viram comunicação, ligação vira chamada.
    //
    // Era nota até 25/11/2026, e nota não é contato para o HubSpot: ela move
    // o notes_last_updated e não move o notes_last_contacted. A empresa saía
    // do rodízio por 30 dias como se tivesse sido contatada e, ao mesmo
    // tempo, aparecia como não contatada em todo relatório. Medido na
    // carteira da Francielle Lenz: 18 empresas trabalhadas pelo Diário que o
    // CRM dava como paradas há até 77 dias.
    const comAtividade = msgs.filter((m) => canalGravaAtividade(m.canal));
    for (const m of comAtividade) {
      const corpo = [
        `<p><b>Diário de bordo · ${RESULTADO_LABEL[resultado] || resultado}</b></p>`,
        observacao ? `<p>${observacao.replace(/\n/g, "<br>")}</p>` : "",
        `<p>${String(m.texto || "").replace(/\n/g, "<br>")}</p>`,
        `<p><i>registrado por ${quem}</i></p>`,
      ]
        .filter(Boolean)
        .join("");
      await registrarContatoNaEmpresa(companyId, { canal: m.canal, corpo, ownerId });
    }
    if (comAtividade.length) return "";

    // Sem mensagem pelo Diário não há o que registrar como atividade: o
    // contato foi por fora e a evidência é a palavra de quem marcou. Nota,
    // e dizendo isso com todas as letras.
    const corpo = [
      `<p><b>Diário de bordo · ${RESULTADO_LABEL[resultado] || resultado}</b></p>`,
      observacao ? `<p>${observacao.replace(/\n/g, "<br>")}</p>` : "",
      "<p><i>Nenhuma mensagem saiu pelo Diário neste dia. O contato foi registrado à mão.</i></p>",
      `<p><i>registrado por ${quem}</i></p>`,
    ]
      .filter(Boolean)
      .join("");
    await criarNotaNaEmpresa(companyId, { corpo, ownerId });
    return "";
  } catch (e) {
    console.error("[carteira] falha ao gravar o contato no HubSpot:", e);
    return "O resultado foi salvo, mas o registro não chegou ao HubSpot.";
  }
}

// A carteira de quem está na tela, só id e nome, para o seletor de incluir
// empresa no dia. Vem daqui e não da página porque a lista do dia carrega
// vinte empresas e a carteira tem centenas: mandar tudo em toda abertura
// pesaria o carregamento para uma caixa que quase nunca é usada.
export async function GET(req) {
  const session = await auth();
  if (!session?.user?.email) return Response.json({ error: "Não autenticado." }, { status: 401 });

  let ownerId;
  try {
    ({ ownerId } = await resolveOwner(session, new URL(req.url).searchParams.get("ownerId")));
  } catch (e) {
    return Response.json({ error: e.message }, { status: 503 });
  }
  if (!ownerId) return Response.json({ error: "Farmer não encontrado." }, { status: 403 });

  try {
    const carteira = await getCarteira(ownerId);
    return Response.json({ ok: true, empresas: carteira.map((e) => ({ id: e.id, nome: e.nome })) });
  } catch (e) {
    console.error("[carteira] falha ao ler a carteira:", e?.message);
    return Response.json({ error: "Não foi possível falar com o HubSpot agora." }, { status: 503 });
  }
}

export async function POST(req) {
  const session = await auth();
  if (!session?.user?.email) return Response.json({ error: "Não autenticado." }, { status: 401 });
  if (!dbReady()) return Response.json({ error: "Banco não configurado." }, { status: 503 });

  const body = await req.json().catch(() => ({}));
  let ownerId, editor;
  try {
    ({ ownerId, editor } = await resolveOwner(session, body.ownerId));
  } catch (e) {
    return Response.json({ error: e.message }, { status: 503 });
  }
  if (!ownerId) return Response.json({ error: "Farmer não encontrado." }, { status: 403 });

  const { companyId, abordagem, contexto, estrategia } = body;

  // Incluir na lista do dia uma empresa da carteira que o sorteio não trouxe.
  //
  // A lista é a sugestão do dia, não a cerca dele. Antes, falar com uma
  // empresa fora dela deixava o farmer sem como registrar, e o trabalho sumia.
  //
  // A empresa precisa ser da carteira de quem está registrando: isto é o que
  // impede alguém pôr no dia uma empresa que não é sua.
  if (body.acao === "incluir") {
    if (!companyId) {
      return Response.json({ error: "Informe a empresa." }, { status: 400 });
    }
    let dela;
    try {
      dela = (await getCarteira(ownerId)).find((e) => String(e.id) === String(companyId));
    } catch (e) {
      console.error("[carteira] falha ao conferir a carteira:", e?.message);
      return Response.json({ error: "Não foi possível falar com o HubSpot agora." }, { status: 503 });
    }
    if (!dela) {
      return Response.json({ error: "Essa empresa não está na carteira deste farmer." }, { status: 400 });
    }
    const dia = body.dia || dayKey();
    const r = await incluirNaLista(ownerId, dia, {
      ...dela,
      ...classifica(dela.ultimaCompra, dia),
      regras: VERSAO_REGRAS,
    });
    return Response.json({ ok: true, resultado: r, nome: dela.nome });
  }
  if (!companyId) return Response.json({ error: "Informe a empresa." }, { status: 400 });
  if (abordagem && !ABORDAGENS.includes(abordagem)) {
    return Response.json({ error: "Abordagem inválida." }, { status: 400 });
  }
  // "" é desmarcar; qualquer outro valor tem que ser uma estratégia do Farmer,
  // senão o id gravado no dia não resolve para nada depois.
  if (estrategia) {
    const porSeg = montaEstrategias(await listarEstrategias());
    const doFarmer = semOcultas(porSeg, await listarOcultas())[SEG_TRAMITACOES] || [];
    if (!doFarmer.some((e) => e.id === estrategia)) {
      return Response.json({ error: "Estratégia inválida." }, { status: 400 });
    }
  }

  try {
    const achou = await salvarAbordagem(
      ownerId,
      body.dia || dayKey(),
      companyId,
      { abordagem, contexto, estrategia },
      editor
    );
    if (!achou) {
      return Response.json({ error: "Essa empresa não está na lista de hoje." }, { status: 400 });
    }
  } catch (e) {
    console.error("[carteira] falha ao salvar a abordagem:", e);
    return Response.json({ error: "Falha ao salvar." }, { status: 500 });
  }
  return Response.json({ ok: true });
}

// Fechamento: o que aconteceu na empresa. Observação é exigida onde o CRM não
// tem a resposta — em tentativa a ligação registrada já é a evidência.
export async function PATCH(req) {
  const session = await auth();
  if (!session?.user?.email) return Response.json({ error: "Não autenticado." }, { status: 401 });
  if (!dbReady()) return Response.json({ error: "Banco não configurado." }, { status: 503 });

  const body = await req.json().catch(() => ({}));
  let ownerId, editor;
  try {
    ({ ownerId, editor } = await resolveOwner(session, body.ownerId));
  } catch (e) {
    return Response.json({ error: e.message }, { status: 503 });
  }
  if (!ownerId) return Response.json({ error: "Farmer não encontrado." }, { status: 403 });

  const { companyId, resultado } = body;
  const observacao = String(body.observacao || "").trim();
  let avisoCrm = "";
  if (!companyId) return Response.json({ error: "Informe a empresa." }, { status: 400 });
  if (!RESULTADOS.some((r) => r.key === resultado)) {
    return Response.json({ error: "Resultado inválido." }, { status: 400 });
  }
  if (EXIGE_OBSERVACAO.includes(resultado) && observacao.length < MINIMO_OBSERVACAO) {
    const faltam = MINIMO_OBSERVACAO - observacao.length;
    return Response.json(
      { error: `Este resultado precisa de observação com pelo menos ${MINIMO_OBSERVACAO} caracteres (faltam ${faltam}).` },
      { status: 400 }
    );
  }

  try {
    const r = await salvarResultadoCarteira(ownerId, body.dia || dayKey(), companyId, resultado, observacao, editor);
    if (r === "fora-da-lista") {
      return Response.json({ error: "Essa empresa não está na lista de hoje." }, { status: 400 });
    }
    if (r === "sem-estrategia") {
      return Response.json(
        { error: "Escolha a estratégia desta empresa antes de registrar o resultado." },
        { status: 400 }
      );
    }
    // TODO resultado deixa rastro no CRM, não só os de contato.
    //
    // Até 26/11/2026 só "falei" e "tentei" escreviam alguma coisa. Quem
    // marcasse "não abordei" ou "trocar de segmento" registrava no Diário e
    // tinha que ir ao HubSpot escrever de novo, à mão. Caso do Vitor Martini
    // na Cruzeiro do Sul Educacional: a observação dizia que o site só tem
    // atendimento por bot, informação que ficou presa no Diário.
    //
    // A forma muda conforme o que aconteceu. Contato vira atividade do canal,
    // porque houve conversa. "Não abordei" e "trocar de segmento" viram nota:
    // ninguém falou com ninguém, e gravar atividade ali seria mentir sobre o
    // que aconteceu e ainda mexeria no "Último contato".
    // O aviso sobe para a tela. A função nunca derruba o registro, porque o
    // resultado já está salvo no Diário, mas falha engolida aqui vira farmer
    // achando que gravou no CRM quando não gravou.
    avisoCrm = await registraContatoNoCrm({
      companyId,
      dia: body.dia || dayKey(),
      resultado,
      observacao,
      ownerId,
      quem: session.user.name || session.user.email,
    });
    // O contato aconteceu: a cascata de canais zera e os três voltam a valer.
    // O teto de 3 é de tentativas sem sucesso, não de mensagens enviadas.
    if (resultado === "efetivo") await resolveTentativas(companyId);
    // O pedido é o que segura a empresa fora do rodízio até o líder decidir.
    if (resultado === "trocar_segmento") {
      await pedirTroca(ownerId, companyId, body.nome || null, observacao);
    } else {
      // Mudou de ideia: o pedido em aberto some e a empresa volta ao rodízio.
      // Pedido já decidido pelo líder fica como está.
      await cancelarTrocaPendente(ownerId, companyId);
    }
  } catch (e) {
    console.error("[carteira] falha ao salvar o resultado:", e);
    return Response.json({ error: "Falha ao salvar." }, { status: 500 });
  }
  return Response.json({ ok: true, aviso: avisoCrm || undefined });
}

// O farmer inicia o dia. É ele quem confirma as estratégias que escolheu, sem
// esperar aval de ninguém: clicar aqui grava o plano nas empresas do HubSpot e
// marca o dia como iniciado na agenda da gestão.
//
// Exige estratégia em todas as empresas do compromisso, porque é justamente
// ela que vai para o CRM: iniciar com buraco gravaria meio dia.
export async function PUT(req) {
  const session = await auth();
  if (!session?.user?.email) return Response.json({ error: "Não autenticado." }, { status: 401 });
  if (!dbReady()) return Response.json({ error: "Banco não configurado." }, { status: 503 });

  const body = await req.json().catch(() => ({}));
  let ownerId;
  try {
    ({ ownerId } = await resolveOwner(session, body.ownerId));
  } catch (e) {
    return Response.json({ error: e.message }, { status: 503 });
  }
  if (!ownerId) return Response.json({ error: "Farmer não encontrado." }, { status: 403 });

  const dia = body.dia || dayKey();
  const itens = await getListaDia(ownerId, dia);
  if (itens.length === 0) {
    return Response.json({ error: "Não há lista para hoje." }, { status: 400 });
  }
  // Extras são voluntários e ficam fora da conta das vinte, aqui também.
  const faltam = itens.filter((e) => !e.extra && !e.abordagem).length;
  if (faltam > 0) {
    return Response.json(
      { error: `Faltam ${faltam} empresa(s) sem estratégia definida.` },
      { status: 400 }
    );
  }

  try {
    await iniciarDiaCarteira(ownerId, dia);
  } catch (e) {
    console.error("[carteira] falha ao iniciar o dia:", e);
    return Response.json({ error: "Falha ao iniciar o dia." }, { status: 500 });
  }

  // O dia fica iniciado mesmo se o HubSpot recusar: a decisão é do farmer, não
  // do CRM. O que não foi gravado volta na resposta em vez de sumir no log.
  const hubspot = await gravarNoHubspot(ownerId, dia).catch((e) => {
    console.error("[carteira] falha ao gravar o dia no HubSpot:", e);
    return { gravadas: 0, falhas: ["todas"], semPropriedade: [] };
  });
  return Response.json({ ok: true, status: "iniciado", hubspot });
}
