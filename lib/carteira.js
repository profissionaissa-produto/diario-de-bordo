// Carteira do farmer: empresas onde ele é proprietário no HubSpot.
// Aqui não há rede — recebe as empresas já lidas e devolve a lista do dia,
// para a regra poder ser conferida sem depender do CRM.
//
// As regras seguem o diário de bordo dos farmers já em produção
// (github.com/leandrobengochea-boop/farmers-dashboard), estudado para não
// reimplementar no escuro: mesmas fronteiras, mesmas cotas, mesma ordem.

// Como o farmer vai abordar a empresa. Escolher isso é a decisão da manhã:
// não há padrão preenchido, senão o dia começa no automático.
export const ABORDAGENS = [
  "OFERTA PARA REATIVAÇÃO",
  "REUNIÃO DE RELACIONAMENTO",
  "AGENDAR PSA FIRST",
  "ABERTURA - BUSCAR OPORTUNIDADE",
  "PRIMEIRO CONTATO",
  "ACOMPANHAMENTO DE TRAMITAÇÃO",
  "CONTATO PÓS-EVENTO",
];

// O que cada abordagem quer conseguir. Existe para a mensagem gerada saber a
// que ela serve: sem isto o modelo lê só o rótulo e escreve genérico.
// ponytail: primeira redação, escrita a partir do nome de cada uma. Quem toca
// o processo tem que revisar, é texto que define o que o cliente recebe.
export const OBJETIVO_ABORDAGEM = {
  "OFERTA PARA REATIVAÇÃO": "trazer de volta um cliente parado, com uma proposta concreta de novo evento",
  "REUNIÃO DE RELACIONAMENTO": "marcar uma conversa sem pauta de venda, para entender o momento da empresa",
  "AGENDAR PSA FIRST": "agendar a participação da empresa no PSA First",
  "ABERTURA - BUSCAR OPORTUNIDADE": "descobrir se existe evento ou demanda no radar da empresa",
  "PRIMEIRO CONTATO": "se apresentar e entender como a empresa costuma contratar palestrante",
  "ACOMPANHAMENTO DE TRAMITAÇÃO": "destravar a logística pendente de um evento já contratado",
  "CONTATO PÓS-EVENTO": "colher a percepção sobre o evento que aconteceu e abrir o próximo",
};

// O que aconteceu, registrado no fim do dia.
export const RESULTADOS = [
  { key: "efetivo", label: "Contato efetivo", cls: "ok" },
  { key: "tentativa", label: "Tentei, sem sucesso", cls: "meio" },
  { key: "nao_abordei", label: "Não abordei", cls: "nao" },
  // Não é resultado de abordagem: é dizer que a empresa não deveria estar
  // nesta carteira.
  { key: "trocar_segmento", label: "Trocar de segmento", cls: "troca" },
];

export const MINIMO_OBSERVACAO = 50;

// Texto é exigido onde o CRM não tem a resposta. Em tentativa não se pede: a
// ligação registrada já é a evidência.
export const EXIGE_OBSERVACAO = ["efetivo", "nao_abordei", "trocar_segmento"];

// "Trocar de segmento" fica fora do placar de efetividade — era marcando
// contato efetivo que a empresa indesejada sumia da lista, e isso inflava o
// número de todo mundo.
export const FORA_DO_PLACAR = ["trocar_segmento"];

// Fronteiras em meses desde a última contratação.
export const LIMITE_MESES = { entreEventos: 3, nutricao: 8, recompra: 12 };

// "extra" é o balde Entre eventos: entra fora da conta das 20.
export const BALDES = {
  extra: { label: "Entre eventos", faixa: "até 3 meses" },
  nutricao: { label: "Nutrição", faixa: "3 a 8 meses" },
  recompra: { label: "Recompra", faixa: "8 a 12 meses" },
  reativacao: { label: "Reativação", faixa: "mais de 12 meses" },
  primeiro_contato: { label: "Primeiro contato", faixa: "nunca contratou" },
};

// Pareto: poucas quentes, muitas frias.
export const COTA_DIARIA = { recompra: 5, nutricao: 3, reativacao: 12, extra: 3 };
export const EMPRESAS_DO_DIA =
  COTA_DIARIA.recompra + COTA_DIARIA.nutricao + COTA_DIARIA.reativacao;

