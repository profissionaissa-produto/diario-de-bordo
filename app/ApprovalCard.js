"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TEMP_STYLE, dealUrl } from "../lib/config";
import { formatNextActivity } from "../lib/activity";
import { SEMENTES, estrategiaPorId as SEMENTES_IDX, numeroDa } from "../lib/estrategias";

const STATUS_LABEL = {
  rascunho: "Não enviado",
  enviado: "Aguardando aprovação",
  aprovado: "Aprovado",
  reprovado: "Reprovado",
};

const brl = (n) =>
  n == null ? "—" : "R$ " + n.toLocaleString("pt-BR", { maximumFractionDigits: 0 });

export default function ApprovalCard({ plano, deals, dia, options = [], estrat }) {
  const ESTRATEGIAS = estrat?.porSeg || SEMENTES;
  const estrategiaPorId = estrat?.idx || SEMENTES_IDX;
  const router = useRouter();
  const [status, setStatus] = useState(plano.status);
  const [motivo, setMotivo] = useState(plano.motivo || "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  // Edição do gestor: incluir, retirar e trocar a evolução pretendida.
  const [editando, setEditando] = useState(false);
  const [rascunho, setRascunho] = useState({ ...plano.items });
  const [catalogo, setCatalogo] = useState(null);

  // Com vários briefings na fila, listar tudo de cada um torna a tela
  // impraticável: mostra os primeiros e abre o resto sob demanda.
  const [verTudo, setVerTudo] = useState(false);
  const PREVIA = 3;

  const itens = editando ? rascunho : plano.items;
  const entries = Object.entries(itens);
  const visiveis = editando || verTudo ? entries : entries.slice(0, PREVIA);
  const ocultos = entries.length - visiveis.length;

  const info = (id) =>
    deals[id] || catalogo?.find((d) => String(d.id) === String(id)) || { id, name: `Negócio ${id}` };

  const total = entries.reduce((s, [id]) => s + (info(id).amount || 0), 0);
  const label = (v) => options.find((o) => o.value === v)?.label || v;

  async function abrirEdicao() {
    setEditando(true);
    setRascunho({ ...plano.items });
    setMsg(null);
    if (!catalogo) {
      try {
        const res = await fetch(`/api/deals?owner=${plano.ownerId}`);
        const d = await res.json();
        setCatalogo(d.deals || []);
      } catch {
        setCatalogo([]);
      }
    }
  }

  async function salvarEdicao() {
    if (Object.keys(rascunho).length === 0) {
      setMsg({ ok: false, text: "O briefing precisa de ao menos um negócio." });
      return;
    }
    const faltando = Object.values(rascunho).filter((v) => !v.para || !v.estrategia).length;
    if (faltando > 0) {
      setMsg({ ok: false, text: `${faltando} negócio(s) sem estratégia ou evolução.` });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/briefing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerId: plano.ownerId, dia, items: rascunho, manterStatus: true }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `Falha (HTTP ${res.status}).`);
      }
      setEditando(false);
      setMsg({ ok: true, text: "Briefing atualizado ✓" });
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: e.message || "Erro ao salvar." });
    } finally {
      setBusy(false);
    }
  }

  async function decidir(novo) {
    if (novo === "reprovado" && !motivo.trim()) {
      setMsg({ ok: false, text: "Escreva a observação antes de reprovar." });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/briefing", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerId: plano.ownerId, dia, status: novo, motivo }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `Falha (HTTP ${res.status}).`);
      }
      const d = await res.json().catch(() => ({}));
      setStatus(novo);
      // O gestor precisa saber o que foi de fato gravado no HubSpot.
      if (novo === "aprovado") {
        const n = d.aplicados || 0;
        const falhas = d.falhas?.length || 0;
        const tarefas = d.tarefas || 0;
        setMsg({
          ok: falhas === 0 && !d.aviso,
          text:
            "Aprovado ✓ · " +
            n +
            (n === 1 ? " negócio atualizado" : " negócios atualizados") +
            " no HubSpot" +
            (tarefas ? " · " + tarefas + (tarefas === 1 ? " tarefa criada" : " tarefas criadas") : "") +
            (falhas ? " · " + falhas + " não gravou, veja os logs" : "") +
            // Escopo faltando no App Privado aparece aqui, não só no log.
            (d.aviso ? " · " + d.aviso : ""),
        });
      } else {
        setMsg({ ok: true, text: "Reprovado ✓" });
      }
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: e.message || "Erro ao registrar." });
    } finally {
      setBusy(false);
    }
  }

  const disponiveis = (catalogo || []).filter((d) => !(String(d.id) in rascunho));

  return (
    <div className={"aprov-card st-" + status}>
      <div className="aprov-head">
        <div className="aprov-quem">
          <span className="aprov-pfp">
            {plano.foto ? <img src={plano.foto} alt={plano.nome} /> : plano.nome.slice(0, 2).toUpperCase()}
          </span>
          <span className="aprov-nome">{plano.nome}</span>
          {/* Sem time cadastrado o cartão aparecia sem contexto nenhum. */}
          <span className="aprov-seg">{plano.seg || "sem time cadastrado"}</span>
          <span className="plan-badge">{STATUS_LABEL[status]}</span>
        </div>
        <div className="aprov-resumo">
          <span><b>{entries.length}</b> negócio{entries.length === 1 ? "" : "s"} hoje</span>
          <span><b>{brl(total)}</b> em jogo</span>
        </div>
      </div>

      <div className="brief-lista">
        {entries.length === 0 && <div className="aprov-vazio">Nenhum negócio no briefing.</div>}
        {visiveis.map(([id, v]) => {
          const n = info(id);
          const at = formatNextActivity(n.nextActivity);
          return (
            <div className={"brief-item v-" + (TEMP_STYLE[v.de] || "none")} key={id}>
              <div className="brief-principal">
                <a className="brief-nome" href={dealUrl(id)} target="_blank" rel="noreferrer">
                  {n.name}
                </a>
                <span className="brief-val">{brl(n.amount)}</span>
              </div>

              {/* Estratégia escolhida — o gestor pode trocar ao editar. */}
              <div className="brief-estrat">
                {editando ? (
                  <div className="select-wrap">
                    <select
                      className="estrat-select"
                      value={v.estrategia || ""}
                      onChange={(e) =>
                        setRascunho((r) => ({ ...r, [id]: { ...r[id], estrategia: e.target.value } }))
                      }
                    >
                      <option value="">Escolher estratégia…</option>
                      {(ESTRATEGIAS[plano.seg] || []).map((e) => (
                        <option key={e.id} value={e.id} title={e.desc}>
                          {numeroDa(e.id)}. {e.titulo}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : v.estrategia && estrategiaPorId[v.estrategia] ? (
                  <span className="estrat-tag" title={estrategiaPorId[v.estrategia].desc}>
                    <b>{numeroDa(v.estrategia)}</b>
                    {estrategiaPorId[v.estrategia].titulo}
                  </span>
                ) : (
                  <span className="estrat-falta">sem estratégia definida</span>
                )}
              </div>

              <div className="brief-evo">
                <span className={"temp-atual t-" + (TEMP_STYLE[v.de] || "none")}>
                  {v.de ? label(v.de) : "sem temperatura"}
                </span>
                <span className="evo-seta">→</span>
                {editando ? (
                  <div className="act" data-v={TEMP_STYLE[v.para] || ""}>
                    <select
                      value={v.para || ""}
                      onChange={(e) =>
                        setRascunho((r) => ({ ...r, [id]: { ...r[id], para: e.target.value } }))
                      }
                    >
                      <option value="">Levar para…</option>
                      {options.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                          {o.value === v.de ? " (manter)" : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <span className={"temp-alvo t-" + (TEMP_STYLE[v.para] || "none")}>
                    {v.para ? label(v.para) : "—"}
                  </span>
                )}
                {editando && (
                  <button
                    className="aprov-x"
                    onClick={() =>
                      setRascunho((r) => {
                        const c = { ...r };
                        delete c[id];
                        return c;
                      })
                    }
                    title="Retirar do briefing"
                  >
                    ×
                  </button>
                )}
              </div>

              {/* A observação que o closer escreveu. É ela que vira o corpo da
                  tarefa na aprovação — quem decide precisa ler antes. */}
              <div className="brief-obs-par">
                <div className="brief-obs-col">
                  <span className="brief-obs-quem">closer</span>
                  {n.observacoes ? (
                    <p className="brief-obs">{n.observacoes}</p>
                  ) : (
                    <p className="brief-obs vazia">sem observação — a tarefa vai nascer sem texto</p>
                  )}
                </div>

                {/* A palavra do gestor naquele negócio, ao lado da do closer. */}
                {(editando || v.obsGestor) && (
                  <div className="brief-obs-col">
                    <span className="brief-obs-quem gestor">gestor</span>
                    {editando ? (
                      <textarea
                        className="obs brief-obs-input"
                        placeholder="Sua observação para este negócio…"
                        value={v.obsGestor || ""}
                        onChange={(e) =>
                          setRascunho((r) => ({ ...r, [id]: { ...r[id], obsGestor: e.target.value } }))
                        }
                      />
                    ) : (
                      <p className="brief-obs do-gestor">{v.obsGestor}</p>
                    )}
                  </div>
                )}
              </div>

              <div className="brief-ativ">
                <span className={"aprov-ativ-data" + (at.none ? " none" : "")}>
                  {at.dateText}
                  {at.pill && <b className={"pill-date " + at.pill.cls}>{at.pill.text}</b>}
                </span>
                {n.nextStep && <span className="aprov-ativ-desc">{n.nextStep}</span>}
              </div>
            </div>
          );
        })}
        {ocultos > 0 && (
          <button className="ver-mais" onClick={() => setVerTudo(true)}>
            ver os outros {ocultos} negócio{ocultos === 1 ? "" : "s"}
          </button>
        )}
        {verTudo && !editando && entries.length > PREVIA && (
          <button className="ver-mais" onClick={() => setVerTudo(false)}>
            recolher
          </button>
        )}
      </div>

      {editando && (
        <div className="aprov-add">
          {catalogo === null ? (
            <span className="aprov-add-lab">Carregando negócios…</span>
          ) : (
            <>
              <span className="aprov-add-lab">Adicionar negócio:</span>
              <div className="select-wrap">
                <select
                  className="closer-select"
                  value=""
                  onChange={(e) => {
                    const id = e.target.value;
                    if (id) {
                      const d = catalogo.find((x) => String(x.id) === id);
                      setRascunho((r) => ({ ...r, [id]: { de: d?.temperatura || "", para: "" } }));
                    }
                  }}
                >
                  <option value="">Selecione…</option>
                  {disponiveis.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
            </>
          )}
        </div>
      )}

      {status === "reprovado" && plano.motivo && !editando && (
        <div className="aprov-motivo">Motivo: {plano.motivo}</div>
      )}

      <div className="aprov-acoes">
        {msg && <span className={msg.ok ? "saved" : "err"}>{msg.text}</span>}
        {plano.revisadoPor && status !== "enviado" && !editando && (
          <span className="aprov-por">por {plano.revisadoPor}</span>
        )}
        {editando ? (
          <>
            <button className="btn-ghost" onClick={() => setEditando(false)} disabled={busy}>Cancelar</button>
            <button className="btn-primary" onClick={salvarEdicao} disabled={busy}>
              {busy ? "Salvando…" : "Salvar alterações"}
            </button>
          </>
        ) : (
          <>
            <button className="btn-ghost" onClick={abrirEdicao} disabled={busy}>Editar briefing</button>
            <button className="btn-danger" onClick={() => decidir("reprovado")} disabled={busy}>
              Reprovar
            </button>
            <button className="btn-primary" onClick={() => decidir("aprovado")} disabled={busy || status === "aprovado"}>
              {busy ? "…" : status === "aprovado" ? "Aprovado" : "Aprovar"}
            </button>
          </>
        )}
      </div>

      {/* Uma observação só, para os dois caminhos: o closer lê o que o gestor
          escreveu tanto ao aprovar quanto ao reprovar. */}
      {!editando && (
        <div className="reprova">
          <input
            className="reprova-input"
            placeholder="Observação para o closer — obrigatória ao reprovar"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          />
        </div>
      )}
    </div>
  );
}
