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

  // O botão cinza sem explicação é o que trava quem está cadastrando: aqui o
  // que falta é dito em caracteres, campo a campo.
  const faltaTitulo = Math.max(0, MIN_TITULO - titulo.trim().length);
  const faltaDesc = Math.max(0, MIN_DESC - desc.trim().length);
  const curto = faltaTitulo > 0 || faltaDesc > 0;
  const pendencias = [
    faltaTitulo && `${faltaTitulo} no título`,
    faltaDesc && `${faltaDesc} em "quando usar"`,
  ].filter(Boolean);

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
          <span className="ctx-lab">Título {faltaTitulo > 0 && <em className="est-falta">mínimo {MIN_TITULO}</em>}</span>
          <input
            className="est-input"
            value={titulo}
            maxLength={120}
            placeholder="Como o closer chama essa estratégia"
            onChange={(e) => setTitulo(e.target.value)}
          />
        </label>

        <label className="est-campo">
          <span className="ctx-lab">Quando usar {faltaDesc > 0 && <em className="est-falta">mínimo {MIN_DESC}</em>}</span>
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
        {curto && !erro && (
          <span className="fech-opcional">Faltam {pendencias.join(" e ")} caracteres para cadastrar.</span>
        )}
        <button className="btn-primary" type="submit" disabled={busy || curto}>
          {busy ? "Cadastrando…" : "Cadastrar"}
        </button>
      </div>
    </form>
  );
}