// Balde seco não encolhe o dia: as vagas vão para os outros nesta ordem.
const CASCATA = ["reativacao", "nutricao", "recompra", "primeiro_contato"];

// Quantos dias a empresa descansa antes de voltar, conforme o que aconteceu.
export const COOLDOWN_POR_RESULTADO = {
  nao_abordei: 1, // não foi tocada: volta amanhã, não pode evaporar
  tentativa: 3, // ninguém fala com decisor na primeira ligação
  efetivo: 30, // a conversa aconteceu; o follow-up vive no negócio
  trocar_segmento: 30, // rede de segurança: quem segura é o pedido em aberto
};
// Dia sem fechamento é tratado como não abordada — senão bastaria não fechar
// o dia para a lista sumir.
export const COOLDOWN_SEM_RESULTADO = 1;

// Três "não atendeu" seguidos normalmente é dado velho ou porta que não abre
// sozinha, não falta de esforço. A empresa NÃO sai do rodízio.
export const TENTATIVAS_ATE_AUXILIO = 3;

const menosMeses = (iso, meses) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - meses);
  return d.toISOString().slice(0, 10);
};

export function diasEntre(de, ate) {
  const a = new Date(`${de}T12:00:00Z`).getTime();
  const b = new Date(`${ate}T12:00:00Z`).getTime();
  return Math.round((b - a) / 86400000);
}

// Classifica pelo tempo desde a última contratação. Comparação de texto: as
// datas vêm como YYYY-MM-DD e a ordem alfabética é a cronológica.
export function classifica(ultimaCompra, hoje) {
  if (!ultimaCompra) return { balde: "primeiro_contato", dias: null };
  const dias = diasEntre(ultimaCompra, hoje);
  if (ultimaCompra > menosMeses(hoje, LIMITE_MESES.entreEventos)) return { balde: "extra", dias };
  if (ultimaCompra <= menosMeses(hoje, LIMITE_MESES.recompra)) return { balde: "reativacao", dias };
  if (ultimaCompra <= menosMeses(hoje, LIMITE_MESES.nutricao)) return { balde: "recompra", dias };
  return { balde: "nutricao", dias };
}

// Descanso conforme o último resultado registrado.
export function emDescanso(hist, hoje) {
  if (!hist?.ultimaData) return false;
  const exigido = hist.ultimoResultado
    ? COOLDOWN_POR_RESULTADO[hist.ultimoResultado] ?? COOLDOWN_SEM_RESULTADO
    : COOLDOWN_SEM_RESULTADO;
  return diasEntre(hist.ultimaData, hoje) < exigido;
}

export const precisaAuxilio = (hist) => (hist?.tentativasSeguidas ?? 0) >= TENTATIVAS_ATE_AUXILIO;

// Ordem dentro do balde:
// - recompra e nutrição: mais perto de estourar a janela primeiro (compra mais antiga)
// - reativação e extra: a mais morna primeiro (compra mais recente)
// Desempate sempre por quem está há mais tempo sem contato efetivo.
function ordena(balde, a, b) {
  if (balde === "recompra" || balde === "nutricao") {
    const d = (a.ultimaCompra ?? "").localeCompare(b.ultimaCompra ?? "");
    if (d !== 0) return d;
  }
  if (balde === "reativacao" || balde === "extra") {
    const d = (b.ultimaCompra ?? "").localeCompare(a.ultimaCompra ?? "");
    if (d !== 0) return d;
  }
  return (a.ultimoContato ?? "").localeCompare(b.ultimoContato ?? "");
}

