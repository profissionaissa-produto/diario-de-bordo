// As tramitações de um dia, prontas para a tela.
//
// Existe porque duas telas pedem a mesma coisa: a página de Tramitações e a
// do farmer, que passou a mostrar a lista dele junto do levantamento de
// demanda. Duplicar a leitura garantiria que uma das duas ficasse para trás
// numa mudança de regra.
import { getTicketsCS, ganhoDosTickets } from "./hubspot";
import { getTramitacoes, getEvolucaoTramitacoes } from "./db";
import {
  PIPELINE_CS,
  ETAPAS_TRAMITACAO,
  ETAPA_LOGISTICA,
  pendenciasDosTickets,
} from "./tramitacoes";

// `donos` é um Set de ownerId, ou null para não filtrar.
export async function tramitacoesDoDia(dia, donos = null) {
  let tickets = [];
  let erro = null;

  try {
    tickets = await getTicketsCS(PIPELINE_CS, ETAPAS_TRAMITACAO);

    // Só o que ainda dá para preparar. Decisão do CS em 10/11/2026: evento que
    // já aconteceu sai da tramitação do farmer, mesmo com o ticket aberto.
    //
    // O filtro entra aqui, antes de tudo, para a contagem e a lista saírem do
    // mesmo conjunto. Filtrar só na hora de desenhar foi o que fez o board
    // dizer 47 e listar 25.
    //
    // Ticket sem data de evento fica: some quem tem data no passado, não quem
    // está com o campo em branco, que é problema a resolver e não caso
    // encerrado.
    tickets = tickets.filter((t) => !t.evento || String(t.evento).slice(0, 10) >= dia);
    if (donos) tickets = tickets.filter((t) => donos.has(String(t.ownerId)));

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
    tickets = [];
  }

  const ids = tickets.map((t) => t.id);
  const [registros, evolucoes] = await Promise.all([
    getTramitacoes(ids),
    getEvolucaoTramitacoes(ids, dia),
  ]);

  return {
    tickets,
    registros,
    evolucoes,
    erro,
    // Já vem ordenado pela gravidade: o mais grave em cima, de todas as etapas
    // juntas, que é a ordem que a lista usa.
    pendencias: pendenciasDosTickets(tickets, dia, registros),
  };
}
