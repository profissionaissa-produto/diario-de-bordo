"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CANAIS, canaisLiberados, canalSugerido, tentativasNo, LIMITE_POR_CANAL, rotuloCanal } from "../lib/canal";
import { telefoneLegivel, paraWhatsApp } from "../lib/telefone";
import { separaAssunto } from "../lib/gmail-texto";
import { tempoDesde } from "../lib/tempo";
import { BALDES } from "../lib/carteira";
import { numeroDa } from "../lib/estrategias";

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

const dataBR = (d) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "");

// Janela da mensagem de abordagem. É modal e não painel dentro da linha porque
// a tabela do dia rola na horizontal: o que coubesse ali nasceria espremido.
//
// Dois passos de propósito: gerar não conta tentativa nem manda nada, só
// mostra o texto para a pessoa ler e corrigir. Quem conta e dispara é o
// segundo botão.
export default function Mensagem({ empresa, contatos = [], tentativas = {}, historico = [], estrategia, ctx, onFechar }) {
  const router = useRouter();
  const liberados = canaisLiberados(tentativas);
  const [canal, setCanal] = useState(canalSugerido(tentativas) || "");
  const [contatoId, setContatoId] = useState(contatos[0]?.id || "");
  const [texto, setTexto] = useState("");
  const [busy, setBusy] = useState("");
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [enviada, setEnviada] = useState(false);

  // Esc fecha, e o fundo para de rolar enquanto a janela está aberta.
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

  const contato = contatos.find((c) => c.id === contatoId) || null;
  const proxima = tentativasNo(tentativas, canal) + 1;
  const assunto = canal === "email" ? separaAssunto(texto, "").assunto : "";
  const desde = tempoDesde(empresa.ultimaCompra);
  const semCanal = liberados.length === 0;

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
      setTexto((await chama("POST")).texto);
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
      router.refresh();
    } catch (e) {
      setErro(e.message);
    } finally {
      setBusy("");
    }
  }

  async function zerar() {
    setBusy("zerar");
    setErro("");
    try {
      const res = await fetch("/api/mensagem", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: empresa.id, ownerId: ctx.ownerId }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Falha ao zerar.");
      router.refresh();
      onFechar();
    } catch (e) {
      setErro(e.message);
      setBusy("");
    }
  }

  return (
    <div className="modal-fundo" onMouseDown={(e) => e.target === e.currentTarget && onFechar()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={`Mensagem para ${empresa.nome}`}>
        <header className="modal-topo">
          <div>
            <h2>{empresa.nome}</h2>
            <div className="modal-sub">
              <span className={"emp-balde b-" + empresa.balde}>
                {BALDES[empresa.balde]?.label || empresa.balde}
              </span>
              <span>
                {empresa.ultimaCompra
                  ? `Última compra em ${dataBR(empresa.ultimaCompra)}, ${desde}`
                  : "Nunca comprou"}
              </span>
              <a href={empresa.url} target="_blank" rel="noreferrer">ver no HubSpot</a>
            </div>
          </div>
          <button className="modal-x" onClick={onFechar} aria-label="Fechar">×</button>
        </header>

        <div className="modal-corpo">
          {/* O que a mensagem tem que respeitar fica à vista enquanto ela é
              escrita, em vez de ter ficado para trás numa coluna da tabela. */}
          <aside className="modal-lado">
            <div className="modal-campo">
              <span className="ctx-lab">Abordagem de hoje</span>
              <b>{empresa.abordagem}</b>
            </div>
            {estrategia && (
              <div className="modal-campo">
                <span className="ctx-lab">Estratégia</span>
                <b>{numeroDa(estrategia.id)}. {estrategia.titulo}</b>
                {estrategia.desc && <p className="est-desc">{estrategia.desc}</p>}
              </div>
            )}
            {empresa.contexto && (
              <div className="modal-campo">
                <span className="ctx-lab">Sua anotação</span>
                <p className="est-desc">{empresa.contexto}</p>
              </div>
            )}
            {empresa.orientacao && (
              <div className="modal-campo">
                <span className="ctx-lab">Orientação do líder</span>
                <p className="est-desc">{empresa.orientacao.texto}</p>
              </div>
            )}

            {historico.length > 0 && (
              <div className="modal-campo">
                <span className="ctx-lab">Já enviado</span>
                {historico.map((h, i) => (
                  <div className="msg-hist-item" key={i}>
                    <span className="est-sem">
                      {h.dia?.slice(8, 10)}/{h.dia?.slice(5, 7)} · {rotuloCanal(h.canal)} · {h.tentativaNoCanal}ª
                    </span>
                    <p>{h.texto || "(sem texto gravado)"}</p>
                  </div>
                ))}
                {ctx.podeZerar && (
                  <button className="btn-zerar" onClick={zerar} disabled={!!busy}>
                    {busy === "zerar" ? "Zerando…" : "Zerar tentativas desta empresa"}
                  </button>
                )}
              </div>
            )}
          </aside>

          <section className="modal-principal">
            {semCanal ? (
              <p className="msg-sem">
                Os três canais já tiveram {LIMITE_POR_CANAL} tentativas sem resposta nesta empresa.
                Registre o resultado no fechamento e leve o caso para o líder.
              </p>
            ) : (
              <>
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
                      <span className="est-sem">
                        {canal === "email"
                          ? contato?.email || "sem e-mail"
                          : telefoneLegivel(contato?.telefone) || "sem telefone"}
                      </span>
                    </span>
                  ) : (
                    // Mais de um vinculado: a escolha é de quem conhece a empresa.
                    <div className="select-wrap">
                      <select className="emp-abordagem" value={contatoId} onChange={(e) => setContatoId(e.target.value)}>
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

                {canal === "email" && (
                  // O e-mail não é um texto solto: quem envia precisa ver de
                  // quem sai, para quem vai e com que assunto, antes de clicar.
                  <div className="msg-env">
                    <div><span className="ctx-lab">De</span>{ctx.remetente || "sua conta"}</div>
                    <div><span className="ctx-lab">Para</span>{contato?.email || <span className="err">sem e-mail</span>}</div>
                    <div><span className="ctx-lab">Assunto</span>{assunto || <span className="est-sem">sai da primeira linha do texto</span>}</div>
                  </div>
                )}

                <textarea
                  className="obs modal-texto"
                  value={texto}
                  placeholder={
                    canal === "email"
                      ? "Clique em Gerar. A primeira linha vira o assunto (Assunto: ...) e o resto, o corpo."
                      : "Clique em Gerar para o texto aparecer aqui. Você pode editar antes de enviar."
                  }
                  onChange={(e) => { setTexto(e.target.value); setEnviada(false); }}
                />
              </>
            )}
          </section>
        </div>

        <footer className="modal-rodape">
          {erro && <span className="err">{erro}</span>}
          {aviso && !erro && <span className="err">{aviso}</span>}
          {enviada && !erro && !aviso && <span className="saved">{ACAO[canal]?.feito}</span>}
          {!semCanal && (
            <>
              <button className="btn-ghost" onClick={gerar} disabled={!!busy || !canal}>
                {busy === "gerar" ? "Gerando…" : texto ? "Gerar outro" : "Gerar"}
              </button>
              <button className="btn-primary" onClick={enviar} disabled={!!busy || !texto.trim() || enviada}>
                {busy === "enviar" ? ACAO[canal]?.fazendo : ACAO[canal]?.rotulo}
              </button>
            </>
          )}
        </footer>
      </div>
    </div>
  );
}
