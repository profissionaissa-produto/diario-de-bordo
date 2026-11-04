import "server-only";
import { neon } from "@neondatabase/serverless";

// O Neon injeta DATABASE_URL; POSTGRES_URL cobre o naming legado da Vercel.
const CONN = process.env.DATABASE_URL || process.env.POSTGRES_URL || "";

// Sem banco configurado o painel segue funcionando; só o briefing fica indisponível.
export const dbReady = () => !!CONN;

let client;
let ready;

function db() {
  if (!client) client = neon(CONN);
  return client;
}

// Cria as tabelas na primeira consulta. ponytail: migração é isto; se o schema
// crescer, trocar por arquivos de migração versionados.
function init() {
  if (!ready) {
    const sql = db();
    ready = (async () => {
      await sql`CREATE TABLE IF NOT EXISTS briefings (
        owner_id TEXT NOT NULL,
        dia DATE NOT NULL,
        status TEXT NOT NULL DEFAULT 'rascunho',
        motivo TEXT,
        revisado_por TEXT,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (owner_id, dia)
      )`;
      // "de" guarda a temperatura no momento do briefing; "para", a pretendida.
      await sql`CREATE TABLE IF NOT EXISTS briefing_items (
        owner_id TEXT NOT NULL,
        dia DATE NOT NULL,
        deal_id TEXT NOT NULL,
        de TEXT,
        para TEXT,
        estrategia TEXT,
        PRIMARY KEY (owner_id, dia, deal_id)
      )`;
      // Tabela criada antes do campo estratégia continua válida.
      await sql`ALTER TABLE briefing_items ADD COLUMN IF NOT EXISTS estrategia TEXT`;
      // Observação do gestor naquele negócio, escrita ao revisar o briefing.
      // Fica ao lado da do closer, sem substituí-la: são duas vozes.
      await sql`ALTER TABLE briefing_items ADD COLUMN IF NOT EXISTS obs_gestor TEXT`;

      // Fechamento do dia: o que de fato aconteceu em cada negócio marcado.
      // Fica fora de briefing_items de propósito — saveBriefing apaga e
      // reinsere os itens, e uma edição do gestor levaria o fechamento junto.
      await sql`CREATE TABLE IF NOT EXISTS fechamentos (
        owner_id TEXT NOT NULL,
        dia DATE NOT NULL,
        deal_id TEXT NOT NULL,
        resultado TEXT NOT NULL,
        observacao TEXT,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (owner_id, dia, deal_id)
      )`;

      // Tarefa criada no HubSpot a partir da estratégia aprovada. Fica aqui, e
      // não em briefing_items, porque saveBriefing apaga e reinsere os itens:
      // uma edição do gestor faria o diário criar a tarefa de novo.
      await sql`CREATE TABLE IF NOT EXISTS briefing_tarefas (
        owner_id TEXT NOT NULL,
        dia DATE NOT NULL,
        deal_id TEXT NOT NULL,
        task_id TEXT NOT NULL,
        criada_em TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (owner_id, dia, deal_id)
      )`;

      // Lista do dia do closer, montada pelos critérios do B2B (lib/funil.js).
      // Só a escalação: o resultado de cada negócio vive em `fechamentos`.
      await sql`CREATE TABLE IF NOT EXISTS funil_dia (
        owner_id TEXT NOT NULL,
        dia DATE NOT NULL,
        deal_id TEXT NOT NULL,
        grupo TEXT NOT NULL,
        posicao INT NOT NULL,
        porque TEXT,
        PRIMARY KEY (owner_id, dia, deal_id)
      )`;
      // Por que o negócio entrou sem bater critério. Fica gravado com a lista
      // porque depende da última compra da empresa, que custa duas chamadas —
      // recalcular a cada abertura da tela sairia caro à toa.
      await sql`ALTER TABLE funil_dia ADD COLUMN IF NOT EXISTS porque TEXT`;

      // Lista do dia do farmer. Gravada na primeira abertura e congelada:
      // atualizar a página não pode reembaralhar o compromisso do dia.
      // O resultado fica na mesma linha porque é dele que sai o histórico que
      // decide o descanso e a sequência de tentativas.
      await sql`CREATE TABLE IF NOT EXISTS carteira_dia (
        owner_id TEXT NOT NULL,
        dia DATE NOT NULL,
        company_id TEXT NOT NULL,
        nome TEXT,
        balde TEXT NOT NULL,
        extra BOOLEAN NOT NULL DEFAULT false,
        posicao INT NOT NULL,
        ultima_compra DATE,
        ultimo_contato DATE,
        abordagem TEXT,
        contexto TEXT,
        resultado TEXT,
        observacao TEXT,
        editado_por TEXT,
        PRIMARY KEY (owner_id, dia, company_id)
      )`;
      // Tabela criada antes destes campos continua válida.
      await sql`ALTER TABLE carteira_dia ADD COLUMN IF NOT EXISTS contexto TEXT`;
      await sql`ALTER TABLE carteira_dia ADD COLUMN IF NOT EXISTS editado_por TEXT`;
      // Guarda o id ("farmer-11"), não o título: o título pode ser reescrito
      // em Configurações e o registro do dia continua apontando certo.
      await sql`ALTER TABLE carteira_dia ADD COLUMN IF NOT EXISTS estrategia TEXT`;

      // Pedido de troca de segmento: a empresa está na carteira errada. Fica
      // fora do rodízio enquanto o líder não decide — por isso é tabela, e não
      // só o resultado do dia: a decisão vale para além daquele dia.
      await sql`CREATE TABLE IF NOT EXISTS carteira_troca (
        owner_id TEXT NOT NULL,
        company_id TEXT NOT NULL,
        nome TEXT,
        motivo TEXT,
        status TEXT NOT NULL DEFAULT ('pendente'),
        pedido_em TIMESTAMPTZ NOT NULL DEFAULT now(),
        decidido_por TEXT,
        decidido_em TIMESTAMPTZ,
        PRIMARY KEY (owner_id, company_id)
      )`;

      // Orientação do líder para uma empresa travada. Aparece no card do
      // farmer assinada, porque conselho sem dono ninguém segue.
      await sql`CREATE TABLE IF NOT EXISTS carteira_orientacao (
        owner_id TEXT NOT NULL,
        company_id TEXT NOT NULL,
        texto TEXT NOT NULL,
        autor TEXT,
        criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (owner_id, company_id)
      )`;

      // Como a tramitação evoluiu no dia. Fica por dia, e não na tramitação,
      // porque uma pendência atravessa vários dias e cada um tem sua história.
      await sql`CREATE TABLE IF NOT EXISTS tramitacao_dia (
        ticket_id TEXT NOT NULL,
        tipo TEXT NOT NULL,
        dia DATE NOT NULL,
        resultado TEXT NOT NULL,
        observacao TEXT,
        quem TEXT,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (ticket_id, tipo, dia)
      )`;

      // O dia do farmer: quando ele abriu e o que o líder comentou. A situação
      // continua derivada do que foi preenchido — aqui fica só o que não dá
      // para deduzir.
      await sql`CREATE TABLE IF NOT EXISTS carteira_briefing (
        owner_id TEXT NOT NULL,
        dia DATE NOT NULL,
        primeiro_acesso TIMESTAMPTZ,
        comentario_lider TEXT,
        comentado_por TEXT,
        revisado_em TIMESTAMPTZ,
        revisado_por TEXT,
        PRIMARY KEY (owner_id, dia)
      )`;
      await sql`ALTER TABLE carteira_briefing ADD COLUMN IF NOT EXISTS revisado_em TIMESTAMPTZ`;
      await sql`ALTER TABLE carteira_briefing ADD COLUMN IF NOT EXISTS revisado_por TEXT`;

      // Tramitações: baixa em duas mãos. O responsável marca, o líder confirma
      // ou devolve. A pendência em si é calculada do HubSpot; aqui fica só a
      // decisão humana sobre ela.
      await sql`CREATE TABLE IF NOT EXISTS tramitacoes (
        ticket_id TEXT NOT NULL,
        tipo TEXT NOT NULL,
        status TEXT NOT NULL,
        marcado_por TEXT,
        marcado_em TIMESTAMPTZ,
        decidido_por TEXT,
        decidido_em TIMESTAMPTZ,
        motivo TEXT,
        PRIMARY KEY (ticket_id, tipo)
      )`;

      // Estratégias cadastradas pela curadoria de cada segmento. As dez
      // originais continuam no código (lib/estrategias.js): aqui fica só o que
      // for criado depois. O id é gravado no briefing, então nunca muda.
      await sql`CREATE TABLE IF NOT EXISTS estrategias (
        id TEXT PRIMARY KEY,
        seg TEXT NOT NULL,
        titulo TEXT NOT NULL,
        descricao TEXT,
        criado_por TEXT,
        criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
      )`;

      // Cada mensagem disparada para uma empresa, por canal. É daqui que sai a
      // contagem da cascata, então é log e não contador: saber quando foi, por
      // quem e para qual contato é o que permite auditar um canal fechado.
      // `resolvida` fica true quando o contato finalmente acontece; a cascata
      // só olha as não resolvidas, porque o teto é de tentativas sem sucesso.
      await sql`CREATE TABLE IF NOT EXISTS contato_tentativa (
        id BIGSERIAL PRIMARY KEY,
        company_id TEXT NOT NULL,
        canal TEXT NOT NULL,
        owner_id TEXT,
        contato_id TEXT,
        dia DATE NOT NULL,
        texto TEXT,
        resolvida BOOLEAN NOT NULL DEFAULT false,
        criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
      )`;
      await sql`CREATE INDEX IF NOT EXISTS contato_tentativa_empresa
        ON contato_tentativa (company_id, resolvida)`;

      // Estratégia tirada da lista. Não é DELETE: o briefing já gravado guarda
      // o id, e apagar a linha apagaria o nome dela no histórico. Por (seg, id)
      // porque o Farmer herdou os ids b2b-*: tirar lá não pode tirar no B2B.
      await sql`CREATE TABLE IF NOT EXISTS estrategias_ocultas (
        seg TEXT NOT NULL,
        id TEXT NOT NULL,
        ocultada_por TEXT,
        ocultada_em TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (seg, id)
      )`;
    })();
  }
  return ready;
}

