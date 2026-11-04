"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const MIN = 40;

// O contexto institucional que entra em toda mensagem gerada do segmento.
// É a camada que não depende do que a pessoa clicou na tela: sem ela o modelo
// só conhece o caso concreto e escreve coisa desconexa quando ele diz pouco.
export default function ContextoBase({ seg, inicial = "", atualizadoPor = "" }) {
  const router = useRouter();
  const [texto, setTexto] = useState(inicial);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");

  const mudou = texto.trim() !== inicial.trim();
  const curto = texto.trim().length > 0 && texto.trim().length < MIN;

  async function salvar(e) {
    e.preventDefault();
    setBusy(true);
    setErro("");
    setOk("");
    try {
      const res = await fetch("/api/contexto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seg, texto }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Falha ao salvar.");
      setOk("Salvo. Entra na próxima mensagem gerada.");
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
        <span className="plan-week">Contexto da PSA para as mensagens de {seg}</span>
        {atualizadoPor && <span className="est-sem">última edição de {atualizadoPor}</span>}
      </div>

      <label className="est-campo">
        <span className="ctx-lab">
          O que a IA precisa saber sempre {curto && <em className="est-falta">mínimo {MIN}</em>}
        </span>
        <textarea
          className="obs ctx-base"
          value={texto}
          maxLength={4000}
          placeholder={
            "Como a PSA trabalha, como o processo funciona, que tom usar e o que nunca pode ser prometido.\n\n" +
            "Isto entra em toda mensagem, e-mail e roteiro gerado deste segmento, junto com a abordagem e a estratégia escolhidas na hora."
          }
          onChange={(e) => { setTexto(e.target.value); setOk(""); }}
        />
      </label>

      <div className="fech-rodape">
        {erro && <span className="err">{erro}</span>}
        {ok && !erro && <span className="saved">{ok}</span>}
        {!erro && !ok && (
          <span className="fech-opcional">
            {texto.trim().length} de 4000 caracteres. Vazio significa gerar só com o que está na tela.
          </span>
        )}
        <button className="btn-primary" type="submit" disabled={busy || !mudou || curto}>
          {busy ? "Salvando…" : "Salvar contexto"}
        </button>
      </div>
    </form>
  );
}
