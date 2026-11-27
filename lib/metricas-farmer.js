import "server-only";
import { hsSearch, hsConta, hsPost } from "./hubspot";
import { PIPELINE_CS, ETAPAS_ATIVAS } from "./tramitacoes";

// Regras iguais às dos outros painéis do time, para o número do diário não
// brigar com o número que eles já usam.
// De julho/26 em diante, só conta no resultado do farmer o lead com origem na
// lista ou qualificado como Farmer. Antes disso, o histórico vale inteiro.
export const ORIGIN_CUTOVER = "2026-07-01";
export const ORIGEM_DO_LEAD_OK = [
  "Ação de CRM",
  "Ação de CRM (Carteira)",
  "Carteira do Farmer",
  "CARTEIRA (Executivos em foco)",
];
export const ORIGEM_QUALIFICACAO_OK = ["Farmer"];

// Origens que contam como demanda levantada pelo farmer. É lista e não um
// valor só porque o time usa as duas: a Cadência do BDR entrou em 26/11/2026,
// e sem ela o Vitor Martini aparecia com 16 em vez de 18.
export const ORIGEM_DEMANDA = ["Farmer", "Cadência do BDR"];

// Etapas de negócio ganho.
const WON_STAGES = ["1076664462", "1076664460"];

const normaliza = (v) =>
  String(v || "").toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[^a-z0-9]/g, "_");

// "Fora do MOA" aparece em dois campos diferentes e com grafias variadas.
const foraDoMOA = (...valores) =>
  valores.some((v) => {
    const n = normaliza(v);
    return n.includes("fora") && n.includes("moa");
  });

