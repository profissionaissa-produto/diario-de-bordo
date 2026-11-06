import { redirect } from "next/navigation";
import Avatar from "../Avatar";
import Link from "next/link";
import { auth, signOut } from "../../auth";
import { getTicketsCS, getOwnerByEmail, getOwnerNames, ganhoDosTickets } from "../../lib/hubspot";
import { getTramitacoes, getEvolucaoTramitacoes, dbReady } from "../../lib/db";
import { dayKey, dayLabel } from "../../lib/week";
import { NOME_CLOSER, closersDe, SEG_TRAMITACOES, EQUIPES_DE, semEquipe } from "../../lib/config";
import { ehGestor, podeVerTramitacoes, equipeLiderada, podeVerEvolucao, podeConfigurar } from "../../lib/permissoes";
import { PIPELINE_CS, ETAPAS_TRAMITACAO, ETAPA_LOGISTICA, ETAPAS_ATIVAS, ETAPAS_TICKET, pendenciasDosTickets, placar, PRE_VERMELHO, PRE_AMARELO, POS_VERMELHO, POS_AMARELO } from "../../lib/tramitacoes";
import TramitacaoCard from "../TramitacaoCard";
import AdminBar from "../AdminBar";
import { listarEstrategias, listarOcultas } from "../../lib/db";
import { montaEstrategias, semOcultas } from "../../lib/estrategias";

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
    // A aquisição da logística vence 5 dias após o ganho do negócio, não perto
    // do evento. Sem esta data o relógio fica cinza dizendo que não há de onde
    // contar, então ela é buscada, mas só para os tickets dessa etapa.
    const naLogistica = tickets.filter((t) => t.etapa === ETAPA_LOGISTICA);
    if (naLogistica.length) {
      const ganho = await ganhoDosTickets(naLogistica.map((t) => t.id)).catch((e) => {
        console.error("[tramitacoes] data de ganho do negócio não carregou:", e?.message);
        return {};
      });
      for (const t of naLogistica) t.ganhoNegocio = ganho[t.id] || "";
    }
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

  // A estratégia do registro é a mesma lista que a curadoria cadastra em
  // Configurações, no segmento Farmer. Não é uma lista própria daqui.
  const [registros, evolucoes, estrategiasFarmer] = await Promise.all([
    getTramitacoes(tickets.map((t) => t.id)),
    getEvolucaoTramitacoes(tickets.map((t) => t.id), hoje),
    (async () =>
      semOcultas(montaEstrategias(await listarEstrategias()), await listarOcultas())[
        SEG_TRAMITACOES
      ] || [])(),
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
  // Equipe antes da pessoa, igual ao Diário: o líder olha a equipe dele e só
  // então desce para um farmer. Equipe travada para quem lidera uma só.
  const equipeSel = eqLider ? eqLider.equipe : searchParams?.equipe || "";
  const daEquipe = equipeSel
    ? new Set(closersDe(SEG_TRAMITACOES, equipeSel).map((c) => String(c.id)))
    : null;
  const noRecorte = daEquipe ? tudo.filter((p) => daEquipe.has(donoDo(p))) : tudo;
  const doFarmer = farmerSel ? noRecorte.filter((p) => donoDo(p) === farmerSel) : noRecorte;

  const abertas = doFarmer.filter((p) => p.status !== "aguardando");
  const aguardando = doFarmer.filter((p) => p.status === "aguardando");
  // "A fazer" conta o que cobra alguém: acompanhamento não cobra nada.
  const aFazer = abertas.filter((p) => p.tipo !== "nenhuma");
  // Tickets do recorte da tela — com farmer escolhido, só os dele.
  const ticketsDoRecorte = farmerSel
    ? tickets.filter((t) => String(t.ownerId) === farmerSel)
    : daEquipe
      ? tickets.filter((t) => daEquipe.has(String(t.ownerId)))
      : tickets;
  const bruta = filtro === "aguardando" ? aguardando : filtro === "todas" ? doFarmer : abertas;

  // Nada é filtrado fora aqui. O bloco separado de evento realizado saiu
  // quando a tela virou quadro, e este filtro ficou para trás sumindo com os
  // tickets de NF e NPS, que são justamente os de evento passado: 22 dos 47
  // da Luiza não apareciam. A gravidade já os põe no topo da coluna deles.
  const lista = bruta;

  // Farmers que o usuário alcança, com a contagem ao lado do nome.
  const equipeDoFiltro = equipeSel;
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

      {/* A mesma barra do Diário: equipe e depois a pessoa. Uma fileira de
          nomes soltos não diz a quem cada um responde. */}
      {farmersVisiveis.length > 0 && (
        <AdminBar
          base="/tramitacoes"
          paramPessoa="owner"
          rotuloPessoa="farmer"
          owners={farmersVisiveis.map((c) => ({ ownerId: c.id, name: `${c.nome} (${c.n})` }))}
          selected={farmerSel}
          seg={SEG_TRAMITACOES}
          segs={[]}
          equipes={eqLider ? [] : EQUIPES_DE(SEG_TRAMITACOES)}
          equipe={equipeSel}
          semEquipe={eqLider ? 0 : semEquipe(SEG_TRAMITACOES)}
        />
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
        {ETAPAS_ATIVAS.filter((id) => lista.some((p) => p.etapa === id)).map((id) => {
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
                      estrategias={estrategiasFarmer}
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

      {/* Coluna vazia só empurra o que importa para fora da tela. Fica a
          contagem, para quem olha saber que o funil é maior do que o quadro. */}
      {!erro && lista.length > 0 && (
        (() => {
          const vazias = ETAPAS_ATIVAS.filter((id) => !lista.some((p) => p.etapa === id)).length;
          return vazias > 0 ? (
            <p className="kanban-vazias">
              {vazias} etapa{vazias === 1 ? "" : "s"} sem nada neste recorte, fora do quadro.
            </p>
          ) : null;
        })()
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
