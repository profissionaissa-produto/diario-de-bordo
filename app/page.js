import { redirect } from "next/navigation";
import { auth, signOut } from "../auth";
import {
  getOwnerByEmail,
  getOpenDeals,
  getTemperaturaOptions,
} from "../lib/hubspot";
import { fotoDe, dealUrl, CLOSERS_BY_SEG, CLOSERS, SEG_CLOSER, SEGMENTOS, PIPELINES_POR_SEG, EQUIPES_DE, closersDe, semEquipe } from "../lib/config";
import DealsTable from "./DealsTable";
import AdminBar from "./AdminBar";
import FocoDia from "./FocoDia";
import Ontem from "./Ontem";
import Fechamento from "./Fechamento";
import ListaDoDia from "./ListaDoDia";
import FecharDia from "./FecharDia";
import Link from "next/link";
import { getBriefing, getDayBriefings, getFechamento, dbReady, tarefasDoDia, aplicarRetornoDeTarefa, MIN_OBS } from "../lib/db";
import { getDealsByIds, retornoDasTarefas, contatosDasEmpresas } from "../lib/hubspot";
import { dayKey, dayLabel, diaUtilAnterior } from "../lib/week";
import { formatNextActivity } from "../lib/activity";
import { ehGestor, segmentosDe, podeGerirCloser, briefingsGeriveis, podeVerTramitacoes, equipeLiderada, podeVerEvolucao, podeConfigurar } from "../lib/permissoes";
import { listarEstrategias, listarOcultas, tentativasPorEmpresa, detalheTentativas } from "../lib/db";
import { montaEstrategias, indexaPorId, semOcultas } from "../lib/estrategias";
import { listaDoDia } from "../lib/dia-farmer";
import { resumoDoMes } from "../lib/metricas-farmer";
import { atividadeDoDia } from "../lib/atividade";
import { listaDoDiaCloser } from "../lib/dia-closer";
import { empresasComSelo } from "../lib/relacionamento";
import { montaHistorico, precisaAuxilio, placarDoDia } from "../lib/carteira";
import { getHistoricoCarteira, aplicarAtividade, getListaDia } from "../lib/db";
import { SEG_TRAMITACOES, empresaUrl } from "../lib/config";

export const dynamic = "force-dynamic";

// Segmento a que o closer pertence (B2B/B2C), pelo cadastro dos times.
function segOf(ownerId) {
  return SEG_CLOSER[String(ownerId)];
}

// Funil de cada segmento vem do cadastro: Farmer compartilha o funil do B2B.
function pipelinesForSeg(seg) {
  return PIPELINES_POR_SEG[seg] || PIPELINES_POR_SEG.B2B;
}

function initials(name) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

