"use client";

import { useState } from "react";
import { TEMP_STYLE } from "../lib/config";
import { estrategiaPorId as SEMENTES_IDX, numeroDa } from "../lib/estrategias";

const brl = (n) => (n == null ? "—" : "R$ " + n.toLocaleString("pt-BR", { maximumFractionDigits: 0 }));

// Espelha RESULTADOS em lib/db.js — o servidor valida de novo, isto é só a tela.
const OPCOES = [
  { id: "efetivo", label: "Contato efetivo", cls: "ok", exigeObs: true, dica: "O que saiu da conversa?" },
  { id: "tentativa", label: "Tentei, sem sucesso", cls: "meio", exigeObs: false, dica: "A atividade no CRM já é a evidência — observação é opcional." },
  { id: "nao_atuei", label: "Não atuei", cls: "nao", exigeObs: true, dica: "Por que o negócio não foi tocado hoje?" },
];
const MIN_OBS = 50;
const opcaoDe = (id) => OPCOES.find((o) => o.id === id);

const plural = (n, um, muitos) => `${n} ${n > 1 ? muitos : um}`;

// O que o CRM registrou hoje neste negócio, em uma linha.
function resumoCrm(a) {
  const p = [];
  if (a.ligacoes) p.push(plural(a.ligacoes, "ligação", "ligações"));
  if (a.conectadas) p.push(plural(a.conectadas, "conectada", "conectadas"));
  if (a.reunioes) p.push(plural(a.reunioes, "reunião realizada", "reuniões realizadas"));
  if (a.outras) p.push(plural(a.outras, "outra atividade", "outras atividades"));
  return p.join(" · ");
}

const temAtividade = (a) => !!a && (a.ligacoes > 0 || a.reunioes > 0 || a.outras > 0);

