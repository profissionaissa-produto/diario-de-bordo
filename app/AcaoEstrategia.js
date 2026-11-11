"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Editar, remover e restaurar uma estratégia da lista do segmento.
//
// Remover não apaga nada: o briefing já gravado continua mostrando o nome
// dela. Editar também não troca o id, pelo mesmo motivo.
//
// Edição vale para as dez originais do código: a gravação cria uma linha no
// banco com o mesmo id e ela passa a valer no lugar da original.
export default function AcaoEstrategia({ seg, id, oculta, titulo = "", desc = "" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");
  const [editando, setEditando] = useState(false);
  const [t, setT] = useState(titulo);
  const [d, setD] = useState(desc);

  async function acao(method, corpo) {
    setBusy(true);
    setErro("");
    try {
      const res = await fetch("/api/estrategias", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seg, id, ...corpo }),
      });
      const r = await res.json().catch(() => ({}));
      // Sem isto o motivo da recusa (última da lista, sem permissão) sumiria.
      if (!res.ok) throw new Error(r.error || "Falha na operação.");
      setEditando(false);
      router.refresh();
    } catch (e) {
      setErro(e.message);
    } finally {
      setBusy(false);
    }
  }

  function fechar() {
    setEditando(false);
    setT(titulo);
    setD(desc);
    setErro("");
  }

  // Janela, não edição na célula: a coluna de ações tem 12% da largura e o
  // "quando usar" é o texto mais longo da tela.
  if (editando) {
    return (
      <div className="modal-fundo" onMouseDown={(ev) => ev.target === ev.currentTarget && fechar()}>
        <div className="modal modal-estreito" role="dialog" aria-modal="true" aria-label="Editar estratégia">
          <header className="modal-topo">
            <div>
              <h2>Editar estratégia</h2>
              <div className="modal-sub">
                <span>{seg}</span>
                <span>· o texto muda para todo mundo, inclusive no briefing de hoje</span>
              </div>
            </div>
            <button className="modal-x" onClick={fechar} aria-label="Fechar">×</button>
          </header>

          <section className="modal-principal">
            <div className="modal-campo">
              <label className="ctx-lab" htmlFor={`t-${id}`}>Título</label>
              <input
                id={`t-${id}`}
                className="est-input"
                value={t}
                onChange={(ev) => setT(ev.target.value)}
              />
            </div>
            <div className="modal-campo">
              <label className="ctx-lab" htmlFor={`d-${id}`}>Quando usar</label>
              <textarea
                id={`d-${id}`}
                className="obs est-area"
                value={d}
                placeholder="Em que situação o time aplica esta estratégia"
                onChange={(ev) => setD(ev.target.value)}
              />
            </div>
            {/* O id é o que está gravado em todo briefing fechado. Dizer isto
                evita a pergunta de sempre: "editar apaga o histórico?" */}
            <p className="fech-opcional">
              Editar muda só o texto. Os briefings já fechados continuam
              apontando para esta mesma estratégia.
            </p>
          </section>

          <footer className="modal-rodape">
            {erro && <span className="err">{erro}</span>}
            <button className="btn-ghost" disabled={busy} onClick={fechar}>
              Cancelar
            </button>
            <button
              className="btn-primary"
              disabled={busy || !t.trim() || !d.trim()}
              onClick={() => acao("PUT", { titulo: t, desc: d })}
            >
              {busy ? "Salvando…" : "Salvar"}
            </button>
          </footer>
        </div>
      </div>
    );
  }

  if (oculta) {
    return (
      <>
        <button className="btn-ghost" disabled={busy} onClick={() => acao("PATCH")}>
          {busy ? "…" : "Restaurar"}
        </button>
        {erro && <span className="err">{erro}</span>}
      </>
    );
  }

  return (
    <div className="est-acoes">
      <button className="btn-ghost" disabled={busy} onClick={() => setEditando(true)}>
        Editar
      </button>
      <button className="btn-ghost" disabled={busy} onClick={() => acao("DELETE")}>
        {busy ? "…" : "Remover"}
      </button>
      {erro && <span className="err">{erro}</span>}
    </div>
  );
}
