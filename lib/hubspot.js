import "server-only";
import { unstable_cache, revalidateTag } from "next/cache";
import { CLOSED_STAGES, OWNER_POR_EMAIL, NOME_CLOSER, PROP_ESTRATEGIA } from "./config";
import { diaDeCampoHora, diaDeCampoData } from "./week";

// Cache de dados do Next, para as leituras caras.
//
// O cache em memória logo abaixo serve para metadado e morre junto com a
// instância. Este aqui é compartilhado entre instâncias e sobrevive, que é o
// que faz trocar de aba não reler o HubSpot inteiro de novo.
//
// O prazo é de minutos de propósito: o Diário é a foto do dia, aberto de
// manhã e trabalhado ao longo dele. Quem grava alguma coisa derruba a etiqueta
// correspondente na hora, então o que a própria pessoa fez aparece na mesma
// hora; o que mudou no HubSpot por fora entra no próximo ciclo.
export const PRAZO_CURTO = 180;
const comCache = (fn, nome, tags, prazo = PRAZO_CURTO) =>
  unstable_cache(fn, [nome], { revalidate: prazo, tags });

const BASE = "https://api.hubapi.com";

function token() {
  const t = process.env.HUBSPOT_TOKEN;
  if (!t) throw new Error("HUBSPOT_TOKEN não configurado no ambiente.");
  return t;
}