// { status, motivo, revisadoPor, items: { [dealId]: {de, para} } }
export async function getBriefing(ownerId, dia) {
  if (!dbReady()) return null;
  try {
    await init();
    const sql = db();
    const [cab, itens] = await Promise.all([
      sql`SELECT status, motivo, revisado_por FROM briefings WHERE owner_id=${String(ownerId)} AND dia=${dia}`,
      sql`SELECT deal_id, de, para, estrategia, obs_gestor FROM briefing_items WHERE owner_id=${String(ownerId)} AND dia=${dia}`,
    ]);
    const row = cab[0];
    const items = {};
    for (const it of itens)
      items[it.deal_id] = { de: it.de || "", para: it.para || "", estrategia: it.estrategia || "", obsGestor: it.obs_gestor || "" };
    // Sem registro e sem itens, o closer ainda não enviou nada hoje.
    const existe = !!row || itens.length > 0;
    return {
      // Gravado = enviado. "rascunho" só existe antes do primeiro envio, e
      // registros legados com esse status ficariam invisíveis na aprovação.
      status: existe ? semRascunho(row?.status) : "rascunho",
      motivo: row?.motivo || "",
      revisadoPor: row?.revisado_por || "",
      items,
    };
  } catch (e) {
    console.error("[briefing] falha ao ler:", e?.message);
    return null;
  }
}

