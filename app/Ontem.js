"use client";

import { useState } from "react";
import { TEMP_STYLE } from "../lib/config";
import { estrategiaPorId as SEMENTES_IDX, numeroDa } from "../lib/estrategias";

const brl = (n) =>
  n == null ? "—" : "R$ " + n.toLocaleString("pt-BR", { maximumFractionDigits: 0 });

const STATUS = {
  enviado: "não decidido",
  aprovado: "aprovado",
  reprovado: "reprovado",
  rascunho: "não enviado",
};

// O que o closer marcou no último dia útil. Recolhido por padrão: serve de
// consulta ao montar o dia, não pode competir com o briefing de hoje.
export default function Ontem({ ontem, estrat }) {
  const estrategiaPorId = estrat?.idx || SEMENTES_IDX;
  const [aberto, setAberto] = useState(false);
  if (!ontem || ontem.itens.length === 0) return null;

  const total = ontem.itens.reduce((s, i) => s + (i.valor || 0), 0);

  return (
    <div className={"ontem st-" + ontem.status}>
      <button className="ontem-head" onClick={() => setAberto((v) => !v)} aria-expanded={aberto}>
        <span className={"hist-seta" + (aberto ? " on" : "")}>›</span>
        <span className="ontem-lab">Dia anterior</span>
        <span className="ontem-dia">{ontem.diaLabel}</span>
        <span className="ontem-meta">
          <b>{ontem.itens.length}</b> negócio{ontem.itens.length === 1 ? "" : "s"} · <b>{brl(total)}</b>
        </span>
        <span className="plan-badge">{STATUS[ontem.status] || ontem.status}</span>
      </button>

      {aberto && (
        <div className="ontem-lista">
          {ontem.motivo && <div className="aprov-motivo">Motivo da reprovação: {ontem.motivo}</div>}
          {ontem.itens.map((i) => (
            <a
              className={"ontem-item v-" + (TEMP_STYLE[i.de] || "none")}
              key={i.id}
              href={i.url}
              target="_blank"
              rel="noreferrer"
            >
              <span className="ontem-nome">
                {i.nome}
                {i.foraDoFunil && <span className="ontem-fora">saiu do funil</span>}
              </span>
              <span className="ontem-linha">
                {estrategiaPorId[i.estrategia] && (
                  <span className="estrat-tag" title={estrategiaPorId[i.estrategia].desc}>
                    <b>{numeroDa(i.estrategia)}</b>
                    {estrategiaPorId[i.estrategia].titulo}
                  </span>
                )}
                <span className="ontem-evo">
                  <span className={"mini t-" + (TEMP_STYLE[i.de] || "none")}>{i.de || "—"}</span>
                  <span className="evo-seta">→</span>
                  <span className={"mini forte t-" + (TEMP_STYLE[i.para] || "none")}>{i.para || "—"}</span>
                </span>
                <span className="ontem-val">{brl(i.valor)}</span>
              </span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