async function hs(path, init = {}, tentativa = 0) {
  const res = await fetch(BASE + path, {
    ...init,
    headers: {
      Authorization: `Bearer ${token()}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text();
    // O HubSpot limita a busca a poucas chamadas por segundo. Esse 429 passa
    // sozinho em menos de um segundo — esperar resolve. Já o limite diário
    // não adianta retentar.
    if (res.status === 429 && tentativa < 3 && !/DAILY/i.test(body)) {
      const espera = Number(res.headers.get("Retry-After") || 0) * 1000 || 400 * (tentativa + 1);
      await new Promise((r) => setTimeout(r, espera));
      return hs(path, init, tentativa + 1);
    }
    throw new Error(`HubSpot ${res.status} em ${path}: ${body.slice(0, 300)}`);
  }
  return res.status === 204 ? null : res.json();
}

// Consumo diário da API. O limite vale para a conta toda — outras integrações
// da empresa dividem a mesma cota.
export async function getApiUsage() {
  const d = await hs(`/account-info/v3/api-usage/daily`);
  const linha = Array.isArray(d) ? d[0] : d?.results?.[0] || d;
  const usadas = linha?.currentUsage ?? null;
  const limite = linha?.usageLimit ?? null;
  return {
    usadas,
    limite,
    restantes: usadas != null && limite != null ? limite - usadas : null,
    percentual: usadas != null && limite ? Math.round((usadas / limite) * 1000) / 10 : null,
    reseta: linha?.collectedAt || linha?.fetchedAt || null,
    bruto: d,
  };
}

export async function getOwnerByEmail(email) {
  // Exceção cadastrada: o login não bate com o e-mail do owner. Resolve sem
  // ir ao HubSpot, o que ainda economiza uma chamada por acesso.
  const fixo = OWNER_POR_EMAIL[String(email || "").toLowerCase()];
  if (fixo) return { ownerId: fixo, name: NOME_CLOSER[fixo] || email };

  const data = await hs(`/crm/v3/owners?email=${encodeURIComponent(email)}`);
  const o = data.results?.[0];
  if (!o) return null;
  return { ownerId: o.id, name: `${o.firstName || ""} ${o.lastName || ""}`.trim() || email };
}

// Nome de owners que não estão no cadastro local. Usado só para eles, que são
// poucos: sem isso o briefing aparece como "Closer 92333469" e não dá para
// decidir nada olhando o cartão.
export async function getOwnerNames(ids) {
  const out = {};
  await Promise.all(
    [...new Set(ids.map(String))].map(async (id) => {
      try {
        out[id] = await cached(`owner-${id}`, UMA_HORA, async () => {
          const o = await hs(`/crm/v3/owners/${id}`);
          return `${o.firstName || ""} ${o.lastName || ""}`.trim() || o.email || `Closer ${id}`;
        });
      } catch {
        out[id] = `Closer ${id}`;
      }
    })
  );
  return out;
}

// Lista os owners (closers) ativos do HubSpot para o seletor do admin.
// ponytail: traz todos os owners; se a lista crescer demais, filtrar por quem tem deals nas pipelines de closer.
export async function getAllOwners() {
  const out = [];
  let after;
  do {
    const q = after ? `?after=${after}&limit=100` : `?limit=100`;
    const d = await hs(`/crm/v3/owners${q}`);
    for (const o of d.results || []) {
      const name = `${o.firstName || ""} ${o.lastName || ""}`.trim() || o.email;
      if (name) out.push({ ownerId: o.id, name, email: (o.email || "").toLowerCase() });
    }
    after = d.paging?.next?.after;
  } while (after);
  return out.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

// Cache em memória para dados que quase não mudam (opções de propriedade, nomes
// de etapa). Sem isso, cada tela repetia as mesmas chamadas e consumia a cota
// diária da API do HubSpot.
const cache = new Map();
export async function cached(chave, ttlMs, fn) {
  const hit = cache.get(chave);
  if (hit && Date.now() - hit.t < ttlMs) return hit.v;
  const v = await fn();
  cache.set(chave, { t: Date.now(), v });
  return v;
}
const UMA_HORA = 60 * 60 * 1000;

async function enumProp(prop) {
  const d = await hs(`/crm/v3/properties/deals/${prop}`);
  const map = {};
  (d.options || []).forEach((o) => (map[o.value] = o.label));
  return { map, options: d.options || [] };
}

export async function getTemperaturaOptions() {
  return cached("temp-options", UMA_HORA, async () => (await enumProp("temperatura_atual")).options);
}

const DEAL_PROPS = [
  "dealname",
  "hubspot_owner_id",
  "amount",
  "pipeline",
  "dealstage",
  "notes_next_activity_date",
  "hs_next_step",
  "temperatura_atual",
  "observacoes",
  // Critérios da lista do dia do closer — ver lib/funil.js.
  "notes_last_updated",
  "hs_latest_meeting_activity",
  "data_de_envio_da_ultima_proposta",
  "data_prevista_do_evento",
  "budget",
  // O que foi conversado na reunião. Medido em 10/11/2026 nos 313 negócios
  // abertos do B2B: 182 têm a transcrição, 58%, e 21 têm o resumo do
  // Copiloto, 7%. No B2C não há nenhuma.
  //
  // O resumo vem estruturado em Conexão, Diagnóstico, Solução, Combinado, e
  // tem mediana de 890 caracteres. A transcrição crua tem mediana de 1.6 mil
  // e chega a 51 mil. Por isso o resumo tem preferência: entrega mais por
  // muito menos prompt.
  "copiloto_resumo_call",
  "transcricao_completa_reuniao",
];

// Rótulos das etapas vêm da API de PIPELINES (fonte que o HubSpot usa na UI).
// A propriedade dealstage pode devolver rótulos vazios, caindo no id cru.
async function getStageLabels() {
  return cached("stage-labels", UMA_HORA, _getStageLabels);
}

async function _getStageLabels() {
  try {
    const d = await hs(`/crm/v3/pipelines/deals`);
    const m = {};
    for (const p of d.results || []) for (const s of p.stages || []) m[s.id] = s.label;
    if (Object.keys(m).length) return m;
  } catch {
    /* fallback abaixo */
  }
  return (await enumProp("dealstage")).map;
}

// withTasks=false pula a leitura de tarefas (mais rápido quando só os ids importam).
async function _getOpenDeals(ownerId, pipelineIds, { withTasks = true } = {}) {
  const labelById = await getStageLabels();
  const out = [];
  let after;
  do {
    const body = {
      filterGroups: [
        {
          filters: [
            { propertyName: "hubspot_owner_id", operator: "EQ", value: String(ownerId) },
            { propertyName: "pipeline", operator: "IN", values: pipelineIds },
            { propertyName: "dealstage", operator: "NOT_IN", values: CLOSED_STAGES },
          ],
        },
      ],
      properties: DEAL_PROPS,
      sorts: [{ propertyName: "hs_next_activity_date", direction: "ASCENDING" }],
      limit: 100,
      ...(after ? { after } : {}),
    };
    const d = await hs(`/crm/v3/objects/deals/search`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    for (const r of d.results || []) {
      const p = r.properties;
      out.push({
        id: r.id,
        ownerId: p.hubspot_owner_id || "",
        name: p.dealname || "(sem nome)",
        amount: p.amount ? Number(p.amount) : null,
        pipeline: p.pipeline,
        stageLabel: labelById[p.dealstage] || p.dealstage || "",
        nextActivity: p.notes_next_activity_date || null,
        nextStep: p.hs_next_step || "",
        temperatura: p.temperatura_atual || "",
        observacoes: p.observacoes || "",
        // Data-e-hora vira dia de Brasília; data pura fica como está.
        ultimaAtividade: diaDeCampoHora(p.notes_last_updated),
        reuniaoEm: diaDeCampoHora(p.hs_latest_meeting_activity),
        propostaEm: diaDeCampoData(p.data_de_envio_da_ultima_proposta),
        eventoEm: diaDeCampoData(p.data_prevista_do_evento),
        budget: p.budget || "",
        // A conversa em si NÃO vem na lista. A transcrição chega a 51 mil
        // caracteres e são 182 negócios com ela: levar isso para a tela é
        // meio mega de payload por carregamento, para exibir uma frase. Só
        // a origem viaja; o texto é lido no /api/closer/mensagem, um de cada
        // vez, por getDealById.
        conversa: p.copiloto_resumo_call?.trim()
          ? "resumo"
          : String(p.transcricao_completa_reuniao || "").trim().length > 200
            ? "transcricao"
            : "",
      });
    }
    after = d.paging?.next?.after;
  } while (after);
  return withTasks ? attachOpenTasks(out) : out;
}

// A leitura mais cara da tela: com 313 negócios abertos no B2B são quatro
// idas ao HubSpot enfileiradas, mais as tarefas de cada um. Trocar de aba
// refazia tudo isto.
export const getOpenDeals = comCache(_getOpenDeals, "open-deals", ["deals"]);

// Tarefas ABERTAS associadas aos negócios — a ação pendente real, incluindo as ATRASADAS.
// notes_next_activity_date só guarda atividade futura: o HubSpot limpa o campo quando a
// tarefa vence, então sozinho ele nunca acusa atraso.
// Requer o escopo crm.objects.tasks.read no App Privado; sem ele, degrada para a data nativa.
async function attachOpenTasks(deals) {
  if (deals.length === 0) return deals;
  try {
    const byDeal = {};
    for (let i = 0; i < deals.length; i += 100) {
      const chunk = deals.slice(i, i + 100);
      const r = await hs(`/crm/v4/associations/deals/tasks/batch/read`, {
        method: "POST",
        body: JSON.stringify({ inputs: chunk.map((d) => ({ id: String(d.id) })) }),
      });
      for (const row of r.results || []) {
        byDeal[row.from?.id] = (row.to || []).map((t) => String(t.toObjectId));
      }
    }

    const taskIds = [...new Set(Object.values(byDeal).flat())];
    if (taskIds.length === 0) return deals;

    const taskById = {};
    for (let i = 0; i < taskIds.length; i += 100) {
      const chunk = taskIds.slice(i, i + 100);
      const r = await hs(`/crm/v3/objects/tasks/batch/read`, {
        method: "POST",
        body: JSON.stringify({
          properties: ["hs_task_subject", "hs_task_status", "hs_timestamp"],
          inputs: chunk.map((id) => ({ id })),
        }),
      });
      for (const t of r.results || []) taskById[t.id] = t.properties;
    }

    for (const d of deals) {
      const open = (byDeal[String(d.id)] || [])
        .map((id) => taskById[id])
        .filter((t) => t && t.hs_task_status !== "COMPLETED" && t.hs_timestamp)
        .sort((a, b) => new Date(a.hs_timestamp) - new Date(b.hs_timestamp));
      if (open.length) {
        d.nextActivity = open[0].hs_timestamp;
        d.nextStep = open[0].hs_task_subject || d.nextStep;
      }
    }
  } catch {
    // Sem escopo de tarefas: mantém notes_next_activity_date (só atividades futuras).
  }
  return deals;
}

// Lê negócios por id (usado pela tela de aprovações, que parte do plano salvo).
// Dono de um negócio. Leitura direta pelo id: não passa pela API de busca,
// que é a limitada por segundo.
export async function getDealOwner(id) {
  const d = await hs(`/crm/v3/objects/deals/${id}?properties=hubspot_owner_id`);
  return d?.properties?.hubspot_owner_id || null;
}

export async function getDealsByIds(ids, { withTasks = false } = {}) {
  const out = {};
  const list = [...new Set(ids.map(String))];
  for (let i = 0; i < list.length; i += 100) {
    const chunk = list.slice(i, i + 100);
    const r = await hs(`/crm/v3/objects/deals/batch/read`, {
      method: "POST",
      body: JSON.stringify({
        properties: [
          "dealname",
          "amount",
          "temperatura_atual",
          "dealstage",
          "notes_next_activity_date",
          "hs_next_step",
          "observacoes",
        ],
        inputs: chunk.map((id) => ({ id })),
      }),
    });
    for (const d of r.results || []) {
      out[d.id] = {
        id: d.id,
        name: d.properties.dealname || "(sem nome)",
        amount: d.properties.amount ? Number(d.properties.amount) : null,
        temperatura: d.properties.temperatura_atual || "",
        nextActivity: d.properties.notes_next_activity_date || null,
        nextStep: d.properties.hs_next_step || "",
        observacoes: d.properties.observacoes || "",
      };
    }
  }
  // Tarefas trazem também as atividades ATRASADAS, que a propriedade não guarda.
  if (withTasks) await attachOpenTasks(Object.values(out));
  return out;
}

// Definição de uma propriedade de negócio: null quando ela não existe na
// conta. Mandar um campo desconhecido faz o HubSpot recusar o PATCH inteiro,
// e isso levaria junto a temperatura, que é a parte que não pode falhar.
// As opções vêm junto porque, em dropdown, só o valor interno exato é aceito
// — um valor fora da lista o HubSpot descarta sem avisar.
// null quer dizer "a conta não tem essa propriedade" — caso esperado, e quem
// chama precisa decidir o que fazer. Nunca significa que a escrita falhou.
export async function propriedadeDe(objeto, nome) {
  return cached(`prop-${objeto}-${nome}`, UMA_HORA, async () => {
    try {
      const d = await hs(`/crm/v3/properties/${objeto}/${nome}`);
      return { tipo: d.type, opcoes: (d.options || []).map((o) => ({ value: o.value, label: o.label })) };
    } catch {
      return null;
    }
  });
}

export const propriedadeDeal = (nome) => propriedadeDe("deals", nome);
export const propriedadeEmpresa = (nome) => propriedadeDe("companies", nome);

export async function updateDeal(id, { temperatura_atual, observacoes, estrategia }) {
  const properties = {};
  if (temperatura_atual !== undefined) properties.temperatura_atual = temperatura_atual;
  if (observacoes !== undefined) properties.observacoes = observacoes;
  if (estrategia !== undefined) properties[PROP_ESTRATEGIA] = estrategia;
  const r = await hs(`/crm/v3/objects/deals/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ properties }),
  });
  // O que a própria pessoa acabou de gravar não pode esperar o prazo do
  // cache: ela recarrega a tela e veria o valor antigo, e isso parece bug.
  derruba("deals");
  return r;
}