// Briefings de um dia (tela de aprovações).
export async function getDayBriefings(dia) {
  if (!dbReady()) return [];
  try {
    await init();
    const sql = db();
    const [cab, itens] = await Promise.all([
      sql`SELECT owner_id, status, motivo, revisado_por FROM briefings WHERE dia=${dia}`,
      sql`SELECT owner_id, deal_id, de, para, estrategia, obs_gestor FROM briefing_items WHERE dia=${dia}`,
    ]);
    const porOwner = {};
    for (const c of cab) {
      porOwner[c.owner_id] = {
        ownerId: c.owner_id,
        status: semRascunho(c.status),
        motivo: c.motivo || "",
        revisadoPor: c.revisado_por || "",
        items: {},
      };
    }
    for (const it of itens) {
      if (porOwner[it.owner_id]) {
        porOwner[it.owner_id].items[it.deal_id] = { de: it.de || "", para: it.para || "", estrategia: it.estrategia || "", obsGestor: it.obs_gestor || "" };
      }
    }
    return Object.values(porOwner);
  } catch (e) {
    console.error("[briefing] falha ao listar dia:", e?.message);
    return [];
  }
}

// Briefings de vários dias (agenda geral da semana).
export async function getBriefingsForDays(dias) {
  if (!dbReady() || dias.length === 0) return [];
  try {
    await init();
    const sql = db();
    const [cab, itens] = await Promise.all([
      sql`SELECT owner_id, dia, status FROM briefings WHERE dia = ANY(${dias}::date[])`,
      sql`SELECT owner_id, dia, deal_id, de, para, estrategia FROM briefing_items WHERE dia = ANY(${dias}::date[])`,
    ]);
    const chave = (o, d) => `${o}|${toKey(d)}`;
    const mapa = {};
    for (const c of cab) {
      mapa[chave(c.owner_id, c.dia)] = {
        ownerId: c.owner_id,
        dia: toKey(c.dia),
        status: semRascunho(c.status),
        items: {},
      };
    }
    for (const it of itens) {
      const k = chave(it.owner_id, it.dia);
      mapa[k] ||= { ownerId: it.owner_id, dia: toKey(it.dia), status: "enviado", items: {} };
      mapa[k].items[it.deal_id] = { de: it.de || "", para: it.para || "", estrategia: it.estrategia || "" };
    }
    return Object.values(mapa);
  } catch (e) {
    console.error("[briefing] falha ao listar semana:", e?.message);
    return [];
  }
}

const semRascunho = (s) => (!s || s === "rascunho" ? "enviado" : s);

