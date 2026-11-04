"use client";

import { useState } from "react";
import { RESULTADOS, EXIGE_OBSERVACAO, MINIMO_OBSERVACAO, BALDES, placarDoDia } from "../lib/carteira";

const opcaoDe = (k) => RESULTADOS.find((r) => r.key === k);

const DICA = {
  efetivo: "O que saiu da conversa?",
  tentativa: "A ligação registrada no CRM já é a evidência — observação é opcional.",
  nao_abordei: "Por que a empresa não foi abordada hoje?",
  trocar_segmento: "Para onde ela deveria ir?",
};

// Resumo do que o CRM já registrou hoje nesta empresa.
function resumoAtividade(a) {
  const partes = [];
  if (a.ligacoes > 0) {
    const conect = a.conectadas > 0 ? ` (${a.conectadas} conectada${a.conectadas === 1 ? "" : "s"})` : "";
    partes.push(`${a.ligacoes} ligação${a.ligacoes === 1 ? "" : "es"}${conect}`);
  }
  if (a.reunioes > 0) partes.push(`${a.reunioes} reunião realizada`);
  if (a.outras > 0) partes.push(`${a.outras} e-mail ou nota`);
  return partes.join(" · ");
}

function Card({ e, ctx, onFechou }) {
  const [resultado, setResultado] = useState(e.resultado || "");
  const [obs, setObs] = useState(e.observacao || "");
  const ativ = e.atividade;
  const [salvo, setSalvo] = useState(!!e.resultado);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");

  const exige = EXIGE_OBSERVACAO.includes(resultado);
  const faltam = exige ? Math.max(0, MINIMO_OBSERVACAO - obs.trim().length) : 0;
  const podeSalvar = !!resultado && faltam === 0;

  async function salvar() {
    setBusy(true);
    setErro("");
    try {
      const res = await fetch("/api/carteira", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ownerId: ctx.ownerId,
          dia: ctx.dia,
          companyId: e.id,
          resultado,
          observacao: obs,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Falha ao salvar.");
      }
      setSalvo(true);
      onFechou(e.id, resultado);
    } catch (err) {
      setErro(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={"emp-card b-" + e.balde + (salvo ? " pronta" : "")}>
      <div className="emp-topo">
        <span className={"emp-balde b-" + e.balde}>{BALDES[e.balde]?.label || e.balde}</span>
        {e.extra && <span className="emp-tag">extra</span>}
      </div>

      <a className="emp-nome" href={e.url} target="_blank" rel="noreferrer">{e.nome}</a>

      {e.abordagem ? (
        <div className="emp-meta">abordagem: <b>{e.abordagem}</b></div>
      ) : (
        <div className="emp-meta emp-hist">sem abordagem definida de manhã</div>
      )}
      {e.contexto && <div className="emp-orientacao">{e.contexto}</div>}

      {/* O fechamento é conferência: o CRM responde o que já sabe. */}
      {ativ && (
        <div className="emp-ativ">
          <span className="emp-ativ-num">{resumoAtividade(ativ)} — hoje no HubSpot</span>
          {!resultado && ativ.sugerido && (
            <button
              className="btn-ghost"
              onClick={() => {
                setResultado(ativ.sugerido);
                // A anotação da ligação já é a observação; o farmer corrige.
                if (ativ.texto && !obs) setObs(ativ.texto);
                setSalvo(false);
              }}
            >
              Preencher pelo HubSpot
            </button>
          )}
        </div>
      )}

      <div className="fech-opcoes">
        {RESULTADOS.map((r) => (
          <button
            key={r.key}
            className={"fech-op " + r.cls + (resultado === r.key ? " on" : "")}
            onClick={() => {
              setResultado(r.key);
              setSalvo(false);
              setErro("");
            }}
          >
            {r.label}
          </button>
        ))}
      </div>

      {resultado && (
        <div className="fech-obs">
          <textarea
            className="obs"
            placeholder={DICA[resultado]}
            value={obs}
            onChange={(ev) => {
              setObs(ev.target.value);
              setSalvo(false);
            }}
          />
          <div className="fech-rodape">
            {exige ? (
              <span className={faltam ? "fech-falta" : "fech-ok"}>
                {faltam ? `faltam ${faltam} caracteres` : "observação completa"}
              </span>
            ) : (
              <span className="fech-opcional">observação opcional</span>
            )}
            {erro && <span className="err">{erro}</span>}
            {salvo && !erro && <span className="saved">registrado ✓</span>}
            <button className="btn-primary" onClick={salvar} disabled={!podeSalvar || busy || salvo}>
              {busy ? "Salvando…" : salvo ? "Registrado" : "Registrar"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function FecharDia({ itens, ctx }) {
  const [feitos, setFeitos] = useState(() => {
    const m = {};
    for (const e of itens) if (e.resultado) m[e.id] = e.resultado;
    return m;
  });

  if (itens.length === 0) {
    return (
      <div className="card">
        <div className="foco-vazio">
          <h3>Nada para fechar</h3>
          <p>O fechamento lista as empresas da sua lista de hoje.</p>
        </div>
      </div>
    );
  }

  const comEstado = itens.map((e) => ({ ...e, resultado: feitos[e.id] ?? e.resultado }));
  const placar = placarDoDia(comEstado);
  // Quantas o CRM consegue responder sozinho — o resto é digitação mesmo.
  const sugestoes = comEstado.filter((e) => !e.resultado && e.atividade?.sugerido).length;
  const faltam = comEstado.filter((e) => !e.resultado).length;

  return (
    <div className="foco">
      <div className="foco-topo">
        <div className="foco-resumo">
          <span className="foco-dia">Fechamento de {ctx.diaLabel}</span>
          <span className="foco-status">{placar.pct}% de contato efetivo</span>
        </div>
        <div className="foco-nums">
          {sugestoes > 0 && (
            <span className="fech-ok">{sugestoes} com atividade já registrada no CRM</span>
          )}
          <span><b>{placar.efetivo}</b> efetivo</span>
          <span><b>{placar.tentativa}</b> tentativa</span>
          <span><b>{placar.nao_abordei}</b> não abordei</span>
          {placar.trocas > 0 && <span><b>{placar.trocas}</b> troca de segmento</span>}
          {faltam > 0 && <span className="foco-alerta"><b>{faltam}</b> sem registro</span>}
        </div>
      </div>

      <div className="evo-nota" style={{ marginBottom: 16 }}>
        O percentual é sobre as <b>{placar.total} empresas do compromisso</b>, não sobre o que foi
        preenchido — e as trocas de segmento ficam fora da conta. Dia sem fechamento faz a empresa
        voltar amanhã como não abordada.
      </div>

      <div className="foco-grid">
        {comEstado.map((e) => (
          <Card key={e.id} e={e} ctx={ctx} onFechou={(id, r) => setFeitos((f) => ({ ...f, [id]: r }))} />
        ))}
      </div>
    </div>
  );
}