// Invalida uma etiqueta do cache de dados sem derrubar o resto.
// Não quebra a gravação se falhar: o dado já foi para o HubSpot, e o pior
// caso é a tela levar alguns minutos para refletir.
export function derruba(tag) {
  try {
    revalidateTag(tag);
  } catch (e) {
    console.error(`[cache] falha ao invalidar "${tag}":`, e?.message);
  }
}

// Contatos de cada empresa, com o que decide para quem mandar a mensagem.
// Devolve { companyId: [ { id, nome, cargo, papel, telefone, email } ] }, com
// o tomador de decisão na frente e quem não tem telefone no fim.
const CONTATO_PROPS = [
  "firstname", "lastname", "email", "phone", "mobilephone",
  "hs_whatsapp_phone_number", "jobtitle", "hs_buying_role",
];

async function _contatosDasEmpresas(companyIds) {
  const ids = [...new Set((companyIds || []).map(String))];
  if (ids.length === 0) return {};
  const porEmpresa = await associacoesEntre("companies", "contacts", ids);
  const todos = [...new Set(Object.values(porEmpresa).flat())];
  if (todos.length === 0) return {};
  const props = await lerEmLote("contacts", todos, CONTATO_PROPS);

  const monta = (id) => {
    const p = props[id] || {};
    const nome = [p.firstname, p.lastname].filter(Boolean).join(" ").trim();
    return {
      id: String(id),
      nome: nome || p.email || `Contato ${id}`,
      cargo: p.jobtitle || "",
      papel: p.hs_buying_role || "",
      // O campo de WhatsApp do HubSpot vem primeiro quando existe: é o número
      // que a conta já confirmou como de WhatsApp.
      telefone: p.hs_whatsapp_phone_number || p.mobilephone || p.phone || "",
      email: p.email || "",
    };
  };

  const out = {};
  for (const [empresa, lista] of Object.entries(porEmpresa)) {
    out[empresa] = lista
      .map(monta)
      .sort((a, b) => {
        const peso = (c) => (c.papel === "DECISION_MAKER" ? 0 : 1) + (c.telefone ? 0 : 2);
        return peso(a) - peso(b);
      });
  }
  return out;
}

// Associação mais leitura em lote das 20 empresas do dia do farmer. Medido em
// produção: é o bloco mais caro e mais instável da tela, de 357ms a 1,6s.
// Contato de empresa não muda no meio do expediente.
export const contatosDasEmpresas = comCache(_contatosDasEmpresas, "contatos-empresas", ["contatos"]);

// Contatos associados ao ticket, crus. Quem separa palestrante, contratante e
// funcionário da PSA é lib/contato-ticket.js: aqui só vem a leitura.
//
// Vem do ticket e não da empresa de propósito. O palestrante não é contato da
// empresa cliente, é contato do ticket, e é dele que a PSA cobra a NF. Medido
// em 09/11/2026: nos tickets da etapa de NF, boa parte tem o palestrante ou o
// escritório dele associado aqui, e nenhum tem na empresa.
export async function contatosDosTickets(ticketIds) {
  const ids = [...new Set((ticketIds || []).map(String))];
  if (ids.length === 0) return {};
  const porTicket = await associacoesEntre("tickets", "contacts", ids);
  const todos = [...new Set(Object.values(porTicket).flat())];
  if (todos.length === 0) return {};
  const props = await lerEmLote("contacts", todos, CONTATO_PROPS);

  const monta = (id) => {
    const p = props[id] || {};
    const nome = [p.firstname, p.lastname].filter(Boolean).join(" ").trim();
    return {
      id: String(id),
      nome: nome || p.email || `Contato ${id}`,
      cargo: p.jobtitle || "",
      papel: p.hs_buying_role || "",
      telefone: p.hs_whatsapp_phone_number || p.mobilephone || p.phone || "",
      email: p.email || "",
    };
  };

  const out = {};
  for (const [ticket, lista] of Object.entries(porTicket)) out[ticket] = lista.map(monta);
  return out;
}

