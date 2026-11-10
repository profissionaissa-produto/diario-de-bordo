import { redirect } from "next/navigation";
import Link from "next/link";
import Avatar from "../Avatar";
import { auth, signOut } from "../../auth";
import { getTicketsCS, getOwnerByEmail } from "../../lib/hubspot";
import {
  getEvolucaoTramitacoes,
  tentativasFinanceiro,
  listarEstrategias,
  listarOcultas,
  dbReady,
} from "../../lib/db";
import { montaEstrategias, semOcultas } from "../../lib/estrategias";
import { dayKey, dayLabel } from "../../lib/week";
import { SEG_FINANCEIRO } from "../../lib/config";
import { podeVerFinanceiro, podeVerTramitacoes, podeVerEvolucao, podeConfigurar, ehGestor, segmentosDe } from "../../lib/permissoes";
import { PIPELINE_CS, ETAPAS_TICKET, gravidade } from "../../lib/tramitacoes";
import {
  ETAPAS_FINANCEIRO,
  cartaoFinanceiro,
  porSituacao,
  placarFinanceiro,
  somaCache,
  emReais,
  SITUACOES,
} from "../../lib/financeiro";
import FinanceiroCard from "../FinanceiroCard";
import AdminBar from "../AdminBar";

export const dynamic = "force-dynamic";

