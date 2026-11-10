"use client";

import { useMemo, useState } from "react";
import { TEMP_STYLE } from "../lib/config";
import { SEMENTES, numeroDa } from "../lib/estrategias";
import { GRUPOS } from "../lib/funil";
import BotaoWhats from "./BotaoWhats";
import MensagemCloser from "./MensagemCloser";

const STATUS_LABEL = {
  rascunho: "Não enviado",
  enviado: "Aguardando aprovação",
  aprovado: "Aprovado",
  reprovado: "Reprovado",
};

// `estrat` traz as estratégias já resolvidas pelo servidor (as do código mais
// as cadastradas). Sem ele a tela cai nas originais — é o que vale quando o
// banco não está configurado.
export default function DealsTable({ deals, options, closerName, emptyLabel, briefing, ctx, seg = "B2B", totalFunil = 0, aviso = "", listaFixa = false, estrat }) {
  const estrategias = (estrat?.porSeg || SEMENTES)[seg] || [];
  const [rows, setRows] = useState(() => deals.map((d) => ({ ...d, _obs: d.observacoes })));
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [page, setPage] = useState(0);

  // Briefing do dia: { [dealId]: { de, para } }. Ausente = fora do briefing.
  // Com a lista fixa não há o que marcar: os negócios escalados pelos critérios
  // já SÃO o briefing, e o closer só preenche estratégia, evolução e observação.
  const [items, setItems] = useState(() => {
    const base = { ...(briefing?.items || {}) };
    if (listaFixa) {
      // "de" congela a temperatura de hoje; "para" o closer escolhe.
      for (const d of deals) base[d.id] ||= { de: d.temperatura || "", para: "", estrategia: "" };
    }
    return base;
  });
  const [status, setStatus] = useState(briefing?.status || "rascunho");
  const [briefMsg, setBriefMsg] = useState(null);
  const [briefBusy, setBriefBusy] = useState(false);
  // Qual negócio está com a janela de mensagem aberta.
  const [msgDe, setMsgDe] = useState(null);

  const aprovado = status === "aprovado";
  const isAdmin = !!ctx?.isAdmin;
  // Aprovado, o closer só acompanha; o admin continua ajustando.
  const podeEditar = ctx?.ownerId && ctx?.dbReady && (!aprovado || isAdmin);
  const total = Object.keys(items).length;

  const PAGE_SIZE = 10;
  // Fechado o briefing, o que será trabalhado hoje vem primeiro.
  const ordered = useMemo(() => {
    if (status !== "aprovado") return rows;
    const dentro = (r) => r.id in items;
    return [...rows].sort((a, b) => (dentro(a) === dentro(b) ? 0 : dentro(a) ? -1 : 1));
  }, [rows, items, status]);

  // Busca por nome do negócio ou etapa, ignorando acento e caixa.
  const [busca, setBusca] = useState("");
  const norm = (s) =>
    String(s || "")
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase();

  const filtrados = useMemo(() => {
    const q = norm(busca).trim();
    if (!q) return ordered;
    return ordered.filter((r) => norm(r.name).includes(q) || norm(r.stageLabel).includes(q));
  }, [ordered, busca]);

  const pageCount = Math.max(1, Math.ceil(filtrados.length / PAGE_SIZE));
  const pageSafe = Math.min(page, pageCount - 1);
  const visible = filtrados.slice(pageSafe * PAGE_SIZE, pageSafe * PAGE_SIZE + PAGE_SIZE);

  const dirty = useMemo(() => rows.filter((r) => r._obs !== r.observacoes), [rows]);

  // Estratégia e evolução são obrigatórias para enviar.
  const incompletos = useMemo(
    () => Object.entries(items).filter(([, v]) => !v.para || !v.estrategia).map(([id]) => id),
    [items]
  );
  const falta = (id) => incompletos.includes(String(id));

  function toggle(r) {
    setItems((it) => {
      const next = { ...it };
      if (r.id in next) delete next[r.id];
      // "de" congela a temperatura de hoje; "para" o closer escolhe.
      else next[r.id] = { de: r.temperatura || "", para: "", estrategia: "" };
      return next;
    });
    setBriefMsg(null);
  }

  function setPara(id, para) {
    setItems((it) => ({ ...it, [id]: { ...it[id], para } }));
    setBriefMsg(null);
  }

  function setEstrategia(id, estrategia) {
    setItems((it) => ({ ...it, [id]: { ...it[id], estrategia } }));
    setBriefMsg(null);
  }

  async function salvarObs() {
    setSaving(true);
    setMsg(null);
    try {
      // Um de cada vez: disparar tudo junto virava uma rajada que o
      // HubSpot recusa por limite de chamadas por segundo.
      for (const r of dirty) {
        const res = await fetch(`/api/deals/${r.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ observacoes: r._obs }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.error || `Falha ao salvar "${r.name}".`);
        }
      }
      setRows((rs) => rs.map((r) => ({ ...r, observacoes: r._obs })));
      setMsg({ ok: true, text: "Observações salvas no HubSpot ✓" });
    } catch (e) {
      setMsg({ ok: false, text: e.message || "Erro ao salvar. Tente de novo." });
    } finally {
      setSaving(false);
    }
  }

  async function enviarBriefing() {
    setBriefBusy(true);
    setBriefMsg(null);
    try {
      const res = await fetch("/api/briefing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerId: ctx.ownerId, dia: ctx.dia, items, manterStatus: isAdmin }),
      });
      // A causa vem do servidor: sem isso a tela dizia só "erro" e ninguém
      // conseguia relatar o que aconteceu.
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `Falha ao enviar (HTTP ${res.status}).`);
      }
      // Rascunho vira "enviado" também quando o gestor monta pelo closer.
      if (status === "rascunho") setStatus("enviado");
      setBriefMsg({
        ok: true,
        text: status === "rascunho" ? "Enviado para aprovação ✓" : "Briefing atualizado ✓",
      });
    } catch (e) {
      setBriefMsg({ ok: false, text: e.message || "Erro ao enviar o briefing." });
    } finally {
      setBriefBusy(false);
    }
  }

  const label = (v) => options.find((o) => o.value === v)?.label || v;

  return (
    <div className="card">
      {aprovado && !isAdmin && ctx?.ownerId && (
        <div className="planbar st-aprovado">
          <div className="planbar-info">
            <span className="plan-badge">Briefing aprovado</span>
            <span className="plan-week">{ctx.diaLabel}</span>
            <span className="plan-count"><b>{total}</b> negócio{total === 1 ? "" : "s"} para hoje</span>
          </div>
          <BotaoWhats
            closer={closerName}
            diaLabel={ctx.diaLabel}
            estrategiaPorId={estrat?.idx}
            itens={rows
              .filter((r) => r.id in items)
              .map((r) => ({
                nome: r.name,
                valor: r.amount,
                de: items[r.id].de ? label(items[r.id].de) : "",
                para: items[r.id].para ? label(items[r.id].para) : "",
                estrategia: items[r.id].estrategia,
                atrasada: r.next?.pill?.cls === "late",
              }))}
          />
        </div>
      )}

      {podeEditar && (
        <div className={"planbar st-" + status}>
          <div className="planbar-info">
            <span className="plan-badge">{STATUS_LABEL[status]}</span>
            <span className="plan-week">{ctx.diaLabel}</span>
            <span className="plan-count"><b>{total}</b> negócio{total === 1 ? "" : "s"} para hoje</span>
            {total === 0 && (
              <span className="plan-motivo">
                {listaFixa ? "sem negócios na lista de hoje" : "marque ao menos um negócio"}
              </span>
            )}
            {incompletos.length > 0 && (
              <span className="plan-motivo">
                {incompletos.length} sem estratégia ou evolução
              </span>
            )}
            {/* O que o gestor escreveu ao decidir — vale aprovado e reprovado. */}
            {briefing?.motivo && (status === "reprovado" || status === "aprovado") && (
              <span className={status === "reprovado" ? "plan-motivo" : "plan-obs-gestor"}>
                {status === "reprovado" ? "Motivo" : "Observação"}
                {briefing.revisadoPor ? ` de ${briefing.revisadoPor}` : ""}: {briefing.motivo}
              </span>
            )}
          </div>
          <div className="planbar-actions">
            {briefMsg && <span className={briefMsg.ok ? "saved" : "err"}>{briefMsg.text}</span>}
            <button
              className="btn-primary"
              onClick={enviarBriefing}
              disabled={briefBusy || total === 0 || incompletos.length > 0}
              title={
                total === 0
                  ? listaFixa
                    ? "Nenhum negócio foi escalado para hoje"
                    : "Marque ao menos um negócio para atuar hoje"
                  : incompletos.length > 0
                  ? "Defina estratégia e evolução em todos os negócios da lista"
                  : undefined
              }
            >
              {briefBusy
                ? "Salvando…"
                : status === "rascunho"
                ? isAdmin
                  ? "Enviar briefing para aprovação"
                  : "Enviar briefing do dia"
                : isAdmin
                ? "Salvar briefing do closer"
                : "Reenviar briefing"}
            </button>
          </div>
        </div>
      )}

      {/* De onde saiu esta lista. Sem isto, o closer só vê o funil encolher. */}
      {aviso ? (
        <div className="busca-bar">
          <span className="err">{aviso}</span>
        </div>
      ) : totalFunil > deals.length ? (
        <div className="busca-bar">
          <span className="plan-week">Lista de hoje</span>
          <span className="plan-badge">
            {deals.length} de {totalFunil} negócios do funil
          </span>
          <span className="fech-opcional">
            escalados pelos critérios do dia — a etiqueta em cada um diz por quê
          </span>
        </div>
      ) : null}

      <div className="busca-bar">
        <div className="busca">
          <span className="busca-lupa">⌕</span>
          <input
            type="search"
            placeholder="Buscar negócio ou etapa…"
            value={busca}
            onChange={(e) => {
              setBusca(e.target.value);
              setPage(0);
            }}
          />
          {busca && (
            <button className="busca-x" onClick={() => { setBusca(""); setPage(0); }} title="Limpar">
              ×
            </button>
          )}
        </div>
        {busca && (
          <span className="busca-res">
            {filtrados.length === 0
              ? "nenhum negócio encontrado"
              : `${filtrados.length} de ${ordered.length} negócios`}
          </span>
        )}
      </div>

      <div className="tscroll">
        <table>
          <thead>
            <tr>
              {podeEditar && !listaFixa && <th className="col-atuar">Atuar hoje</th>}
              <th style={{ width: "18%" }}>Nome do negócio</th>
              <th style={{ width: "11%" }}>Etapa atual</th>
              <th style={{ width: "13%" }}>Próxima atividade</th>
              <th style={{ width: "18%" }}>Estratégia</th>
              <th style={{ width: "17%" }}>Evolução pretendida</th>
              <th className="col-obs">Observação</th>
              <th style={{ width: "13%" }}>Mensagem</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => {
              const item = items[r.id];
              const dentro = !!item;
              return (
                <tr key={r.id} className={dentro ? "in-plan" + (falta(r.id) ? " incompleto" : "") : ""}>
                  {podeEditar && !listaFixa && (
                    <td>
                      <label className="plan-check">
                        <input type="checkbox" checked={dentro} onChange={() => toggle(r)} />
                        <span>Atuar</span>
                      </label>
                    </td>
                  )}
                  <td className="deal">
                    {/* Com a lista fixa, todos são de hoje: a flag viraria ruído. */}
                    {dentro && !listaFixa && <span className="plan-flag">Hoje</span>}
                    {/* Por que este negócio está na lista de hoje. */}
                    {r.grupo && GRUPOS[r.grupo] && (
                      <span
                        className={"emp-tag grupo g-" + r.grupo}
                        title={r.porque || GRUPOS[r.grupo].motivo}
                      >
                        {GRUPOS[r.grupo].label}
                      </span>
                    )}
                    <a className="deal-link" href={r.url} target="_blank" rel="noreferrer">
                      {r.name}
                    </a>
                    <small>{r.amountText}</small>
                    {/* Entrou só para fechar as dez: diz o que faltou em cada critério. */}
                    {r.porque && <small className="deal-porque">{r.porque}</small>}
                  </td>
                  <td>
                    <span className="stage">
                      <span className={"dot" + (r.adv ? " adv" : "")} />
                      {r.stageLabel}
                    </span>
                  </td>
                  <td>
                    <div className="next">
                      <span className={"date" + (r.next.none ? " none" : "")}>
                        {r.next.dateText}
                        {r.next.pill && (
                          <span className={"pill-date " + r.next.pill.cls}>{r.next.pill.text}</span>
                        )}
                      </span>
                      {r.nextStep && <span className="activity">{r.nextStep}</span>}
                    </div>
                  </td>
                  <td>
                    {/* Estratégia que o closer vai usar neste negócio hoje. */}
                    {dentro && podeEditar ? (
                      <div className="select-wrap">
                        <select
                          className={"estrat-select" + (!item.estrategia ? " falta" : "")}
                          value={item.estrategia || ""}
                          onChange={(e) => setEstrategia(r.id, e.target.value)}
                        >
                          <option value="">Escolher estratégia…</option>
                          {estrategias.map((e) => (
                            <option key={e.id} value={e.id} title={e.desc}>
                              {numeroDa(e.id)}. {e.titulo}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : dentro && item.estrategia ? (
                      <span className="estrat-tag" title={estrategias.find((e) => e.id === item.estrategia)?.desc}>
                        <b>{numeroDa(item.estrategia)}</b>
                        {estrategias.find((e) => e.id === item.estrategia)?.titulo || ""}
                      </span>
                    ) : (
                      <span className="evo-vazio">—</span>
                    )}
                  </td>
                  <td>
                    {/* Empilhado com rótulos: na coluna estreita, a seta solta
                        parecia quebra de linha acidental. */}
                    <div className="evo">
                      <div className="evo-linha">
                        <span className="evo-lab">de</span>
                        <span className={"temp-atual t-" + (TEMP_STYLE[r.temperatura] || "none")}>
                          {r.temperatura ? label(r.temperatura) : "sem temperatura"}
                        </span>
                      </div>
                      <div className="evo-linha">
                        <span className="evo-lab">para</span>
                        {dentro && podeEditar ? (
                          <div className={"act" + (!item.para ? " falta" : "")} data-v={TEMP_STYLE[item.para] || ""}>
                            {/* A temperatura atual continua na lista: manter é uma
                                decisão válida — atuar sem mudar de patamar. */}
                            <select value={item.para} onChange={(e) => setPara(r.id, e.target.value)}>
                              <option value="">definir…</option>
                              {options.map((o) => (
                                <option key={o.value} value={o.value}>
                                  {o.label}
                                  {o.value === r.temperatura ? " (manter)" : ""}
                                </option>
                              ))}
                            </select>
                          </div>
                        ) : dentro && item.para ? (
                          <span className={"temp-alvo t-" + (TEMP_STYLE[item.para] || "none")}>
                            {label(item.para)}
                          </span>
                        ) : (
                          <span className="evo-vazio">—</span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td>
                    <textarea
                      className="obs"
                      placeholder="Escrever observação…"
                      value={r._obs}
                      onChange={(e) => {
                        const v = e.target.value;
                        setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, _obs: v } : x)));
                        setMsg(null);
                      }}
                    />
                    {/* O que o gestor escreveu neste negócio ao revisar. */}
                    {item?.obsGestor && (
                      <p className="obs-do-gestor">
                        <span className="brief-obs-quem gestor">gestor</span>
                        {item.obsGestor}
                      </p>
                    )}
                  </td>

                  {/* Último passo da linha, e só libera depois que estratégia e
                      evolução estão definidas: são elas que a mensagem executa. */}
                  <td className="col-acao">
                    <button
                      type="button"
                      className="btn-msg"
                      onClick={() => setMsgDe(r.id)}
                      disabled={!dentro || falta(r.id)}
                      title={
                        !dentro
                          ? "Marque o negócio para atuar hoje"
                          : falta(r.id)
                            ? "Defina estratégia e evolução para liberar a mensagem"
                            : undefined
                      }
                    >
                      {!dentro ? "Fora de hoje" : falta(r.id) ? "Defina estratégia e evolução" : "Gerar mensagem"}
                    </button>
                  </td>
                </tr>
              );
            })}
            {visible.length === 0 && (
              <tr>
                <td colSpan={podeEditar ? 8 : 7} style={{ textAlign: "center", color: "var(--muted)", padding: "40px" }}>
                  {rows.length === 0
                    ? emptyLabel || "Nenhum negócio ativo no funil."
                    : `Nenhum negócio encontrado para “${busca}”.`}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="foot">
        <span>
          {rows.length} negócio{rows.length === 1 ? "" : "s"}
          {closerName ? ` · ${closerName}` : ""}
          {msg && <> · <span className={msg.ok ? "saved" : "err"}>{msg.text}</span></>}
        </span>
        <div className="foot-actions">
          {pageCount > 1 && (
            <div className="pager">
              <button onClick={() => setPage(pageSafe - 1)} disabled={pageSafe === 0}>‹</button>
              <span>Página {pageSafe + 1} de {pageCount}</span>
              <button onClick={() => setPage(pageSafe + 1)} disabled={pageSafe >= pageCount - 1}>›</button>
            </div>
          )}
          <button className="save" onClick={salvarObs} disabled={saving || dirty.length === 0}>
            {saving ? "Salvando…" : dirty.length ? `Salvar observações (${dirty.length})` : "Tudo salvo"}
          </button>
        </div>
      </div>

      {/* Fora da tabela: a janela é modal e dentro de <td> herdava o recorte
          da célula. O que vale é o estado da tela agora, não o do servidor. */}
      {msgDe && rows.some((r) => r.id === msgDe) && (
        <MensagemCloser
          negocio={rows.find((r) => r.id === msgDe)}
          item={items[msgDe]}
          estrategia={estrategias.find((e) => e.id === items[msgDe]?.estrategia) || null}
          label={label}
          onFechar={() => setMsgDe(null)}
        />
      )}
    </div>
  );
}
