"use client";

import { useEffect, useRef, useState } from "react";
import { CANAIS, canaisLiberados, canalSugerido, tentativasNo, LIMITE_POR_CANAL } from "../lib/canal";
import { telefoneLegivel, paraWhatsApp } from "../lib/telefone";
import { separaAssunto } from "../lib/gmail-texto";
import { numeroDa } from "../lib/estrategias";
import { TEMP_STYLE } from "../lib/config";

const ACAO = {
  whatsapp: { rotulo: "Abrir no WhatsApp", fazendo: "Registrando…", feito: "Tentativa registrada e gravada no HubSpot." },
  email: { rotulo: "Enviar e-mail", fazendo: "Enviando…", feito: "E-mail enviado pela sua caixa, com cópia para a timeline." },
  ligacao: { rotulo: "Registrar e abrir no HubSpot", fazendo: "Registrando…", feito: "Tentativa registrada. A chamada em si é o HubSpot que registra." },
};

const dataBR = (d) => (d ? `${String(d).slice(8, 10)}/${String(d).slice(5, 7)}/${String(d).slice(0, 4)}` : "");

// A mensagem do closer. Mesma janela da carteira e do financeiro: contexto à
// esquerda, mensagem à direita, e o texto chega escrito.
//
// O que ela soma e que as outras duas não têm: a distância entre a
// temperatura de hoje e a que o closer quer alcançar, e o que foi conversado
// na última reunião.
export default function MensagemCloser({ negocio, item, estrategia, label, onFechar }) {
  const [carregando, setCarregando] = useState(true);
  const [contatos, setContatos] = useState([]);
  const [remetente, setRemetente] = useState(null);
  const [tentativas, setTentativas] = useState({});
  const [erro, setErro] = useState("");

  const [contatoId, setContatoId] = useState("");
  const [canal, setCanal] = useState("");
  // Um texto por contato e canal: trocar e voltar não apaga o que estava
  // escrito nem cobra geração nova.
  const [textos, setTextos] = useState({});
  const [assuntos, setAssuntos] = useState({});
  const [cc, setCc] = useState("");
  const [busy, setBusy] = useState("");
  const [feito, setFeito] = useState("");
  const [enviados, setEnviados] = useState({});
  const jaPediu = useRef(new Set());

  const chave = `${contatoId}|${canal}`;
  const texto = textos[chave] || "";
  const setTexto = (v) => setTextos((t) => ({ ...t, [chave]: v }));
  const assunto = assuntos[chave] || "";
  const setAssunto = (v) => setAssuntos((a) => ({ ...a, [chave]: v }));
  const enviada = !!enviados[chave];

  useEffect(() => {
    const tecla = (e) => e.key === "Escape" && onFechar();
    document.addEventListener("keydown", tecla);
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", tecla);
      document.body.style.overflow = antes;
    };
  }, [onFechar]);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const res = await fetch(`/api/closer/mensagem?dealId=${negocio.id}`);
        const d = await res.json().catch(() => ({}));
        if (!vivo) return;
        if (!res.ok) throw new Error(d.error || "Falha ao ler os contatos.");
        setContatos(d.contatos || []);
        setRemetente(d.remetente || null);
        setTentativas(d.tentativas || {});
        setContatoId(String(d.contatos?.[0]?.id || ""));
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
  }, [negocio.id]);

  const contato = contatos.find((x) => String(x.id) === contatoId) || null;
  const liberados = canaisLiberados(tentativas);
  const tentativa = canal ? tentativasNo(tentativas, canal) + 1 : 0;
  const semTelefone = canal !== "email" && contato && !contato.telefone;
  const semEmail = canal === "email" && contato && !contato.email;
  const podeGerar = !!contato && !!canal && !semTelefone && !semEmail;

  // A mensagem chega escrita, como nas outras duas janelas.
  useEffect(() => {
    if (!podeGerar || textos[chave] || busy || jaPediu.current.has(chave)) return;
    jaPediu.current.add(chave);
    gerar();
  }, [chave, podeGerar]);

  async function chamar(metodo, corpo) {
    const res = await fetch("/api/closer/mensagem", {
      method: metodo,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dealId: negocio.id,
        canal,
        contatoId,
        // Vêm da tela: são a decisão de hoje e ainda não foram gravadas.
        estrategia: item?.estrategia || "",
        para: item?.para || "",
        observacao: negocio._obs ?? negocio.observacoes ?? "",
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
      if (canal === "email") {
        const { assunto: a, corpo } = separaAssunto(d.texto);
        setAssunto(a);
        setTexto(corpo);
      } else {
        setTexto(d.texto);
      }
    } catch (e) {
      setErro(e.message);
    } finally {
      setBusy("");
    }
  }

  function tentarDeNovo() {
    jaPediu.current.delete(chave);
    gerar();
  }

  async function enviar() {
    setBusy("enviar");
    setErro("");
    try {
      const d = await chamar("PUT", { texto, assunto, cc });
      setFeito(d.aviso || ACAO[canal]?.feito || `Tentativa ${d.tentativa} registrada.`);
      setEnviados((x) => ({ ...x, [chave]: true }));
      setTentativas((t) => ({ ...t, [canal]: (t[canal] || 0) + 1 }));
      if (d.url) window.open(d.url, "_blank", "noopener");
    } catch (e) {
      setErro(e.message);
    } finally {
      setBusy("");
    }
  }

  const faltaEnviar =
    !texto.trim() || !!busy || enviada || (canal === "email" && (!assunto.trim() || !contato?.email));
  const semCanal = liberados.length === 0;

  return (
    <div className="modal-fundo" onMouseDown={(e) => e.target === e.currentTarget && onFechar()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={`Mensagem para ${negocio.name}`}>
        <header className="modal-topo">
          <div>
            <h2>{negocio.name}</h2>
            <div className="modal-sub">
              <span>{negocio.stageLabel}</span>
              {negocio.eventoEm && <span>· evento {dataBR(negocio.eventoEm)}</span>}
              <a href={negocio.url} target="_blank" rel="noreferrer">ver no HubSpot</a>
            </div>
          </div>
          <button className="modal-x" onClick={onFechar} aria-label="Fechar">×</button>
        </header>

        <div className="modal-corpo">
          {/* O que a mensagem tem que respeitar fica à vista enquanto ela é
              lida, em vez de ter ficado para trás numa coluna da tabela. */}
          <aside className="modal-lado">
            <div className="modal-campo">
              <span className="ctx-lab">Evolução pretendida</span>
              <b className="msg-evolucao">
                <span className={"temp-alvo t-" + (TEMP_STYLE[negocio.temperatura] || "none")}>
                  {label?.(negocio.temperatura) || negocio.temperatura || "sem temperatura"}
                </span>
                <span className="msg-seta">→</span>
                <span className={"temp-alvo t-" + (TEMP_STYLE[item?.para] || "none")}>
                  {item?.para ? label?.(item.para) || item.para : "não definida"}
                </span>
              </b>
            </div>

            {estrategia && (
              <div className="modal-campo">
                <span className="ctx-lab">Estratégia</span>
                <b>{numeroDa(estrategia.id)}. {estrategia.titulo}</b>
                {estrategia.desc && <p className="est-desc">{estrategia.desc}</p>}
              </div>
            )}

            {negocio.nextStep && (
              <div className="modal-campo">
                <span className="ctx-lab">Próximo passo no CRM</span>
                <p className="est-desc">{negocio.nextStep}</p>
              </div>
            )}
            {negocio.nextActivity && (
              <div className="modal-campo">
                <span className="ctx-lab">Próxima atividade</span>
                <b>{dataBR(negocio.nextActivity)}</b>
              </div>
            )}

            {(negocio._obs || negocio.observacoes) && (
              <div className="modal-campo">
                <span className="ctx-lab">Sua anotação</span>
                <p className="est-desc">{negocio._obs ?? negocio.observacoes}</p>
              </div>
            )}

            {/* Diz de onde o texto tirou o contexto. Sem isto ninguém sabe se
                a mensagem leu a reunião ou inventou. */}
            <div className="modal-campo">
              <span className="ctx-lab">Última reunião</span>
              <p className="est-desc">
                {negocio.conversa === "resumo"
                  ? "Resumo do Copiloto do Closer, usado na mensagem."
                  : negocio.conversa === "transcricao"
                    ? "Sem resumo do Copiloto. A mensagem usa o fim da transcrição, que é onde fica o combinado."
                    : "Sem registro no CRM. A mensagem não vai citar o que foi conversado."}
              </p>
            </div>
          </aside>

          <section className="modal-principal">
            {carregando ? (
              <p className="msg-sem">Lendo os contatos do negócio…</p>
            ) : semCanal ? (
              <p className="msg-sem">
                Os três canais já tiveram {LIMITE_POR_CANAL} tentativas sem resposta neste negócio.
                Registre o resultado e leve o caso para o líder.
              </p>
            ) : (
              <>
                <div className="msg-linha">
                  <span className="ctx-lab">Canal</span>
                  <div className="seg-toggle">
                    {CANAIS.map((x) => {
                      const fechado = !liberados.includes(x.key);
                      return (
                        <button
                          key={x.key}
                          type="button"
                          className={canal === x.key ? "on" : ""}
                          disabled={fechado}
                          title={fechado ? `${LIMITE_POR_CANAL} tentativas sem resposta neste canal` : undefined}
                          onClick={() => { setCanal(x.key); setErro(""); setFeito(""); }}
                        >
                          {x.label}
                          <span className="msg-cont">
                            {tentativasNo(tentativas, x.key)}/{LIMITE_POR_CANAL}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <span className="msg-nota">
                    tentativa {tentativa} de {LIMITE_POR_CANAL} neste canal
                  </span>
                </div>

                <div className="msg-linha">
                  <span className="ctx-lab">Para</span>
                  {contatos.length === 0 ? (
                    <span className="err">Este negócio não tem contato vinculado no HubSpot.</span>
                  ) : contatos.length === 1 ? (
                    <span className="msg-contato">
                      {contato?.nome}
                      {contato?.cargo ? `, ${contato.cargo}` : ""}
                      {contato?.papel === "DECISION_MAKER" && <span className="emp-tag">decisor</span>}
                      <span className="est-sem">
                        {canal === "email"
                          ? contato?.email || "sem e-mail"
                          : telefoneLegivel(contato?.telefone) || "sem telefone"}
                      </span>
                    </span>
                  ) : (
                    <div className="select-wrap">
                      <select className="emp-abordagem" value={contatoId} onChange={(e) => setContatoId(e.target.value)}>
                        {contatos.map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.nome}
                            {x.papel === "DECISION_MAKER" ? " (decisor)" : ""}
                            {x.cargo ? ` · ${x.cargo}` : ""}
                            {paraWhatsApp(x.telefone) ? "" : " · sem telefone"}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                {semTelefone && <p className="msg-nota">{contato.nome} está sem telefone no HubSpot.</p>}
                {semEmail && <p className="msg-nota">{contato.nome} está sem e-mail no HubSpot.</p>}

                {canal === "email" && (
                  <div className="msg-env">
                    <div>
                      <span className="ctx-lab">De</span>
                      <span className="msg-fixo">{remetente?.email || "sua conta"}</span>
                    </div>
                    <div>
                      <span className="ctx-lab">Para</span>
                      <span className="msg-fixo">{contato?.email || <span className="err">sem e-mail</span>}</span>
                    </div>
                    <div>
                      <label className="ctx-lab" htmlFor="cl-cc">Cópia</label>
                      <input id="cl-cc" className="est-input" value={cc} placeholder="opcional, separe por vírgula" onChange={(e) => setCc(e.target.value)} />
                    </div>
                    <div>
                      <label className="ctx-lab" htmlFor="cl-assunto">Assunto</label>
                      <input
                        id="cl-assunto"
                        className="est-input"
                        value={assunto}
                        placeholder={busy === "gerar" ? "Escrevendo…" : "Assunto do e-mail"}
                        onChange={(e) => setAssunto(e.target.value)}
                      />
                    </div>
                  </div>
                )}

                <textarea
                  className="obs modal-texto"
                  value={texto}
                  placeholder={
                    busy === "gerar"
                      ? "Escrevendo a mensagem…"
                      : canal === "ligacao"
                        ? "Gere o roteiro e ajuste antes de ligar."
                        : "Leia e ajuste antes de mandar."
                  }
                  onChange={(e) => {
                    setTexto(e.target.value);
                    setEnviados((x) => ({ ...x, [chave]: false }));
                    setFeito("");
                  }}
                />
              </>
            )}
          </section>
        </div>

        <footer className="modal-rodape">
          {erro && <span className="err">{erro}</span>}
          {feito && !erro && <span className="saved">{feito}</span>}
          {/* Só aparece quando a geração falhou: fora disso a mensagem chega
              pronta e o closer ajusta o que quiser. */}
          {erro && !semCanal && (
            <button className="btn-ghost" onClick={tentarDeNovo} disabled={!!busy}>
              {busy === "gerar" ? "Escrevendo…" : "Tentar de novo"}
            </button>
          )}
          {!semCanal && ACAO[canal] && (
            <button className="btn-primary" onClick={enviar} disabled={faltaEnviar}>
              {busy === "enviar" ? ACAO[canal].fazendo : ACAO[canal].rotulo}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
