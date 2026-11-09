"use client";

import { useState } from "react";
import { clienteDo, palestranteDo } from "../lib/tramitacoes";
import RegistroTramitacao from "./RegistroTramitacao";

const SELO = {
  aguardando: { txt: "Aguardando líder", cls: "aguardando" },
  devolvido: { txt: "Devolvida pelo líder", cls: "devolvido" },
};

const dataBR = (d) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : "");

export default function TramitacaoCard({ p, ticket, ehGestor, evolucao, estrategias, mostrarDono }) {
  const [aberto, setAberto] = useState(false);

  const selo = SELO[p.status];
  const assunto = ticket?.assunto || "";
  const cliente = clienteDo(assunto) || `Ticket ${p.ticketId}`;
  const palestrante = palestranteDo(assunto);

  return (
    <article className={`tram-card n-${p.nivel}`}>
      {/* O motivo já vem escrito pela régua da Sinaleira. Refazer a conta aqui
          faria a tela mentir no dia em que alguém a calibrasse. */}
      <header className="tram-grav">
        <span className={`tram-ponto p-${p.nivel}`} />
        <span>{p.motivo}</span>
      </header>

      <h4 className="tram-cliente">{cliente}</h4>
      <div className="tram-meta">
        {palestrante && <span>{palestrante}</span>}
        {p.evento && <span>· {dataBR(p.evento)}</span>}
        {mostrarDono && ticket?.donoNome && <span>· {ticket.donoNome}</span>}
      </div>

      {selo && <span className={"tram-selo " + selo.cls}>{selo.txt}</span>}
      {p.status === "devolvido" && p.motivoDecisao && (
        <div className="aprov-motivo">Devolvida: {p.motivoDecisao}</div>
      )}
      {p.status === "aguardando" && p.marcadoPor && (
        <div className="tram-por">marcada por {p.marcadoPor}</div>
      )}
      {evolucao?.resultado && (
        <div className="tram-por">marcado hoje: {evolucao.abordagem || evolucao.resultado}</div>
      )}

      <button className="btn-link tram-abrir" onClick={() => setAberto(true)}>
        {evolucao?.resultado ? "Ver ou corrigir a marcação" : "Marcar o que vou fazer"}
      </button>

      {aberto && (
        <RegistroTramitacao
          p={p}
          ticket={ticket}
          estrategias={estrategias}
          evolucao={evolucao}
          ehGestor={ehGestor}
          onFechar={() => setAberto(false)}
        />
      )}
    </article>
  );
}
