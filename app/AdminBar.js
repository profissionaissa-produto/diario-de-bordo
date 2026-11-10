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
  // A mesma barra serve o Diário e as Tramitações. Sem isto a de lá empurrava
  // a navegação para "/" e o filtro se perdia ao trocar de equipe.
  base = "/",
  paramPessoa = "closer",
  // Segmento que tem tela própria em vez de ser um recorte desta. O
  // Financeiro é assim: ele não olha o funil de ninguém, olha os tickets que
  // já foram vendidos.
  rotas = {},
}) {
  const router = useRouter();
  const sp = useSearchParams();

  function nav(next) {
    // Segmento com tela própria leva para ela, limpo: equipe e pessoa do
    // segmento anterior não querem dizer nada lá.
    if (next.seg && rotas[next.seg]) {
      router.push(rotas[next.seg]);
      return;
    }
    const p = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    router.push(base + "?" + p.toString());
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
                onClick={() => nav({ seg: val, equipe: "", [paramPessoa]: "" })}
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
            <button className={equipe ? "" : "on"} onClick={() => nav({ equipe: "", [paramPessoa]: "" })}>
              Todas
            </button>
            {equipes.map((val) => (
              <button
                key={val}
                className={equipe === val ? "on" : ""}
                onClick={() => nav({ equipe: val, [paramPessoa]: "" })}
              >
                {val}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Tela que não filtra por pessoa não mostra o seletor vazio. */}
      {owners.length > 0 && (
      <div className="ctx-campo cresce">
        <span className="ctx-lab">
          {rotuloPessoa === "farmer" ? "Farmer" : "Closer"}
          <span className="ctx-cont">{owners.length}</span>
        </span>
        <div className="select-wrap">
          <select
            className="closer-select"
            value={selected || ""}
            onChange={(e) => nav({ [paramPessoa]: e.target.value })}
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
      )}

      {/* Sem isto, quem ficou sem equipe sumiria do filtro sem explicação. */}
      {!equipe && semEquipe > 0 && (
        <span className="plan-motivo">
          {semEquipe} sem equipe — aparecem só em “Todas”
        </span>
      )}

      {escolhido && (
        <button className="ctx-limpar" onClick={() => nav({ [paramPessoa]: "" })}>
          limpar seleção
        </button>
      )}
    </div>
  );
}