// Um card por negócio do briefing. Salva um de cada vez: o closer fecha
// conforme termina cada contato, não tudo no fim do dia.
function Card({ r, item, inicial, crm, tarefa, ctx, onSalvo, estrategiaPorId = SEMENTES_IDX }) {
  // A tarefa concluída no HubSpot é o registro do time, que não anota ligação.
  // Vindo dela, já entra preenchido; da atividade solta, entra como sugestão.
  const [resultado, setResultado] = useState(
    inicial?.resultado || (tarefa?.concluida ? "efetivo" : "") || crm?.sugerido || ""
  );
  const [obs, setObs] = useState(inicial?.observacao || tarefa?.texto || "");
  const [salvo, setSalvo] = useState(!!inicial?.resultado);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");

  const op = opcaoDe(resultado);
  const faltam = op?.exigeObs ? Math.max(0, MIN_OBS - obs.trim().length) : 0;
  const podeSalvar = !!resultado && faltam === 0;

  async function salvar() {
    setBusy(true);
    setErro("");
    try {
      const res = await fetch("/api/fechamento", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ownerId: ctx.ownerId,
          dia: ctx.dia,
          dealId: r.id,
          resultado,
          observacao: obs,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Falha ao salvar.");
      }
      setSalvo(true);
      onSalvo(r.id, resultado);
    } catch (e) {
      setErro(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={"fech-card" + (salvo ? " fechado" : "")}>
      <div className="fech-topo">
        <a className="foco-nome" href={r.url} target="_blank" rel="noreferrer">{r.name}</a>
        <span className="foco-val">{brl(r.amount)}</span>
      </div>

      {/* O que ele planejou de manhã, para fechar contra o combinado. */}
      <div className="fech-plano">
        {item?.estrategia && estrategiaPorId[item.estrategia] && (
          <span className="estrat-tag" title={estrategiaPorId[item.estrategia].desc}>
            <b>{numeroDa(item.estrategia)}</b>
            {estrategiaPorId[item.estrategia].titulo}
          </span>
        )}
        <span className="fech-evo">
          <span className={"mini t-" + (TEMP_STYLE[item?.de] || "none")}>{item?.de || "—"}</span>
          <span className="evo-seta">→</span>
          <span className={"mini forte t-" + (TEMP_STYLE[item?.para] || "none")}>{item?.para || "—"}</span>
        </span>
      </div>

      {/* A tarefa do dia: é nela que o time registra o que aconteceu. */}
      {tarefa && (
        <div className={"fech-tarefa" + (tarefa.concluida ? " feita" : "")}>
          <span className="fech-crm-lab">
            {tarefa.concluida ? "tarefa concluída" : "tarefa ainda aberta"}
          </span>
          {tarefa.texto ? (
            <p className="fech-crm-texto">{tarefa.texto}</p>
          ) : (
            <span className="fech-opcional">
              {tarefa.concluida
                ? "concluída sem texto — escreva aqui o que aconteceu"
                : "responda a tarefa no HubSpot e ela volta preenchida aqui"}
            </span>
          )}
        </div>
      )}

      {/* Evidência do CRM: o closer já registrou lá, não digita de novo aqui. */}
      {temAtividade(crm) && (
        <div className="fech-crm">
          <span className="fech-crm-lab">no CRM hoje</span>
          <span className="fech-crm-nums">{resumoCrm(crm)}</span>
          {crm.texto && <p className="fech-crm-texto">{crm.texto}</p>}
        </div>
      )}

      <div className="fech-opcoes">
        {OPCOES.map((o) => (
          <button
            key={o.id}
            className={"fech-op " + o.cls + (resultado === o.id ? " on" : "")}
            onClick={() => {
              setResultado(o.id);
              setSalvo(false);
              setErro("");
            }}
          >
            {o.label}
          </button>
        ))}
      </div>

      {op && (
        <div className="fech-obs">
          <textarea
            className="obs"
            placeholder={op.dica}
            value={obs}
            onChange={(e) => {
              setObs(e.target.value);
              setSalvo(false);
            }}
          />
          <div className="fech-rodape">
            {op.exigeObs ? (
              <span className={faltam ? "fech-falta" : "fech-ok"}>
                {faltam ? `faltam ${faltam} caracteres` : "observação completa"}
              </span>
            ) : (
              <span className="fech-opcional">observação opcional</span>
            )}
            {erro && <span className="err">{erro}</span>}
            {salvo && !erro && <span className="saved">registrado ✓</span>}
            <button className="btn-primary" onClick={salvar} disabled={!podeSalvar || busy || salvo}>
              {busy ? "Salvando…" : salvo ? "Registrado" : "Registrar"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Fechamento({ rows, briefing, fechamento, atividade, tarefas, ctx, estrat }) {
  const items = briefing?.items || {};
  const doDia = rows.filter((r) => r.id in items);
  const [feitos, setFeitos] = useState(() => {
    const m = {};
    for (const [id, v] of Object.entries(fechamento || {})) m[id] = v.resultado;
    return m;
  });

  if (doDia.length === 0) {
    return (
      <div className="card">
        <div className="foco-vazio">
          <h3>Nada para fechar hoje</h3>
          <p>O fechamento lista os negócios que foram marcados no briefing do dia.</p>
        </div>
      </div>
    );
  }

  const fechados = doDia.filter((r) => feitos[r.id]).length;
  const conta = (id) => doDia.filter((r) => feitos[r.id] === id).length;

  return (
    <div className="foco">
      <div className="foco-topo">
        <div className="foco-resumo">
          <span className="foco-dia">Fechamento de {ctx.diaLabel}</span>
        </div>
        <div className="foco-nums">
          <span><b>{fechados}</b> de <b>{doDia.length}</b> registrados</span>
          {OPCOES.map((o) => conta(o.id) > 0 && (
            <span key={o.id}><b>{conta(o.id)}</b> {o.label.toLowerCase()}</span>
          ))}
          {fechados < doDia.length && (
            <span className="foco-alerta"><b>{doDia.length - fechados}</b> sem registro</span>
          )}
        </div>
      </div>

      <div className="foco-grid">
        {doDia.map((r) => (
          <Card
            key={r.id}
            r={r}
            item={items[r.id]}
            inicial={fechamento?.[r.id]}
            crm={atividade?.[r.id]}
            tarefa={tarefas?.[r.id]}
            estrategiaPorId={estrat?.idx || SEMENTES_IDX}
            ctx={ctx}
            onSalvo={(id, resultado) => setFeitos((f) => ({ ...f, [id]: resultado }))}
          />
        ))}
      </div>
    </div>
  );
}
