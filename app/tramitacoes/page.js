import { redirect } from "next/navigation";
import Link from "next/link";
import { auth, signOut } from "../../auth";
import { getTicketsCS, getOwnerByEmail, getOwnerNames } from "../../lib/hubspot";
import { getTramitacoes, getEvolucaoTramitacoes, dbReady } from "../../lib/db";
import { dayKey, dayLabel } from "../../lib/week";
import { NOME_CLOSER, closersDe, SEG_TRAMITACOES } from "../../lib/config";
import { ehGestor, podeVerTramitacoes, equipeLiderada, podeVerEvolucao, podeConfigurar } from "../../lib/permissoes";
import { PIPELINE_CS, ETAPAS_TRAMITACAO, ETAPAS_ATIVAS, ETAPAS_TICKET, pendenciasDosTickets, placar, PRE_VERMELHO, PRE_AMARELO, POS_VERMELHO, POS_AMARELO } from "../../lib/tramitacoes";
import TramitacaoCard from "../TramitacaoCard";

export const dynamic = "force-dynamic";

function initials(name) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

export default async function Tramitacoes({ searchParams }) {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");

  const userName = session.user.name || session.user.email;
  const gestor = ehGestor(session.user);
  const hoje = dayKey();
  const filtro = searchParams?.f || "abertas";

  const eqLider = equipeLiderada(session.user);

  // Tramitação é trabalho do time de CS. Resolve o owner antes de qualquer
  // chamada pesada: sem permissão, a pessoa nem chega a consultar o HubSpot.
  let meuOwnerId = null;
  if (!session.user.isAdmin) {
    const owner = await getOwnerByEmail(session.user.email.toLowerCase()).catch(() => null);
    meuOwnerId = owner ? String(owner.ownerId) : null;
  }
  if (!podeVerTramitacoes(session.user, meuOwnerId)) redirect("/");

  let tickets = [];
  let erro = null;
  try {
    tickets = await getTicketsCS(PIPELINE_CS, ETAPAS_TRAMITACAO);
  } catch (e) {
    console.error("[tramitacoes] falha ao buscar tickets:", e);
    erro = e;
  }

  // Quem não é gestor vê só o que é dele; quem lidera uma equipe vê a equipe.
  if (!gestor) {
    tickets = tickets.filter((t) => String(t.ownerId) === meuOwnerId);
  } else if (eqLider) {
    const daEquipe = new Set(closersDe(eqLider.seg, eqLider.equipe).map((c) => c.id));
    tickets = tickets.filter((t) => daEquipe.has(String(t.ownerId)));
  }

  const [registros, evolucoes] = await Promise.all([
    getTramitacoes(tickets.map((t) => t.id)),
    getEvolucaoTramitacoes(tickets.map((t) => t.id), hoje),
  ]);

  // Já vem ordenado da regra: evento passado e ainda aberto primeiro, depois
  // evento próximo com etapa de preparação pendente.
  const todas = pendenciasDosTickets(tickets, hoje, registros);
  const placarBoard = placar(todas);

  const donoDo = (p) => String(tickets.find((t) => t.id === p.ticketId)?.ownerId || "");

  // Quantos TICKETS ativos cada farmer tem. Conta ticket, não pendência: é o
  // número que bate com o funil de CS no HubSpot, e foi contando pendência que
  // o board dizia 4 onde o CRM mostrava 45.
  const porFarmer = {};
  for (const t of tickets) {
    if (t.ownerId) porFarmer[t.ownerId] = (porFarmer[t.ownerId] || 0) + 1;
  }

  // Com a etapa virando a pendência, nenhum ticket ativo fica de fora: cada
  // um tem exatamente uma, que é a ação que o nome da etapa pede.
  const tudo = todas;

  const farmerSel = searchParams?.owner || "";
  const doFarmer = farmerSel ? tudo.filter((p) => donoDo(p) === farmerSel) : tudo;

  const abertas = doFarmer.filter((p) => p.status !== "aguardando");
  const aguardando = doFarmer.filter((p) => p.status === "aguardando");
  // "A fazer" conta o que cobra alguém: acompanhamento não cobra nada.
  const aFazer = abertas.filter((p) => p.tipo !== "nenhuma");
  // Tickets do recorte da tela — com farmer escolhido, só os dele.
  const ticketsDoRecorte = farmerSel
    ? tickets.filter((t) => String(t.ownerId) === farmerSel)
    : tickets;
  const bruta = filtro === "aguardando" ? aguardando : filtro === "todas" ? doFarmer : abertas;

  // Evento já realizado vai para o fim, em bloco próprio: o ticket segue
  // aberto, mas a ação perdeu a hora e não pode disputar espaço com o resto.
  const lista = bruta.filter((p) => !p.eventoPassado);
  const vencidas = bruta.filter((p) => p.eventoPassado);

  // Farmers que o usuário alcança, com a contagem ao lado do nome.
  const equipeDoFiltro = eqLider ? eqLider.equipe : "";
  const farmersVisiveis = gestor
    ? closersDe(SEG_TRAMITACOES, equipeDoFiltro)
        .map((c) => ({ ...c, n: porFarmer[c.id] || 0 }))
        .sort((a, b) => b.n - a.n || a.nome.localeCompare(b.nome, "pt-BR"))
    : [];

  // Nome do dono só para quem aparece na tela, e só se não estiver no cadastro.
  const donos = [...new Set(lista.map((p) => tickets.find((t) => t.id === p.ticketId)?.ownerId).filter(Boolean))];
  const faltamNome = donos.filter((id) => !NOME_CLOSER[id]);
  const nomesHub = faltamNome.length ? await getOwnerNames(faltamNome).catch(() => ({})) : {};
  const ticketsById = Object.fromEntries(
    tickets.map((t) => [t.id, { ...t, donoNome: NOME_CLOSER[t.ownerId] || nomesHub[t.ownerId] || "" }])
  );

  // Segue o mesmo recorte do resto da tela, senão o número briga com a lista.
  const atrasadas = doFarmer.filter((p) => p.atrasada && p.status !== "aguardando").length;

  return (
    <div className="wrap">
      <div className="top">
        <div className="brand">
          <img className="logo" src="/logo-psa.png" alt="PSA" />
          <div className="divider" />
          <div>
            <div className="title">Tramitações</div>
            <div className="subtitle">
              Pendências de CS · {dayLabel(hoje)}
              {eqLider ? " · equipe " + eqLider.equipe : ""}
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
        <div className="viewtoggle">
          <Link href="/">Diário de bordo</Link>
          {gestor && <Link href="/agenda">Agenda do dia</Link>}
          {gestor && podeVerEvolucao(session.user) && <Link href="/evolucao">Evolução</Link>}
          <Link href="/tramitacoes" className="on">
            Tramitações{abertas.length ? ` (${abertas.length})` : ""}
          </Link>
          {podeConfigurar(session.user) && <Link href="/configuracoes">Configurações</Link>}
          <Link href="/ajuda">Como funciona</Link>
        </div>
        <div className="seg-toggle">
          {[["abertas", `A fazer (${abertas.length})`], ["aguardando", `Aguardando líder (${aguardando.length})`], ["todas", "Todas"]].map(
            ([v, l]) => (
              <Link
                key={v}
                href={`/tramitacoes?f=${v}${farmerSel ? `&owner=${farmerSel}` : ""}`}
                className={filtro === v ? "on" : ""}
              >
                {l}
              </Link>
            )
          )}
        </div>
      </div>

      {/* Quem está com o quê. Sem isto, o board é uma pilha sem dono. */}
      {farmersVisiveis.length > 0 && (
        <div className="bar">
          <div className="admin-controls">
            <span className="tram-tipo">Farmer</span>
            <div className="seg-toggle tram-farmers">
              <Link href={`/tramitacoes?f=${filtro}`} className={farmerSel ? "" : "on"}>
                Todos
              </Link>
              {farmersVisiveis.map((c) => (
                <Link
                  key={c.id}
                  href={`/tramitacoes?f=${filtro}&owner=${c.id}`}
                  className={farmerSel === c.id ? "on" : ""}
                >
                  {c.nome.split(" ")[0]} <b>{c.n}</b>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

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
            <div className="lab">A fazer</div>
            <div className="val">{aFazer.length}</div>
            <div className="sub">pendências na janela de prazo</div>
          </div>
          <div className="kpi">
            <div className="lab">Atrasadas</div>
            <div className="val o">{atrasadas}</div>
            <div className="sub">prazo já vencido</div>
          </div>
          <div className="kpi">
            <div className="lab">Aguardando líder</div>
            <div className="val a">{aguardando.length}</div>
            <div className="sub">marcadas, esperando confirmação</div>
          </div>
          <div className="kpi">
            <div className="lab">Tickets ativos</div>
            <div className="val">{ticketsDoRecorte.length}</div>
            <div className="sub">
              {farmerSel
                ? "do farmer selecionado"
                : eqLider
                ? "equipe " + eqLider.equipe
                : gestor
                ? "CS inteiro"
                : "seus tickets"}
            </div>
          </div>
        </div>
      )}

      {!erro && lista.length === 0 ? (
        <div className="card">
          <div className="cal-empty">
            {filtro === "abertas"
              ? "Nenhuma pendência dentro do prazo hoje."
              : filtro === "aguardando"
              ? "Nada esperando confirmação do líder."
              : "Nenhuma tramitação para mostrar."}
          </div>
        </div>
      ) : (
        <div className="kanban">
        {ETAPAS_ATIVAS.map((id) => {
          const coluna = lista.filter((p) => p.etapa === id);
          const pl = placar(coluna);
          return (
            <section className="kcol" key={id}>
              <header className="kcol-topo">
                <div className="kcol-nome">
                  <h3>{ETAPAS_TICKET[id].label}</h3>
                  <span className="kcol-n">{coluna.length}</span>
                </div>
                {/* Quantos de cada cor, para a gravidade da coluna aparecer
                    antes de alguém rolar os cards. */}
                <div className="kcol-pontos">
                  {["vermelho", "amarelo", "verde", "cinza"]
                    .filter((c) => pl[c] > 0)
                    .map((c) => (
                      <span key={c} className={"kcol-pt p-" + c}>
                        <span className={"tram-ponto p-" + c} />
                        {pl[c]}
                      </span>
                    ))}
                </div>
              </header>

              <div className="kcol-cards">
                {coluna.length === 0 ? (
                  <p className="kcol-vazia">nada aqui</p>
                ) : (
                  coluna.map((p) => (
                    <TramitacaoCard
                      key={p.ticketId + p.tipo}
                      p={p}
                      ticket={ticketsById[p.ticketId]}
                      ehGestor={gestor}
                      evolucao={evolucoes[p.ticketId + "|" + p.tipo] || null}
                      mostrarDono={!farmerSel}
                    />
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>
      )}

      <div className="evo-nota">
        <b>A régua.</b> A etapa diz a ação, e a gravidade sai da distância até o
        evento. Antes da palestra: evento em até {PRE_AMARELO} dias avisa, em
        até {PRE_VERMELHO} grita, e o caso mais grave é o evento que já passou
        com a etapa ainda de preparação. Depois da palestra, nas etapas de NPS,
        pagamento e nota, conta o tempo parado: {POS_AMARELO} dias avisa,{" "}
        {POS_VERMELHO} grita. Ticket sem data de evento fica cinza pedindo o
        dado, nunca verde. A baixa é em duas mãos — quem executa marca, o líder confirma. Devolver
        traz a pendência de volta com o prazo original, então vencida volta vencida. Contrato com
        status <b>Assinado</b> baixa a assinatura e a minuta sozinho.
      </div>
    </div>
  );
}
