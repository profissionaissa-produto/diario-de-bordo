import { redirect } from "next/navigation";
import Avatar from "../Avatar";
import Link from "next/link";
import { auth, signOut } from "../../auth";
import { listarEstrategias, listarOcultas, lerTexto, chaveContexto, dbReady } from "../../lib/db";
import { montaEstrategias, numeroDa } from "../../lib/estrategias";
import { segsConfiguraveis, podeVerTramitacoes, podeVerFinanceiro, podeVerEvolucao } from "../../lib/permissoes";
import { SEG_TRAMITACOES } from "../../lib/config";
import NovaEstrategia from "../NovaEstrategia";
import AcaoEstrategia from "../AcaoEstrategia";
import ContextoBase from "../ContextoBase";

export const dynamic = "force-dynamic";

function initials(name) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

export default async function Configuracoes({ searchParams }) {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");

  // A configuração é nominal: quem não configura nenhum segmento não tem o
  // que fazer nesta tela.
  const segs = segsConfiguraveis(session.user);
  if (segs.length === 0) redirect("/");

  // Curador cai direto no segmento dele; quem alcança mais de um escolhe pela
  // aba, e um ?seg= de fora da lista não vira porta dos fundos.
  const pedido = searchParams?.seg;
  const seg = segs.includes(pedido) ? pedido : segs[0];

  const userName = session.user.name || session.user.email;
  // A tabela mostra a lista inteira, removidas inclusive: sem elas na tela não
  // haveria como restaurar o que foi tirado por engano.
  const lista = montaEstrategias(await listarEstrategias())[seg] || [];
  const ocultas = (await listarOcultas())[seg] || {};
  const contexto = await lerTexto(chaveContexto(seg));
  const naLista = lista.filter((e) => !ocultas[e.id]).length;

  return (
    <div className="wrap">
      <div className="top">
        <div className="brand">
          <img className="logo" src="/logo-psa.png" alt="PSA" />
          <div className="divider" />
          <div>
            <div className="title">Configurações</div>
            <div className="subtitle">
              Estratégias que o time de {seg} pode escolher no briefing · {naLista} na lista
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
        {/* Mesmo menu do segmento de quem está olhando: no CS o dia é carteira
            e tramitação; no comercial é briefing e aprovação. */}
        <div className="viewtoggle">
          <Link href="/">Diário de bordo</Link>
          {seg === SEG_TRAMITACOES ? (
            <>
              <Link href="/agenda">Agenda do dia</Link>
              {podeVerEvolucao(session.user) && <Link href="/evolucao">Evolução</Link>}
            </>
          ) : (
            <>
              <Link href="/aprovacoes">Aprovações</Link>
              <Link href="/agenda">Agenda geral</Link>
              {/* As duas telas não são do fluxo comercial, mas quem alcança
                  precisa chegar nelas de qualquer segmento. */}
            </>
          )}
          <Link href="/configuracoes" className="on">Configurações</Link>
        </div>
        {segs.length > 1 && (
          <div className="seg-toggle">
            {segs.map((s) => (
              <Link key={s} href={`/configuracoes?seg=${s}`} className={s === seg ? "on" : ""}>{s}</Link>
            ))}
          </div>
        )}
      </div>

      {!dbReady() && (
        <div className="card">
          <div className="foco-vazio">
            <h3>Banco não configurado</h3>
            <p>A lista abaixo é a do código. Sem banco não dá para cadastrar nada novo.</p>
          </div>
        </div>
      )}

      {dbReady() && <ContextoBase seg={seg} inicial={contexto} />}

      {dbReady() && <NovaEstrategia seg={seg} />}

      <div className="card">
        <div className="planbar">
          <span className="plan-week">Lista de {seg}</span>
          <span className="plan-badge">
            {naLista} em uso{lista.length - naLista ? ` · ${lista.length - naLista} removida(s)` : ""}
          </span>
        </div>
        <div className="tscroll">
          <table>
            <thead>
              <tr>
                <th style={{ width: "6%" }}>#</th>
                <th style={{ width: "26%" }}>Título</th>
                <th style={{ width: "40%" }}>Quando usar</th>
                <th style={{ width: "16%" }}>Cadastrada por</th>
                <th style={{ width: "12%" }} />
              </tr>
            </thead>
            <tbody>
              {lista.map((e) => (
                <tr key={e.id} className={ocultas[e.id] ? "est-removida" : ""}>
                  <td>{numeroDa(e.id)}</td>
                  <td className="deal">{e.titulo}</td>
                  <td className="est-desc">{e.desc}</td>
                  <td>
                    {e.criadoPor || <span className="est-sem">original</span>}
                    {ocultas[e.id] && (
                      <span className="est-sem"> · removida por {ocultas[e.id] || "alguém"}</span>
                    )}
                  </td>
                  <td>
                    {dbReady() && (
                      <AcaoEstrategia
                        seg={seg}
                        id={e.id}
                        oculta={!!ocultas[e.id]}
                        titulo={e.titulo}
                        desc={e.desc}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="fech-opcional">
        A estratégia entra na hora para o time escolher no briefing, e o texto editado
        aqui vale para todo mundo. No HubSpot ela é gravada no campo
        <b> Estratégia da abordagem</b> do negócio, que é texto livre: o que estiver
        escrito aqui é o que vai para lá, sem precisar cadastrar opção nenhuma.
        Enquanto esse campo não existir na conta, o briefing grava a temperatura e deixa
        a estratégia de fora, registrando o aviso no log.
      </p>
    </div>
  );
}