// Filtros de data na REST do HubSpot só aceitam timestamp em milissegundos.
// Passar "2026-09-01" devolve 400, e o número zera sem ninguém perceber.
function limitesDoMes(hoje) {
  const inicio = `${hoje.slice(0, 7)}-01`;
  const d = new Date(`${inicio}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  const fim = d.toISOString().slice(0, 10);
  return {
    inicioMs: String(new Date(`${inicio}T00:00:00Z`).getTime()),
    fimMs: String(new Date(`${fim}T00:00:00Z`).getTime()),
  };
}

export async function resumoDoMes(farmerIds, hoje) {
  const vazio = {
    oportunidades: 0, ticketsAtivos: 0, receita: 0,
    carteira: 0, comContato: 0, pctContato: 0, mes: hoje.slice(0, 7),
  };
  if (!farmerIds || farmerIds.length === 0) return vazio;

  const { inicioMs, fimMs } = limitesDoMes(hoje);
  const cutoverMs = new Date(ORIGIN_CUTOVER).getTime();

  const [criados, ganhos, ticketsAtivos, carteira, comContato] = await Promise.all([
    hsSearch("deals",
      [{ filters: [
        { propertyName: "sdrfarmer_responsavel", operator: "IN", values: farmerIds },
        { propertyName: "pipedrive___data_de_qualificacao", operator: "GTE", value: inicioMs },
        { propertyName: "pipedrive___data_de_qualificacao", operator: "LT", value: fimMs },
      ] }],
      ["origem_do_lead", "origem_da_qualificacao", "closed_lost_reason",
       "motivo_de_sinalizacao_de_perda", "pipedrive___data_de_qualificacao"]
    ).catch(() => []),

    hsSearch("deals",
      [{ filters: [
        { propertyName: "sdrfarmer_responsavel", operator: "IN", values: farmerIds },
        { propertyName: "closedate", operator: "GTE", value: inicioMs },
        { propertyName: "closedate", operator: "LT", value: fimMs },
        { propertyName: "dealstage", operator: "IN", values: WON_STAGES },
      ] }],
      ["amount_in_home_currency"]
    ).catch(() => []),

    hsConta("tickets", [
      { propertyName: "hubspot_owner_id", operator: "IN", values: farmerIds },
      { propertyName: "hs_pipeline", operator: "EQ", value: PIPELINE_CS },
      { propertyName: "hs_pipeline_stage", operator: "IN", values: ETAPAS_ATIVAS },
    ]).catch(() => 0),

    hsConta("companies", [
      { propertyName: "hubspot_owner_id", operator: "IN", values: farmerIds },
    ]).catch(() => 0),

    hsConta("companies", [
      { propertyName: "hubspot_owner_id", operator: "IN", values: farmerIds },
      { propertyName: "ultimo_contato_efetivo", operator: "GTE", value: inicioMs },
    ]).catch(() => 0),
  ]);

  const oportunidades = criados.filter((d) => {
    const p = d.properties || {};
    if (foraDoMOA(p.closed_lost_reason, p.motivo_de_sinalizacao_de_perda)) return false;
    const bruto = p.pipedrive___data_de_qualificacao || "";
    const ts = /^\d{10,}$/.test(bruto) ? parseInt(bruto, 10) : new Date(bruto).getTime();
    if (ts >= cutoverMs) {
      const okLead = ORIGEM_DO_LEAD_OK.includes(p.origem_do_lead || "");
      const okQual = ORIGEM_QUALIFICACAO_OK.includes(p.origem_da_qualificacao || "");
      if (!okLead && !okQual) return false;
    }
    return true;
  }).length;

  const receita = ganhos.reduce(
    (s, d) => s + (parseFloat(d.properties?.amount_in_home_currency || "0") || 0),
    0
  );

  return {
    oportunidades,
    ticketsAtivos,
    receita,
    carteira,
    comContato,
    // Régua de cobertura: quanto da carteira foi realmente tocada no mês.
    pctContato: carteira > 0 ? Math.round((comContato / carteira) * 100) : 0,
    mes: hoje.slice(0, 7),
  };
}

// Demandas levantadas no mês, por farmer.
//
// A regra é do time: negócio com "Origem da qualificação" igual a Farmer ou
// Cadência do BDR, criado dentro do mês, e o crédito vai para quem está em
// "SDR/Farmer Responsável", não para o dono do negócio. Quem toca a venda é o
// closer; o farmer é quem levantou.
//
// Conferido em 26/11/2026 com o Vitor Martini: 18 em novembro, 16 com origem
// Farmer e 2 com Cadência do BDR. Só com a origem Farmer dava 16, e era
// justamente a diferença que ele apontou.
//
// Uma busca só para o time inteiro, não uma por pessoa: o painel abre com
// onze farmers e seriam onze idas ao HubSpot por carregamento.
export async function demandasDoMes(farmerIds, hoje) {
  const ids = [...new Set((farmerIds || []).map(String))];
  if (ids.length === 0) return {};
  const { inicioMs, fimMs } = limitesDoMes(hoje);

  const deals = await hsSearch(
    "deals",
    [
      {
        filters: [
          { propertyName: "sdrfarmer_responsavel", operator: "IN", values: ids },
          { propertyName: "origem_da_qualificacao", operator: "IN", values: ORIGEM_DEMANDA },
          { propertyName: "createdate", operator: "GTE", value: inicioMs },
          { propertyName: "createdate", operator: "LT", value: fimMs },
        ],
      },
    ],
    // Os dois campos de perda vêm junto: é por eles que se sabe se a demanda
    // foi descartada como fora do MOA.
    ["sdrfarmer_responsavel", "closed_lost_reason", "motivo_de_sinalizacao_de_perda"]
  ).catch((e) => {
    // Sem o número é melhor a tela não mostrar nada do que mostrar zero: zero
    // aqui seria lido como farmer que não levantou nada no mês.
    console.error("[agenda] falha ao contar as demandas do mês:", e?.message);
    return null;
  });
  if (!deals) return {};

  const out = {};
  const donoDoNegocio = {};
  for (const d of deals) {
    const quem = String(d.properties?.sdrfarmer_responsavel || "");
    if (!quem) continue;
    // Demanda perdida como fora do MOA não conta para ninguém: ela foi
    // descartada por não ser o perfil que a PSA atende, então não é resultado
    // do farmer. Medido em 27/11/2026: 19 das 197 de novembro, concentradas
    // no Felippe Freitas, 6, e no Juliano Marques, 4.
    if (foraDoMOA(d.properties?.closed_lost_reason, d.properties?.motivo_de_sinalizacao_de_perda)) {
      continue;
    }
    donoDoNegocio[String(d.id)] = quem;
    out[quem] = out[quem] || { demandas: 0, reunioes: 0 };
    out[quem].demandas += 1;
  }

  // Reunião realizada nesses negócios, contada só quando quem agendou é o
  // próprio farmer do negócio.
  //
  // Reunião que o closer marcou no negócio que o farmer levantou é trabalho do
  // closer, e somá-la aqui inflaria o número de quem não marcou nada. Medido
  // em 26/11/2026 nos negócios do Vitor Martini: das 8 reuniões, 7 foram
  // agendadas por ele e 1 por outra pessoa.
  //
  // "Realizada" é a reunião com desfecho Concluída. Agendada e ainda no
  // futuro não aconteceu, e sem desfecho ninguém sabe se aconteceu.
  const reunioes = await reunioesDosNegocios(Object.keys(donoDoNegocio)).catch((e) => {
    console.error("[agenda] falha ao contar as reuniões do mês:", e?.message);
    return null;
  });
  if (reunioes) {
    for (const [dealId, lista] of Object.entries(reunioes)) {
      const farmer = donoDoNegocio[dealId];
      if (!farmer || !out[farmer]) continue;
      for (const r of lista) {
        if (r.criadaPor !== farmer) continue;
        if (r.desfecho !== "COMPLETED") continue;
        out[farmer].reunioes += 1;
      }
    }
  }
  return out;
}

// As reuniões de cada negócio, com quem agendou e o desfecho.
//
// Em lote pelos dois lados: a associação de cem negócios por chamada e a
// leitura de cem reuniões por chamada. Uma ida por negócio seriam duzentas
// chamadas a cada abertura do painel.
async function reunioesDosNegocios(dealIds) {
  const ids = [...new Set((dealIds || []).map(String))];
  if (ids.length === 0) return {};

  const porNegocio = {};
  for (let i = 0; i < ids.length; i += 100) {
    const d = await hsPost("/crm/v4/associations/deals/meetings/batch/read", {
      inputs: ids.slice(i, i + 100).map((id) => ({ id })),
    });
    for (const r of d.results || []) {
      porNegocio[r.from.id] = (r.to || []).map((x) => String(x.toObjectId));
    }
  }

  const todas = [...new Set(Object.values(porNegocio).flat())];
  const info = {};
  for (let i = 0; i < todas.length; i += 100) {
    const d = await hsPost("/crm/v3/objects/meetings/batch/read", {
      properties: ["hs_created_by_user_id", "hs_meeting_outcome"],
      inputs: todas.slice(i, i + 100).map((id) => ({ id })),
    });
    for (const m of d.results || []) {
      info[m.id] = {
        criadaPor: String(m.properties?.hs_created_by_user_id || ""),
        desfecho: String(m.properties?.hs_meeting_outcome || ""),
      };
    }
  }

  const out = {};
  for (const [dealId, lista] of Object.entries(porNegocio)) {
    out[dealId] = lista.map((id) => info[id]).filter(Boolean);
  }
  return out;
}
