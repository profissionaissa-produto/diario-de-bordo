"use client";

import { useState } from "react";
import { ABORDAGENS, BALDES } from "../lib/carteira";
import { canaisLiberados } from "../lib/canal";
import { briefingDoContato } from "../lib/briefing-contato";
import Mensagem from "./Mensagem";

const dataBR = (d) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "—");

function Linha({ e, ctx, estrategias, contatos, tentativas, historico, onAbordagem }) {
  const [abordagem, setAbordagem] = useState(e.abordagem || "");
  // Só leitura desde que a coluna da lista curada saiu: a decisão do dia virou
  // a própria coluna Estratégia. O que já foi gravado antes continua indo para
  // o prompt e para o briefing.
  const estrategia = e.estrategia || "";
  const [contexto, setContexto] = useState(e.contexto || "");
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");
  const [aberta, setAberta] = useState(false);

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

  const semCanal = canaisLiberados(tentativas).length === 0;
  // A mensagem vem depois da decisão, não antes: sem a estratégia do dia o
  // texto não tem a que servir.
  const falta = [!abordagem && "a estratégia"].filter(Boolean);
  const briefing = briefingDoContato({
    contatos: historico,
    abordagem,
    estrategia: estrategias.find((s) => s.id === estrategia) || null,
  });

  return (
    <>
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
        <button
          type="button"
          className="btn-msg"
          onClick={() => setAberta((v) => !v)}
          disabled={semCanal || falta.length > 0}
          title={
            semCanal
              ? "Os três canais já esgotaram nesta empresa"
              : falta.length > 0
                ? `Defina ${falta.join(" e ")} para liberar a mensagem`
                : undefined
          }
        >
          {semCanal
            ? "Canais esgotados"
            : falta.length > 0
              ? `Defina ${falta.join(" e ")}`
              : "Gerar mensagem"}
        </button>
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


      <td>
        <div className="select-wrap">
          <select
            className="emp-abordagem"
            value={abordagem}
            disabled={busy}
            onChange={(ev) => escolher(ev.target.value)}
          >
            <option value="">Escolher estratégia…</option>
            {ABORDAGENS.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>
        {erro && <span className="err">{erro}</span>}
      </td>

      <td>
        {/* Antes do primeiro contato a coluna é entrada: o que o farmer
            escreve aqui entra no prompt. Depois dele vira registro do que foi
            feito, que é o que o líder precisa ler. */}
        {briefing ? (
          <div className="emp-briefing">
            {briefing}
            {contexto && <span className="emp-briefing-nota">{contexto}</span>}
          </div>
        ) : (
          // Salva ao sair do campo: digitar não pode disparar uma chamada por tecla.
          <textarea
            className="obs emp-contexto"
            placeholder="Contexto (opcional)"
            value={contexto}
            onChange={(ev) => setContexto(ev.target.value)}
            onBlur={() => contexto !== (e.contexto || "") && salvar({ contexto })}
          />
        )}
      </td>
    </tr>


    {aberta && (
      <Mensagem
        // O que vale é o que está escolhido na tela agora. Passar e.abordagem
        // mostrava o valor do servidor, que ainda é o anterior até a página
        // recarregar, e a janela abria com a abordagem em branco.
        empresa={{ ...e, abordagem, contexto, estrategia }}
        contatos={contatos}
        tentativas={tentativas}
        historico={historico}
        estrategia={estrategias.find((x) => x.id === estrategia) || null}
        ctx={ctx}
        onFechar={() => setAberta(false)}
      />
    )}
    </>
  );
}

function Tabela({ itens, ctx, estrategias, contatos, tentativas, historicoContato, onAbordagem }) {
  return (
    <div className="tscroll">
      <table>
        <thead>
          <tr>
            <th style={{ width: "30%" }}>Empresa</th>
            <th style={{ width: "12%" }}>Etapa</th>
            <th style={{ width: "13%" }}>Última compra</th>
            <th style={{ width: "25%" }}>Estratégia</th>
            <th style={{ width: "20%" }}>Contexto</th>
          </tr>
        </thead>
        <tbody>
          {itens.map((e) => (
            <Linha
              key={e.id}
              e={e}
              ctx={ctx}
              estrategias={estrategias}
              contatos={contatos[e.id] || []}
              tentativas={tentativas[e.id] || {}}
              historico={historicoContato[e.id] || []}
              onAbordagem={onAbordagem}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ListaDoDia({ itens, ctx, estrategias = [], contatos = {}, tentativas = {}, historicoContato = {} }) {
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
            <span className="plan-motivo">{faltam} sem estratégia definida</span>
          ) : (
            <span className="fech-ok">todas mapeadas</span>
          )}
        </div>
        <div className="planbar-actions">
          <a
            className={"btn-primary" + (faltam > 0 ? " desativado" : "")}
            href={faltam > 0 ? undefined : ctx.urlFechamento}
            title={faltam > 0 ? "Defina a estratégia de todas antes de fechar o dia" : undefined}
          >
            Ir para o fechamento
          </a>
        </div>
      </div>

      <Tabela itens={doCompromisso} ctx={ctx} estrategias={estrategias} contatos={contatos} tentativas={tentativas} historicoContato={historicoContato} onAbordagem={marcar} />

      {extras.length > 0 && (
        <>
          <div className="tab-secao">
            Extras — clientes recentes, fora da conta das {doCompromisso.length}
          </div>
          <Tabela itens={extras} ctx={ctx} estrategias={estrategias} contatos={contatos} tentativas={tentativas} historicoContato={historicoContato} onAbordagem={marcar} />
        </>
      )}
    </div>
  );
}
