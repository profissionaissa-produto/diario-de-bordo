import "server-only";
import { hsSearch, associacoesPara, associacoesEntre, lerEmLote, cached, comCache } from "./hubspot";
import { dayKey } from "./week";

// Selo de relacionamento: a empresa tem história construída com o dono ATUAL
// da carteira — ele registrou negócio e já realizou mais de uma reunião de
// relacionamento com ela. O sinal é da pessoa, não da empresa: herdar uma
// carteira não herda o relacionamento de quem veio antes.
export const MINIMO_REUNIOES = 2;
const TIPO_REUNIAO = "Reunião de Relacionamento";

// Parte das reuniões, que são poucas, e só então confere o negócio. O caminho
// inverso varreria a carteira inteira de negócios a cada abertura do diário.
// São quatro buscas encadeadas, cada uma esperando a anterior, e é a parte
// mais lenta de abrir o diário do farmer. O selo é histórico: quem tem
// relacionamento construído não deixa de ter no meio do dia. Calcula uma vez
// por farmer por dia e reusa, então a primeira abertura paga e o resto não.
const DOZE_HORAS = 12 * 60 * 60 * 1000;

async function _empresasComSelo(farmerId, companyIds) {
  // Set não sobrevive ao cache como Set: guarda lista e remonta na saída.
  return cached(`selo-${farmerId}-${dayKey()}`, DOZE_HORAS, async () => [
    ...(await calculaSelo(farmerId, companyIds)),
  ]);
}

// Quatro buscas encadeadas no HubSpot, medidas de 4ms a 653ms conforme a
// instância esteja quente ou fria. O cache de memória já resolvia dentro da
// instância; o compartilhado resolve também na partida, que é onde doía.
const seloEmCache = comCache(_empresasComSelo, "selo-relacionamento", ["selo"], DOZE_HORAS / 1000);

export async function empresasComSelo(farmerId, companyIds) {
  if (!companyIds || companyIds.length === 0) return new Set();
  return new Set(await seloEmCache(farmerId, companyIds));
}

async function calculaSelo(farmerId, companyIds) {
  const selo = new Set();

  const reunioes = await hsSearch(
    "meetings",
    [{ filters: [
      { propertyName: "hubspot_owner_id", operator: "EQ", value: String(farmerId) },
      { propertyName: "hs_activity_type", operator: "EQ", value: TIPO_REUNIAO },
      { propertyName: "hs_meeting_outcome", operator: "EQ", value: "COMPLETED" },
    ] }],
    ["hs_meeting_title"]
  ).catch(() => []);
  if (reunioes.length === 0) return selo;

  const assoc = await associacoesPara("meetings", reunioes.map((r) => r.id)).catch(() => ({}));
  const porEmpresa = {};
  for (const empresas of Object.values(assoc)) {
    for (const e of empresas) porEmpresa[e] = (porEmpresa[e] || 0) + 1;
  }

  const naLista = new Set(companyIds.map(String));
  const candidatas = Object.entries(porEmpresa)
    .filter(([empresa, total]) => total >= MINIMO_REUNIOES && naLista.has(empresa))
    .map(([empresa]) => empresa);
  if (candidatas.length === 0) return selo;

  const negociosPorEmpresa = await associacoesEntre("companies", "deals", candidatas).catch(() => ({}));
  const dealIds = [...new Set(Object.values(negociosPorEmpresa).flat())];
  if (dealIds.length === 0) return selo;

  const donos = await lerEmLote("deals", dealIds, ["sdrfarmer_responsavel"]).catch(() => ({}));

  for (const empresa of candidatas) {
    const negocios = negociosPorEmpresa[empresa] || [];
    if (negocios.some((id) => donos[id]?.sdrfarmer_responsavel === String(farmerId))) {
      selo.add(empresa);
    }
  }
  return selo;
}
