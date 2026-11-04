"use client";

import { useState } from "react";
import { CANAIS, canaisLiberados, canalSugerido, tentativasNo, LIMITE_POR_CANAL } from "../lib/canal";
import { telefoneLegivel, paraWhatsApp } from "../lib/telefone";
import { separaAssunto } from "../lib/gmail-texto";
import { rotuloCanal } from "../lib/canal";

// O que o botão faz em cada canal. O WhatsApp abre o wa.me com o texto, o
// e-mail sai pela caixa de quem está mandando, e a ligação leva ao registro da
// empresa no HubSpot, que é onde fica o discador.
const ACAO = {
  whatsapp: {
    rotulo: "Abrir no WhatsApp",
    fazendo: "Registrando…",
    feito: "Tentativa registrada e gravada no HubSpot.",
  },
  email: {
    rotulo: "Enviar e-mail",
    fazendo: "Enviando…",
    feito: "E-mail enviado pela sua caixa, com cópia para a timeline.",
  },
  ligacao: {
    rotulo: "Registrar e abrir no HubSpot",
    fazendo: "Registrando…",
    feito: "Tentativa registrada. A chamada em si é o HubSpot que registra.",
  },
};

// Geração da mensagem de abordagem. Dois passos de propósito: gerar não conta
// tentativa nem manda nada, só mostra o texto para a pessoa ler e corrigir.
// Quem conta e dispara é o segundo botão.
export default function Mensagem({ empresa, contatos = [], tentativas = {}, historico = [], remetente, ctx, onFechar }) {
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
  const assunto = canal === "email" ? separaAssunto(texto, "").assunto : "";

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
            {/* O dado que importa muda com o canal: no e-mail o telefone não
                diz nada sobre a mensagem chegar. */}
            <span className="est-sem">
              {canal === "email"
                ? contato?.email || "sem e-mail"
                : telefoneLegivel(contato?.telefone) || "sem telefone"}
            </span>
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

      {/* O que já foi mandado para esta empresa. Estava gravado e não
          aparecia em lugar nenhum: quem abre o painel na segunda tentativa
          precisa ler o que foi dito na primeira. */}
      {historico.length > 0 && (
        <details className="msg-hist">
          <summary>{historico.length} mensagem{historico.length === 1 ? "" : "s"} já enviada{historico.length === 1 ? "" : "s"}</summary>
          {historico.map((h, i) => (
            <div className="msg-hist-item" key={i}>
              <span className="est-sem">
                {h.dia?.slice(8, 10)}/{h.dia?.slice(5, 7)} · {rotuloCanal(h.canal)} · {h.tentativaNoCanal}ª
              </span>
              <p>{h.texto || "(sem texto gravado)"}</p>
            </div>
          ))}
        </details>
      )}

      {canal === "email" && (
        // O e-mail não é um texto solto: quem envia precisa ver de quem sai,
        // para quem vai e com que assunto, antes de clicar.
        <div className="msg-env">
          <div><span className="ctx-lab">De</span>{remetente || "sua conta"}</div>
          <div><span className="ctx-lab">Para</span>{contato?.email || <span className="err">sem e-mail</span>}</div>
          <div><span className="ctx-lab">Assunto</span>{assunto || <span className="est-sem">sai da primeira linha do texto</span>}</div>
        </div>
      )}

      <textarea
        className="obs msg-texto"
        value={texto}
        placeholder={
          canal === "email"
            ? "Clique em Gerar. A primeira linha vira o assunto (Assunto: ...) e o resto, o corpo."
            : "Clique em Gerar para o texto aparecer aqui. Você pode editar antes de enviar."
        }
        onChange={(e) => { setTexto(e.target.value); setEnviada(false); }}
      />

      <div className="fech-rodape">
        {erro && <span className="err">{erro}</span>}
        {aviso && !erro && <span className="err">{aviso}</span>}
        {enviada && !erro && !aviso && <span className="saved">{ACAO[canal]?.feito}</span>}
        <button className="btn-ghost" onClick={gerar} disabled={!!busy || !canal}>
          {busy === "gerar" ? "Gerando…" : texto ? "Gerar outro" : "Gerar"}
        </button>
        <button className="btn-primary" onClick={enviar} disabled={!!busy || !texto.trim() || enviada}>
          {busy === "enviar" ? ACAO[canal]?.fazendo : ACAO[canal]?.rotulo}
        </button>
      </div>
    </div>
  );
}
