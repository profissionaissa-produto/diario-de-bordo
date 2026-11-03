"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Remover e restaurar uma estratégia da lista do segmento. Remover não apaga
// nada: o briefing já gravado continua mostrando o nome dela.
export default function AcaoEstrategia({ seg, id, oculta }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");

  async function acao(method) {
    setBusy(true);
    setErro("");
    try {
      const res = await fetch("/api/estrategias", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seg, id }),
      });
      const d = await res.json().catch(() => ({}));
      // Sem isto o motivo da recusa (última da lista, sem permissão) sumiria.
      if (!res.ok) throw new Error(d.error || "Falha na operação.");
      router.refresh();
    } catch (e) {
      setErro(e.message);
    } finally {
      setBusy(false);
    }
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
    <>
      <button className="btn-ghost" disabled={busy} onClick={() => acao("DELETE")}>
        {busy ? "…" : "Remover"}
      </button>
      {erro && <span className="err">{erro}</span>}
    </>
  );
}