export default async function Financeiro({ searchParams }) {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");

  const userName = session.user.name || session.user.email;
  const hoje = dayKey();

  // Quem opera esta tela é identificado pelo owner, como nas tramitações: a
  // sessão não carrega o ownerId, então ele é resolvido pelo e-mail do login.
  let meuOwnerId = null;
  if (!session.user.isAdmin) {
    const owner = await getOwnerByEmail(session.user.email.toLowerCase()).catch(() => null);
    meuOwnerId = owner ? String(owner.ownerId) : null;
  }
  if (!podeVerFinanceiro(session.user, meuOwnerId)) redirect("/");

  let tickets = [];
  let erro = null;
  try {
    tickets = await getTicketsCS(PIPELINE_CS, ETAPAS_FINANCEIRO);
  } catch (e) {
    console.error("[financeiro] falha ao buscar tickets:", e);
    erro = e;
  }

  // Sem filtro por dono, de propósito. Quem cobra não cobra "os clientes
  // dela": cobra o que venceu, seja de quem for o ticket.
  const ids = tickets.map((t) => t.id);
  const [evolucoes, tentativas, estrategias] = await Promise.all([
    getEvolucaoTramitacoes(ids, hoje),
    tentativasFinanceiro(ids),
    (async () =>
      semOcultas(montaEstrategias(await listarEstrategias()), await listarOcultas())[
        SEG_FINANCEIRO
      ] || [])(),
  ]);

  const etapaSel = ETAPAS_FINANCEIRO.includes(searchParams?.etapa) ? searchParams.etapa : "";

  const todos = tickets
    .map((t) => {
      const tipo = `fin:${t.etapa}`;
      return cartaoFinanceiro(t, hoje, {
        // A cor é a da Sinaleira, recebida pronta. Esta tela não recalcula
        // gravidade: duas réguas pintando o mesmo ticket foi o defeito de
        // 05/11/2026, e a coluna aqui já responde a outra pergunta.
        gravidade: gravidade(t, hoje),
        evolucao: evolucoes[`${t.id}|${tipo}`] || null,
        tentativas: tentativas[`${t.id}|${tipo}`] || 0,
      });
    })
    .filter(Boolean);

  const lista = etapaSel ? todos.filter((c) => c.etapa === etapaSel) : todos;
  const grupos = porSituacao(lista);
  const pl = placarFinanceiro(lista);
  const vencido = somaCache(grupos.vencida);

  const ticketsById = Object.fromEntries(tickets.map((t) => [t.id, t]));

  // Quantos tickets em cada etapa, para o filtro dizer o tamanho antes do
  // clique. Etapa sem nada continua aparecendo, com zero: aqui são quatro e
  // esconder uma faria parecer que o processo tem três.
  const porEtapa = Object.fromEntries(
    ETAPAS_FINANCEIRO.map((id) => [id, todos.filter((c) => c.etapa === id).length])
  );

  return (
    <div className="wrap">
      <div className="top">
        <div className="brand">
          <img className="logo" src="/logo-psa.png" alt="PSA" />
          <div className="divider" />
          <div>
            <div className="title">Financeiro</div>
            <div className="subtitle">Faturamento, cobrança e NF · {dayLabel(hoje)}</div>
          </div>
        </div>
        <div className="who">
          <Avatar foto={session.user.foto} nome={userName} />
          <div className="who-name">{userName}</div>
          <form action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}>
            <button className="signout" type="submit">Sair</button>
          </form>
        </div>
      </div>

      {/* A mesma barra de segmento do Diário, para o caminho de volta existir:
          o Financeiro é um segmento como os outros, só que com tela própria. */}
      <AdminBar
        owners={[]}
        selected=""
        seg={SEG_FINANCEIRO}
        segs={[...segmentosDe(session.user), SEG_FINANCEIRO]}
        rotas={{ [SEG_FINANCEIRO]: "/financeiro" }}
        equipes={[]}
        semEquipe={0}
      />

      <div className="viewbar">
        <div className="viewtoggle">
          <Link href="/">Diário de bordo</Link>
          {ehGestor(session.user) && <Link href="/agenda">Agenda do dia</Link>}
          {ehGestor(session.user) && podeVerEvolucao(session.user) && <Link href="/evolucao">Evolução</Link>}
          {podeVerTramitacoes(session.user, meuOwnerId) && <Link href="/tramitacoes">Tramitações</Link>}
          <Link href="/financeiro" className="on">
            Financeiro{lista.length ? ` (${lista.length})` : ""}
          </Link>
          {podeConfigurar(session.user) && <Link href="/configuracoes">Configurações</Link>}
          <Link href="/ajuda">Como funciona</Link>
        </div>
        <div className="seg-toggle">
          <Link href="/financeiro" className={etapaSel ? "" : "on"}>
            Todas ({todos.length})
          </Link>
          {ETAPAS_FINANCEIRO.map((id) => (
            <Link
              key={id}
              href={`/financeiro?etapa=${id}`}
              className={etapaSel === id ? "on" : ""}
            >
              {ETAPAS_TICKET[id].label} ({porEtapa[id]})
            </Link>
          ))}
        </div>
      </div>

      {erro && (
        <div className="card">
          <div className="cal-empty">
            Não foi possível ler os tickets do HubSpot agora. Atualize em alguns instantes.
          </div>
        </div>
      )}

      {!dbReady() && <div className="card"><div className="cal-empty">Banco não configurado.</div></div>}

      {!erro && (
        <div className="kpis">
          <div className="kpi">
            <div className="lab">Vencidas</div>
            <div className="val o">{pl.vencida}</div>
            <div className="sub">data combinada já passou</div>
          </div>
          <div className="kpi">
            <div className="lab">Vence hoje</div>
            <div className="val a">{pl.hoje}</div>
            <div className="sub">cai hoje, é o dia de cobrar</div>
          </div>
          <div className="kpi">
            <div className="lab">Em cachê vencido</div>
            <div className="val">{emReais(vencido)}</div>
            <div className="sub">soma do cachê dos tickets vencidos</div>
          </div>
          <div className="kpi">
            <div className="lab">Tickets</div>
            <div className="val">{lista.length}</div>
            <div className="sub">{etapaSel ? "na etapa escolhida" : "nas quatro etapas"}</div>
          </div>
        </div>
      )}

      {!erro && lista.length === 0 ? (
        <div className="card">
          <div className="cal-empty">Nenhum ticket nestas etapas agora.</div>
        </div>
      ) : (
        <div className="kanban">
          {SITUACOES.filter((s) => grupos[s.key].length > 0).map((s) => (
            <section className="kcol" key={s.key}>
              <header className="kcol-topo">
                <div className="kcol-nome">
                  <h3>{s.label}</h3>
                  <span className="kcol-n">{grupos[s.key].length}</span>
                </div>
                <p className="kcol-regra">{s.hint}</p>
              </header>
              <div className="kcol-cards">
                {grupos[s.key].map((c) => (
                  <FinanceiroCard
                    key={c.ticketId + c.tipo}
                    c={c}
                    ticket={ticketsById[c.ticketId]}
                    estrategias={estrategias}
                    ehGestor={ehGestor(session.user)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <div className="evo-nota">
        <b>A régua.</b> A coluna sai da data combinada com o cliente, que é a{" "}
        <b>Data Prevista de Pagamento</b> do ticket, preenchida em 99 de cada 100
        tickets destas quatro etapas. Quando há mais de uma parcela, manda a mais
        atrasada, e as outras aparecem no card. A cor do card é a da coluna. A
        linha <b>Sinaleira</b>, no pé do card, é a outra régua: ela mede cada
        etapa pelo marco dela, contra o evento, e por isso pode discordar sem
        que nenhuma das duas esteja errada.{" "}
        <b>O que ainda falta:</b> não existe no HubSpot campo que marque pagamento
        confirmado. Enquanto não existir, parcela já paga continua contando como
        vencida até o ticket sair da etapa, e hoje 73 de cada 100 estão nessa
        coluna. Registrar a confirmação aqui deixa a evidência no ticket, mas não
        tira o card da coluna.
      </div>
    </div>
  );
}
