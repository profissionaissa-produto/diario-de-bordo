import { redirect } from "next/navigation";
import Avatar from "../Avatar";
import Link from "next/link";
import { auth, signOut } from "../../auth";
import { getEvolucaoCarteira, dbReady } from "../../lib/db";
import { dayKey, dayLabel, ultimosDiasUteis } from "../../lib/week";
import { NOME_CLOSER, SEG_CLOSER, SEGMENTOS, EQUIPES_DE, closersDe, fotoDe, SEG_TRAMITACOES } from "../../lib/config";
import { ehGestor, segmentosDe, podeVerTramitacoes, equipeLiderada, podeVerEvolucao, podeConfigurar } from "../../lib/permissoes";

export const dynamic = "force-dynamic";

// As quatro faixas somam as empresas do compromisso do dia.
const FAIXAS = [
  { id: "efetivo", label: "Contato efetivo", cls: "ef" },
  { id: "tentativa", label: "Tentei, sem sucesso", cls: "te" },
  { id: "nao_abordei", label: "Não abordei", cls: "na" },
  { id: "sem_registro", label: "Sem registro", cls: "sr" },
];

const pct = (n, total) => (total ? Math.round((n / total) * 100) : 0);

function initials(name) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

export default async function Evolucao({ searchParams }) {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");
  if (!ehGestor(session.user)) redirect("/");
  // A Evolução mede empresas da carteira: sem alcance ao time de CS não há o
  // que mostrar, e uma tela vazia parece defeito.
  if (!podeVerEvolucao(session.user)) redirect("/");

  const userName = session.user.name || session.user.email;
  const meusSegs = segmentosDe(session.user);
  // Não há seletor de segmento: a carteira é do time de CS e ponto.
  const seg = SEG_TRAMITACOES;
  const eqLider = equipeLiderada(session.user);
  const equipeTravada = eqLider && eqLider.seg === seg ? eqLider.equipe : "";
  const equipe = equipeTravada || searchParams?.equipe || "";

  const dias = ultimosDiasUteis(10);
  const linhas = await getEvolucaoCarteira(dias, closersDe(seg, equipe).map((c) => c.id));

  // Só os closers da equipe escolhida entram na conta.
  const daEquipe = new Set(closersDe(seg, equipe).map((c) => c.id));
  const doRecorte = linhas.filter((l) => daEquipe.has(l.ownerId));

  const zero = () => Object.fromEntries([["marcados", 0], ...FAIXAS.map((f) => [f.id, 0])]);
  const soma = (acc, l) => {
    acc.marcados += l.marcados;
    for (const f of FAIXAS) acc[f.id] += l[f.id];
    return acc;
  };

  const porDia = Object.fromEntries(dias.map((d) => [d, zero()]));
  const porCloser = {};
  for (const l of doRecorte) {
    soma(porDia[l.dia] ||= zero(), l);
    soma((porCloser[l.ownerId] ||= zero()), l);
  }

  const total = doRecorte.reduce(soma, zero());
  // Registrados = tudo que não ficou em branco. As duas leituras aparecem
  // porque elas chegam a inverter o ranking, e uma sozinha engana.
  const registrados = (x) => FAIXAS.filter((f) => f.id !== "sem_registro").reduce((s, f) => s + (x[f.id] || 0), 0);

  const ranking = Object.entries(porCloser)
    .map(([id, x]) => ({
      id,
      nome: NOME_CLOSER[id] || `Closer ${id}`,
      foto: fotoDe(id),
      ...x,
      sobreMarcados: pct(x.efetivo, x.marcados),
      sobreRegistrados: pct(x.efetivo, registrados(x)),
    }))
    .sort((a, b) => b.sobreMarcados - a.sobreMarcados);

  const qs = (over = {}) => {
    const p = new URLSearchParams({ seg, ...(equipe ? { equipe } : {}), ...over });
    for (const [k, v] of Object.entries(over)) if (!v) p.delete(k);
    return "/evolucao?" + p.toString();
  };

  return (
    <div className="wrap">
      <div className="top">
        <div className="brand">
          <img className="logo" src="/logo-psa.png" alt="PSA" />
          <div className="divider" />
          <div>
            <div className="title">Evolução</div>
            <div className="subtitle">
              Últimos {dias.length} dias úteis · até {dayLabel(dayKey())}
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
          <Link href="/agenda">Agenda do dia</Link>
          <Link href="/evolucao" className="on">Evolução</Link>
          {podeVerTramitacoes(session.user, null) && <Link href="/tramitacoes">Tramitações</Link>}
          {podeConfigurar(session.user) && <Link href="/configuracoes">Configurações</Link>}
          <Link href="/ajuda">Como funciona</Link>
        </div>
        {!equipeTravada && EQUIPES_DE(seg).length > 0 && (
          <div className="seg-toggle">
            <Link href={qs({ equipe: "" })} className={equipe ? "" : "on"}>Todas</Link>
            {EQUIPES_DE(seg).map((e) => (
              <Link key={e} href={qs({ equipe: e })} className={equipe === e ? "on" : ""}>{e}</Link>
            ))}
          </div>
        )}
      </div>

      {!dbReady() && <div className="card"><div className="cal-empty">Banco não configurado.</div></div>}

      {dbReady() && total.marcados === 0 ? (
        <div className="card">
          <div className="cal-empty">
            Nenhuma empresa setada nos últimos {dias.length} dias úteis neste recorte.
          </div>
        </div>
      ) : (
        <>
          <div className="kpis">
            <div className="kpi">
              <div className="lab">Contato efetivo</div>
              <div className="val a">{pct(total.efetivo, total.marcados)}%</div>
              <div className="sub">sobre {total.marcados} empresas setadas</div>
            </div>
            <div className="kpi">
              <div className="lab">Sobre os registrados</div>
              <div className="val">{pct(total.efetivo, registrados(total))}%</div>
              <div className="sub">ignorando o que ficou em branco</div>
            </div>
            <div className="kpi">
              <div className="lab">Sem registro</div>
              <div className="val o">{pct(total.sem_registro, total.marcados)}%</div>
              <div className="sub">{total.sem_registro} negócios sem fechamento</div>
            </div>
            <div className="kpi">
              <div className="lab">Empresas setadas</div>
              <div className="val">{total.marcados}</div>
              <div className="sub">no período, neste recorte</div>
            </div>
          </div>

          <div className="card evo-bloco">
            <div className="evo-cab">
              <b>Composição por dia</b>
              <div className="evo-legenda">
                {FAIXAS.map((f) => (
                  <span key={f.id}><i className={"evo-chip " + f.cls} />{f.label}</span>
                ))}
              </div>
            </div>
            <div className="evo-dias">
              {dias.map((d) => {
                const x = porDia[d] || zero();
                return (
                  <div className="evo-dia" key={d}>
                    <div className="evo-dia-lab">{dayLabel(d).split(", ")[1]}</div>
                    <div className="evo-barra" title={`${x.marcados} negócios marcados`}>
                      {x.marcados === 0 ? (
                        <div className="evo-vazia" />
                      ) : (
                        FAIXAS.map((f) =>
                          x[f.id] > 0 ? (
                            <div
                              key={f.id}
                              className={"evo-parte " + f.cls}
                              style={{ width: `${(x[f.id] / x.marcados) * 100}%` }}
                              title={`${f.label}: ${x[f.id]} (${pct(x[f.id], x.marcados)}%)`}
                            />
                          ) : null
                        )
                      )}
                    </div>
                    <div className="evo-dia-num">
                      {x.marcados ? `${pct(x.efetivo, x.marcados)}%` : "—"}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="card evo-bloco">
            <div className="evo-cab"><b>Por closer</b></div>
            <div className="tscroll">
              <table>
                <thead>
                  <tr>
                    <th>Closer</th>
                    <th>Marcados</th>
                    <th>Efetivo</th>
                    <th>% sobre marcados</th>
                    <th>% sobre registrados</th>
                    <th>Sem registro</th>
                  </tr>
                </thead>
                <tbody>
                  {ranking.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <span className="evo-quem">
                          <span className="aprov-pfp">
                            {c.foto ? <img src={c.foto} alt={c.nome} /> : initials(c.nome)}
                          </span>
                          {c.nome}
                        </span>
                      </td>
                      <td>{c.marcados}</td>
                      <td>{c.efetivo}</td>
                      <td><b>{c.sobreMarcados}%</b></td>
                      <td>{c.sobreRegistrados}%</td>
                      <td className={c.sem_registro ? "evo-alerta" : ""}>
                        {c.sem_registro} ({pct(c.sem_registro, c.marcados)}%)
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="evo-nota">
            <b>Como ler.</b> O número principal é contato efetivo sobre os negócios <b>marcados no
            briefing</b>, não sobre os que foram preenchidos. Medir só o preenchido premiaria quem
            fecha menos do que planejou — marcar 10 negócios, registrar 2 e conectar em 1 daria 50%.
            Por isso a coluna “sem registro” fica visível: muitas vezes é ela que explica o número.
            As duas leituras podem inverter a ordem entre closers, então compare as duas antes de
            cobrar alguém.
          </div>
        </>
      )}
    </div>
  );
}
