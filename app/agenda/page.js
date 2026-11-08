import { redirect } from "next/navigation";
import Avatar from "../Avatar";
import Link from "next/link";
import { auth, signOut } from "../../auth";
import { getDealsByIds } from "../../lib/hubspot";
import { getDayBriefings, dbReady } from "../../lib/db";
import { dayKey, dayLabel } from "../../lib/week";
import { CLOSERS, SEG_CLOSER, SEGMENTOS, TEMP_STYLE, dealUrl, fotoDe, EQUIPES_DE, closersDe, semEquipe, SEG_TRAMITACOES, empresaUrl } from "../../lib/config";
import { getDiasDosFarmers, getTrocasPendentes, getOrientacoes, getHistoricoCarteira, getBriefingsCarteira } from "../../lib/db";
import { resumoDoMes } from "../../lib/metricas-farmer";
import { atividadeDoDia } from "../../lib/atividade";
import { aplicarAtividade } from "../../lib/db";
import { situacaoDoDia, placarDoDia, montaHistorico, precisaAuxilio } from "../../lib/carteira";
import AgendaFarmers from "../AgendaFarmers";
import { ehGestor, segmentosDe, podeGerirCloser, podeVerTramitacoes, podeVerFinanceiro, equipeLiderada, podeVerEvolucao, podeConfigurar } from "../../lib/permissoes";

export const dynamic = "force-dynamic";

function initials(name) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}
const brl = (n) => (n == null ? "" : "R$ " + n.toLocaleString("pt-BR", { maximumFractionDigits: 0 }));

const STATUS_LABEL = {
  rascunho: "Rascunho",
  enviado: "Aguardando",
  aprovado: "Aprovado",
  reprovado: "Reprovado",
};

