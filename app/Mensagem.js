"use client";

import { useState } from "react";
import { CANAIS, canaisLiberados, canalSugerido, tentativasNo, LIMITE_POR_CANAL, rotuloCanal } from "../lib/canal";
import { telefoneLegivel, paraWhatsApp } from "../lib/telefone";

// Geração da mensagem de abordagem. Dois passos de propósito: gerar não conta
// tentativa nem manda nada, só mostra o texto para a pessoa ler e corrigir.
// Quem conta e grava no CRM é o botão de abrir no WhatsApp.
export default function Mensagem({ empresa, contatos = [], tentativas = {}, ctx, onFechar }) {
  const liberados = canaisLiberados(tentativas);
  const [canal, setCanal] = useState(canalSugerido(tentativas) || "");
  const [contatoId, setContatoId] = useState(contatos[0]?.id || "");
  const [texto, setTexto] = useState("");
  const [busy, setBusy] = useState("");
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [enviada, setEnviada] = useState(false);

  const contato = contatos.find((c) => c.id === contatoId) || null;
  const proxima = tentativasNo(tentativas, canal) + 1;

  async function chama(method, corpo) {
    const res = await fetch("/api/mensagem", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ownerId: ctx.ownerId,
        dia: ctx.dia,
        companyId: empresa.id,
        canal,
        contato,
        ...corpo,
      }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.error || "Falha na operação.");
    return d;
  }

  async function gerar() {
    setBusy("gerar");
    setErro("");
    setAviso("");
    try {
      const d = await chama("POST");
      setTexto(d.texto);
    } catch (e) {
      setErro(e.message);
    } finally {
      setBusy("");
    }
  }

  async function enviar() {
    setBusy("enviar");
    setErro("");
    setAviso("");
    try {
      const d = await chama("PUT", { texto });
      setEnviada(true);
      if (d.aviso) setAviso(d.aviso);
      // Abre depois de contar: se a contagem falhar, nada é enviado.
      if (d.url) window.open(d.url, "_blank", "noopener");
    } catch (e) {
      setErro(e.message);
    } finally {
      setBusy("");
    }
  }

  if (liberados.length === 0) {
    return (
      <div className="msg-painel">
        <div className="msg-topo">
          <b>{empresa.nome}</b>
          <button className="btn-ghost" onClick={onFechar}>Fechar</button>
        </div>
        <p className="msg-sem">
          Os três canais já tiveram {LIMITE_POR_CANAL} tentativas sem resposta nesta empresa.
          Registre o resultado no fechamento e leve o caso para o líder.
        </p>
      </div>
    );
  }

  return (
    <div className="msg-painel">
      <div className="msg-topo">
        <b>{empresa.nome}</b>
        <button className="btn-ghost" onClick={onFechar}>Fechar</button>
      </div>

      <div className="msg-linha">
        <span className="ctx-lab">Canal</span>
        <div className="seg-toggle">
          {CANAIS.map((c) => {
            const fechado = !liberados.includes(c.key);
            return (
              <button
                key={c.key}
                type="button"
                className={canal === c.key ? "on" : ""}
                disabled={fechado}
                title={fechado ? `${LIMITE_POR_CANAL} tentativas sem resposta neste canal` : undefined}
                onClick={() => { setCanal(c.key); setTexto(""); setEnviada(false); }}
              >
                {c.label}
                <span className="msg-cont">{tentativasNo(tentativas, c.key)}/{LIMITE_POR_CANAL}</span>
              </button>
            );
          })}
        </div>
        <span className="msg-nota">tentativa {proxima} de {LIMITE_POR_CANAL} neste canal</span>
      </div>

      <div className="msg-linha">
        <span className="ctx-lab">Para</span>
        {contatos.length === 0 ? (
          <span className="err">Esta empresa não tem contato vinculado no HubSpot.</span>
        ) : contatos.length === 1 ? (
          <span className="msg-contato">
            {contato?.nome}
            {contato?.cargo ? `, ${contato.cargo}` : ""}
            {contato?.papel === "DECISION_MAKER" && <span className="emp-tag">decisor</span>}
            <span className="est-sem">{telefoneLegivel(contato?.telefone) || "sem telefone"}</span>
          </span>
        ) : (
          // Mais de um vinculado: a escolha é de quem conhece a empresa.
          <div className="select-wrap">
            <select
              className="emp-abordagem"
              value={contatoId}
              onChange={(e) => setContatoId(e.target.value)}
            >
              {contatos.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                  {c.papel === "DECISION_MAKER" ? " (decisor)" : ""}
                  {c.cargo ? ` · ${c.cargo}` : ""}
                  {paraWhatsApp(c.telefone) ? "" : " · sem telefone"}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <textarea
        className="obs msg-texto"
        value={texto}
        placeholder="Clique em Gerar para o texto aparecer aqui. Você pode editar antes de enviar."
        onChange={(e) => { setTexto(e.target.value); setEnviada(false); }}
      />

      <div className="fech-rodape">
        {erro && <span className="err">{erro}</span>}
        {aviso && !erro && <span className="err">{aviso}</span>}
        {enviada && !erro && !aviso && (
          <span className="saved">Tentativa {proxima - 1} registrada e gravada no HubSpot.</span>
        )}
        <button className="btn-ghost" onClick={gerar} disabled={!!busy || !canal}>
          {busy === "gerar" ? "Gerando…" : texto ? "Gerar outro" : "Gerar"}
        </button>
        <button className="btn-primary" onClick={enviar} disabled={!!busy || !texto.trim() || enviada}>
          {busy === "enviar"
            ? "Registrando…"
            : canal === "whatsapp"
              ? "Abrir no WhatsApp"
              : `Registrar ${rotuloCanal(canal).toLowerCase()}`}
        </button>
      </div>
    </div>
  );
}
