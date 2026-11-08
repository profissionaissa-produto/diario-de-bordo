// Ponte entre o Diário e a régua da Sinaleira, em lib/sinaleira/.
//
// Aqui não mora regra nenhuma: as regras são as de lá, copiadas sem editar. O
// que este arquivo faz é traduzir o ticket do Diário para o formato que elas
// esperam, chamar a avaliação e devolver no formato que a tela usa.
//
// Por que existe: o Diário tinha régua própria, que media distância até o
// evento. A da Sinaleira mede marcos de cada etapa, e por isso a logística
// vence 5 dias após o ganho do negócio, não perto do evento. Dois tickets em
// Contratar Logística apareciam verdes aqui e vermelhos lá, em 05/11/2026.
import { SLA, completar } from "./sinaleira/sinaleira.ts";
import { avaliarEtapa } from "./sinaleira/relogios.ts";

// A tela pinta por nível; a régua devolve cor. São o mesmo eixo com nomes
// diferentes, e traduzir aqui evita renomear a cópia.
const NIVEL = { verde: "verde", amarelo: "amarelo", vermelho: "vermelho", cinza: "cinza" };

// Peso para ordenar. A cor manda; dentro da cor, o mais antigo primeiro, que é
// o que vinha do dia do evento na régua anterior.
const BASE = { vermelho: 3000, amarelo: 2000, verde: 1000, cinza: 0 };

const DIA = 86400000;
const emDias = (iso, hoje) =>
  !iso ? null : Math.round((Date.parse(`${String(iso).slice(0, 10)}T00:00:00Z`) - hoje) / DIA);

// O ticket do Diário tem os nomes dele; a régua espera os dela. `completar`
// preenche o resto com vazio, e vazio vira cinza na avaliação, nunca verde.
export function paraSinaleira(t) {
  return completar({
    id: String(t.id),
    subject: t.assunto || "",
    stage: String(t.etapa || ""),
    evento: t.evento || "",
    proprietario: t.ownerId ? String(t.ownerId) : null,
    onboarding: t.onboarding || "",
    statusContrato: t.statusContrato || "",
    entrouEtapa: t.entrouEtapa || "",
    logistica: t.logistica || "",
    tipoEmpresa: t.tipoEmpresa || "",
    formatoEmpresa: t.formatoEmpresa || "",
    formatoContrato: t.formatoContrato || "",
    palestranteExclusivo: t.palestranteExclusivo || "",
    palestrantePrincipal: t.palestrantePrincipal || "",
    tipoProduto: t.tipoProduto || "",
    prazoAssinatura: t.prazoAssinatura || "",
    dataAssinatura: t.dataAssinatura || "",
    prazoBriefing: t.prazoBriefing || "",
    callBriefing: t.callBriefing || "",
    entrouBriefing: t.entrouBriefing || "",
    dataFaturamento: t.dataFaturamento || "",
    dataEmissao: t.dataEmissao || "",
    prazoDespacho: t.prazoDespacho || "",
    prazoLogistica: t.prazoLogistica || "",
    ganhoNegocio: t.ganhoNegocio || "",
    pagamentoLogistica: t.pagamentoLogistica || "",
    envioCliente: t.envioCliente || "",
    envioPalestrante: t.envioPalestrante || "",
    prazoAssinaturaPalestrante: t.prazoAssinaturaPalestrante || "",
    dataAssinaturaPalestrante: t.dataAssinaturaPalestrante || "",
    anexoCliente: t.anexoCliente || "",
    anexoPalestrante: t.anexoPalestrante || "",
    reunioes: t.reunioes || [],
  });
}

// Gravidade de um ticket pela régua da Sinaleira. `hoje` em milissegundos,
// que é o que ela espera; a tela trabalha com data em texto.
export function gravidadeSinaleira(ticket, hojeMs = Date.now()) {
  const a = avaliarEtapa(paraSinaleira(ticket), hojeMs, SLA);
  const dias = emDias(ticket.evento, hojeMs);
  return {
    nivel: NIVEL[a.cor] || "cinza",
    // Dentro da mesma cor, quem está parado há mais tempo sobe. `a.dias` é a
    // conta da própria régua, então a ordem acompanha qualquer calibração.
    peso: (BASE[a.cor] || 0) + Math.min(Math.max(a.dias || 0, 0), 900),
    dias,
    // A frase vem pronta de lá quando a cor sai de relógio. Sem ela o card
    // teria que adivinhar o que o número significa.
    motivo: a.texto || a.etapa || "",
    // O nome da etapa como a Sinaleira o escreve. Vem separado porque é ele
    // que o `motivo` usa de reserva quando não há frase: quem quiser mostrar
    // só o que acrescenta informação compara os dois e cala quando são iguais.
    etapaSinaleira: a.etapa || "",
    vence: a.vence || "",
  };
}

export { SLA };
