"use client";

import { useRouter, useSearchParams } from "next/navigation";

// Barra de contexto: quem eu sou, que time estou olhando e de quem é o dia.
// Cada filtro leva rótulo porque três grupos de pílulas soltas lado a lado não
// dizem o que fazem — quem chega na tela precisa adivinhar.
export default function AdminBar({
  owners,
  selected,
  seg,
  segs = [],
  equipes = [],
  equipe = "",
  semEquipe = 0,
  rotuloPessoa = "closer",
}) {
  const router = useRouter();
  const sp = useSearchParams();

  function nav(next) {
    const p = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    router.push("/?" + p.toString());
  }

  const escolhido = owners.find((o) => String(o.ownerId) === String(selected));

  return (
    <div className="ctxbar">
      {/* O papel saiu daqui para o cabeçalho, junto do nome: solto antes dos
          filtros ele parecia um filtro a mais e empurrava a linha. */}
      {segs.length > 1 && (
        <div className="ctx-campo">
          <span className="ctx-lab">Segmento</span>
          <div className="seg-toggle">
            {segs.map((val) => (
              <button
                key={val}
                className={seg === val ? "on" : ""}
                // Trocar de segmento zera equipe e pessoa: elas são de cada um.
                onClick={() => nav({ seg: val, equipe: "", closer: "" })}
              >
                {val}
              </button>
            ))}
          </div>
        </div>
      )}

      {equipes.length > 0 && (
        <div className="ctx-campo">
          <span className="ctx-lab">Equipe</span>
          <div className="seg-toggle">
            <button className={equipe ? "" : "on"} onClick={() => nav({ equipe: "", closer: "" })}>
              Todas
            </button>
            {equipes.map((val) => (
              <button
                key={val}
                className={equipe === val ? "on" : ""}
                onClick={() => nav({ equipe: val, closer: "" })}
              >
                {val}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="ctx-campo cresce">
        <span className="ctx-lab">
          {rotuloPessoa === "farmer" ? "Farmer" : "Closer"}
          <span className="ctx-cont">{owners.length}</span>
        </span>
        <div className="select-wrap">
          <select
            className="closer-select"
            value={selected || ""}
            onChange={(e) => nav({ closer: e.target.value })}
          >
            <option value="">Selecione um {rotuloPessoa}…</option>
            {owners.map((o) => (
              <option key={o.ownerId} value={o.ownerId}>
                {o.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Sem isto, quem ficou sem equipe sumiria do filtro sem explicação. */}
      {!equipe && semEquipe > 0 && (
        <span className="plan-motivo">
          {semEquipe} sem equipe — aparecem só em “Todas”
        </span>
      )}

      {escolhido && (
        <button className="ctx-limpar" onClick={() => nav({ closer: "" })}>
          limpar seleção
        </button>
      )}
    </div>
  );
}
