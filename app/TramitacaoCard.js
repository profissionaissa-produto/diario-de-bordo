"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  RESULTADOS_TRAMITACAO,
  TRAMITACAO_EXIGE_OBSERVACAO,
  clienteDo,
  palestranteDo,
} from "../lib/tramitacoes";

const SELO = {
  aguardando: { txt: "Aguardando líder", cls: "aguardando" },
  devolvido: { txt: "Devolvida pelo líder", cls: "devolvido" },
};

const dataBR = (d) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : "");

export default function TramitacaoCard({ p, ticket, ehGestor, evolucao, mostrarDono }) {
  const router = useRouter();
  const [resultado, setResultado] = useState(evolucao?.resultado || "");
  const [obsEvo, setObsEvo] = useState(evolucao?.observacao || "");
  const [evoSalva, setEvoSalva] = useState(!!evolucao?.resultado);
  const [evoErro, setEvoErro] = useState("");

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [abrirDevolver, setAbrirDevolver] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [aberto, setAberto] = useState(false);

  async function registrarEvolucao() {
    setBusy(true);
    setEvoErro("");
    try {
      const res = await fetch("/api/tramitacoes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketId: p.ticketId, tipo: p.tipo, resultado, observacao: obsEvo }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Falha ao registrar.");
      }
      setEvoSalva(true);
    } catch (e) {
      setEvoErro(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function chamar(metodo, corpo) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/tramitacoes", {
        method: metodo,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketId: p.ticketId, tipo: p.tipo, ...corpo }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Falha ao registrar.");
      }
      setAbrirDevolver(false);
      router.refresh();
    } catch (e) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  }

  const selo = SELO[p.status];
  const assunto = ticket?.assunto || "";
  const cliente = clienteDo(assunto) || `Ticket ${p.ticketId}`;
  const palestrante = palestranteDo(assunto);

  return (
    <article className={`tram-card n-${p.nivel}`}>
      {/* O motivo já vem escrito pela régua: "Evento foi há 10 dias e a etapa
          ainda é de preparação". Repetir a conta aqui faria a tela mentir no
          dia em que alguém calibrasse os números. */}
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

      {/* A coluna fica legível com o card fechado; agir é um clique. */}
      <button className="btn-link tram-abrir" onClick={() => setAberto((v) => !v)}>
        {aberto ? "Fechar" : evoSalva ? "Registrado ✓" : "Registrar o que fiz"}
      </button>

      {aberto && (
        <div className="tram-painel">
          <div className="fech-opcoes">
            {RESULTADOS_TRAMITACAO.map((r) => (
              <button
                key={r.key}
                className={"fech-op " + r.cls + (resultado === r.key ? " on" : "")}
                onClick={() => { setResultado(r.key); setEvoSalva(false); setEvoErro(""); }}
              >
                {r.label}
              </button>
            ))}
          </div>

          {resultado && TRAMITACAO_EXIGE_OBSERVACAO.includes(resultado) && (
            <textarea
              className="obs"
              placeholder="O que travou? De quem depende?"
              value={obsEvo}
              onChange={(e) => { setObsEvo(e.target.value); setEvoSalva(false); }}
            />
          )}

          <div className="fech-rodape">
            {evoErro && <span className="err">{evoErro}</span>}
            {msg && <span className="err">{msg}</span>}
            {evoSalva && !evoErro && <span className="saved">registrado</span>}
            {resultado && (
              <button className="btn-ghost" onClick={registrarEvolucao} disabled={busy || evoSalva}>
                {evoSalva ? "Registrado" : "Registrar"}
              </button>
            )}
            {p.status === "aguardando" ? (
              ehGestor ? (
                <>
                  <button className="btn-ghost" onClick={() => setAbrirDevolver((v) => !v)} disabled={busy}>
                    Devolver
                  </button>
                  <button className="btn-primary" onClick={() => chamar("PATCH", { decisao: "confirmado" })} disabled={busy}>
                    {busy ? "…" : "Confirmar baixa"}
                  </button>
                </>
              ) : (
                <span className="tram-espera">esperando o líder</span>
              )
            ) : (
              <button className="btn-primary" onClick={() => chamar("POST", {})} disabled={busy}>
                {busy ? "…" : "Marcar como feito"}
              </button>
            )}
          </div>

          {abrirDevolver && (
            <div className="reprova">
              <input
                className="reprova-input"
                placeholder="Por que está voltando?"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
              />
              <button className="btn-danger" onClick={() => chamar("PATCH", { decisao: "devolvido", motivo })} disabled={busy}>
                Devolver
              </button>
            </div>
          )}
        </div>
      )}
    </article>
  );
}