export default async function AgendaGeral({ searchParams }) {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");
  if (!ehGestor(session.user)) redirect("/");

  const userName = session.user.name || session.user.email;
  const dia = searchParams?.dia || dayKey();
  // Líder fica restrito ao próprio segmento.
  const meusSegs = segmentosDe(session.user);
  const pedido = SEGMENTOS.includes(searchParams?.seg) ? searchParams.seg : "B2B";
  const seg = meusSegs.includes(pedido) ? pedido : meusSegs[0] || "B2B";

  const briefings = await getDayBriefings(dia);
  const porOwner = Object.fromEntries(briefings.map((b) => [String(b.ownerId), b]));

  // Todos os closers do time aparecem — inclusive quem ainda não enviou nada.
  // Ordem por urgência para o gestor: o que espera decisão primeiro, quem não
  // enviou por último. Dentro do mesmo grupo, mantém a ordem do cadastro.
  const PESO = { enviado: 0, reprovado: 1, aprovado: 2, rascunho: 3 };
  // A grade segue a equipe escolhida; sem equipe, o time inteiro.
  const eqLider = equipeLiderada(session.user);
  const equipeTravada = eqLider && eqLider.seg === seg ? eqLider.equipe : "";
  const equipe = equipeTravada || searchParams?.equipe || "";
  const time = closersDe(seg, equipe)
    .map((c, i) => {
      const briefing = porOwner[c.id] || null;
      const temItens = briefing && Object.keys(briefing.items).length > 0;
      return {
        ...c,
        i,
        foto: fotoDe(c.id),
        briefing,
        peso: temItens ? PESO[briefing.status] ?? 3 : 4, // sem briefing: por último
      };
    })
    .sort((a, b) => a.peso - b.peso || a.i - b.i);

  // Quem não enviou vira uma faixa compacta; misturado aos cartões, quebrava a
  // leitura em coluna e espalhava os nomes pela tela.
  const comBriefing = time.filter((c) => c.peso < 4);
  const semBriefing = time.filter((c) => c.peso === 4);

  // A agenda é montada por time, então quem enviou sem estar no cadastro não
  // caberia em coluna nenhuma. Em vez de desaparecer, vira um aviso: o cartão
  // dele existe e pode ser decidido em Aprovações.
  const foraDoCadastro = briefings.filter(
    (b) =>
      !SEG_CLOSER[String(b.ownerId)] &&
      Object.keys(b.items).length > 0 &&
      podeGerirCloser(session.user, b.ownerId)
  ).length;

  // O time de CS não trabalha briefing de negócios: a agenda dele é a carteira.
  const ehFarmer = seg === SEG_TRAMITACOES;
  let farmersDoDia = null;
  let resumoTime = null;
  if (ehFarmer) {
    const idsTime = closersDe(seg, equipe).map((c) => c.id);
    // Antes de montar os cartões: o que o CRM registrou hoje vira resultado.
    // Uma busca por tipo para o time inteiro — uma por farmer inviabilizaria
    // a tela.
    const ativTime = await atividadeDoDia(idsTime, dia).catch((e) => {
      console.error("[agenda] atividade do time falhou:", e?.message);
      return {};
    });
    for (const id of idsTime) {
      await aplicarAtividade(id, dia, ativTime[id] || {}).catch(() => {});
    }

    const [dias, trocas, orientacoes, briefs] = await Promise.all([
      getDiasDosFarmers(idsTime, dia),
      getTrocasPendentes(idsTime),
      getOrientacoes(idsTime),
      getBriefingsCarteira(idsTime, dia),
    ]);
    // Números do time no topo. Falha aqui não derruba a agenda.
    resumoTime = await resumoDoMes(idsTime, dia).catch((e) => {
      console.error("[agenda] resumo do time falhou:", e?.message);
      return null;
    });
    // O histórico é por farmer: sem ele não dá para saber quem pediu auxílio.
    const historicos = await Promise.all(idsTime.map((id) => getHistoricoCarteira(id, dia)));
    farmersDoDia = closersDe(seg, equipe).map((c, i) => {
      const itens = dias[c.id] || [];
      const h = montaHistorico(historicos[i]);
      return {
        ownerId: c.id,
        nome: c.nome,
        equipe: c.equipe || "",
        foto: fotoDe(c.id),
        situacao: situacaoDoDia(itens),
        placar: placarDoDia(itens),
        itens: itens.map((e) => ({
          ...e,
          url: empresaUrl(e.id),
          historico: h.get(String(e.id)) || null,
          precisaAuxilio: precisaAuxilio(h.get(String(e.id))),
          orientacao: orientacoes[c.id]?.[e.id] || null,
        })),
        trocas: (trocas[c.id] || []).map((t) => ({ ...t, url: empresaUrl(t.id) })),
        brief: briefs[c.id] || null,
      };
    });
  }

  const ids = briefings.flatMap((b) => Object.keys(b.items));
  const dealsById = ids.length ? await getDealsByIds(ids) : {};

  const totalNeg = time.reduce((s, c) => s + Object.keys(c.briefing?.items || {}).length, 0);
  const enviaram = time.filter((c) => c.briefing && Object.keys(c.briefing.items).length).length;

  return (
    <div className="wrap">
      <div className="top">
        <div className="brand">
          <img className="logo" src="/logo-psa.png" alt="PSA" />
          <div className="divider" />
          <div>
            <div className="title">{ehFarmer ? "Agenda do dia" : "Agenda geral"}</div>
            <div className="subtitle">
              {dayLabel(dia)} ·{" "}
              {ehFarmer
                ? `${farmersDoDia.filter((f) => f.itens.length > 0).length} de ${farmersDoDia.length} farmers com lista hoje`
                : `${enviaram} de ${time.length} closers · ${totalNeg} negócio${totalNeg === 1 ? "" : "s"}`}
            </div>
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
          <Link href="/">Diário de bordo</Link>
          {ehFarmer ? (
            <>
              <Link href="/agenda" className="on">Agenda do dia</Link>
              {podeVerEvolucao(session.user) && <Link href="/evolucao">Evolução</Link>}
              {podeVerTramitacoes(session.user, null) && <Link href="/tramitacoes">Tramitações</Link>}
              {podeVerFinanceiro(session.user, null) && <Link href="/financeiro">Financeiro</Link>}
              {podeConfigurar(session.user) && <Link href="/configuracoes">Configurações</Link>}
              <Link href="/ajuda">Como funciona</Link>
            </>
          ) : (
            <>
              <Link href="/aprovacoes">Aprovações</Link>
              <Link href="/agenda" className="on">Agenda geral</Link>
              {podeConfigurar(session.user) && <Link href="/configuracoes">Configurações</Link>}
            </>
          )}
        </div>
        <div className="seg-toggle">
          {meusSegs.map((s) => (
            <Link key={s} href={`/agenda?seg=${s}`} className={seg === s ? "on" : ""}>{s}</Link>
          ))}
        </div>
        {!equipeTravada && EQUIPES_DE(seg).length > 0 && (
          <div className="seg-toggle">
            <Link href={`/agenda?seg=${seg}`} className={equipe ? "" : "on"}>Todas</Link>
            {EQUIPES_DE(seg).map((e) => (
              <Link key={e} href={`/agenda?seg=${seg}&equipe=${encodeURIComponent(e)}`} className={equipe === e ? "on" : ""}>{e}</Link>
            ))}
          </div>
        )}
      </div>

      {!dbReady() && <div className="card"><div className="cal-empty">Banco não configurado.</div></div>}

      {foraDoCadastro > 0 && (
        <div className="aprov-motivo">
          {foraDoCadastro} briefing{foraDoCadastro === 1 ? "" : "s"} de closer sem time cadastrado —
          não aparece{foraDoCadastro === 1 ? "" : "m"} nesta grade.{" "}
          <Link href="/aprovacoes">Ver em Aprovações</Link>
        </div>
      )}

      {farmersDoDia && (
        <AgendaFarmers farmers={farmersDoDia} diaLabel={dayLabel(dia)} dia={dia} resumo={resumoTime} />
      )}

      {!farmersDoDia && dbReady() && semBriefing.length > 0 && (
        <div className="sem-briefing">
          <span className="sem-briefing-lab">Sem briefing hoje ({semBriefing.length})</span>
          <div className="sem-briefing-lista">
            {semBriefing.map((c) => (
              <span className="sem-chip" key={c.id}>
                <span className="aprov-pfp">
                  {c.foto ? <img src={c.foto} alt={c.nome} /> : initials(c.nome)}
                </span>
                {c.nome}
              </span>
            ))}
          </div>
        </div>
      )}

      {!farmersDoDia && dbReady() && (
        <div className="dia-grid">
          {comBriefing.map((c) => {
            const itens = Object.entries(c.briefing?.items || {});
            const valor = itens.reduce((s, [id]) => s + (dealsById[id]?.amount || 0), 0);
            const st = c.briefing?.status;
            return (
              <div className={"dia-card" + (itens.length ? " st-" + st : " vazio")} key={c.id}>
                <div className="dia-head">
                  <span className="aprov-pfp">
                    {c.foto ? <img src={c.foto} alt={c.nome} /> : initials(c.nome)}
                  </span>
                  <div className="dia-quem">
                    <span className="dia-nome">{c.nome}</span>
                    <span className="dia-meta">
                      {itens.length
                        ? `${itens.length} negócio${itens.length === 1 ? "" : "s"} · ${brl(valor)}`
                        : "sem briefing hoje"}
                    </span>
                  </div>
                  {itens.length > 0 && <span className="plan-badge">{STATUS_LABEL[st]}</span>}
                </div>

                {itens.length > 0 && (
                  <div className="dia-itens">
                    {itens.map(([id, v]) => {
                      const n = dealsById[id];
                      if (!n) return null;
                      return (
                        <a
                          className={"dia-item v-" + (TEMP_STYLE[v.de] || "none")}
                          key={id}
                          href={dealUrl(id)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <span className="dia-item-nome">{n.name}</span>
                          <span className="dia-item-evo">
                            <span className={"mini t-" + (TEMP_STYLE[v.de] || "none")}>{v.de || "—"}</span>
                            <span className="evo-seta">→</span>
                            <span className={"mini forte t-" + (TEMP_STYLE[v.para] || "none")}>
                              {v.para || "—"}
                            </span>
                            <span className="dia-item-val">{brl(n.amount)}</span>
                          </span>
                        </a>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