function brl(n) {
  if (n == null) return "—";
  return "R$ " + n.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

// Aviso claro quando a API do HubSpot recusa (cota diária é o caso mais comum).
function ErroHubspot({ erro }) {
  // Dois 429 bem diferentes: o diário só volta amanhã, o por segundo passa
  // na hora. Chamar os dois de "limite diário" mandava todo mundo embora.
  const msg = String(erro?.message || "");
  const diario = /DAILY/i.test(msg);
  const rajada = !diario && /429|SECONDLY|RATE_LIMIT/i.test(msg);
  return (
    <div className="empty">
      <h2>
        {diario
          ? "Limite diário do HubSpot atingido"
          : rajada
          ? "HubSpot recusou por excesso de chamadas"
          : "HubSpot indisponível"}
      </h2>
      <p>
        {diario
          ? "A conta atingiu o limite de chamadas à API do HubSpot por hoje. Os dados voltam assim que a cota renovar (no início do próximo dia)."
          : rajada
          ? "Foram muitas chamadas em pouco tempo. Atualize a página — esse limite libera em segundos."
          : "Não foi possível falar com o HubSpot agora. Tente novamente em alguns minutos."}
      </p>
    </div>
  );
}

export default async function Page({ searchParams }) {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");
  const email = session.user.email.toLowerCase();
  const userName = session.user.name || email;
  const isAdmin = !!session.user.isAdmin;
  // Líder também gere briefings, porém só do time dele — e tem funil próprio.
  const gestor = ehGestor(session.user);
  // Segmento em que a pessoa cadastra estratégia; null para quase todo mundo.
  const configura = podeConfigurar(session.user);
  const meusSegs = segmentosDe(session.user);
  // Sempre um segmento ativo: B2B é o padrão ao abrir o painel.
  const segPedido = SEGMENTOS.includes(searchParams?.seg) ? searchParams.seg : "B2B";
  let seg = !gestor || meusSegs.includes(segPedido) ? segPedido : meusSegs[0] || "B2B";

  // Líder de equipe não escolhe: o recorte dele é sempre a própria equipe.
  const eqLider = equipeLiderada(session.user);
  const equipeTravada = eqLider && eqLider.seg === seg ? eqLider.equipe : "";
  const equipeAtiva = equipeTravada || searchParams?.equipe || "";

  let viewOwner = null;
  let owners = [];
  let deals = [];
  // Quem está logado (para a foto do topo) — o closer visualizado pode ser outro.
  let meuOwnerId = null;

  // Falha do HubSpot (cota diária, indisponibilidade) vira aviso, não tela de erro.
  let erroHubspot = null;
  let tempOptions = [];
  try {
    tempOptions = await getTemperaturaOptions();
  } catch (e) {
    erroHubspot = e;
  }

  if (gestor) {
    // Lista fixa dos closers do segmento (evita varrer os owners do HubSpot).
    // Quem lidera uma equipe fica preso a ela; os demais escolhem no filtro.
    owners = closersDe(seg, equipeAtiva).map((c) => ({ ownerId: c.id, name: c.nome }));
    // Líder é closer também: sem seleção, abre no próprio funil.
    const proprio = !isAdmin ? await getOwnerByEmail(email).catch(() => null) : null;
    meuOwnerId = proprio?.ownerId || null;
    const selId = searchParams?.closer || (proprio ? String(proprio.ownerId) : "");
    if (selId && owners.some((o) => String(o.ownerId) === String(selId)) && podeGerirCloser(session.user, selId)) {
      const sel = owners.find((o) => String(o.ownerId) === String(selId));
      viewOwner = { ownerId: sel.ownerId, name: sel.name };
      try {
        deals = await getOpenDeals(viewOwner.ownerId, pipelinesForSeg(seg));
      } catch (e) {
        erroHubspot = e;
      }
    }
  } else {
    try {
      viewOwner = await getOwnerByEmail(email);
    } catch (e) {
      erroHubspot = e;
    }
    if (!viewOwner && erroHubspot) {
      return <ErroHubspot erro={erroHubspot} />;
    }
    if (!viewOwner) {
      return (
        <div className="empty">
          <h2>Sem cadastro no HubSpot</h2>
          <p>O e-mail <b>{email}</b> não está vinculado a nenhum closer no HubSpot. Fale com o RevOps.</p>
        </div>
      );
    }
    meuOwnerId = viewOwner.ownerId;
    // O segmento do closer vem do time dele, não da URL.
    seg = segOf(viewOwner.ownerId) || seg;
    try {
      deals = await getOpenDeals(viewOwner.ownerId, pipelinesForSeg(seg));
    } catch (e) {
      erroHubspot = e;
    }
  }

  const isFechar = searchParams?.view === "fechar";
  const isFoco = searchParams?.view === "foco";

  // Farmer trabalha empresas da própria carteira, não negócios do funil.
  const ehFarmer = seg === SEG_TRAMITACOES;
  let carteiraDoDia = null;
  let resumoMes = null;
  let contatosDoDia = {};
  let tentativasDoDia = {};
  let historicoContato = {};
  if (ehFarmer && viewOwner) {
    try {
      let [{ itens }, linhas] = await Promise.all([
        listaDoDia(String(viewOwner.ownerId), dayKey(), { registraAcesso: !gestor }),
        getHistoricoCarteira(String(viewOwner.ownerId), dayKey()),
      ]);
      const historico = montaHistorico(linhas);
      const owner = String(viewOwner.ownerId);
      // Os ids já são conhecidos aqui: a releitura adiante preenche campos, não
      // troca as empresas do dia. Esperar por ela para só então buscar contato
      // e tentativas era o que punha três idas ao HubSpot em fila.
      const ids = itens.map((e) => String(e.id));

      // Tudo que não depende de mais nada vai junto. Antes eram seis esperas
      // em série, três delas pesadas no HubSpot, sem uma precisar da outra.
      // Cada uma trata o próprio erro: o dia não cai porque o selo falhou.
      const [resumo, porOwner, selos, contatos, tentativas, detalhe] = await Promise.all([
        // Números do mês: o cabeçalho do farmer fala de carteira e resultado,
        // não de funil. Falha aqui não derruba o dia.
        resumoDoMes([owner], dayKey()).catch((err) => {
          console.error("[carteira] resumo do mês falhou:", err?.message);
          return null;
        }),
        // O que o CRM já sabe do dia: vira sugestão de resultado no fechamento.
        // Falha aqui (escopo, cota) só faz o farmer preencher à mão.
        // A efetividade é automática: o que o CRM registrou hoje vira o
        // resultado sem ninguém clicar, e é por isso que o placar do líder
        // evolui sozinho.
        atividadeDoDia([owner], dayKey()).catch((err) => {
          console.error("[carteira] atividade do dia falhou:", err?.message);
          return {};
        }),
        // Selo de relacionamento: raro de propósito, e caro de apurar — falha
        // aqui só tira o selo, não derruba o dia.
        empresasComSelo(owner, ids).catch((err) => {
          console.error("[carteira] selo de relacionamento falhou:", err?.message);
          return new Set();
        }),
        // Para quem mandar a mensagem. Falha sem derrubar o dia: some o botão,
        // não a lista.
        contatosDasEmpresas(ids).catch((err) => {
          console.error("[mensagem] falha ao ler os contatos das empresas:", err?.message);
          return {};
        }),
        // A contagem não pode falhar calada: sem ela a cascata liberaria tudo.
        tentativasPorEmpresa(ids),
        detalheTentativas(ids),
      ]);

      resumoMes = resumo;
      contatosDoDia = contatos;
      tentativasDoDia = tentativas;
      historicoContato = detalhe;
      const ativ = porOwner[owner] || {};

      // Preenche só o que está em branco — nunca sobrescreve escolha manual.
      await aplicarAtividade(owner, dayKey(), ativ).catch((err) =>
        console.error("[carteira] não consegui aplicar a atividade:", err?.message)
      );

      // Relê depois de aplicar, senão a tela mostra o estado anterior.
      itens = await getListaDia(owner, dayKey());

      carteiraDoDia = itens.map((e) => ({
        ...e,
        url: empresaUrl(e.id),
        historico: historico.get(String(e.id)) || null,
        precisaAuxilio: precisaAuxilio(historico.get(String(e.id))),
        atividade: ativ[String(e.id)] || null,
        selo: selos.has(String(e.id)),
      }));
    } catch (e) {
      console.error("[carteira] falha ao montar o dia:", e);
      erroHubspot = e;
    }
  }

  if (erroHubspot && deals.length === 0 && !carteiraDoDia) return <ErroHubspot erro={erroHubspot} />;

  const dia = dayKey();
  const briefing = viewOwner ? await getBriefing(viewOwner.ownerId, dia) : null;
  // O que o CRM já registrou hoje, negócio a negócio — o closer atua em negócio,
  // não em empresa. Vira sugestão no fechamento, nunca resultado gravado: aqui a
  // observação é obrigatória e só quem falou com o cliente sabe escrevê-la.
  // Falha (escopo, cota) só faz o closer preencher à mão, como antes.
  const atividadeCrm =
    viewOwner && isFechar && !ehFarmer
      ? (
          (await atividadeDoDia([String(viewOwner.ownerId)], dia, "deals").catch((err) => {
            console.error("[fechamento] atividade do dia falhou:", err?.message);
            return {};
          }))[String(viewOwner.ownerId)] || {}
        )
      : {};

  // O time não registra ligação: a tarefa é o registro. Concluí-la no HubSpot
  // com um texto fecha o negócio no diário, sem ninguém digitar de novo aqui.
  let tarefaPorDeal = {};
  if (viewOwner && isFechar && !ehFarmer) {
    try {
      const porDeal = await tarefasDoDia(String(viewOwner.ownerId), dia);
      const retorno = await retornoDasTarefas(Object.values(porDeal));
      const aGravar = {};
      for (const [dealId, taskId] of Object.entries(porDeal)) {
        const t = retorno[String(taskId)];
        if (!t) continue;
        tarefaPorDeal[dealId] = t;
        // Só o que veio concluído vira registro, e só com texto suficiente para
        // valer como observação. O resto fica como sugestão na tela.
        if (t.concluida && t.texto.length >= MIN_OBS) {
          aGravar[dealId] = { resultado: "efetivo", observacao: t.texto };
        }
      }
      // Nunca sobrescreve o que o closer já registrou — ON CONFLICT DO NOTHING.
      await aplicarRetornoDeTarefa(String(viewOwner.ownerId), dia, aGravar);
    } catch (e) {
      console.error("[fechamento] não consegui ler o retorno das tarefas:", e?.message);
    }
  }

  // Lido depois de aplicar o retorno das tarefas: senão a tela mostraria o
  // fechamento de antes e o que veio do HubSpot só apareceria no recarregar.
  const fechamento = viewOwner && isFechar ? await getFechamento(viewOwner.ownerId, dia) : {};

  // Briefing do último dia útil, para o closer retomar de onde parou.
  const diaAnterior = diaUtilAnterior(dia);
  const anterior = viewOwner ? await getBriefing(viewOwner.ownerId, diaAnterior) : null;

  // Preserva closer/segmento ao alternar a visão.
  const qs = (view) => {
    const q = new URLSearchParams();
    if (searchParams?.closer) q.set("closer", searchParams.closer);
    if (equipeAtiva) q.set("equipe", equipeAtiva);
    q.set("seg", seg);
    if (view) q.set("view", view);
    return "/?" + q.toString();
  };
  // Pendentes que este gestor pode decidir.
  const pendentes = gestor
    ? briefingsGeriveis(session.user, await getDayBriefings(dia)).filter(
        (b) => b.status === "enviado"
      ).length
    : 0;

  // Tramitações só para o time de CS e quem o gere.
  const verTramitacoes = podeVerTramitacoes(session.user, viewOwner ? String(meuOwnerId || viewOwner.ownerId) : null);

  // Derivado da lista do dia: não custa chamada nenhuma a mais.
  const kpiFarmer = {
    compromisso: (carteiraDoDia || []).filter((e) => !e.extra).length,
    mapeadas: (carteiraDoDia || []).filter((e) => e.abordagem).length,
    placar: placarDoDia(carteiraDoDia || []),
  };

  const rows = deals.map((d) => ({
    ...d,
    next: formatNextActivity(d.nextActivity),
    amountText: brl(d.amount),
    adv: /avanç/i.test(d.stageLabel),
    url: dealUrl(d.id),
  }));

  // A lista do dia do closer no B2B: dos negócios abertos, os 10 que os
  // critérios escalaram. Fora do B2B a tela segue mostrando o funil inteiro,
  // porque os critérios são do B2B.
  let doDia = rows;
  let avisoFunil = "";
  // Com a lista montada pelos critérios, ela É o briefing: o closer não escolhe
  // mais o que atuar, só preenche. Sem ela, a tela volta ao modo de seleção.
  let listaPorCriterios = false;
  if (seg === "B2B" && viewOwner && rows.length > 0) {
    try {
      const { itens } = await listaDoDiaCloser(String(viewOwner.ownerId), rows, dia);
      doDia = itens;
      listaPorCriterios = true;
    } catch (e) {
      // Cair para o funil inteiro é melhor que tela vazia, mas o closer precisa
      // saber que está vendo outra coisa — senão some sem ninguém perceber.
      console.error("[funil] não consegui montar a lista do dia:", e?.message);
      avisoFunil = "Não consegui montar a lista do dia — mostrando o funil inteiro. " + e.message;
    }
  }

  // Negócios do dia anterior: aproveita o que já veio no funil de hoje e só
  // consulta o HubSpot pelos que saíram dele (ganho, perdido ou reatribuído).
  let ontem = null;
  if (anterior && Object.keys(anterior.items).length > 0) {
    const porId = Object.fromEntries(rows.map((r) => [String(r.id), r]));
    const ausentes = Object.keys(anterior.items).filter((id) => !porId[id]);
    const extras = ausentes.length ? await getDealsByIds(ausentes).catch(() => ({})) : {};
    ontem = {
      diaLabel: dayLabel(diaAnterior),
      status: anterior.status,
      motivo: anterior.motivo,
      itens: Object.entries(anterior.items).map(([id, v]) => ({
        id,
        url: dealUrl(id),
        nome: porId[id]?.name || extras[id]?.name || `Negócio ${id}`,
        valor: porId[id]?.amount ?? extras[id]?.amount ?? null,
        foraDoFunil: !porId[id],
        ...v,
      })),
    };
  }

  const hoje = rows.filter((d) => d.next.pill?.cls === "today").length;
  const atrasadas = rows.filter((d) => d.next.pill?.cls === "late").length;
  const valor = rows.reduce((s, d) => s + (d.amount || 0), 0);
  // Foto de quem está logado, nunca a do closer que ele está visualizando.
  const avatar = meuOwnerId ? fotoDe(meuOwnerId) : null;

  // As dez originais vêm do código; o que a curadoria cadastrou vem do banco.
  // idx sai da lista inteira: uma estratégia removida ainda precisa ter nome no
  // briefing antigo que a gravou. porSeg é só o que ainda dá para escolher.
  const porSeg = montaEstrategias(await listarEstrategias());
  const estrat = { porSeg: semOcultas(porSeg, await listarOcultas()), idx: indexaPorId(porSeg) };

  return (
    <div className="wrap">
      <div className="top">
        <div className="brand">
          <img className="logo" src="/logo-psa.png" alt="PSA" />
          <div className="divider" />
          <div>
            <div className="title">Diário de Bordo</div>
            {/* O objeto de trabalho muda com o segmento: o farmer não tem
                funil, tem carteira. */}
            <div className="subtitle">
              {ehFarmer
                ? "Carteira de empresas · sincronizado com o HubSpot"
                : "Negócios ativos no funil · sincronizado com o HubSpot"}
            </div>
          </div>
        </div>
        <div className="who">
          <div className="pfp">{avatar ? <img src={avatar} alt={userName} /> : initials(userName)}</div>
          <div className="who-name">{userName}</div>
          {gestor && <span className="admin-tag">{isAdmin ? "Admin" : "Líder " + seg}</span>}
          <form action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}>
            <button className="signout" type="submit">Sair</button>
          </form>
        </div>
      </div>

      {gestor ? (
        <>
          {/* O menu segue o fluxo do segmento: no CS o dia é carteira,
              tramitação e evolução; no comercial é briefing e aprovação.
              Mostrar as duas coisas juntas obriga a pessoa a descobrir
              sozinha o que se aplica a ela. */}
          <div className="viewbar">
            <div className="viewtoggle">
              <Link href="/" className="on">Diário de bordo</Link>
              {ehFarmer ? (
                <>
                  <Link href="/agenda">Agenda do dia</Link>
                  {podeVerEvolucao(session.user) && <Link href="/evolucao">Evolução</Link>}
                  {/* Sem contador aqui: o número exigiria buscar os tickets do
                      funil só para desenhar o menu. */}
                  {verTramitacoes && <Link href="/tramitacoes">Tramitações</Link>}
                  {configura && <Link href="/configuracoes">Configurações</Link>}
                  <Link href="/ajuda">Como funciona</Link>
                </>
              ) : (
                <>
                  <Link href="/aprovacoes">
                    Aprovações
                    {pendentes > 0 && <span className="aba-cont">{pendentes}</span>}
                  </Link>
                  <Link href="/agenda">Agenda geral</Link>
                  {configura && <Link href="/configuracoes">Configurações</Link>}
                </>
              )}
            </div>
          </div>
          <AdminBar
            owners={owners}
            selected={viewOwner ? String(viewOwner.ownerId) : ""}
            seg={seg}
            segs={meusSegs}
            rotuloPessoa={ehFarmer ? "farmer" : "closer"}
            equipes={equipeTravada ? [] : EQUIPES_DE(seg)}
            equipe={equipeAtiva}
            semEquipe={equipeTravada ? 0 : semEquipe(seg)}
          />
        </>
      ) : (
        <div className="viewbar">
          <div className="viewtoggle">
            <Link href="/" className="on">Diário de bordo</Link>
            {verTramitacoes && <Link href="/tramitacoes">Tramitações</Link>}
            {ehFarmer && <Link href="/ajuda">Como funciona</Link>}
          </div>
          <div className="ctx"><span className="ctx-dot" />Segmento: {seg}</div>
        </div>
      )}

      {ehFarmer ? (
        <>
        <div className="kpis">
          <div className="kpi"><div className="lab">Empresas do dia</div><div className="val">{kpiFarmer.compromisso}</div><div className="sub">o compromisso de hoje</div></div>
          <div className="kpi"><div className="lab">Mapeadas</div><div className="val a">{kpiFarmer.mapeadas}</div><div className="sub">com abordagem definida</div></div>
          <div className="kpi"><div className="lab">Contato efetivo hoje</div><div className="val">{kpiFarmer.placar.pct}%</div><div className="sub">sobre o compromisso do dia</div></div>
          <div className="kpi"><div className="lab">Sem registro</div><div className="val o">{kpiFarmer.placar.sem_registro}</div><div className="sub">ainda sem fechamento</div></div>
        </div>
        {resumoMes && (
          <div className="kpis">
            <div className="kpi"><div className="lab">Oportunidades no mês</div><div className="val a">{resumoMes.oportunidades}</div><div className="sub">negócios criados por você</div></div>
            <div className="kpi"><div className="lab">Receita gerada</div><div className="val">{brl(resumoMes.receita)}</div><div className="sub">negócios ganhos no mês</div></div>
            <div className="kpi"><div className="lab">Tickets ativos</div><div className="val">{resumoMes.ticketsAtivos}</div><div className="sub">eventos em execução</div></div>
            <div className="kpi"><div className="lab">Carteira tocada</div><div className="val o">{resumoMes.pctContato}%</div><div className="sub">{resumoMes.comContato} de {resumoMes.carteira} empresas no mês</div></div>
          </div>
        )}
        </>
      ) : (
      <div className="kpis">
        <div className="kpi"><div className="lab">Negócios ativos</div><div className="val">{rows.length}</div><div className="sub">{viewOwner ? `funil ${seg}` : "selecione um closer"}</div></div>
        <div className="kpi"><div className="lab">Atividades próximas</div><div className="val a">{hoje}</div><div className="sub">hoje ou nos próximos 3 dias</div></div>
        <div className="kpi"><div className="lab">Atrasadas</div><div className="val o">{atrasadas}</div><div className="sub">próxima atividade vencida</div></div>
        <div className="kpi"><div className="lab">Valor no funil</div><div className="val">{brl(valor)}</div><div className="sub">soma dos negócios abertos</div></div>
      </div>
      )}

      {viewOwner && ontem && !ehFarmer && <Ontem ontem={ontem} estrat={estrat} />}

      {viewOwner && (
        <div className="viewbar">
          <div className="viewtoggle">
            {ehFarmer ? (
              <>
                <Link href={qs("")} className={isFechar ? "" : "on"}>Plano do dia</Link>
                <Link href={qs("fechar")} className={isFechar ? "on" : ""}>Fechamento</Link>
              </>
            ) : (
              <>
                <Link href={qs("")} className={isFoco || isFechar ? "" : "on"}>Tabela</Link>
                <Link href={qs("foco")} className={isFoco ? "on" : ""}>Meu dia</Link>
                <Link href={qs("fechar")} className={isFechar ? "on" : ""}>Fechamento</Link>
              </>
            )}
          </div>
        </div>
      )}

      {carteiraDoDia && isFechar ? (
        <FecharDia
          itens={carteiraDoDia}
          ctx={{
            ownerId: viewOwner ? String(viewOwner.ownerId) : "",
            dia,
            diaLabel: dayLabel(dia),
          }}
        />
      ) : carteiraDoDia ? (
        <ListaDoDia
          itens={carteiraDoDia}
          estrategias={estrat.porSeg[SEG_TRAMITACOES] || []}
          contatos={contatosDoDia}
          tentativas={tentativasDoDia}
          historicoContato={historicoContato}
          ctx={{
            ownerId: viewOwner ? String(viewOwner.ownerId) : "",
            dia,
            diaLabel: dayLabel(dia),
            urlFechamento: qs("fechar"),
            // O e-mail sai da caixa de quem está operando a tela.
            remetente: session.user.email,
            // Zerar a cascata é decisão de quem responde pelo farmer.
            podeZerar: gestor,
          }}
        />
      ) : isFechar ? (
        <Fechamento
          rows={rows}
          briefing={briefing}
          fechamento={fechamento}
          atividade={atividadeCrm}
          tarefas={tarefaPorDeal}
          estrat={estrat}
          ctx={{
            ownerId: viewOwner ? String(viewOwner.ownerId) : "",
            dia,
            diaLabel: dayLabel(dia),
          }}
        />
      ) : isFoco ? (
        <FocoDia
          rows={rows}
          briefing={briefing}
          options={tempOptions}
          seg={seg}
          estrat={estrat}
          ctx={{ diaLabel: dayLabel(dia), closerName: viewOwner ? viewOwner.name : "" }}
        />
      ) : (
      /* key força remontagem ao trocar de closer/segmento — sem ela a tabela
         fica presa na lista anterior. */
      <DealsTable
        key={`${searchParams?.closer || "me"}-${seg}`}
        deals={doDia}
        totalFunil={rows.length}
        aviso={avisoFunil}
        listaFixa={listaPorCriterios}
        options={tempOptions}
        closerName={viewOwner ? viewOwner.name : ""}
        emptyLabel={isAdmin && !viewOwner ? "Selecione um closer acima para ver o diário." : "Nenhum negócio ativo no funil."}
        briefing={briefing}
        seg={seg}
        estrat={estrat}
        ctx={{
          ownerId: viewOwner ? String(viewOwner.ownerId) : "",
          dia,
          diaLabel: dayLabel(dia),
          isAdmin: gestor,
          dbReady: dbReady(),
        }}
      />
      )}
    </div>
  );
}
