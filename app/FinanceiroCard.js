"use client";

import { useState } from "react";
import { clienteDo, palestranteDo } from "../lib/tramitacoes";
import { abordagensDa, emReais } from "../lib/financeiro";
import RegistroTramitacao from "./RegistroTramitacao";

const dataBR = (d) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : "");

export default function FinanceiroCard({ c, ticket, estrategias, ehGestor }) {
  const [aberto, setAberto] = useState(false);

  const assunto = ticket?.assunto || "";
  const cliente = clienteDo(assunto) || `Ticket ${c.ticketId}`;
  const palestrante = palestranteDo(assunto);
  const valor = Number(String(c.cache).replace(",", ".")) || 0;

  return (
    <article className={`tram-card n-${c.nivel}`}>
      {/* A linha de cima é a parcela: é por ela que o card está nesta coluna,
          e é dela que sai a cor. */}
      <header className="tram-grav">
        <span className={`tram-ponto p-${c.nivel}`} />
        <span>{c.texto}</span>
      </header>

      <h4 className="tram-cliente">{cliente}</h4>
      <div className="tram-meta">
        <span>{c.label}</span>
        {palestrante && <span>· {palestrante}</span>}
        {c.evento && <span>· evento {dataBR(c.evento)}</span>}
      </div>

      {/* Todas as parcelas, não só a que mandou. Com duas ou três combinadas,
          ver só uma data esconde o resto do compromisso. */}
      {c.parcelas.length > 1 && (
        <div className="fin-parcelas">
          {c.parcelas.map((p) => (
            <span
              key={p.n}
              className={"fin-parcela" + (p.n === c.parcela ? " on" : "") + (p.data ? "" : " vazia")}
            >
              {p.n}ª {p.data ? dataBR(p.data) : "sem data"}
            </span>
          ))}
        </div>
      )}

      <div className="tram-meta">
        {valor > 0 && <span>cachê {emReais(valor)}</span>}
        {c.pagamentoPalestrante && <span>· palestrante {dataBR(c.pagamentoPalestrante)}</span>}
      </div>

      {/* O veredito da etapa, nomeado. Ele mede outra coisa, o marco da etapa
          contra o evento, então pode discordar da coluna. Escrito assim os
          dois convivem; na mesma bolinha, um desmentia o outro. */}
      {c.sinaleira?.motivo && (
        <div className="fin-sinaleira">
          <span className={`tram-ponto p-${c.sinaleira.nivel}`} />
          <span>Sinaleira: {c.sinaleira.motivo}</span>
        </div>
      )}

      {c.tentativa > 1 && <span className="tram-selo aguardando">{c.tentativa - 1} já registradas</span>}

      {/* No financeiro não há resultado: o que diz que o dia foi marcado é a
          ação escolhida. Olhar o resultado aqui deixava o card dizendo que
          nada tinha sido marcado mesmo depois de registrar. */}
      {c.evolucao?.abordagem && <div className="tram-por">marcado hoje: {c.evolucao.abordagem}</div>}

      <button className="btn-link tram-abrir" onClick={() => setAberto(true)}>
        {c.evolucao?.abordagem ? "Ver ou corrigir a marcação" : "Marcar o que vou fazer"}
      </button>

      {aberto && (
        <RegistroTramitacao
          p={c}
          ticket={ticket}
          estrategias={estrategias}
          evolucao={c.evolucao}
          ehGestor={ehGestor}
          abordagens={abordagensDa(c.etapa)}
          financeiro
          onFechar={() => setAberto(false)}
        />
      )}
    </article>
  );
}