// A lista do dia: 20 do compromisso mais os extras.
//   empresas: [{ id, nome, ultimaCompra, ultimoContato, noFunil }]
//   historico: Map id -> { ultimaData, ultimoResultado, tentativasSeguidas, aparicoes }
//   trocando: Set de ids com pedido de troca de segmento em aberto
export function montaListaDoDia(empresas, hoje, historico = new Map(), trocando = new Set()) {
  const comBalde = empresas.map((e) => ({ ...e, ...classifica(e.ultimaCompra, hoje) }));

  // Empresa com negócio aberto já está sendo trabalhada e ocuparia vaga à toa.
  // Empresa com troca de segmento em aberto é o problema, não a tarefa.
  const disponiveis = comBalde.filter(
    (e) => !emDescanso(historico.get(String(e.id)), hoje) && !e.noFunil && !trocando.has(String(e.id))
  );

  const pools = {};
  for (const b of Object.keys(BALDES)) {
    pools[b] = disponiveis
      .filter((e) => e.balde === b)
      // Quem pediu auxílio vai na frente do próprio balde: de nada adianta
      // marcar a empresa se ela não entrar na lista do dia.
      .sort((x, y) => {
        const ax = precisaAuxilio(historico.get(String(x.id))) ? 0 : 1;
        const ay = precisaAuxilio(historico.get(String(y.id))) ? 0 : 1;
        return ax - ay || ordena(b, x, y);
      });
  }

  const escolhidas = [];
  const usados = new Set();
  const puxa = (balde, quantidade) => {
    let pegos = 0;
    for (const e of pools[balde] || []) {
      if (pegos >= quantidade) break;
      if (usados.has(e.id)) continue;
      usados.add(e.id);
      escolhidas.push({ ...e, extra: balde === "extra" });
      pegos++;
    }
    return pegos;
  };

  for (const balde of ["recompra", "nutricao", "reativacao"]) puxa(balde, COTA_DIARIA[balde]);

  for (const balde of CASCATA) {
    const falta = EMPRESAS_DO_DIA - escolhidas.length;
    if (falta <= 0) break;
    puxa(balde, falta);
  }

  // Extras entram por último e ficam fora da conta das 20.
  puxa("extra", COTA_DIARIA.extra);

  return escolhidas;
}

// Histórico por empresa, a partir dos dias anteriores já registrados.
// Espera as linhas ordenadas por empresa e data decrescente.
export function montaHistorico(linhas) {
  const mapa = new Map();
  for (const l of linhas) {
    const atual = mapa.get(l.companyId);
    if (!atual) {
      mapa.set(l.companyId, {
        companyId: l.companyId,
        ultimaData: l.data,
        ultimoResultado: l.resultado ?? null,
        tentativasSeguidas: l.resultado === "tentativa" ? 1 : 0,
        aparicoes: 1,
      });
      continue;
    }
    atual.aparicoes++;
    // Só conta a sequência enquanto ela não for interrompida por outro resultado.
    if (l.resultado === "tentativa" && atual.tentativasSeguidas === atual.aparicoes - 1) {
      atual.tentativasSeguidas++;
    }
  }
  return mapa;
}

// Situação do dia, derivada do que foi preenchido — não há status guardado
// para sair do ar com o que a tela mostra.
export function situacaoDoDia(itens) {
  if (!itens || itens.length === 0) return { chave: "sem_lista", label: "Sem lista" };
  const comAbordagem = itens.filter((e) => e.abordagem).length;
  // Trocar de segmento não é abordagem, mas é registro: conta como fechada.
  const comResultado = itens.filter((e) => e.resultado).length;
  if (comResultado === itens.length) return { chave: "fechado", label: "Dia fechado" };
  if (comAbordagem === itens.length) return { chave: "iniciado", label: "Dia iniciado" };
  if (comAbordagem > 0) return { chave: "mapeando", label: "Mapeando" };
  return { chave: "nao_iniciado", label: "Não iniciado" };
}

// Placar do dia: trocas de segmento ficam de fora, e extras também — as
// quatro faixas precisam somar exatamente o compromisso.
export function placarDoDia(itens) {
  const doCompromisso = (itens || []).filter((e) => !e.extra && !FORA_DO_PLACAR.includes(e.resultado));
  const conta = (k) => doCompromisso.filter((e) => e.resultado === k).length;
  const total = doCompromisso.length;
  return {
    total,
    efetivo: conta("efetivo"),
    tentativa: conta("tentativa"),
    nao_abordei: conta("nao_abordei"),
    sem_registro: doCompromisso.filter((e) => !e.resultado).length,
    trocas: (itens || []).filter((e) => e.resultado === "trocar_segmento").length,
    // Efetivo sobre o compromisso, não sobre o que foi preenchido.
    pct: total ? Math.round((conta("efetivo") / total) * 100) : 0,
  };
}
