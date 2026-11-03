"use client";

import { useState } from "react";
import { ABORDAGENS, BALDES } from "../lib/carteira";
import { numeroDa } from "../lib/estrategias";

// Contexto de quem já apareceu antes: é o que responde "por que ela voltou?".
function historicoTexto(h) {
  if (!h?.ultimaData) return "";
  const dia = h.ultimaData.slice(8, 10) + "/" + h.ultimaData.slice(5, 7);
  const r = {
    efetivo: "falaram em " + dia,
    tentativa: `${h.tentativasSeguidas || 1}ª tentativa · sem contato desde ${dia}`,
    nao_abordei: "não abordada em " + dia,
    trocar_segmento: "troca pedida em " + dia,
  };
  return r[h.ultimoResultado] || `apareceu em ${dia}, sem fechamento`;
}

const dataBR = (d) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "—");

function Linha({ e, ctx, estrategias, onAbordagem }) {
  const [abordagem, setAbordagem] = useState(e.abordagem || "");
  const [estrategia, setEstrategia] = useState(e.estrategia || "");
  const [contexto, setContexto] = useState(e.contexto || "");
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");

  async function salvar(campos) {
    setBusy(true);
    setErro("");
    try {
      const res = await fetch("/api/carteira", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerId: ctx.ownerId, dia: ctx.dia, companyId: e.id, ...campos }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Falha ao salvar.");
      }
      return true;
    } catch (err) {
      setErro(err.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function escolher(valor) {
    const anterior = abordagem;
    setAbordagem(valor);
    // Não finge que salvou: volta ao anterior se a gravação falhar.
    if (await salvar({ abordagem: valor })) onAbordagem(e.id, valor);
    else setAbordagem(anterior);
  }

  async function escolherEstrategia(valor) {
    const anterior = estrategia;
    setEstrategia(valor);
    if (!(await salvar({ estrategia: valor }))) setEstrategia(anterior);
  }

  const hist = historicoTexto(e.historico);

  return (
    <tr className={abordagem ? "linha-pronta" : ""}>
      <td className="deal">
        {e.extra && <span className="emp-tag">extra</span>}
        {e.precisaAuxilio && <span className="emp-tag auxilio">auxílio</span>}
        {e.selo && (
          <span className="emp-tag selo" title="Negócio registrado e mais de uma reunião de relacionamento com você">
            relacionamento
          </span>
        )}
        <a className="deal-link" href={e.url} target="_blank" rel="noreferrer">{e.nome}</a>
        {e.orientacao && (
          <div className="emp-orientacao">
            {e.orientacao.texto}
            <span className="emp-orientacao-autor">— {e.orientacao.autor}</span>
          </div>
        )}
      </td>

      <td>
        <span className={"emp-balde b-" + e.balde}>{BALDES[e.balde]?.label || e.balde}</span>
      </td>

      <td className="col-data">{dataBR(e.ultimaCompra)}</td>

      <td className="col-hist">{hist || <span className="sem">primeira vez na lista</span>}</td>

      <td>
        <div className="select-wrap">
          <select
            className="emp-abordagem"
            value={abordagem}
            disabled={busy}
            onChange={(ev) => escolher(ev.target.value)}
          >
            <option value="">Como vai abordar…</option>
            {ABORDAGENS.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>
        {erro && <span className="err">{erro}</span>}
        {e.editadoPor && <span className="emp-editado">ajustado por {e.editadoPor}</span>}
      </td>

      <td>
        {/* Opcional: a abordagem é o compromisso do dia, a estratégia é como
            ele vai conduzir. Sem lista cadastrada a coluna não cobra nada. */}
        <div className="select-wrap">
          <select
            className="emp-abordagem"
            value={estrategia}
            disabled={busy || estrategias.length === 0}
            onChange={(ev) => escolherEstrategia(ev.target.value)}
          >
            <option value="">{estrategias.length ? "Escolher estratégia…" : "Nenhuma cadastrada"}</option>
            {estrategias.map((s) => (
              <option key={s.id} value={s.id} title={s.desc}>
                {numeroDa(s.id)}. {s.titulo}
              </option>
            ))}
          </select>
        </div>
      </td>

      <td>
        {/* Salva ao sair do campo: digitar não pode disparar uma chamada por tecla. */}
        <textarea
          className="obs emp-contexto"
          placeholder="Contexto (opcional)"
          value={contexto}
          onChange={(ev) => setContexto(ev.target.value)}
          onBlur={() => contexto !== (e.contexto || "") && salvar({ contexto })}
        />
      </td>
    </tr>
  );
}

function Tabela({ itens, ctx, estrategias, onAbordagem }) {
  return (
    <div className="tscroll">
      <table>
        <thead>
          <tr>
            <th style={{ width: "22%" }}>Empresa</th>
            <th style={{ width: "9%" }}>Fase</th>
            <th style={{ width: "10%" }}>Última compra</th>
            <th style={{ width: "14%" }}>Por que voltou</th>
            <th style={{ width: "17%" }}>Abordagem</th>
            <th style={{ width: "16%" }}>Estratégia</th>
            <th style={{ width: "12%" }}>Contexto</th>
          </tr>
        </thead>
        <tbody>
          {itens.map((e) => (
            <Linha key={e.id} e={e} ctx={ctx} estrategias={estrategias} onAbordagem={onAbordagem} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ListaDoDia({ itens, ctx, estrategias = [] }) {
  const [abordagens, setAbordagens] = useState(() => {
    const m = {};
    for (const e of itens) if (e.abordagem) m[e.id] = e.abordagem;
    return m;
  });

  const doCompromisso = itens.filter((e) => !e.extra);
  const extras = itens.filter((e) => e.extra);
  // A lista inteira é o compromisso, extras inclusive.
  const faltam = itens.filter((e) => !abordagens[e.id]).length;
  const marcar = (id, v) => setAbordagens((a) => ({ ...a, [id]: v }));

  if (itens.length === 0) {
    return (
      <div className="card">
        <div className="foco-vazio">
          <h3>Sem lista para hoje</h3>
          <p>
            A lista é montada a partir das empresas em que você é proprietário no HubSpot.
            Se ela veio vazia, quase sempre é proprietário errado no CRM — corrigir lá corrige
            aqui no dia seguinte.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="planbar">
        <div className="planbar-info">
          <span className="plan-week">{ctx.diaLabel}</span>
          <span className="plan-badge">
            {doCompromisso.length} empresas{extras.length ? ` + ${extras.length} extras` : ""}
          </span>
          {faltam > 0 ? (
            <span className="plan-motivo">{faltam} sem abordagem definida</span>
          ) : (
            <span className="fech-ok">todas mapeadas</span>
          )}
        </div>
        <div className="planbar-actions">
          <a
            className={"btn-primary" + (faltam > 0 ? " desativado" : "")}
            href={faltam > 0 ? undefined : ctx.urlFechamento}
            title={faltam > 0 ? "Defina a abordagem de todas antes de fechar o dia" : undefined}
          >
            Ir para o fechamento
          </a>
        </div>
      </div>

      <Tabela itens={doCompromisso} ctx={ctx} estrategias={estrategias} onAbordagem={marcar} />

      {extras.length > 0 && (
        <>
          <div className="tab-secao">
            Extras — clientes recentes, fora da conta das {doCompromisso.length}
          </div>
          <Tabela itens={extras} ctx={ctx} estrategias={estrategias} onAbordagem={marcar} />
        </>
      )}
    </div>
  );
}
