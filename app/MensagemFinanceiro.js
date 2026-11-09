"use client";

import { useEffect, useState } from "react";
import { CANAIS, canaisLiberados, canalSugerido, tentativasNo, LIMITE_POR_CANAL, rotuloCanal } from "../lib/canal";
import { telefoneLegivel, paraWhatsApp } from "../lib/telefone";
import { separaAssunto } from "../lib/gmail-texto";
import { destinoDa, DESTINOS } from "../lib/financeiro";

// O que o botão faz em cada canal. O WhatsApp abre o wa.me com o texto, o
// e-mail sai pela caixa de quem está mandando, e a ligação leva ao ticket no
// HubSpot, que é onde fica o discador. Não existe outro discador e não vai
// existir, então o produto aqui é o roteiro.
const ACAO = {
  whatsapp: { rotulo: "Abrir no WhatsApp", fazendo: "Registrando…" },
  email: { rotulo: "Enviar e-mail", fazendo: "Enviando…" },
  ligacao: { rotulo: "Registrar e abrir no HubSpot", fazendo: "Registrando…" },
};

// A mensagem de cobrança, dentro da janela de marcação do financeiro.
//
// Ela só aparece depois que a ação do dia está escolhida, porque é a ação que
// decide para quem o texto vai: cobrança é com quem paga, NF é com quem emite,
// e renegociar prazo pode ser com qualquer um dos dois, e aí pergunta.
export default function MensagemFinanceiro({ c, abordagem, estrategia, observacao }) {
  const destinoDaAcao = destinoDa(abordagem);
  const precisaEscolher = destinoDaAcao === "ambos";

  const [carregando, setCarregando] = useState(true);
  const [contatos, setContatos] = useState([]);
  const [tentativas, setTentativas] = useState({});
  const [erro, setErro] = useState("");

  const [destino, setDestino] = useState(precisaEscolher ? "" : destinoDaAcao);
  const [contatoId, setContatoId] = useState("");
  const [canal, setCanal] = useState("");
  const [texto, setTexto] = useState("");
  const [assunto, setAssunto] = useState("");
  const [cc, setCc] = useState("");
  const [busy, setBusy] = useState("");
  const [feito, setFeito] = useState("");

  // Carrega quando a janela abre, e não junto com o board: são centenas de
  // leituras no HubSpot para desenhar uma tela usada um ticket por vez.
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const res = await fetch(`/api/financeiro/mensagem?ticketId=${c.ticketId}`);
        const d = await res.json().catch(() => ({}));
        if (!vivo) return;
        if (!res.ok) throw new Error(d.error || "Falha ao ler os contatos.");
        setContatos(d.contatos || []);
        setTentativas(d.tentativas || {});
        setCanal(canalSugerido(d.tentativas || {}) || "");
      } catch (e) {
        if (vivo) setErro(e.message);
      } finally {
        if (vivo) setCarregando(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [c.ticketId]);

  // Trocou a ação, trocou o lado. O destino volta a seguir o mapa, e o texto
  // já gerado é descartado: ele foi escrito para outra pessoa.
  useEffect(() => {
    setDestino(destinoDa(abordagem) === "ambos" ? "" : destinoDa(abordagem));
    setTexto("");
    setFeito("");
  }, [abordagem]);

  // Escolhido o lado, o contato padrão é o primeiro daquele lado que dá para
  // contatar. A lista já vem classificada e ordenada do servidor.
  const doLado = contatos.filter((x) => x.tipo === destino);
  useEffect(() => {
    const primeiro = doLado.find((x) => x.email || x.telefone) || doLado[0];
    setContatoId(primeiro ? String(primeiro.id) : "");
    setTexto("");
  }, [destino, contatos.length]);

  const contato = contatos.find((x) => String(x.id) === contatoId) || null;
  const liberados = canaisLiberados(tentativas);
  const tentativa = canal ? tentativasNo(tentativas, canal) + 1 : 0;

  async function chamar(metodo, corpo) {
    const res = await fetch("/api/financeiro/mensagem", {
      method: metodo,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ticketId: c.ticketId,
        canal,
        destino,
        contatoId,
        abordagem,
        estrategia,
        observacao,
        ...corpo,
      }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.error || "Falha.");
    return d;
  }

  async function gerar() {
    setBusy("gerar");
    setErro("");
    setFeito("");
    try {
      const d = await chamar("POST", {});
      setTexto(d.texto);
      if (canal === "email") setAssunto(separaAssunto(d.texto).assunto);
    } catch (e) {
      setErro(e.message);
    } finally {
      setBusy("");
    }
  }

  async function enviar() {
    setBusy("enviar");
    setErro("");
    try {
      const corpo = canal === "email" ? separaAssunto(texto).corpo : texto;
      const d = await chamar("PUT", { texto: canal === "email" ? corpo : texto, assunto, cc });
      setFeito(d.aviso || `Tentativa ${d.tentativa} registrada.`);
      setTentativas((t) => ({ ...t, [canal]: (t[canal] || 0) + 1 }));
      if (d.url) window.open(d.url, "_blank", "noopener");
    } catch (e) {
      setErro(e.message);
    } finally {
      setBusy("");
    }
  }

  // Ação interna não tem mensagem: emitir nota, conferir NF e aguardar retorno
  // são trabalho nosso, e oferecer "gerar" neles sugeriria mandar texto para
  // quem não tem o que receber.
  if (!abordagem || destinoDaAcao === "nenhum") return null;

  const semTelefone = canal !== "email" && contato && !contato.telefone;
  const semEmail = canal === "email" && contato && !contato.email;
  const naoPodeGerar = !destino || !contato || !canal || !!busy || semTelefone || semEmail;

  return (
    <div className="msg-bloco">
      <div className="est-campo">
        <span className="ctx-lab">Mensagem</span>
        {carregando && <p className="reg-dica">Lendo os contatos do ticket…</p>}
      </div>

      {/* Só aparece quando a ação cabe dos dois lados. Nas outras o destino já
          está decidido e perguntar seria pergunta com uma resposta só. */}
      {precisaEscolher && (
        <div className="est-campo">
          <span className="ctx-lab">Com quem é essa conversa</span>
          <div className="fech-opcoes">
            {Object.entries(DESTINOS).map(([k, label]) => (
              <button
                key={k}
                className={"fech-op" + (destino === k ? " on" : "")}
                onClick={() => setDestino(k)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {destino && !carregando && (
        <label className="est-campo">
          <span className="ctx-lab">
            Para quem · {DESTINOS[destino]}
            {doLado.length > 1 && <em className="est-falta">{doLado.length} contatos</em>}
          </span>
          <div className="select-wrap">
            <select
              className="emp-abordagem"
              value={contatoId}
              disabled={doLado.length === 0}
              onChange={(e) => {
                setContatoId(e.target.value);
                setTexto("");
              }}
            >
              {doLado.length === 0 && <option value="">Nenhum contato deste lado no ticket</option>}
              {doLado.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.nome}
                  {x.cargo ? `, ${x.cargo}` : ""}
                  {x.email ? ` · ${x.email}` : " · sem e-mail"}
                </option>
              ))}
            </select>
          </div>
          {doLado.length === 0 && (
            <p className="reg-dica">
              Este ticket não tem contato do lado {DESTINOS[destino].toLowerCase()} no HubSpot. É preciso
              associar um antes de mandar mensagem.
            </p>
          )}
          {contato?.telefone && (
            <p className="reg-dica">
              {telefoneLegivel(contato.telefone)}
              {!paraWhatsApp(contato.telefone) ? ", sem DDD completo para abrir no WhatsApp" : ""}
            </p>
          )}
        </label>
      )}

      {destino && doLado.length > 0 && (
        <div className="est-campo">
          <span className="ctx-lab">
            Canal
            {canal && <em className="est-falta">tentativa {tentativa} de {LIMITE_POR_CANAL}</em>}
          </span>
          <div className="fech-opcoes">
            {CANAIS.map((x) => {
              const esgotado = !liberados.includes(x.key);
              return (
                <button
                  key={x.key}
                  className={"fech-op" + (canal === x.key ? " on" : "")}
                  disabled={esgotado}
                  title={esgotado ? `${LIMITE_POR_CANAL} tentativas sem resposta neste canal` : ""}
                  onClick={() => {
                    setCanal(x.key);
                    setTexto("");
                  }}
                >
                  {rotuloCanal(x.key)}
                </button>
              );
            })}
          </div>
          {liberados.length === 0 && (
            <p className="reg-dica">
              Os três canais já tiveram {LIMITE_POR_CANAL} tentativas sem resposta neste ticket.
            </p>
          )}
        </div>
      )}

      {semTelefone && <p className="reg-dica">{contato.nome} não tem telefone no HubSpot.</p>}
      {semEmail && <p className="reg-dica">{contato.nome} não tem e-mail no HubSpot.</p>}

      {texto && canal === "email" && (
        <>
          <label className="est-campo">
            <span className="ctx-lab">Assunto</span>
            <input className="reprova-input" value={assunto} onChange={(e) => setAssunto(e.target.value)} />
          </label>
          <label className="est-campo">
            <span className="ctx-lab">Em cópia</span>
            <input
              className="reprova-input"
              placeholder="separe por vírgula"
              value={cc}
              onChange={(e) => setCc(e.target.value)}
            />
          </label>
        </>
      )}

      {texto && (
        <label className="est-campo">
          <span className="ctx-lab">
            {canal === "ligacao" ? "Roteiro da ligação" : "Texto, revise antes de mandar"}
          </span>
          <textarea className="obs reg-texto" value={texto} onChange={(e) => setTexto(e.target.value)} />
        </label>
      )}

      <div className="msg-rodape">
        {erro && <span className="err">{erro}</span>}
        {feito && !erro && <span className="saved">{feito}</span>}
        <button className="btn-ghost" onClick={gerar} disabled={naoPodeGerar}>
          {busy === "gerar" ? "Gerando…" : texto ? "Gerar outra" : "Gerar mensagem"}
        </button>
        {texto && (
          <button className="btn-primary" onClick={enviar} disabled={!!busy}>
            {busy === "enviar" ? ACAO[canal].fazendo : ACAO[canal].rotulo}
          </button>
        )}
      </div>
    </div>
  );
}
