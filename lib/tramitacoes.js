// Tramitação: o que está pendente em cada evento já vendido, e quão grave é.
//
// O funil de CS foi reestruturado em 06/10/2026 e as etapas passaram a ter
// nome de ação: Contratar Logística, Assinar Contrato, Faturar, Realizar
// Briefing. Isso muda o modelo inteiro. Antes a pendência era deduzida de
// datas soltas do ticket; agora a própria etapa diz o que falta fazer.
//
// Os ids e rótulos vêm da Sinaleira (painel-tramitacao), que é quem acompanha
// o funil de perto. Etapa que existe no HubSpot e falta aqui some da tela sem
// avisar: foi o que aconteceu com as cinco etapas antigas, e 185 tickets
// ficaram invisíveis no Diário.
//
// Nada aqui toca rede: recebe o ticket já lido e devolve o que está pendente,
// para a regra poder ser conferida sem depender do CRM.

export const PIPELINE_CS = "748675953";

// Como a tramitação evoluiu no dia. "Travado" exige explicação: é o que mostra
// ao líder o que depende de terceiro — cliente, jurídico, palestrante — e não
// de esforço do farmer.
export const RESULTADOS_TRAMITACAO = [
  { key: "resolvi", label: "Resolvi", cls: "ok" },
  { key: "avancei", label: "Avancei", cls: "meio" },
  { key: "travado", label: "Travado", cls: "nao" },
];
export const TRAMITACAO_EXIGE_OBSERVACAO = ["travado"];

// `fase` separa o que ainda dá para preparar do que só existe depois da
// palestra. É o que decide como a gravidade é medida: antes do evento conta o
// tempo que falta; depois, o tempo que já passou.
export const ETAPAS_TICKET = {
  "1450325173": { label: "Contratar logística", ordem: 1, fase: "pre" },
  "1450325174": { label: "Assinar contrato", ordem: 2, fase: "pre" },
  "1450683393": { label: "Faturar", ordem: 3, fase: "pre" },
  "1450325175": { label: "Realizar briefing", ordem: 4, fase: "pre" },
  "1452885000": { label: "Confirmar pagamento pré-palestra", ordem: 5, fase: "pre" },
  "1448673032": { label: "Aguardando evento", ordem: 6, fase: "espera" },
  "1451268423": { label: "Coletar NPS e fotos", ordem: 7, fase: "pos" },
  "1088361911": { label: "Confirmar pagamento pós-palestra", ordem: 8, fase: "pos" },
  "1333136740": { label: "Solicitar NF do palestrante", ordem: 9, fase: "pos" },
};

export const ETAPAS_ATIVAS = Object.keys(ETAPAS_TICKET);
export const ETAPAS_TRAMITACAO = ETAPAS_ATIVAS;

// Fora do board por decisão do CS: não é etapa de atuação do farmer e não tem
// prazo acordado. Fica nomeada para um ticket que mude de etapa com a tela
// aberta não aparecer como desconhecido.
export const FORA_DO_BOARD = { "1088360203": "Etapa de conferência" };

export const ETAPAS_POS_EVENTO = ETAPAS_ATIVAS.filter((id) => ETAPAS_TICKET[id].fase === "pos");

export const etapaDe = (id) => ETAPAS_TICKET[String(id)] || null;
export const labelDaEtapa = (id) => etapaDe(id)?.label || FORA_DO_BOARD[String(id)] || "";

// ponytail: régua de calibração, proposta nossa e não regra medida com o CS.
// Mexer nestes números não exige mexer no cálculo — o check cobre as bordas.
//
// Antes do evento a conta é quanto falta: a dias do evento com a logística
// ainda por contratar é o caso que não pode passar batido.
export const PRE_VERMELHO = 3;
export const PRE_AMARELO = 7;
// Depois do evento a conta é quanto já passou parado.
export const POS_VERMELHO = 30;
export const POS_AMARELO = 15;

const DIA = 86400000;
const asDate = (s) => new Date(String(s).slice(0, 10) + "T12:00:00");
export const diasEntre = (de, ate) => Math.round((asDate(ate) - asDate(de)) / DIA);

