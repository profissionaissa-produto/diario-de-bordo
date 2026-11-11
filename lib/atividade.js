import "server-only";
import { hsSearch, associacoesPara, disposicoesConectadas, comCache } from "./hubspot";

// Atividade registrada no HubSpot hoje, por empresa (farmer) ou por negócio
// (closer). É a fonte do fechamento: quem trabalha já registra ligação e
// reunião no CRM, e pedir para digitar de novo no diário é retrabalho que mata
// a adoção.
//
// Cada leitura falha para o lado seguro: sem o escopo, a atividade volta vazia
// e o farmer preenche à mão, como antes. Nunca inventa resultado.

const semHtml = (v) =>
  String(v || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

// A janela é o dia em Brasília, não em UTC: senão o começo da manhã fica de
// fora e o fim do dia anterior entra.
function janelaDoDia(dia, farmerIds, prop) {
  return [
    { propertyName: "hubspot_owner_id", operator: "IN", values: farmerIds },
    { propertyName: prop, operator: "GTE", value: String(new Date(`${dia}T00:00:00-03:00`).getTime()) },
    { propertyName: prop, operator: "LTE", value: String(new Date(`${dia}T23:59:59-03:00`).getTime()) },
  ];
}

async function _atividadeDoDia(ownerIds, dia, alvo = "companies") {
  const porFarmer = {};
  for (const id of ownerIds) porFarmer[String(id)] = {};
  if (ownerIds.length === 0) return porFarmer;

  const ids = ownerIds.map(String);
  const [conectadas, ligacoes, reunioes, emails, notas] = await Promise.all([
    disposicoesConectadas().catch(() => new Set()),
    hsSearch("calls", [{ filters: janelaDoDia(dia, ids, "hs_timestamp") }],
      ["hs_call_disposition", "hs_call_body", "hubspot_owner_id"]).catch(() => []),
    hsSearch("meetings", [{ filters: janelaDoDia(dia, ids, "hs_timestamp") }],
      ["hs_meeting_outcome", "hs_meeting_body", "hubspot_owner_id"]).catch(() => []),
    hsSearch("emails", [{ filters: janelaDoDia(dia, ids, "hs_timestamp") }],
      ["hubspot_owner_id"]).catch(() => []),
    hsSearch("notes", [{ filters: janelaDoDia(dia, ids, "hs_timestamp") }],
      ["hs_note_body", "hubspot_owner_id"]).catch(() => []),
  ]);

  const [empLigacoes, empReunioes, empEmails, empNotas] = await Promise.all([
    associacoesPara("calls", ligacoes.map((c) => c.id), alvo).catch(() => ({})),
    associacoesPara("meetings", reunioes.map((m) => m.id), alvo).catch(() => ({})),
    associacoesPara("emails", emails.map((e) => e.id), alvo).catch(() => ({})),
    associacoesPara("notes", notas.map((n) => n.id), alvo).catch(() => ({})),
  ]);

  const registra = (dono, alvoId) => {
    const mapa = porFarmer[String(dono)];
    if (!mapa) return null;
    mapa[alvoId] ||= { ligacoes: 0, conectadas: 0, reunioes: 0, outras: 0, texto: "", sugerido: null };
    return mapa[alvoId];
  };
  // A anotação mais longa costuma ser a que explica o contato.
  const guardaTexto = (a, t) => {
    if (t && t.length > a.texto.length) a.texto = t;
  };

  for (const c of ligacoes) {
    const p = c.properties || {};
    const conectou = conectadas.has(p.hs_call_disposition || "");
    const texto = semHtml(p.hs_call_body);
    for (const alvoId of empLigacoes[c.id] || []) {
      const a = registra(p.hubspot_owner_id, alvoId);
      if (!a) continue;
      a.ligacoes++;
      if (conectou) a.conectadas++;
      guardaTexto(a, texto);
    }
  }

  for (const m of reunioes) {
    const p = m.properties || {};
    const realizada = p.hs_meeting_outcome === "COMPLETED";
    const texto = semHtml(p.hs_meeting_body);
    for (const alvoId of empReunioes[m.id] || []) {
      const a = registra(p.hubspot_owner_id, alvoId);
      if (!a) continue;
      if (realizada) a.reunioes++;
      else a.outras++;
      guardaTexto(a, texto);
    }
  }

  for (const e of emails) {
    for (const alvoId of empEmails[e.id] || []) {
      const a = registra(e.properties?.hubspot_owner_id, alvoId);
      if (a) a.outras++;
    }
  }

  for (const n of notas) {
    const texto = semHtml(n.properties?.hs_note_body);
    for (const alvoId of empNotas[n.id] || []) {
      const a = registra(n.properties?.hubspot_owner_id, alvoId);
      if (!a) continue;
      a.outras++;
      guardaTexto(a, texto);
    }
  }

  // Ligação conectada ou reunião realizada é contato efetivo; ligação sem
  // resposta, e-mail ou nota é tentativa. Sem atividade, fica em branco —
  // e em branco é "não abordei", que o farmer confirma.
  for (const mapa of Object.values(porFarmer)) {
    for (const a of Object.values(mapa)) {
      if (a.conectadas > 0 || a.reunioes > 0) a.sugerido = "efetivo";
      else if (a.ligacoes > 0 || a.outras > 0) a.sugerido = "tentativa";
    }
  }

  return porFarmer;
}

// Nove chamadas ao HubSpot por abertura de tela: cinco buscas de atividade do
// dia mais quatro leituras de associação. Medido em produção, de 414ms a 863ms,
// e é o maior bloco que sobrou.
//
// Dois minutos de cache. A atividade muda ao longo do dia, mas ela só vira
// SUGESTÃO de resultado no fechamento, nunca resultado gravado: atrasar dois
// minutos não erra nada, e quem registrou a ligação agora mesmo não está
// olhando o diário no mesmo segundo.
export const atividadeDoDia = comCache(_atividadeDoDia, "atividade-dia", ["atividade"], 120);
