"use client";

import { useState } from "react";
import { TEMP_STYLE, dealUrl } from "../lib/config";
import { estrategiaPorId as SEMENTES_IDX, numeroDa } from "../lib/estrategias";

const brl = (n) =>
  n == null ? "—" : "R$ " + n.toLocaleString("pt-BR", { maximumFractionDigits: 0 });

const ROTULO = {
  aprovado: "Aprovado",
  reprovado: "Reprovado",
  enviado: "Não decidido",
  rascunho: "Não enviado",
};

// Linha do histórico que abre mostrando o que foi aprovado naquele dia.
// Os negócios são buscados na primeira abertura, não no carregamento da página.
export default function HistLinha({ registro, estrat }) {
  const estrategiaPorId = estrat?.idx || SEMENTES_IDX;
  const [aberto, setAberto] = useState(false);
  const [itens, setItens] = useState(null);
  const [erro, setErro] = useState(false);

  async function alternar() {
    const vai = !aberto;
    setAberto(vai);
    if (vai && itens === null) {
      try {
        const res = await fetch(`/api/briefing?owner=${registro.ownerId}&dia=${registro.dia}`);
        if (!res.ok) throw new Error();
        const d = await res.json();
        setItens(d.itens || []);
      } catch {
        setErro(true);
        setItens([]);
      }
    }
  }

  const total = (itens || []).reduce((s, i) => s + (i.valor || 0), 0);

  return (
    <div className={"hist-item st-" + registro.status}>
      <button className="hist-linha" onClick={alternar} aria-expanded={aberto}>
        <span className={"hist-seta" + (aberto ? " on" : "")}>›</span>
        <span className="hist-nome">{registro.nome}</span>
        <span className="hist-n">
          {registro.negocios} negócio{registro.negocios === 1 ? "" : "s"}
        </span>
        <span className="plan-badge">{ROTULO[registro.status] || registro.status}</span>
        {registro.revisadoPor && <span className="hist-por">por {registro.revisadoPor}</span>}
        {registro.motivo && <span className="hist-motivo">{registro.motivo}</span>}
      </button>

      {aberto && (
        <div className="hist-detalhe">
          {itens === null && <div className="hist-carregando">Carregando negócios…</div>}
          {erro && <div className="hist-carregando">Não foi possível carregar.</div>}
          {itens?.length === 0 && !erro && <div className="hist-carregando">Sem negócios.</div>}
          {itens?.length > 0 && (
            <>
              <div className="hist-detalhe-topo">
                <b>{itens.length}</b> negócio{itens.length === 1 ? "" : "s"} · <b>{brl(total)}</b>
              </div>
              {itens.map((i) => (
                <div className={"hist-neg v-" + (TEMP_STYLE[i.de] || "none")} key={i.id}>
                  <a className="hist-neg-nome" href={dealUrl(i.id)} target="_blank" rel="noreferrer">
                    {i.nome}
                  </a>
                  <div className="hist-neg-meta">
                    {i.estrategia && estrategiaPorId[i.estrategia] && (
                      <span className="estrat-tag" title={estrategiaPorId[i.estrategia].desc}>
                        <b>{numeroDa(i.estrategia)}</b>
                        {estrategiaPorId[i.estrategia].titulo}
                      </span>
                    )}
                    <span className="hist-neg-evo">
                      <span className={"mini t-" + (TEMP_STYLE[i.de] || "none")}>{i.de || "—"}</span>
                      <span className="evo-seta">→</span>
                      <span className={"mini forte t-" + (TEMP_STYLE[i.para] || "none")}>
                        {i.para || "—"}
                      </span>
                    </span>
                    <span className="hist-neg-val">{brl(i.valor)}</span>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