export function somaDias(data, n) {
  const d = asDate(data);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Gravidade de um ticket hoje. Devolve sempre um objeto: cinza com motivo é
// resposta válida, e é melhor do que verde por ausência de dado.
//
// `nivel` serve para pintar; `peso` serve para ordenar. Peso maior sobe.
export function gravidade(ticket, hoje) {
  const etapa = etapaDe(ticket.etapa);
  if (!etapa) {
    return { nivel: "cinza", peso: 0, dias: null, motivo: "Etapa fora do board" };
  }

  if (!ticket.evento) {
    // Sem data não dá para medir. Cinza pedindo o dado, nunca verde: verde
    // aqui diria "está tudo bem" sobre algo que ninguém conferiu.
    return { nivel: "cinza", peso: 10, dias: null, motivo: "Sem data de evento no ticket" };
  }

  const dias = diasEntre(hoje, ticket.evento);

  // O evento já aconteceu e o ticket continua numa etapa de preparação. É o
  // caso mais grave do board: a ação perdeu a data e segue aberta.
  if (etapa.fase === "pre" && dias < 0) {
    return {
      nivel: "vermelho",
      peso: 1000 + Math.min(-dias, 365),
      dias,
      motivo: `Evento foi há ${-dias} dia${-dias === 1 ? "" : "s"} e a etapa ainda é de preparação`,
    };
  }

  if (etapa.fase === "pre") {
    if (dias <= PRE_VERMELHO) {
      return {
        nivel: "vermelho",
        peso: 900 - dias,
        dias,
        motivo: dias === 0 ? "Evento é hoje" : `Evento em ${dias} dia${dias === 1 ? "" : "s"}`,
      };
    }
    if (dias <= PRE_AMARELO) {
      return { nivel: "amarelo", peso: 800 - dias, dias, motivo: `Evento em ${dias} dias` };
    }
    return { nivel: "verde", peso: 500 - Math.min(dias, 365), dias, motivo: `Evento em ${dias} dias` };
  }

  // Aguardando evento: não há o que cobrar antes da data. Depois dela, o
  // ticket devia ter andado, e passa a contar como parado.
  if (etapa.fase === "espera") {
    if (dias >= 0) return { nivel: "verde", peso: 100, dias, motivo: `Evento em ${dias} dias` };
    const parado = -dias;
    if (parado > POS_AMARELO) {
      return { nivel: "vermelho", peso: 1000 + parado, dias, motivo: `Evento foi há ${parado} dias e o ticket não saiu da espera` };
    }
    return { nivel: "amarelo", peso: 700 + parado, dias, motivo: `Evento foi há ${parado} dia${parado === 1 ? "" : "s"}` };
  }

  // Pós-evento: a ação é justamente depois da palestra, então o relógio só
  // começa na data dela. Antes disso não há atraso nenhum.
  const parado = -dias;
  if (parado < 0) return { nivel: "verde", peso: 50, dias, motivo: "Evento ainda não aconteceu" };
  if (parado >= POS_VERMELHO) {
    return { nivel: "vermelho", peso: 600 + parado, dias, motivo: `${parado} dias desde o evento` };
  }
  if (parado >= POS_AMARELO) {
    return { nivel: "amarelo", peso: 400 + parado, dias, motivo: `${parado} dias desde o evento` };
  }
  return { nivel: "verde", peso: 200 + parado, dias, motivo: `${parado} dia${parado === 1 ? "" : "s"} desde o evento` };
}

// A pendência de um ticket é a própria etapa em que ele está. Devolve null
// para etapa fora do board, e para a que o líder já baixou.
export function pendenciaDoTicket(ticket, hoje, registros = {}) {
  const etapa = etapaDe(ticket.etapa);
  if (!etapa) return null;

  const reg = registros[`${ticket.id}|${ticket.etapa}`] || null;
  // Baixada pelo líder não sai do board: ela afunda. Sumir faria o farmer ver
  // menos tickets do que tem na mão, que foi o defeito da versão anterior.
  const g =
    reg?.status === "confirmado"
      ? { nivel: "cinza", peso: 1, dias: null, motivo: `Baixada por ${reg.decididoPor || reg.marcadoPor || "alguém"}` }
      : gravidade(ticket, hoje);
  return {
    ticketId: ticket.id,
    etapa: ticket.etapa,
    tipo: ticket.etapa,
    label: etapa.label,
    fase: etapa.fase,
    ordem: etapa.ordem,
    evento: ticket.evento || null,
    dias: g.dias,
    nivel: g.nivel,
    peso: g.peso,
    motivo: g.motivo,
    atrasada: g.nivel === "vermelho",
    eventoPassado: g.dias !== null && g.dias < 0,
    status: reg?.status || "aberta",
    marcadoPor: reg?.marcadoPor || "",
    decididoPor: reg?.decididoPor || "",
    motivoDecisao: reg?.motivo || "",
  };
}

// O board inteiro, do mais grave para o menos. Empate de peso desempata pela
// ordem da etapa no funil, para dois casos iguais não dançarem entre recargas.
export function pendenciasDosTickets(tickets, hoje, registros = {}) {
  return tickets
    .map((t) => pendenciaDoTicket(t, hoje, registros))
    .filter(Boolean)
    .sort((a, b) => b.peso - a.peso || a.ordem - b.ordem || String(a.ticketId).localeCompare(String(b.ticketId)));
}

// Agrupa por dono, para a tela do líder. A ordem dentro de cada dono é a
// mesma do board.
export function agrupaPorDono(pendencias, ticketsById) {
  const porDono = {};
  for (const p of pendencias) {
    const dono = ticketsById[p.ticketId]?.ownerId || "sem-dono";
    (porDono[dono] ||= []).push(p);
  }
  return porDono;
}

// Quantos em cada nível, para o cabeçalho dizer o tamanho do problema antes
// de a pessoa rolar a lista.
export function placar(pendencias) {
  const out = { vermelho: 0, amarelo: 0, verde: 0, cinza: 0, total: pendencias.length };
  for (const p of pendencias) out[p.nivel]++;
  return out;
}