// O driver devolve DATE como Date; a UI trabalha com "YYYY-MM-DD".
function toKey(d) {
  if (typeof d === "string") return d.slice(0, 10);
  const dt = new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

// Histórico: todos os dias registrados, do mais recente para trás. Inclui o dia
// atual — restrito a dias anteriores, ficava vazio no começo do uso.
export async function getBriefingHistory(_diaAtual, limit = 200) {
  if (!dbReady()) return [];
  try {
    await init();
    const sql = db();
    const rows = await sql`
      SELECT b.owner_id, b.dia, b.status, b.motivo, b.revisado_por,
        (SELECT COUNT(*) FROM briefing_items i WHERE i.owner_id = b.owner_id AND i.dia = b.dia) AS n
      FROM briefings b
      ORDER BY b.dia DESC, b.owner_id
      LIMIT ${limit}`;
    return rows.map((r) => ({
      ownerId: r.owner_id,
      dia: toKey(r.dia),
      status: semRascunho(r.status),
      motivo: r.motivo || "",
      revisadoPor: r.revisado_por || "",
      negocios: Number(r.n) || 0,
    }));
  } catch (e) {
    console.error("[briefing] falha no histórico:", e?.message);
    return [];
  }
}

// Substitui os itens do briefing. status null preserva o atual.
export async function saveBriefing(ownerId, dia, items, status) {
  await init();
  const sql = db();
  // status null = o gestor está apenas ajustando: preserva a situação, exceto
  // quando ainda é rascunho — aí o briefing precisa entrar na fila de aprovação,
  // senão fica invisível para todo mundo.
  await sql`INSERT INTO briefings (owner_id, dia, status, updated_at)
    VALUES (${String(ownerId)}, ${dia}, COALESCE(${status}, 'enviado'), now())
    ON CONFLICT (owner_id, dia) DO UPDATE
    SET status = COALESCE(${status}, NULLIF(briefings.status, 'rascunho'), 'enviado'),
        updated_at = now()`;
  await sql`DELETE FROM briefing_items WHERE owner_id=${String(ownerId)} AND dia=${dia}`;

  const entries = Object.entries(items);
  if (entries.length) {
    const ids = entries.map(([id]) => String(id));
    const des = entries.map(([, v]) => v?.de || null);
    const paras = entries.map(([, v]) => v?.para || null);
    const estrats = entries.map(([, v]) => v?.estrategia || null);
    const obsGestor = entries.map(([, v]) => v?.obsGestor || null);
    await sql`INSERT INTO briefing_items (owner_id, dia, deal_id, de, para, estrategia, obs_gestor)
      SELECT ${String(ownerId)}, ${dia}, d, x, y, z, g
      FROM unnest(${ids}::text[], ${des}::text[], ${paras}::text[], ${estrats}::text[],
                  ${obsGestor}::text[]) AS t(d, x, y, z, g)`;
  }
}

export async function reviewBriefing(ownerId, dia, status, motivo, revisor) {
  await init();
  const sql = db();
  await sql`INSERT INTO briefings (owner_id, dia, status, motivo, revisado_por, updated_at)
    VALUES (${String(ownerId)}, ${dia}, ${status}, ${motivo || null}, ${revisor}, now())
    ON CONFLICT (owner_id, dia) DO UPDATE
    SET status=${status}, motivo=${motivo || null}, revisado_por=${revisor}, updated_at=now()`;
}

// ---------------------------------------------------------------- fechamento

// Resultados possíveis. A observação é exigida onde o número sozinho não
// explica nada: o que saiu da conversa, ou por que o negócio não foi tocado.
// Em tentativa não se pede — a atividade registrada no CRM já é a evidência.
export const RESULTADOS = {
  efetivo: { label: "Contato efetivo", exigeObs: true },
  tentativa: { label: "Tentei, sem sucesso", exigeObs: false },
  nao_atuei: { label: "Não atuei", exigeObs: true },
};
export const MIN_OBS = 50;

// { [dealId]: { resultado, observacao } }
export async function getFechamento(ownerId, dia) {
  if (!dbReady()) return {};
  try {
    await init();
    const sql = db();
    const rows = await sql`SELECT deal_id, resultado, observacao FROM fechamentos
      WHERE owner_id=${String(ownerId)} AND dia=${dia}`;
    const out = {};
    for (const r of rows) out[r.deal_id] = { resultado: r.resultado, observacao: r.observacao || "" };
    return out;
  } catch (e) {
    console.error("[fechamento] falha ao ler:", e?.message);
    return {};
  }
}

// Grava um negócio de cada vez: o closer fecha conforme termina, não no fim.
export async function salvarFechamento(ownerId, dia, dealId, resultado, observacao) {
  await init();
  const sql = db();
  await sql`INSERT INTO fechamentos (owner_id, dia, deal_id, resultado, observacao, updated_at)
    VALUES (${String(ownerId)}, ${dia}, ${String(dealId)}, ${resultado}, ${observacao || null}, now())
    ON CONFLICT (owner_id, dia, deal_id) DO UPDATE
    SET resultado=${resultado}, observacao=${observacao || null}, updated_at=now()`;
}

// Negócios que já ganharam tarefa neste dia — aprovar de novo não duplica.
export async function dealsComTarefa(ownerId, dia) {
  if (!dbReady()) return new Set();
  try {
    await init();
    const sql = db();
    const rows = await sql`SELECT deal_id FROM briefing_tarefas
      WHERE owner_id=${String(ownerId)} AND dia=${dia}`;
    return new Set(rows.map((r) => r.deal_id));
  } catch (e) {
    console.error("[tarefa] falha ao ler:", e?.message);
    return new Set();
  }
}

export async function registraTarefa(ownerId, dia, dealId, taskId) {
  await init();
  const sql = db();
  await sql`INSERT INTO briefing_tarefas (owner_id, dia, deal_id, task_id)
    VALUES (${String(ownerId)}, ${dia}, ${String(dealId)}, ${String(taskId)})
    ON CONFLICT (owner_id, dia, deal_id) DO UPDATE SET task_id=${String(taskId)}`;
}

// Fechamentos de um dia inteiro (agenda e evolução).
export async function getFechamentosDoDia(dia) {
  if (!dbReady()) return {};
  try {
    await init();
    const sql = db();
    const rows = await sql`SELECT owner_id, deal_id, resultado FROM fechamentos WHERE dia=${dia}`;
    const out = {};
    for (const r of rows) (out[r.owner_id] ||= {})[r.deal_id] = r.resultado;
    return out;
  } catch (e) {
    console.error("[fechamento] falha ao listar dia:", e?.message);
    return {};
  }
}

// ----------------------------------------------------------------- evolução

// -------------------------------------------------------------- tramitações

// { [`${ticketId}|${tipo}`]: { status, marcadoPor, decididoPor, motivo } }
export async function getTramitacoes(ticketIds) {
  if (!dbReady() || ticketIds.length === 0) return {};
  try {
    await init();
    const sql = db();
    const rows = await sql`SELECT ticket_id, tipo, status, marcado_por, decidido_por, motivo
      FROM tramitacoes WHERE ticket_id = ANY(${ticketIds.map(String)}::text[])`;
    const out = {};
    for (const r of rows) {
      out[`${r.ticket_id}|${r.tipo}`] = {
        status: r.status,
        marcadoPor: r.marcado_por || "",
        decididoPor: r.decidido_por || "",
        motivo: r.motivo || "",
      };
    }
    return out;
  } catch (e) {
    console.error("[tramitacoes] falha ao ler:", e?.message);
    return {};
  }
}

// "aguardando" = o responsável marcou e espera o líder.
export async function marcarTramitacao(ticketId, tipo, quem) {
  await init();
  const sql = db();
  await sql`INSERT INTO tramitacoes (ticket_id, tipo, status, marcado_por, marcado_em)
    VALUES (${String(ticketId)}, ${tipo}, 'aguardando', ${quem}, now())
    ON CONFLICT (ticket_id, tipo) DO UPDATE
    SET status='aguardando', marcado_por=${quem}, marcado_em=now(),
        decidido_por=NULL, decidido_em=NULL, motivo=NULL`;
}

// Negar devolve a pendência ao board com o prazo original — vencida volta
// vencida. É o que impede que "marcar como feito" vire atalho para sumir.
export async function decidirTramitacao(ticketId, tipo, decisao, quem, motivo) {
  await init();
  const sql = db();
  await sql`INSERT INTO tramitacoes (ticket_id, tipo, status, decidido_por, decidido_em, motivo)
    VALUES (${String(ticketId)}, ${tipo}, ${decisao}, ${quem}, now(), ${motivo || null})
    ON CONFLICT (ticket_id, tipo) DO UPDATE
    SET status=${decisao}, decidido_por=${quem}, decidido_em=now(), motivo=${motivo || null}`;
}

// ------------------------------------------------- lista do dia do farmer

// A lista já gravada para o dia, na ordem em que foi montada.
export async function getListaDia(ownerId, dia) {
  if (!dbReady()) return [];
  try {
    await init();
    const sql = db();
    const rows = await sql`SELECT company_id, nome, balde, extra, ultima_compra, ultimo_contato,
        abordagem, contexto, estrategia, resultado, observacao, editado_por
      FROM carteira_dia WHERE owner_id=${String(ownerId)} AND dia=${dia}
      ORDER BY extra, posicao`;
    return rows.map((r) => ({
      id: r.company_id,
      nome: r.nome || `Empresa ${r.company_id}`,
      balde: r.balde,
      extra: r.extra,
      ultimaCompra: r.ultima_compra ? toKey(r.ultima_compra) : null,
      ultimoContato: r.ultimo_contato ? toKey(r.ultimo_contato) : null,
      abordagem: r.abordagem || null,
      contexto: r.contexto || "",
      estrategia: r.estrategia || "",
      resultado: r.resultado || null,
      observacao: r.observacao || "",
      editadoPor: r.editado_por || null,
    }));
  } catch (e) {
    console.error("[carteira] falha ao ler a lista do dia:", e?.message);
    return [];
  }
}

// Grava a lista do dia. DO NOTHING no conflito: uma vez sorteada, é ela que
// vale — reabrir a tela não pode trocar o compromisso do farmer.
export async function salvarListaDia(ownerId, dia, empresas) {
  if (empresas.length === 0) return;
  await init();
  const sql = db();
  const ids = empresas.map((e) => String(e.id));
  const nomes = empresas.map((e) => e.nome || null);
  const baldes = empresas.map((e) => e.balde);
  const extras = empresas.map((e) => !!e.extra);
  const pos = empresas.map((_, i) => i);
  const compras = empresas.map((e) => e.ultimaCompra || null);
  const contatos = empresas.map((e) => e.ultimoContato || null);
  await sql`INSERT INTO carteira_dia
      (owner_id, dia, company_id, nome, balde, extra, posicao, ultima_compra, ultimo_contato)
    SELECT ${String(ownerId)}, ${dia}, c, n, b, x, p, uc, ut
    FROM unnest(${ids}::text[], ${nomes}::text[], ${baldes}::text[], ${extras}::boolean[],
                ${pos}::int[], ${compras}::date[], ${contatos}::date[])
      AS t(c, n, b, x, p, uc, ut)
    ON CONFLICT (owner_id, dia, company_id) DO NOTHING`;
}

// Dias anteriores já registrados, para montar o histórico que decide o
// descanso e a sequência de tentativas. Ordenado como montaHistorico espera.
export async function getHistoricoCarteira(ownerId, hoje) {
  if (!dbReady()) return [];
  try {
    await init();
    const sql = db();
    const rows = await sql`SELECT company_id, dia, resultado FROM carteira_dia
      WHERE owner_id=${String(ownerId)} AND dia < ${hoje}::date
      ORDER BY company_id, dia DESC`;
    return rows.map((r) => ({
      companyId: r.company_id,
      data: toKey(r.dia),
      resultado: r.resultado || null,
    }));
  } catch (e) {
    console.error("[carteira] falha ao ler o histórico:", e?.message);
    return [];
  }
}

// Abordagem escolhida de manhã para uma empresa da lista.
export async function salvarAbordagem(ownerId, dia, companyId, { abordagem, contexto, estrategia } = {}, editadoPor) {
  await init();
  const sql = db();
  // COALESCE: quem manda só a abordagem não apaga o contexto, e vice-versa.
  const r = await sql`UPDATE carteira_dia
    SET abordagem = COALESCE(${abordagem === undefined ? null : abordagem}, abordagem),
        contexto = COALESCE(${contexto === undefined ? null : contexto}, contexto),
        estrategia = COALESCE(${estrategia === undefined ? null : estrategia}, estrategia),
        editado_por = COALESCE(${editadoPor || null}, editado_por)
    WHERE owner_id=${String(ownerId)} AND dia=${dia} AND company_id=${String(companyId)}
    RETURNING company_id`;
  // Empresa fora da lista do dia não recebe abordagem: a lista é o compromisso.
  return r.length > 0;
}

// Fechamento de uma empresa da lista: o que aconteceu e por quê.
export async function salvarResultadoCarteira(ownerId, dia, companyId, resultado, observacao, editadoPor) {
  await init();
  const sql = db();
  const r = await sql`UPDATE carteira_dia
    SET resultado=${resultado || null}, observacao=${observacao || null},
        editado_por = COALESCE(${editadoPor || null}, editado_por)
    WHERE owner_id=${String(ownerId)} AND dia=${dia} AND company_id=${String(companyId)}
    RETURNING company_id`;
  return r.length > 0;
}

// Situação do dia de vários farmers — a agenda do líder. O estado é derivado
// do que foi preenchido: sem abordagem é dia não começado, sem resultado em
// alguma empresa é dia em aberto.
export async function getDiasDosFarmers(ownerIds, dia) {
  if (!dbReady() || ownerIds.length === 0) return {};
  try {
    await init();
    const sql = db();
    const rows = await sql`SELECT owner_id, company_id, nome, balde, extra, abordagem, contexto,
        resultado, observacao, editado_por
      FROM carteira_dia
      WHERE dia=${dia} AND owner_id = ANY(${ownerIds.map(String)}::text[])
      ORDER BY owner_id, extra, posicao`;
    const out = {};
    for (const r of rows) {
      (out[r.owner_id] ||= []).push({
        id: r.company_id,
        nome: r.nome || `Empresa ${r.company_id}`,
        balde: r.balde,
        extra: r.extra,
        abordagem: r.abordagem || null,
        contexto: r.contexto || "",
        resultado: r.resultado || null,
        observacao: r.observacao || "",
        editadoPor: r.editado_por || null,
      });
    }
    return out;
  } catch (e) {
    console.error("[carteira] falha ao ler o dia dos farmers:", e?.message);
    return {};
  }
}

// ------------------------------------------- troca de segmento e orientação

// Abre o pedido quando o farmer marca "trocar de segmento". Se já existe
// pendente, atualiza o motivo — o farmer pode ter reescrito.
export async function pedirTroca(ownerId, companyId, nome, motivo) {
  await init();
  const sql = db();
  await sql`INSERT INTO carteira_troca (owner_id, company_id, nome, motivo, status)
    VALUES (${String(ownerId)}, ${String(companyId)}, ${nome || null}, ${motivo || null}, 'pendente')
    ON CONFLICT (owner_id, company_id) DO UPDATE
    SET motivo=${motivo || null}, status='pendente', pedido_em=now(),
        decidido_por=NULL, decidido_em=NULL`;
}

// Pedidos em aberto. Enquanto existirem, a empresa não volta ao rodízio.
export async function getTrocasPendentes(ownerIds) {
  if (!dbReady() || ownerIds.length === 0) return {};
  try {
    await init();
    const sql = db();
    const rows = await sql`SELECT owner_id, company_id, nome, motivo, pedido_em
      FROM carteira_troca
      WHERE status='pendente' AND owner_id = ANY(${ownerIds.map(String)}::text[])
      ORDER BY pedido_em`;
    const out = {};
    for (const r of rows) {
      (out[r.owner_id] ||= []).push({
        id: r.company_id,
        nome: r.nome || `Empresa ${r.company_id}`,
        motivo: r.motivo || "",
      });
    }
    return out;
  } catch (e) {
    console.error("[carteira] falha ao ler as trocas:", e?.message);
    return {};
  }
}

// "trocado" fecha o pedido (a empresa saiu da carteira no HubSpot);
// "mantido" devolve a empresa ao rodízio do farmer.
export async function decidirTroca(ownerId, companyId, decisao, quem) {
  await init();
  const sql = db();
  await sql`UPDATE carteira_troca
    SET status=${decisao}, decidido_por=${quem}, decidido_em=now()
    WHERE owner_id=${String(ownerId)} AND company_id=${String(companyId)}`;
}

export async function salvarOrientacao(ownerId, companyId, texto, autor) {
  await init();
  const sql = db();
  await sql`INSERT INTO carteira_orientacao (owner_id, company_id, texto, autor, criado_em)
    VALUES (${String(ownerId)}, ${String(companyId)}, ${texto}, ${autor}, now())
    ON CONFLICT (owner_id, company_id) DO UPDATE
    SET texto=${texto}, autor=${autor}, criado_em=now()`;
}

export async function getOrientacoes(ownerIds) {
  if (!dbReady() || ownerIds.length === 0) return {};
  try {
    await init();
    const sql = db();
    const rows = await sql`SELECT owner_id, company_id, texto, autor FROM carteira_orientacao
      WHERE owner_id = ANY(${ownerIds.map(String)}::text[])`;
    const out = {};
    for (const r of rows) {
      (out[r.owner_id] ||= {})[r.company_id] = { texto: r.texto, autor: r.autor || "" };
    }
    return out;
  } catch (e) {
    console.error("[carteira] falha ao ler as orientações:", e?.message);
    return {};
  }
}

// Evolução da tramitação no dia: resolvi, avancei ou travado.
export async function salvarEvolucaoTramitacao(ticketId, tipo, dia, resultado, observacao, quem) {
  await init();
  const sql = db();
  await sql`INSERT INTO tramitacao_dia (ticket_id, tipo, dia, resultado, observacao, quem, updated_at)
    VALUES (${String(ticketId)}, ${tipo}, ${dia}, ${resultado}, ${observacao || null}, ${quem}, now())
    ON CONFLICT (ticket_id, tipo, dia) DO UPDATE
    SET resultado=${resultado}, observacao=${observacao || null}, quem=${quem}, updated_at=now()`;
}

export async function getEvolucaoTramitacoes(ticketIds, dia) {
  if (!dbReady() || ticketIds.length === 0) return {};
  try {
    await init();
    const sql = db();
    const rows = await sql`SELECT ticket_id, tipo, resultado, observacao FROM tramitacao_dia
      WHERE dia=${dia} AND ticket_id = ANY(${ticketIds.map(String)}::text[])`;
    const out = {};
    for (const r of rows) {
      out[`${r.ticket_id}|${r.tipo}`] = { resultado: r.resultado, observacao: r.observacao || "" };
    }
    return out;
  } catch (e) {
    console.error("[tramitacoes] falha ao ler a evolução:", e?.message);
    return {};
  }
}

// Evolução da carteira: uma linha por farmer e dia, com a composição do que
// foi setado. Extras e trocas de segmento ficam fora — as quatro faixas
// precisam somar exatamente o compromisso do dia.
export async function getEvolucaoCarteira(dias, ownerIds) {
  if (!dbReady() || dias.length === 0 || ownerIds.length === 0) return [];
  try {
    await init();
    const sql = db();
    const rows = await sql`SELECT owner_id, dia, resultado FROM carteira_dia
      WHERE dia = ANY(${dias}::date[]) AND owner_id = ANY(${ownerIds.map(String)}::text[])
        AND extra = false AND (resultado IS NULL OR resultado <> 'trocar_segmento')`;
    const mapa = {};
    for (const r of rows) {
      const k = `${r.owner_id}|${toKey(r.dia)}`;
      mapa[k] ||= {
        ownerId: r.owner_id, dia: toKey(r.dia), marcados: 0,
        efetivo: 0, tentativa: 0, nao_abordei: 0, sem_registro: 0,
      };
      mapa[k].marcados++;
      const faixa = ["efetivo", "tentativa", "nao_abordei"].includes(r.resultado)
        ? r.resultado
        : "sem_registro";
      mapa[k][faixa]++;
    }
    return Object.values(mapa);
  } catch (e) {
    console.error("[carteira] falha ao apurar a evolução:", e?.message);
    return [];
  }
}

// Marca a primeira vez que o farmer abriu o próprio dia. Só a primeira: é o
// horário de início, não o último acesso.
export async function registrarAcesso(ownerId, dia) {
  await init();
  const sql = db();
  await sql`INSERT INTO carteira_briefing (owner_id, dia, primeiro_acesso)
    VALUES (${String(ownerId)}, ${dia}, now())
    ON CONFLICT (owner_id, dia) DO NOTHING`;
}

export async function comentarDia(ownerId, dia, texto, quem) {
  await init();
  const sql = db();
  await sql`INSERT INTO carteira_briefing (owner_id, dia, comentario_lider, comentado_por)
    VALUES (${String(ownerId)}, ${dia}, ${texto}, ${quem})
    ON CONFLICT (owner_id, dia) DO UPDATE
    SET comentario_lider=${texto}, comentado_por=${quem}`;
}

export async function getBriefingsCarteira(ownerIds, dia) {
  if (!dbReady() || ownerIds.length === 0) return {};
  try {
    await init();
    const sql = db();
    const rows = await sql`SELECT owner_id, primeiro_acesso, comentario_lider, comentado_por,
        revisado_em, revisado_por
      FROM carteira_briefing WHERE dia=${dia} AND owner_id = ANY(${ownerIds.map(String)}::text[])`;
    const out = {};
    for (const r of rows) {
      out[r.owner_id] = {
        primeiroAcesso: r.primeiro_acesso || null,
        comentario: r.comentario_lider || "",
        comentadoPor: r.comentado_por || "",
        revisado: !!r.revisado_em,
        revisadoPor: r.revisado_por || "",
      };
    }
    return out;
  } catch (e) {
    console.error("[carteira] falha ao ler o dia:", e?.message);
    return {};
  }
}

// Preenche o resultado a partir da atividade do CRM, sem tocar no que já foi
// decidido à mão. É isto que faz o placar do líder evoluir ao longo do dia sem
// ninguém reabrir o diário.
// Só grava onde o campo está vazio: escolha do farmer nunca é sobrescrita.
export async function aplicarAtividade(ownerId, dia, atividadePorEmpresa) {
  const entradas = Object.entries(atividadePorEmpresa || {}).filter(([, a]) => a?.sugerido);
  if (entradas.length === 0) return 0;
  await init();
  const sql = db();

  const ids = entradas.map(([id]) => String(id));
  const resultados = entradas.map(([, a]) => a.sugerido);
  // O texto da ligação vira a observação, limitado para não estourar o card.
  const textos = entradas.map(([, a]) => (a.texto ? a.texto.slice(0, 600) : null));

  const r = await sql`
    UPDATE carteira_dia c SET
      resultado = COALESCE(c.resultado, t.res),
      observacao = CASE
        WHEN COALESCE(NULLIF(TRIM(c.observacao), ''), NULL) IS NULL THEN COALESCE(t.txt, c.observacao)
        ELSE c.observacao END
    FROM unnest(${ids}::text[], ${resultados}::text[], ${textos}::text[]) AS t(emp, res, txt)
    WHERE c.owner_id = ${String(ownerId)} AND c.dia = ${dia} AND c.company_id = t.emp
      AND c.resultado IS NULL
    RETURNING c.company_id`;
  return r.length;
}

// O farmer desmarcou "trocar de segmento": o pedido em aberto deixa de existir
// e a empresa volta ao rodízio. Pedido já decidido pelo líder não se desfaz.
export async function cancelarTrocaPendente(ownerId, companyId) {
  await init();
  const sql = db();
  await sql`DELETE FROM carteira_troca
    WHERE owner_id=${String(ownerId)} AND company_id=${String(companyId)} AND status='pendente'`;
}

// O líder revisou o dia do farmer. Fica separado do comentário: dá para
// revisar sem escrever nada, e comentar sem ter revisado.
export async function marcarRevisado(ownerId, dia, quem) {
  await init();
  const sql = db();
  await sql`INSERT INTO carteira_briefing (owner_id, dia, revisado_em, revisado_por)
    VALUES (${String(ownerId)}, ${dia}, now(), ${quem})
    ON CONFLICT (owner_id, dia) DO UPDATE
    SET revisado_em=now(), revisado_por=${quem}`;
}

// -------------------------------------------------- lista do dia do closer

// Espelha a carteira do farmer: a lista é gravada na primeira abertura e
// congelada. Atualizar a página não pode reembaralhar o compromisso do dia.
// O resultado não fica aqui — ele já vive em `fechamentos`, que é a tela onde
// o closer registra o que aconteceu.
export async function getListaFunil(ownerId, dia) {
  if (!dbReady()) return [];
  try {
    await init();
    const sql = db();
    const rows = await sql`SELECT deal_id, grupo, porque FROM funil_dia
      WHERE owner_id=${String(ownerId)} AND dia=${dia} ORDER BY posicao`;
    return rows.map((r) => ({ id: r.deal_id, grupo: r.grupo, porque: r.porque || "" }));
  } catch (e) {
    console.error("[funil] falha ao ler a lista do dia:", e?.message);
    return [];
  }
}

export async function salvarListaFunil(ownerId, dia, negocios) {
  if (!negocios.length) return;
  await init();
  const sql = db();
  const ids = negocios.map((n) => String(n.id));
  const grupos = negocios.map((n) => n.grupo);
  const pos = negocios.map((_, i) => i);
  const porques = negocios.map((n) => n.porque || null);
  await sql`INSERT INTO funil_dia (owner_id, dia, deal_id, grupo, posicao, porque)
    SELECT ${String(ownerId)}, ${dia}, d, g, p, q
    FROM unnest(${ids}::text[], ${grupos}::text[], ${pos}::int[], ${porques}::text[])
      AS t(d, g, p, q)
    ON CONFLICT (owner_id, dia, deal_id) DO NOTHING`;
}

// Aparições anteriores com o resultado de cada uma — é daí que sai o descanso.
// O resultado mora em `fechamentos`, então o histórico é a junção das duas.
export async function getHistoricoFunil(ownerId, hoje) {
  if (!dbReady()) return new Map();
  try {
    await init();
    const sql = db();
    const rows = await sql`SELECT f.deal_id, f.dia, fe.resultado
      FROM funil_dia f
      LEFT JOIN fechamentos fe
        ON fe.owner_id = f.owner_id AND fe.dia = f.dia AND fe.deal_id = f.deal_id
      WHERE f.owner_id=${String(ownerId)} AND f.dia < ${hoje}::date
      ORDER BY f.deal_id, f.dia DESC`;
    // A primeira linha de cada negócio é a aparição mais recente.
    const mapa = new Map();
    for (const r of rows) {
      if (mapa.has(r.deal_id)) continue;
      mapa.set(r.deal_id, { ultimaData: toKey(r.dia), ultimoResultado: r.resultado || null });
    }
    return mapa;
  } catch (e) {
    console.error("[funil] falha ao ler o histórico:", e?.message);
    return new Map();
  }
}

// Tarefas criadas para o dia: { [dealId]: taskId }. É por elas que o diário
// lê de volta o que o closer respondeu no HubSpot.
export async function tarefasDoDia(ownerId, dia) {
  if (!dbReady()) return {};
  try {
    await init();
    const sql = db();
    const rows = await sql`SELECT deal_id, task_id FROM briefing_tarefas
      WHERE owner_id=${String(ownerId)} AND dia=${dia}`;
    return Object.fromEntries(rows.map((r) => [r.deal_id, r.task_id]));
  } catch (e) {
    console.error("[tarefa] falha ao listar as do dia:", e?.message);
    return {};
  }
}

// Grava no fechamento o que voltou da tarefa concluída — e só onde o closer
// ainda não registrou nada. A escolha dele nunca é sobrescrita.
// { [dealId]: { resultado, observacao } }
export async function aplicarRetornoDeTarefa(ownerId, dia, porDeal) {
  const entradas = Object.entries(porDeal || {}).filter(([, v]) => v?.resultado);
  if (entradas.length === 0) return 0;
  await init();
  const sql = db();
  const ids = entradas.map(([id]) => String(id));
  const resultados = entradas.map(([, v]) => v.resultado);
  const obs = entradas.map(([, v]) => v.observacao || null);
  const r = await sql`INSERT INTO fechamentos (owner_id, dia, deal_id, resultado, observacao)
    SELECT ${String(ownerId)}, ${dia}, d, res, ob
    FROM unnest(${ids}::text[], ${resultados}::text[], ${obs}::text[]) AS t(d, res, ob)
    ON CONFLICT (owner_id, dia, deal_id) DO NOTHING
    RETURNING deal_id`;
  return r.length;
}

// Estratégias cadastradas depois das dez originais. Sem banco o painel segue
// com as do código — é o mesmo piso do resto das telas.
export async function listarEstrategias() {
  if (!dbReady()) return [];
  await init();
  const sql = db();
  const rows = await sql`SELECT id, seg, titulo, descricao, criado_por
    FROM estrategias ORDER BY criado_em`;
  return rows.map((r) => ({
    id: r.id,
    seg: r.seg,
    titulo: r.titulo,
    desc: r.descricao || "",
    criadoPor: r.criado_por || "",
  }));
}

// Devolve a estratégia criada. Id repetido é erro: significa que duas pessoas
// cadastraram ao mesmo tempo e a segunda sobrescreveria a primeira.
export async function criarEstrategia({ id, seg, titulo, desc, criadoPor }) {
  await init();
  const sql = db();
  const r = await sql`INSERT INTO estrategias (id, seg, titulo, descricao, criado_por)
    VALUES (${id}, ${seg}, ${titulo}, ${desc || null}, ${criadoPor || null})
    ON CONFLICT (id) DO NOTHING
    RETURNING id`;
  if (r.length === 0) throw new Error("Essa estratégia acabou de ser cadastrada por outra pessoa. Recarregue e tente de novo.");
  return { id, seg, titulo, desc: desc || "", criadoPor: criadoPor || "" };
}

// Quem foi tirado da lista, como { "Farmer": Set(ids) }.
export async function listarOcultas() {
  if (!dbReady()) return {};
  await init();
  const sql = db();
  const rows = await sql`SELECT seg, id, ocultada_por FROM estrategias_ocultas`;
  const out = {};
  for (const r of rows) (out[r.seg] ||= {})[r.id] = r.ocultada_por || "";
  return out;
}

export async function ocultarEstrategia(seg, id, quem) {
  await init();
  const sql = db();
  await sql`INSERT INTO estrategias_ocultas (seg, id, ocultada_por)
    VALUES (${seg}, ${id}, ${quem || null})
    ON CONFLICT (seg, id) DO UPDATE SET ocultada_por=${quem || null}, ocultada_em=now()`;
}

export async function restaurarEstrategia(seg, id) {
  await init();
  const sql = db();
  await sql`DELETE FROM estrategias_ocultas WHERE seg=${seg} AND id=${id}`;
}

// ------------------------------------------ tentativas de contato por canal

// { companyId: { whatsapp: 2, email: 0, ... } }, só as não resolvidas: é o
// que a cascata usa para decidir qual canal ainda está de pé.
export async function tentativasPorEmpresa(companyIds) {
  if (!dbReady()) return {};
  const ids = [...new Set((companyIds || []).map(String))];
  if (ids.length === 0) return {};
  try {
    await init();
    const sql = db();
    const rows = await sql`SELECT company_id, canal, count(*)::int AS n
      FROM contato_tentativa
      WHERE resolvida = false AND company_id = ANY(${ids})
      GROUP BY company_id, canal`;
    const out = {};
    for (const r of rows) (out[r.company_id] ||= {})[r.canal] = r.n;
    return out;
  } catch (e) {
    // Sem a contagem a cascata liberaria tudo, o que é pior do que falhar:
    // quem chama precisa saber que o número não veio.
    console.error("[canal] falha ao ler as tentativas:", e?.message);
    throw e;
  }
}

export async function registraTentativa({ companyId, canal, ownerId, contatoId, dia, texto }) {
  await init();
  const sql = db();
  const r = await sql`INSERT INTO contato_tentativa
      (company_id, canal, owner_id, contato_id, dia, texto)
    VALUES (${String(companyId)}, ${canal}, ${ownerId ? String(ownerId) : null},
            ${contatoId ? String(contatoId) : null}, ${dia}, ${texto || null})
    RETURNING id`;
  return r[0]?.id;
}

// O contato aconteceu: a sequência daquela empresa zera e todos os canais
// voltam a valer. O histórico fica, só sai da conta.
export async function resolveTentativas(companyId) {
  await init();
  const sql = db();
  const r = await sql`UPDATE contato_tentativa SET resolvida = true
    WHERE company_id = ${String(companyId)} AND resolvida = false
    RETURNING id`;
  return r.length;
}
