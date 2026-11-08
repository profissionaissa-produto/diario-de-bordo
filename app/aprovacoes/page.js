import { redirect } from "next/navigation";
import Avatar from "../Avatar";
import Link from "next/link";
import { auth, signOut } from "../../auth";
import { getDealsByIds, getTemperaturaOptions, getOwnerNames } from "../../lib/hubspot";
import { getDayBriefings, getBriefingHistory, listarEstrategias, listarOcultas, dbReady } from "../../lib/db";
import { montaEstrategias, indexaPorId, semOcultas } from "../../lib/estrategias";
import { dayKey, dayLabel } from "../../lib/week";
import { CLOSERS_BY_SEG, NOME_CLOSER, SEG_CLOSER, fotoDe } from "../../lib/config";
import { seedDia } from "../../lib/seed";
import { ehGestor, segmentosDe, briefingsGeriveis, podeGerirCloser , podeVerTramitacoes, podeVerFinanceiro, podeConfigurar } from "../../lib/permissoes";
import ApprovalCard from "../ApprovalCard";
import HistLinha from "../HistLinha";

export const dynamic = "force-dynamic";

function initials(name) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

export default async function Aprovacoes({ searchParams }) {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");
  if (!ehGestor(session.user)) redirect("/");

  const userName = session.user.name || session.user.email;
  const dia = dayKey();
  const filtro = searchParams?.st || "pendentes";

  // Popula cronogramas de demonstração e volta para a lista.
  if (searchParams?.simular === "1") {
    await seedDia(dia);
    redirect("/aprovacoes");
  }

  const plans = await getDayBriefings(dia);

  // Times e nomes vêm da configuração local, sem consultar o HubSpot.
  const segOf = (id) => SEG_CLOSER[String(id)];
  const nomeDe = NOME_CLOSER;

  // Líder enxerga apenas o time dele; admin, os dois segmentos. A mesma regra
  // do contador da home: exigir cadastro aqui escondia briefings que o número
  // contava, e ninguém conseguia aprová-los.
  const meusSegs = segmentosDe(session.user);
  const visiveis = briefingsGeriveis(session.user, plans);
  // Quem enviou sem estar no cadastro: nome vem do HubSpot só para esses.
  const semCadastro = visiveis.filter((p) => !segOf(p.ownerId)).map((p) => p.ownerId);
  const nomesHub = semCadastro.length ? await getOwnerNames(semCadastro).catch(() => ({})) : {};
  const todos = visiveis.map((p) => ({
    ...p,
    nome: nomeDe[p.ownerId] || nomesHub[p.ownerId] || `Closer ${p.ownerId}`,
    seg: segOf(p.ownerId) || null,
    foto: fotoDe(p.ownerId),
  }));

  const pendentes = todos.filter((p) => p.status === "enviado");
  const decididos = todos.filter((p) => p.status === "aprovado" || p.status === "reprovado");
  const isHistorico = filtro === "historico";
  const lista = isHistorico
    ? []
    : filtro === "todos"
    ? todos
    : filtro === "decididos"
    ? decididos
    : pendentes;

  // Histórico: semanas anteriores, agrupadas.
  const historico = isHistorico ? await getBriefingHistory(dia) : [];
  const porSemana = {};
  for (const h of historico) {
    if (!podeGerirCloser(session.user, h.ownerId)) continue;
    (porSemana[h.dia] ||= []).push({ ...h, nome: nomeDe[h.ownerId] || `Closer ${h.ownerId}` });
  }

  // Um único batch para todos os negócios citados nos planos exibidos.
  const tempOptions = await getTemperaturaOptions().catch(() => []);
  const ids = lista.flatMap((p) => Object.keys(p.items));
  const dealsById = ids.length ? await getDealsByIds(ids, { withTasks: true }) : {};

  // As dez originais vêm do código; o que a curadoria cadastrou vem do banco.
  // idx sai da lista inteira: uma estratégia removida ainda precisa ter nome no
  // briefing antigo que a gravou. porSeg é só o que ainda dá para escolher.
  const porSeg = montaEstrategias(await listarEstrategias());
  const estrat = { porSeg: semOcultas(porSeg, await listarOcultas()), idx: indexaPorId(porSeg) };
  const configura = podeConfigurar(session.user);

  return (
    <div className="wrap">
      <div className="top">
        <div className="brand">
          <img className="logo" src="/logo-psa.png" alt="PSA" />
          <div className="divider" />
          <div>
            <div className="title">Aprovações</div>
            <div className="subtitle">Briefings de {dayLabel(dia)} · {pendentes.length} aguardando</div>
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

      <div className="viewbar">
        <div className="viewtoggle">
          <Link href="/" className="">Diário de bordo</Link>
          <Link href="/aprovacoes" className="on">Aprovações{pendentes.length ? ` (${pendentes.length})` : ""}</Link>
          <Link href="/agenda">Agenda geral</Link>
          {podeVerTramitacoes(session.user, null) && <Link href="/tramitacoes">Tramitações</Link>}
          {podeVerFinanceiro(session.user, null) && <Link href="/financeiro">Financeiro</Link>}
          {configura && <Link href="/configuracoes">Configurações</Link>}
        </div>
        <div className="seg-toggle">
          {[["pendentes", "Aguardando"], ["decididos", "Decididos"], ["todos", "Todos"], ["historico", "Histórico"]].map(([v, l]) => (
            <Link key={v} href={`/aprovacoes?st=${v}`} className={filtro === v ? "on" : ""}>{l}</Link>
          ))}
        </div>
      </div>

      {!dbReady() && <div className="card"><div className="cal-empty">Banco não configurado.</div></div>}

      {isHistorico && (
        Object.keys(porSemana).length === 0 ? (
          <div className="card"><div className="cal-empty">Ainda não há dias anteriores registrados.</div></div>
        ) : (
          <div className="aprov-list">
            {Object.entries(porSemana).map(([sem, planos]) => (
              <div className="hist-bloco" key={sem}>
                <div className="hist-semana">{dayLabel(sem)}</div>
                <div className="hist-linhas">
                  {planos.map((p) => (
                    <HistLinha key={p.ownerId + sem} registro={p} estrat={estrat} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {!isHistorico && dbReady() && lista.length === 0 && (
        <div className="card">
          <div className="cal-empty">
            <p style={{ margin: "0 0 18px" }}>
              {filtro === "pendentes"
                ? "Nenhum briefing aguardando aprovação hoje."
                : "Nada por aqui hoje."}
            </p>
            {todos.length === 0 && (
              <Link className="btn-primary" href="/aprovacoes?simular=1">
                Simular briefings dos closers
              </Link>
            )}
          </div>
        </div>
      )}

      <div className="aprov-list">
        {lista.map((p) => (
          <ApprovalCard key={p.ownerId} plano={p} deals={dealsById} dia={dia} options={tempOptions} estrat={estrat} />
        ))}
      </div>
    </div>
  );
}
