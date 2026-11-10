"use client";

import { useState } from "react";
import { clienteDo, palestranteDo } from "../lib/tramitacoes";
import RegistroTramitacao from "./RegistroTramitacao";

const SELO = {
  aguardando: { txt: "Aguardando líder", cls: "aguardando" },
  devolvido: { txt: "Devolvida pelo líder", cls: "devolvido" },
};

const dataBR = (d) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "—");

// Uma tramitação, uma linha. A tela voltou a ser lista em 10/11/2026: no
// quadro por etapa a pessoa rolava na horizontal para achar o que era dela, e
// a ordem de gravidade, que é o que importa, ficava escondida dentro de cada
// coluna. Na lista ela é a própria ordem das linhas.
export default function TramitacaoLinha({ p, ticket, ehGestor, evolucao, estrategias, mostrarDono }) {
  const [aberta, setAberta] = useState(false);

  const selo = SELO[p.status];
  const assunto = ticket?.assunto || "";
  const cliente = clienteDo(assunto) || `Ticket ${p.ticketId}`;
  const palestrante = palestranteDo(assunto);

  return (
    <>
      <tr className={evolucao?.resultado ? "linha-pronta" : ""}>
        <td className="deal">
          {cliente}
          {palestrante && <div className="emp-meta">{palestrante}</div>}
          {selo && <span className={"tram-selo " + selo.cls}>{selo.txt}</span>}
          {p.status === "devolvido" && p.motivoDecisao && (
            <div className="aprov-motivo">Devolvida: {p.motivoDecisao}</div>
          )}
        </td>

        <td>
          <span className="emp-balde b-etapa">{p.label}</span>
        </td>

        <td className="col-data">{dataBR(p.evento)}</td>

        {/* O motivo já vem escrito pela régua da Sinaleira. Refazer a conta
            aqui faria a tela mentir no dia em que alguém a calibrasse. */}
        <td>
          <span className={"tram-grav n-" + p.nivel}>
            <span className={`tram-ponto p-${p.nivel}`} />
            {p.motivo}
          </span>
        </td>

        {/* O nome vai num span, não no td: emp-meta é display flex, e flex num
            td tira a célula do fluxo da tabela. A coluna inteira saía
            desalinhada das outras. */}
        {mostrarDono && (
          <td>
            <span className="emp-meta">{ticket?.donoNome || "—"}</span>
          </td>
        )}

        <td className="col-acao">
          <button type="button" className="btn-msg" onClick={() => setAberta(true)}>
            {evolucao?.resultado ? "Ver a marcação" : "Marcar o que vou fazer"}
          </button>
          {evolucao?.resultado && (
            <div className="tram-por">{evolucao.abordagem || evolucao.resultado}</div>
          )}
        </td>
      </tr>

      {aberta && (
        <RegistroTramitacao
          p={p}
          ticket={ticket}
          estrategias={estrategias}
          evolucao={evolucao}
          ehGestor={ehGestor}
          onFechar={() => setAberta(false)}
        />
      )}
    </>
  );
}
