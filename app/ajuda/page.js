import { redirect } from "next/navigation";
import Link from "next/link";
import { auth, signOut } from "../../auth";
import {
  BALDES, COTA_DIARIA, EMPRESAS_DO_DIA, ABORDAGENS, RESULTADOS,
  COOLDOWN_POR_RESULTADO, COOLDOWN_SEM_RESULTADO, TENTATIVAS_ATE_AUXILIO,
  MINIMO_OBSERVACAO, EXIGE_OBSERVACAO, FORA_DO_PLACAR,
} from "../../lib/carteira";
import { RESULTADOS_TRAMITACAO, ETAPAS_TICKET, ETAPAS_ATIVAS } from "../../lib/tramitacoes";
import { MINIMO_REUNIOES } from "../../lib/relacionamento";

export const dynamic = "force-dynamic";

// As regras do diário, lidas do próprio código. Afinar um número no lugar
// certo atualiza este texto junto — o que evita a página envelhecer sozinha.
export default async function Ajuda() {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");
  const userName = session.user.name || session.user.email;

  const rotulo = (k) => RESULTADOS.find((r) => r.key === k)?.label || k;

  return (
    <div className="wrap">
      <div className="top">
        <div className="brand">
          <img className="logo" src="/logo-psa.png" alt="PSA" />
          <div className="divider" />
          <div>
            <div className="title">Como funciona</div>
            <div className="subtitle">As regras do diário, lidas do próprio sistema</div>
          </div>
        </div>
        <div className="who">
          <div className="who-name">{userName}</div>
          <form action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}>
            <button className="signout" type="submit">Sair</button>
          </form>
        </div>
      </div>

      <div className="viewbar">
        <div className="viewtoggle">
          <Link href="/">Diário de bordo</Link>
          <Link href="/tramitacoes">Tramitações</Link>
          <Link href="/financeiro">Financeiro</Link>
          <Link href="/ajuda" className="on">Como funciona</Link>
        </div>
      </div>

      <div className="ajuda">
        <section className="card ajuda-bloco">
          <h2>Para que serve</h2>
          <p>
            O dia começa decidido. Em vez de abrir o CRM e escolher por intuição quem procurar, você
            recebe de manhã uma lista de <b>{EMPRESAS_DO_DIA} empresas</b> da própria carteira,
            escolhidas pelo tempo desde a última contratação, define como vai abordar cada uma e, no
            fim do dia, registra o que conseguiu. A lista é montada uma vez por dia e congela:
            atualizar a página não embaralha nada.
          </p>
        </section>

        <section className="card ajuda-bloco">
          <h2>As fases da carteira</h2>
          <table className="ajuda-tab">
            <thead>
              <tr><th>Fase</th><th>Desde a última compra</th><th>O que significa</th></tr>
            </thead>
            <tbody>
              {Object.entries(BALDES).map(([k, b]) => (
                <tr key={k}>
                  <td><b>{b.label}</b></td>
                  <td>{b.faixa}</td>
                  <td>{DESCRICAO[k]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="card ajuda-bloco">
          <h2>Como as empresas do dia são escolhidas</h2>
          <p>
            Poucas quentes, muitas frias: <b>{COTA_DIARIA.recompra} de recompra</b>,{" "}
            <b>{COTA_DIARIA.nutricao} de nutrição</b> e <b>{COTA_DIARIA.reativacao} de reativação</b>,
            somando as {EMPRESAS_DO_DIA} do compromisso, mais <b>{COTA_DIARIA.extra} extras</b> de
            entre eventos, fora da conta.
          </p>
          <p>
            Dentro de cada fase a ordem tem lógica: em recompra e nutrição vem primeiro quem está
            mais perto de estourar a janela; em reativação, a mais morna. Empate se resolve por quem
            está há mais tempo sem contato efetivo. Se uma fase não tem empresas suficientes, as
            vagas são completadas pelas outras — por isso o número não cai quando um balde seca.
          </p>
          <p className="ajuda-nota">
            Empresa com negócio aberto seu fica de fora: já está sendo trabalhada e ocuparia uma vaga
            à toa. Empresa faltando ou sobrando na lista quase sempre é proprietário errado no
            HubSpot — corrigir lá corrige aqui no dia seguinte.
          </p>
        </section>

        <section className="card ajuda-bloco">
          <h2>O ciclo do dia</h2>
          <p>De manhã, escolha a abordagem de cada empresa. Não existe escolher quais atacar: a lista inteira é o compromisso.</p>
          <ul className="ajuda-lista">
            {ABORDAGENS.map((a) => <li key={a}>{a}</li>)}
          </ul>
          <p>No fim do dia, registre o que aconteceu:</p>
          <ul className="ajuda-lista">
            {RESULTADOS.map((r) => (
              <li key={r.key}>
                <b>{r.label}</b>
                {EXIGE_OBSERVACAO.includes(r.key)
                  ? ` — observação obrigatória, mínimo ${MINIMO_OBSERVACAO} caracteres`
                  : " — a atividade registrada no CRM já é a evidência"}
                {FORA_DO_PLACAR.includes(r.key) ? " · fica fora do placar" : ""}
              </li>
            ))}
          </ul>
          <p className="ajuda-nota">
            O fechamento é conferência, não digitação: o diário lê o que você já registrou hoje no
            HubSpot e propõe o resultado. Ligação conectada ou reunião realizada viram contato
            efetivo; ligação sem resposta, e-mail ou nota viram tentativa. O que você marcar à mão
            nunca é sobrescrito.
          </p>
        </section>

        <section className="card ajuda-bloco">
          <h2>Quando a empresa volta para a lista</h2>
          <table className="ajuda-tab">
            <tbody>
              {Object.entries(COOLDOWN_POR_RESULTADO).map(([k, dias]) => (
                <tr key={k}>
                  <td><b>{rotulo(k)}</b></td>
                  <td>volta depois de {dias} dia{dias === 1 ? "" : "s"}</td>
                </tr>
              ))}
              <tr>
                <td><b>Dia não fechado</b></td>
                <td>
                  volta depois de {COOLDOWN_SEM_RESULTADO} dia — sem resultado registrado, o sistema
                  assume que a empresa não foi abordada
                </td>
              </tr>
            </tbody>
          </table>
          <p className="ajuda-nota">
            Trocar de segmento não volta enquanto o líder não decidir: ele troca no HubSpot ou
            devolve a empresa ao rodízio.
          </p>
        </section>

        <section className="card ajuda-bloco">
          <h2>Auxílio do líder e selo de relacionamento</h2>
          <p>
            Depois de <b>{TENTATIVAS_ATE_AUXILIO} tentativas seguidas</b> sem contato, a empresa
            ganha o selo de auxílio e passa a ir na frente da própria fase — ela continua na lista,
            porque tirá-la seria premiar a porta fechada. O líder responde com uma orientação, que
            aparece no card assinada. O selo some sozinho quando um contato efetivo zera a sequência.
          </p>
          <p>
            O selo de <b>relacionamento</b> aparece onde você registrou negócio e realizou mais de{" "}
            {MINIMO_REUNIOES - 1} reunião de relacionamento com a empresa. Conta só o que foi feito
            por você: herdar uma carteira não herda o relacionamento de quem veio antes.
          </p>
        </section>

        <section className="card ajuda-bloco">
          <h2>Tramitações</h2>
          <table className="ajuda-tab">
            <thead>
              <tr><th>Etapa</th><th>Quando fica grave</th></tr>
            </thead>
            <tbody>
              {ETAPAS_ATIVAS.map((id) => (
                <tr key={id}>
                  <td><b>{ETAPAS_TICKET[id].label}</b></td>
                  <td>
                    {ETAPAS_TICKET[id].fase === "pre"
                      ? "marco próprio da etapa, e evento que já passou com ela aberta é o caso mais grave"
                      : ETAPAS_TICKET[id].fase === "espera"
                        ? "tranquila até a data do evento; depois dela, parada"
                        : "o prazo começa na data do evento"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>
            No fim do dia, cada tramitação recebe{" "}
            {RESULTADOS_TRAMITACAO.map((r) => r.label).join(", ")}. Travado exige observação: é o que
            mostra ao líder o que depende de terceiro e não de você.
          </p>
          <p className="ajuda-nota">
            A lista sai dos tickets abertos onde você é o proprietário, no funil de
            CS, nas {ETAPAS_ATIVAS.length} etapas de atuação. A ordem é por
            gravidade, não por data de entrada: o que já passou do evento e
            continua aberto vem primeiro. Feriado não é considerado. Negar
            devolve a pendência, e vencida volta vencida.
          </p>
        </section>
      </div>
    </div>
  );
}

const DESCRICAO = {
  extra: "Comprou há pouco. A conversa é o próximo evento do calendário, não uma venda do zero.",
  nutricao: "Cedo para recompra, tarde para pós-evento. Mantém a relação viva até a janela abrir.",
  recompra: "Janela quente: a empresa está no ciclo de contratar de novo.",
  reativacao: "Passou do ciclo. Precisa de um motivo novo para voltar à mesa.",
  primeiro_contato: "Está na carteira mas nunca comprou. Entra quando os outros baldes não bastam.",
};
