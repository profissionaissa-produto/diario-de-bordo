"use client";

import { useState } from "react";
import { resumoWhatsApp, enqueteWhatsApp } from "../lib/resumo";

// Resumo e enquete do briefing aprovado, prontos para o WhatsApp.
// A enquete é digitada no app (+ → Enquete): o WhatsApp não cria enquete por
// link, então aqui entregamos a pergunta e as opções para colar.
export default function BotaoWhats({ closer, diaLabel, itens, estrategiaPorId }) {
  const [modo, setModo] = useState(null); // "resumo" | "enquete"
  const [copiado, setCopiado] = useState("");

  const texto = resumoWhatsApp({ closer, diaLabel, itens, ...(estrategiaPorId ? { estrategiaPorId } : {}) });
  const enquete = enqueteWhatsApp({ closer, diaLabel, itens });

  async function copiar(valor, marca) {
    try {
      await navigator.clipboard.writeText(valor);
      setCopiado(marca);
      setTimeout(() => setCopiado(""), 2000);
    } catch {
      /* sem permissão: o texto continua visível para seleção manual */
    }
  }

  return (
    <div className="whats">
      <div className="whats-acoes">
        <button
          className={"btn-whats" + (modo === "enquete" ? " on" : "")}
          onClick={() => setModo(modo === "enquete" ? null : "enquete")}
        >
          Enquete do dia
        </button>
        <button
          className={"btn-ghost" + (modo === "resumo" ? " on" : "")}
          onClick={() => setModo(modo === "resumo" ? null : "resumo")}
        >
          Resumo em texto
        </button>
      </div>

      {modo === "enquete" && (
        <div className="enq">
          <div className="enq-passo">
            No WhatsApp: <b>+ → Enquete</b>. Toque em cada campo abaixo para copiar.
          </div>

          <button className="enq-campo enq-pergunta" onClick={() => copiar(enquete.pergunta, "p")}>
            <span className="enq-lab">Pergunta</span>
            <span className="enq-valor">{enquete.pergunta}</span>
            <span className="enq-copiar">{copiado === "p" ? "copiado ✓" : "copiar"}</span>
          </button>

          {enquete.opcoes.map((o, i) => (
            <button className="enq-campo" key={i} onClick={() => copiar(o, "o" + i)}>
              <span className="enq-lab">{i + 1}</span>
              <span className="enq-valor">{o}</span>
              <span className="enq-copiar">{copiado === "o" + i ? "copiado ✓" : "copiar"}</span>
            </button>
          ))}

          {enquete.cortados > 0 && (
            <div className="enq-aviso">
              O WhatsApp aceita 12 opções por enquete — {enquete.cortados} negócio
              {enquete.cortados === 1 ? "" : "s"} ficaram de fora.
            </div>
          )}

          <button
            className="btn-ghost"
            onClick={() => copiar(enquete.opcoes.join("\n"), "todas")}
          >
            {copiado === "todas" ? "Opções copiadas ✓" : "Copiar todas as opções"}
          </button>
        </div>
      )}

      {modo === "resumo" && (
        <div className="enq">
          <div className="whats-acoes">
            <button className="btn-whats" onClick={() => copiar(texto, "r")}>
              {copiado === "r" ? "Copiado ✓" : "Copiar resumo"}
            </button>
            <a
              className="btn-ghost"
              href={`https://wa.me/?text=${encodeURIComponent(texto)}`}
              target="_blank"
              rel="noreferrer"
            >
              Abrir no WhatsApp
            </a>
          </div>
          <pre className="whats-previa">{texto}</pre>
        </div>
      )}
    </div>
  );
}