// Registro da conversa na empresa. "default" deixa o HubSpot resolver o tipo
// da associação, como já fazemos na tarefa do negócio.
export async function criarNotaNaEmpresa(companyId, { corpo, ownerId }) {
  const nota = await hs("/crm/v3/objects/notes", {
    method: "POST",
    body: JSON.stringify({
      properties: {
        hs_note_body: corpo || "",
        hs_timestamp: String(Date.now()),
        ...(ownerId ? { hubspot_owner_id: String(ownerId) } : {}),
      },
    }),
  });
  await hs(`/crm/v4/objects/notes/${nota.id}/associations/default/companies/${companyId}`, {
    method: "PUT",
  });
  return nota.id;
}

// A tratativa que o farmer fez na tramitação, gravada no ticket de CS. É o
// que evidencia no CRM que houve ação no dia: sem isto o registro vive só
// no banco do Diário e quem abre o ticket não vê nada.
export async function criarNotaNoTicket(ticketId, { corpo, ownerId }) {
  const nota = await hs("/crm/v3/objects/notes", {
    method: "POST",
    body: JSON.stringify({
      properties: {
        hs_note_body: corpo || "",
        hs_timestamp: String(Date.now()),
        ...(ownerId ? { hubspot_owner_id: String(ownerId) } : {}),
      },
    }),
  });
  await hs(`/crm/v4/objects/notes/${nota.id}/associations/default/tickets/${ticketId}`, {
    method: "PUT",
  });
  return nota.id;
}

// Tarefa no ticket. A nota diz o que foi feito; a tarefa é o que cobra alguém
// de volta numa data. É a peça que o seguimento financeiro usa para "Confirmar
// pagamento" virar compromisso em vez de recado.
//
// `vence` é AAAA-MM-DD. O HubSpot quer milissegundos, e meio-dia UTC evita que
// a tarefa caia no dia anterior para quem está em fuso negativo.
export async function criarTarefaNoTicket(ticketId, { titulo, corpo, vence, ownerId }) {
  const assunto = String(titulo || "").trim();
  if (!assunto) throw new Error("Tarefa sem título não aparece na lista de ninguém.");

  const quando = /^\d{4}-\d{2}-\d{2}$/.test(String(vence || ""))
    ? Date.parse(`${vence}T12:00:00Z`)
    : Date.now();

  const tarefa = await hs("/crm/v3/objects/tasks", {
    method: "POST",
    body: JSON.stringify({
      properties: {
        hs_task_subject: assunto,
        hs_task_body: corpo || "",
        hs_task_status: "NOT_STARTED",
        hs_task_type: "TODO",
        hs_timestamp: String(quando),
        ...(ownerId ? { hubspot_owner_id: String(ownerId) } : {}),
      },
    }),
  });
  await hs(`/crm/v4/objects/tasks/${tarefa.id}/associations/default/tickets/${ticketId}`, {
    method: "PUT",
  });
  derruba("tickets");
  return tarefa.id;
}

