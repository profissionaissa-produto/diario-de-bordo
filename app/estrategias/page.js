import { redirect } from "next/navigation";
import Link from "next/link";
import { auth, signOut } from "../../auth";
import { listarEstrategias, dbReady } from "../../lib/db";
import { montaEstrategias, numeroDa } from "../../lib/estrategias";
import { segCurado, podeVerTramitacoes, podeVerEvolucao } from "../../lib/permissoes";
import { SEG_TRAMITACOES } from "../../lib/config";
import NovaEstrategia from "../NovaEstrategia";

export const dynamic = "force-dynamic";

function initials(name) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

export default async function Estrategias() {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");

  // A curadoria é nominal: quem não cura não tem o que fazer nesta tela.
  const seg = segCurado(session.user);
  if (!seg) redirect("/");

  const userName = session.user.name || session.user.email;
  const lista = montaEstrategias(await listarEstrategias())[seg] || [];
  const cadastradas = lista.filter((e) => e.criadoPor).length;

  return (
    <div className="wrap">
      <div className="top">
        <div className="brand">
          <img className="logo" src="/logo-psa.png" alt="PSA" />
          <div className="divider" />
          <div>
            <div className="title">Estratégias</div>
            <div className="subtitle">
              O que o time de {seg} pode escolher no briefing · {lista.length} na lista
            </div>
          </div>
        </div>
        <div className="who">
          <div className="pfp">{initials(userName)}</div>
          <div className="who-name">{userName}</div>
          <form action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}>
            <button className="signout" type="submit">Sair</button>
          </form>
        </div>
      </div>

      <div className="viewbar">
        {/* Mesmo menu do segmento de quem está olhando: no CS o dia é carteira
            e tramitação; no comercial é briefing e aprovação. */}
        <div className="viewtoggle">
          <Link href="/">Diário de bordo</Link>
          {seg === SEG_TRAMITACOES ? (
            <>
              <Link href="/agenda">Agenda do dia</Link>
              {podeVerEvolucao(session.user) && <Link href="/evolucao">Evolução</Link>}
              {podeVerTramitacoes(session.user, null) && <Link href="/tramitacoes">Tramitações</Link>}
            </>
          ) : (
            <>
              <Link href="/aprovacoes">Aprovações</Link>
              <Link href="/agenda">Agenda geral</Link>
            </>
          )}
          <Link href="/estrategias" className="on">Estratégias</Link>
        </div>
      </div>

      {!dbReady() && (
        <div className="card">
          <div className="foco-vazio">
            <h3>Banco não configurado</h3>
            <p>A lista abaixo é a do código. Sem banco não dá para cadastrar nada novo.</p>
          </div>
        </div>
      )}

      {dbReady() && <NovaEstrategia seg={seg} />}

      <div className="card">
        <div className="planbar">
          <span className="plan-week">Lista de {seg}</span>
          <span className="plan-badge">
            {lista.length} no total{cadastradas ? ` · ${cadastradas} cadastrada${cadastradas === 1 ? "" : "s"} aqui` : ""}
          </span>
        </div>
        <div className="tscroll">
          <table>
            <thead>
              <tr>
                <th style={{ width: "6%" }}>#</th>
                <th style={{ width: "28%" }}>Título</th>
                <th style={{ width: "48%" }}>Quando usar</th>
                <th style={{ width: "18%" }}>Cadastrada por</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((e) => (
                <tr key={e.id}>
                  <td>{numeroDa(e.id)}</td>
                  <td className="deal">{e.titulo}</td>
                  <td className="est-desc">{e.desc}</td>
                  <td>{e.criadoPor || <span className="est-sem">original</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="fech-opcional">
        A estratégia entra na hora para o time escolher no briefing. Para ela também ser
        gravada no campo <b>Estratégia</b> do negócio no HubSpot, a mesma opção precisa
        existir lá — enquanto não existir, o briefing grava a temperatura e deixa a
        estratégia de fora, registrando o aviso no log.
      </p>
    </div>
  );
}
