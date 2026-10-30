"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const MIN_TITULO = 5;
const MIN_DESC = 20;

// Cadastro de estratégia. O servidor valida de novo e é ele quem decide o id —
// aqui só não deixamos enviar o que já se sabe incompleto.
export default function NovaEstrategia({ seg }) {
  const router = useRouter();
  const [titulo, setTitulo] = useState("");
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");

  const curto = titulo.trim().length < MIN_TITULO || desc.trim().length < MIN_DESC;

  async function salvar(e) {
    e.preventDefault();
    setBusy(true);
    setErro("");
    setOk("");
    try {
      const res = await fetch("/api/estrategias", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seg, titulo, desc }),
      });
      const d = await res.json().catch(() => ({}));
      // Sem isto o erro do servidor viraria "falhou" sem dizer o quê.
      if (!res.ok) throw new Error(d.error || "Falha ao cadastrar.");
      setOk(`Cadastrada como ${d.estrategia.id}. Já aparece para o time.`);
      setTitulo("");
      setDesc("");
      router.refresh();
    } catch (err) {
      setErro(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card est-form" onSubmit={salvar}>
      <div className="planbar">
        <span className="plan-week">Nova estratégia de {seg}</span>
      </div>

      <div className="est-campos">
        <label className="est-campo">
          <span className="ctx-lab">Título</span>
          <input
            className="est-input"
            value={titulo}
            maxLength={120}
            placeholder="Como o closer chama essa estratégia"
            onChange={(e) => setTitulo(e.target.value)}
          />
        </label>

        <label className="est-campo">
          <span className="ctx-lab">Quando usar</span>
          <textarea
            className="obs"
            value={desc}
            maxLength={600}
            placeholder="Em que situação ela se aplica e o que o closer faz na prática."
            onChange={(e) => setDesc(e.target.value)}
          />
        </label>
      </div>

      <div className="fech-rodape">
        {erro && <span className="err">{erro}</span>}
        {ok && !erro && <span className="saved">{ok}</span>}
        <button className="btn-primary" type="submit" disabled={busy || curto}>
          {busy ? "Cadastrando…" : "Cadastrar"}
        </button>
      </div>
    </form>
  );
}