// O que o farmer planejou para a empresa, gravado no CRM como o closer grava
// no negócio. Só as chaves montadas por quem chama, para não limpar campo.
export async function updateCompany(id, properties) {
  return hs(`/crm/v3/objects/companies/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ properties }),
  });
}

// Tickets do funil de CS, com as datas que geram tramitação. Paginado em
// fila, nunca em paralelo: a busca do HubSpot tem limite por segundo.
// Mesma lista do painel-tramitacao: é o que os relógios copiados leem.
// Propriedade que falta aqui vira cinza lá dizendo qual campo falta, o que
// é melhor do que verde por ausência de dado, mas continua sendo buraco.
const TICKET_PROPS = [
  "subject",
  "hs_pipeline_stage",
  "hubspot_owner_id",
  "data_do_evento__ganho_",
  "hs_v2_date_entered_current_stage",
  "data_de_realizacao_do_onboarding",
  "status_do_contrato",
  "logistica_sera_organizada_pela_psa_",
  "tipo_de_empresa_contratante",
  "formato_da_empresa",
  "formato_de_contrato__ganho_",
  "palestrante_e_exclusivo",
  "palestrante_principal",
  "tipo_de_produto",
  "assinar_contrato",
  "prazo_para_assinatura_de_contrato",
  "data_de_assinatura_do_contrato",
  "data_para_realizacao_de_briefing",
  "data_e_hora_da_call_de_briefing",
  "hs_v2_date_entered_1450325175",
  "data_de_faturamento",
  "data_de_emissao",
  "prazo_para_despachar_faturamento_ao_financeiro",
  "despachar_faturamento_ao_financeiro",
  "adquirir_logistica",
  "prazo_de_aquisicao_de_logistica",
  "prazo_para_aquisicao_da_logistica",
  "data_prevista_de_pagamento_logistica",
  "data_de_envio_contrato_cliente",
  "data_de_envio_contrato_palestrante",
  "prazo_de_assinatura__contrato_palestrante",
  "data_de_assinatura__palestrante_",
  "contrato",
  "contrato_palestrante",
  // Seguimento financeiro. Preenchimento medido em 08/11/2026, nos 100
  // primeiros dos 128 tickets abertos nas quatro etapas financeiras:
  //   data_prevista_de_pagamento              99%  é a data combinada, 1ª parcela
  //   quantidade_de_parcelas                  98%  valores 1, 2 e 3
  //   data_prevista_de_pagamento__2a_parcela_ 27%  e 22 dos 23 que têm 2+ parcelas
  //   data_prevista_do__3__parcela_            4%
  //   cache_do_palestrante                   100%
  //   data_de_pagamento_do_palestrante        97%
  // Ficaram de fora por estarem vazias: status_de_pagamento, nota_fiscal,
  // numero_da_nota_fiscal, data_de_emissao e valor_total_nd, todas em 0%.
  "data_prevista_de_pagamento",
  "data_prevista_de_pagamento__2a_parcela_",
  "data_prevista_do__3__parcela_",
  "quantidade_de_parcelas",
  "cache_do_palestrante",
  "data_de_pagamento_do_palestrante",
  // 60% preenchida, medida em 09/11/2026. É o que o cliente deve. O cachê,
  // que está em 100%, é o que a PSA paga ao palestrante: são lados opostos.
  "valor_total_do_contrato_bruto",
];

// Duas propriedades com nome quase igual guardam a mesma coisa: vale a
// primeira preenchida, na ordem em que o CS as usa.
const primeira = (...vs) => vs.map(soData).find(Boolean) || "";
const soData = (v) => (v ? String(v).slice(0, 10) : "");

// Quando o negócio do ticket foi ganho. É daqui que sai o prazo de aquisição
// da logística, que vence 5 dias depois do ganho e não perto do evento. Sem
// esta data o relógio de lá fica cinza dizendo que não há de onde contar.
//
// Três idas ao HubSpot, então só é chamada para os tickets da etapa de
// logística, como no painel-tramitacao.
export async function ganhoDosTickets(ticketIds) {
  const ids = [...new Set((ticketIds || []).map(String))];
  if (ids.length === 0) return {};

  // Quais etapas contam como ganho vem do próprio HubSpot: a conta tem oito
  // funis de negócio e cravar ids na mão quebraria calado quando mudassem.
  const ganhas = await cached("etapas-ganhas", UMA_HORA, async () => {
    const d = await hs("/crm/v3/pipelines/deals");
    const set = [];
    for (const f of d.results || [])
      for (const e of f.stages || [])
        if (e.metadata?.isClosed === "true" && e.metadata?.probability === "1.0") set.push(String(e.id));
    return set;
  });
  const ehGanha = new Set(ganhas);

  const porTicket = await associacoesEntre("tickets", "deals", ids);
  const dealIds = [...new Set(Object.values(porTicket).flat())];
  if (dealIds.length === 0) return {};

  // propertiesWithHistory derruba o lote para 50 por chamada.
  const primeiroGanho = {};
  for (let i = 0; i < dealIds.length; i += 50) {
    const lote = dealIds.slice(i, i + 50);
    const r = await hs("/crm/v3/objects/deals/batch/read", {
      method: "POST",
      body: JSON.stringify({
        properties: ["dealstage"],
        propertiesWithHistory: ["dealstage"],
        inputs: lote.map((id) => ({ id })),
      }),
    });
    for (const d of r.results || []) {
      const quando = (d.propertiesWithHistory?.dealstage || [])
        .filter((h) => ehGanha.has(String(h.value)))
        .map((h) => String(h.timestamp))
        .sort()[0];
      if (quando) primeiroGanho[String(d.id)] = quando;
    }
  }

  const out = {};
  for (const [ticket, negocios] of Object.entries(porTicket)) {
    // Ticket com mais de um negócio: vale o ganho mais antigo, que é quando o
    // relógio da logística começou a correr de fato.
    const datas = negocios.map((d) => primeiroGanho[d]).filter(Boolean).sort();
    if (datas.length) out[ticket] = new Date(datas[0]).toISOString().slice(0, 10);
  }
  return out;
}

async function _getTicketsCS(pipelineId, etapas = []) {
  const out = [];
  let after;
  do {
    const d = await hs(`/crm/v3/objects/tickets/search`, {
      method: "POST",
      body: JSON.stringify({
        filterGroups: [
          {
            filters: [
              { propertyName: "hs_pipeline", operator: "EQ", value: String(pipelineId) },
              // Lista fechada de etapas: só estas geram trabalho para o farmer.
              ...(etapas.length
                ? [{ propertyName: "hs_pipeline_stage", operator: "IN", values: etapas }]
                : []),
            ],
          },
        ],
        properties: TICKET_PROPS,
        limit: 100,
        ...(after ? { after } : {}),
      }),
    });
    for (const r of d.results || []) out.push(mapaTicketCS(r));
    after = d.paging?.next?.after;
  } while (after);
  return out;
}

// Vale para o financeiro e para as tramitações: as duas telas varrem as
// mesmas etapas do mesmo funil de CS.
export const getTicketsCS = comCache(_getTicketsCS, "tickets-cs", ["tickets"]);

// O ticket do HubSpot no formato que o painel usa. Fica à parte porque o
// seguimento financeiro precisa ler um ticket só, e varrer as quatro etapas
// inteiras para achar um era o caminho fácil e caro.
function mapaTicketCS(r) {
  const p = r.properties || {};
  return {
        id: r.id,
        assunto: p.subject || "(sem assunto)",
        ownerId: p.hubspot_owner_id || "",
        // A etapa é a pendência: o nome dela diz a ação que falta.
        etapa: p.hs_pipeline_stage || "",
        evento: soData(p.data_do_evento__ganho_) || null,
        onboarding: soData(p.data_de_realizacao_do_onboarding),
        statusContrato: p.status_do_contrato || "",
        entrouEtapa: soData(p.hs_v2_date_entered_current_stage),
        logistica: p.logistica_sera_organizada_pela_psa_ || "",
        tipoEmpresa: p.tipo_de_empresa_contratante || "",
        formatoEmpresa: p.formato_da_empresa || "",
        formatoContrato: p.formato_de_contrato__ganho_ || "",
        palestranteExclusivo: p.palestrante_e_exclusivo || "",
        palestrantePrincipal: p.palestrante_principal || "",
        tipoProduto: p.tipo_de_produto || "",
        prazoAssinatura: primeira(p.assinar_contrato, p.prazo_para_assinatura_de_contrato),
        dataAssinatura: soData(p.data_de_assinatura_do_contrato),
        prazoBriefing: soData(p.data_para_realizacao_de_briefing),
        callBriefing: soData(p.data_e_hora_da_call_de_briefing),
        entrouBriefing: soData(p.hs_v2_date_entered_1450325175),
        dataFaturamento: soData(p.data_de_faturamento),
        dataEmissao: soData(p.data_de_emissao),
        prazoDespacho: primeira(
          p.prazo_para_despachar_faturamento_ao_financeiro,
          p.despachar_faturamento_ao_financeiro
        ),
        prazoLogistica: primeira(
          p.adquirir_logistica,
          p.prazo_de_aquisicao_de_logistica,
          p.prazo_para_aquisicao_da_logistica
        ),
        pagamentoLogistica: soData(p.data_prevista_de_pagamento_logistica),
        envioCliente: soData(p.data_de_envio_contrato_cliente),
        envioPalestrante: soData(p.data_de_envio_contrato_palestrante),
        prazoAssinaturaPalestrante: soData(p.prazo_de_assinatura__contrato_palestrante),
        dataAssinaturaPalestrante: soData(p.data_de_assinatura__palestrante_),
        anexoCliente: p.contrato || "",
        anexoPalestrante: p.contrato_palestrante || "",
        // O que o cliente combinou pagar, e quando. A Sinaleira não lê estes
        // campos: os relógios dela medem o pagamento contra a data do evento.
        // Quem usa é o seguimento financeiro, em lib/financeiro.js.
        pagamento1: soData(p.data_prevista_de_pagamento),
        pagamento2: soData(p.data_prevista_de_pagamento__2a_parcela_),
        pagamento3: soData(p.data_prevista_do__3__parcela_),
        parcelas: p.quantidade_de_parcelas || "",
        cache: p.cache_do_palestrante || "",
        pagamentoPalestrante: soData(p.data_de_pagamento_do_palestrante),
        valorContrato: p.valor_total_do_contrato_bruto || "",
  };
}

// Um ticket de CS pelo id, com as mesmas propriedades do board.
export async function getTicketCS(id) {
  const r = await hs(`/crm/v3/objects/tickets/${id}?properties=${TICKET_PROPS.join(",")}`);
  return r?.id ? mapaTicketCS(r) : null;
}

// ------------------------------------------------------------- carteira CS

// Empresas onde a pessoa é proprietária: a carteira do farmer.
export async function getCarteira(ownerId) {
  const out = [];
  let after;
  do {
    const d = await hs(`/crm/v3/objects/companies/search`, {
      method: "POST",
      body: JSON.stringify({
        filterGroups: [
          { filters: [{ propertyName: "hubspot_owner_id", operator: "EQ", value: String(ownerId) }] },
        ],
        properties: ["name", "data_da_ultima_compra", "ultimo_contato_efetivo", "city"],
        limit: 200,
        ...(after ? { after } : {}),
      }),
    });
    for (const r of d.results || []) {
      const p = r.properties || {};
      out.push({
        id: r.id,
        nome: p.name || `Empresa ${r.id}`,
        cidade: p.city || "",
        ultimaCompra: (p.data_da_ultima_compra || "").slice(0, 10) || null,
        ultimoContato: (p.ultimo_contato_efetivo || "").slice(0, 10) || null,
      });
    }
    after = d.paging?.next?.after;
  } while (after);
  return out;
}

// Empresas que já têm negócio aberto DESTE farmer — elas saem da lista, porque
// já estão sendo trabalhadas. O vínculo é a propriedade do negócio
// "SDR/Farmer Responsável", não o dono do negócio: quem toca a venda é o
// closer, o farmer é quem abriu.
export async function empresasNoFunil(farmerId) {
  const deals = [];
  let after;
  do {
    const d = await hs(`/crm/v3/objects/deals/search`, {
      method: "POST",
      body: JSON.stringify({
        filterGroups: [
          {
            filters: [
              { propertyName: "sdrfarmer_responsavel", operator: "EQ", value: String(farmerId) },
              { propertyName: "hs_is_closed", operator: "EQ", value: "false" },
            ],
          },
        ],
        properties: ["dealname"],
        limit: 200,
        ...(after ? { after } : {}),
      }),
    });
    deals.push(...(d.results || []).map((r) => r.id));
    after = d.paging?.next?.after;
  } while (after);

  const empresas = new Set();
  for (let i = 0; i < deals.length; i += 100) {
    const chunk = deals.slice(i, i + 100);
    const r = await hs(`/crm/v4/associations/deals/companies/batch/read`, {
      method: "POST",
      body: JSON.stringify({ inputs: chunk.map((id) => ({ id })) }),
    });
    for (const row of r.results || []) {
      for (const t of row.to || []) empresas.add(String(t.toObjectId));
    }
  }
  return empresas;
}

// Busca genérica paginada — usada pelas métricas, que precisam de campos
// variados de objetos diferentes.
export async function hsSearch(objectType, filterGroups, properties) {
  const out = [];
  let after;
  do {
    const d = await hs(`/crm/v3/objects/${objectType}/search`, {
      method: "POST",
      body: JSON.stringify({ filterGroups, properties, limit: 200, ...(after ? { after } : {}) }),
    });
    out.push(...(d.results || []));
    after = d.paging?.next?.after;
  } while (after);
  return out;
}

// Contagem barata: o HubSpot devolve o total na primeira página, então não há
// por que paginar só para contar.
export async function hsConta(objectType, filters) {
  const d = await hs(`/crm/v3/objects/${objectType}/search`, {
    method: "POST",
    body: JSON.stringify({ filterGroups: [{ filters }], properties: ["hs_object_id"], limit: 1 }),
  });
  return d.total ?? 0;
}

// Tarefa no negócio, a partir da estratégia aprovada no briefing.
// Exige o escopo crm.objects.tasks.write no App Privado: sem ele o HubSpot
// devolve 403 e o erro sobe — quem chama decide, mas ninguém fica sem saber.
export const ASSUNTO_TAREFA = "Tarefa do Diário de Bordo";

export async function criarTarefaNoDeal(dealId, { corpo, ownerId, vence }) {
  const tarefa = await hs("/crm/v3/objects/tasks", {
    method: "POST",
    body: JSON.stringify({
      properties: {
        // Nome fixo: é assim que o time reconhece de onde a tarefa veio.
        hs_task_subject: ASSUNTO_TAREFA,
        // O corpo é a observação que o closer escreveu no diário.
        hs_task_body: corpo || "",
        hs_task_status: "NOT_STARTED",
        hs_task_type: "TODO",
        hs_task_priority: "HIGH",
        hs_timestamp: String(vence),
        hubspot_owner_id: String(ownerId),
      },
    }),
  });
  // "default" deixa o HubSpot resolver o tipo da associação. Cravar o id na mão
  // é suposição que quebra calada no dia em que o portal muda.
  await hs(`/crm/v4/objects/tasks/${tarefa.id}/associations/default/deals/${dealId}`, {
    method: "PUT",
  });
  return tarefa.id;
}

// Associações de um tipo de engajamento em lote. O alvo é empresa para o
// farmer e negócio para o closer: o closer atua em negócio, não em empresa.
export async function associacoesPara(objeto, ids, alvo = "companies") {
  const out = {};
  const lista = [...new Set((ids || []).map(String))];
  for (let i = 0; i < lista.length; i += 100) {
    const chunk = lista.slice(i, i + 100);
    const r = await hs(`/crm/v4/associations/${objeto}/${alvo}/batch/read`, {
      method: "POST",
      body: JSON.stringify({ inputs: chunk.map((id) => ({ id })) }),
    });
    for (const row of r.results || []) {
      out[row.from?.id] = (row.to || []).map((t) => String(t.toObjectId));
    }
  }
  return out;
}

// Disposições de ligação que significam que alguém atendeu. Vêm do próprio
// HubSpot porque cada conta cadastra as suas, com rótulos diferentes.
export async function disposicoesConectadas() {
  return cached("disposicoes", UMA_HORA, async () => {
    const d = await hs(`/calling/v1/dispositions`);
    const lista = Array.isArray(d) ? d : d?.results || [];
    return new Set(
      lista
        .filter((o) => {
          if (o.deleted) return false;
          const l = String(o.label || "").toLowerCase();
          return l.includes("conect") || l.includes("connect") || l.includes("atend") || l.includes("reunião agendada");
        })
        .map((o) => o.id)
    );
  });
}

// Associações entre dois tipos quaisquer, em lote.
export async function associacoesEntre(de, para, ids) {
  const out = {};
  const lista = [...new Set((ids || []).map(String))];
  for (let i = 0; i < lista.length; i += 100) {
    const chunk = lista.slice(i, i + 100);
    const r = await hs(`/crm/v4/associations/${de}/${para}/batch/read`, {
      method: "POST",
      body: JSON.stringify({ inputs: chunk.map((id) => ({ id })) }),
    });
    for (const row of r.results || []) {
      out[row.from?.id] = (row.to || []).map((t) => String(t.toObjectId));
    }
  }
  return out;
}

// Leitura em lote de propriedades de qualquer objeto.
export async function lerEmLote(objeto, ids, properties) {
  const out = {};
  const lista = [...new Set((ids || []).map(String))];
  for (let i = 0; i < lista.length; i += 100) {
    const chunk = lista.slice(i, i + 100);
    const r = await hs(`/crm/v3/objects/${objeto}/batch/read`, {
      method: "POST",
      body: JSON.stringify({ properties, inputs: chunk.map((id) => ({ id })) }),
    });
    for (const d of r.results || []) out[d.id] = d.properties || {};
  }
  return out;
}

// Última compra da empresa ligada ao negócio — critério 6 da lista do closer.
// O dado mora na empresa, não no negócio, então custa duas chamadas: a
// associação e a leitura em lote. Falhar aqui só esvazia o grupo "cliente
// recente"; o resto do dia continua de pé.
export async function ultimaCompraPorNegocio(dealIds) {
  const ids = [...new Set((dealIds || []).map(String))];
  if (ids.length === 0) return {};
  const porDeal = await associacoesPara("deals", ids, "companies");
  const empresas = [...new Set(Object.values(porDeal).flat())];
  if (empresas.length === 0) return {};

  const dados = await lerEmLote("companies", empresas, ["data_da_ultima_compra"]);
  const out = {};
  for (const [dealId, empresaIds] of Object.entries(porDeal)) {
    // Negócio com mais de uma empresa vale pela compra mais recente.
    const datas = empresaIds
      .map((id) => diaDeCampoData(dados[id]?.data_da_ultima_compra))
      .filter(Boolean)
      .sort();
    if (datas.length) out[dealId] = datas[datas.length - 1];
  }
  return out;
}

// Diagnóstico da criação de tarefa: as tarefas ligadas a um negócio e se o
// App Privado tem escopo de escrita. O teste de escopo manda um corpo
// deliberadamente inválido — falta de escopo responde 403 antes da validação,
// então dá para saber sem criar nada no CRM.
export async function diagnosticoTarefas(dealId) {
  const out = { dealId: String(dealId), tarefas: [], leitura: "", escrita: "" };

  try {
    const r = await hs(`/crm/v4/objects/deals/${dealId}/associations/tasks`);
    const ids = (r.results || []).map((t) => String(t.toObjectId));
    out.leitura = `ok — ${ids.length} tarefa(s) associada(s)`;
    if (ids.length) {
      const dados = await lerEmLote("tasks", ids, [
        "hs_task_subject",
        "hs_task_status",
        "hs_timestamp",
        "hs_createdate",
        "hubspot_owner_id",
      ]);
      out.tarefas = Object.entries(dados).map(([id, p]) => ({
        id,
        assunto: p.hs_task_subject,
        status: p.hs_task_status,
        prazo: p.hs_timestamp,
        criadaEm: p.hs_createdate,
        dono: p.hubspot_owner_id,
      }));
    }
  } catch (e) {
    out.leitura = String(e.message);
  }

  try {
    await hs("/crm/v3/objects/tasks", {
      method: "POST",
      body: JSON.stringify({ properties: { hs_timestamp: "nao-e-uma-data" } }),
    });
    out.escrita = "criou algo — não deveria, o corpo era inválido";
  } catch (e) {
    const msg = String(e.message);
    // 400 = o HubSpot aceitou a chamada e recusou o conteúdo: escopo existe.
    out.escrita = /HubSpot 400/.test(msg)
      ? "ok — o escopo de escrita existe (recusou só o conteúdo inválido, como esperado)"
      : msg;
  }

  return out;
}

// O que voltou das tarefas do dia. Como o time não registra ligação, a tarefa
// é o registro: concluí-la com um texto é o fechamento do negócio.
// { [taskId]: { concluida, texto, concluidaEm } }
export async function retornoDasTarefas(taskIds) {
  const ids = [...new Set((taskIds || []).map(String))];
  if (ids.length === 0) return {};
  const dados = await lerEmLote("tasks", ids, [
    "hs_task_status",
    "hs_task_body",
    "hs_task_completion_date",
    "hs_timestamp",
  ]);
  const out = {};
  for (const [id, p] of Object.entries(dados)) {
    out[id] = {
      concluida: p.hs_task_status === "COMPLETED",
      // O corpo vem como HTML quando editado pelo HubSpot.
      texto: String(p.hs_task_body || "")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/\s+/g, " ")
        .trim(),
      concluidaEm: p.hs_task_completion_date || null,
      prazo: p.hs_timestamp || null,
    };
  }
  return out;
}

// Histórico de uma propriedade com a autoria de cada alteração. É a única
// forma de saber QUEM mudou um campo: a busca e o SQL não devolvem fonte.
export async function historicoDeProps(dealId, nomes) {
  const props = (nomes || []).join(",");
  const d = await hs(
    `/crm/v3/objects/deals/${dealId}?propertiesWithHistory=${encodeURIComponent(props)}`
  );
  const out = {};
  for (const [nome, versoes] of Object.entries(d.propertiesWithHistory || {})) {
    out[nome] = (versoes || []).slice(0, 10).map((v) => ({
      valor: v.value,
      quando: v.timestamp,
      origem: v.sourceType,
      fonte: v.sourceId,
      usuario: v.updatedByUserId,
    }));
  }
  return { id: String(dealId), historico: out };
}

// Sonda: existe transcrição de reunião no CRM, e em quantos negócios?
//
// O conector de IA bloqueia reunião e chamada, então a única forma de medir é
// pelo token da aplicação, que tem escopos próprios. Read-only, não grava nada.
//
// A transcrição do HubSpot vive na CHAMADA, em hs_call_transcript, mesmo
// quando a reunião foi por Zoom ou Meet: a Conversation Intelligence cria um
// registro de chamada. Por isso a sonda olha os dois.
export async function sondaReunioes(pipelineId, etapasFechadas = [], limite = 150) {
  const fora = {
    pipeline: { propertyName: "pipeline", operator: "EQ", value: String(pipelineId) },
    etapas: etapasFechadas.length
      ? { propertyName: "dealstage", operator: "NOT_IN", values: etapasFechadas }
      : null,
  };
  const d = await hs(`/crm/v3/objects/deals/search`, {
    method: "POST",
    body: JSON.stringify({
      filterGroups: [{ filters: [fora.pipeline, fora.etapas].filter(Boolean) }],
      properties: ["dealname"],
      limit: Math.min(limite, 100),
    }),
  });
  const ids = (d.results || []).map((r) => r.id);
  if (ids.length === 0) return { erro: "Nenhum negócio aberto encontrado." };

  const out = { negocios: ids.length };

  for (const [tipo, props] of [
    ["meetings", ["hs_meeting_title", "hs_meeting_body", "hs_meeting_outcome", "hs_meeting_start_time"]],
    ["calls", ["hs_call_title", "hs_call_body", "hs_call_transcript", "hs_call_duration", "hs_call_recording_url"]],
  ]) {
    try {
      const assoc = await associacoesEntre("deals", tipo, ids);
      const comAlgum = Object.values(assoc).filter((l) => l.length > 0).length;
      const todos = [...new Set(Object.values(assoc).flat())].slice(0, 100);
      const lidos = todos.length ? await lerEmLote(tipo, todos, props) : {};
      const vals = Object.values(lidos);
      const cheio = (k) => vals.filter((p) => String(p[k] || "").trim()).length;
      const tam = (k) =>
        vals.map((p) => String(p[k] || "").length).filter(Boolean).sort((a, b) => a - b);
      const meio = tam(tipo === "calls" ? "hs_call_transcript" : "hs_meeting_body");
      out[tipo] = {
        negociosComRegistro: comAlgum,
        registrosLidos: vals.length,
        preenchimento: Object.fromEntries(props.map((k) => [k, cheio(k)])),
        medianaDeCaracteres: meio.length ? meio[Math.floor(meio.length / 2)] : 0,
      };
    } catch (e) {
      // Escopo faltando é resposta, não falha: diz exatamente o que pedir.
      out[tipo] = { erro: String(e.message || e).slice(0, 300) };
    }
  }
  return out;
}


// Contatos de um negócio. O closer atua em negócio, e é no negócio que o
// contato está pendurado: não na empresa, como na carteira do farmer.
//
// Medido em 10/11/2026: 99% dos negócios abertos do B2B têm contato com
// e-mail, 98% com telefone e 99% com o papel de decisor marcado. Só 4% têm
// mais de um. Por isso aqui não há classificação como no financeiro: o
// contato do negócio é o contato.
async function _contatosDosNegocios(dealIds) {
  const ids = [...new Set((dealIds || []).map(String))];
  if (ids.length === 0) return {};
  const porNegocio = await associacoesEntre("deals", "contacts", ids);
  const todos = [...new Set(Object.values(porNegocio).flat())];
  if (todos.length === 0) return {};
  const props = await lerEmLote("contacts", todos, CONTATO_PROPS);

  const monta = (id) => {
    const p = props[id] || {};
    const nome = [p.firstname, p.lastname].filter(Boolean).join(" ").trim();
    return {
      id: String(id),
      nome: nome || p.email || `Contato ${id}`,
      cargo: p.jobtitle || "",
      papel: p.hs_buying_role || "",
      telefone: p.hs_whatsapp_phone_number || p.mobilephone || p.phone || "",
      email: p.email || "",
    };
  };

  const out = {};
  for (const [negocio, lista] of Object.entries(porNegocio)) {
    // Decisor primeiro, e quem dá para contatar antes de quem não dá.
    out[negocio] = lista.map(monta).sort((a, b) => {
      const peso = (c) => (c.papel === "DECISION_MAKER" ? 0 : 1) + (c.email || c.telefone ? 0 : 2);
      return peso(a) - peso(b);
    });
  }
  return out;
}

// Associação mais leitura em lote dos contatos, para a lista inteira do dia.
// Contato de negócio não muda no meio do expediente.
export const contatosDosNegocios = comCache(_contatosDosNegocios, "contatos-negocios", ["contatos"]);


// Um negócio pelo id, no mesmo formato da lista. O closer gera mensagem num
// negócio por vez, e varrer o funil inteiro para achar um é caro.
export async function getDealById(id) {
  const [r, labelById] = await Promise.all([
    hs(`/crm/v3/objects/deals/${id}?properties=${DEAL_PROPS.join(",")}`),
    getStageLabels(),
  ]);
  if (!r?.id) return null;
  const p = r.properties || {};
  return {
    id: r.id,
    ownerId: p.hubspot_owner_id || "",
    name: p.dealname || "(sem nome)",
    amount: p.amount ? Number(p.amount) : null,
    pipeline: p.pipeline,
    stageLabel: labelById[p.dealstage] || p.dealstage || "",
    nextActivity: p.notes_next_activity_date || null,
    nextStep: p.hs_next_step || "",
    temperatura: p.temperatura_atual || "",
    observacoes: p.observacoes || "",
    eventoEm: diaDeCampoData(p.data_prevista_do_evento),
    resumoReuniao: p.copiloto_resumo_call || "",
    transcricao: p.transcricao_completa_reuniao || "",
  };
}

// Registro da conversa no negócio. O closer atua em negócio, então é lá que a
// evidência do WhatsApp tem que aparecer, não na empresa.
export async function criarNotaNoNegocio(dealId, { corpo, ownerId }) {
  const nota = await hs("/crm/v3/objects/notes", {
    method: "POST",
    body: JSON.stringify({
      properties: {
        hs_note_body: corpo || "",
        hs_timestamp: String(Date.now()),
        ...(ownerId ? { hubspot_owner_id: String(ownerId) } : {}),
      },
    }),
  });
  await hs(`/crm/v4/objects/notes/${nota.id}/associations/default/deals/${dealId}`, { method: "PUT" });
  // A nota conta como atividade no negócio, e a lista mostra a última.
  derruba("deals");
  return nota.id;
}
