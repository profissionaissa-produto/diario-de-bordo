"use client";

import { useEffect, useRef, useState } from "react";
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
// A geração é automática: o botão que abre esta janela já se chama "Gerar
// mensagem", então pedir um segundo clique era pedir a mesma coisa duas vezes.
// O farmer lê, ajusta e envia.
export default function Mensagem({ empresa, contatos = [], tentativas = {}, historico = [], estrategia, ctx, onFechar }) {
  const router = useRouter();
  const liberados = canaisLiberados(tentativas);
  const [canal, setCanal] = useState(canalSugerido(tentativas) || "");
  const [contatoId, setContatoId] = useState(contatos[0]?.id || "");
  // Um texto por canal: trocar de canal e voltar não pode apagar o que já
  // estava escrito nem cobrar uma geração nova.
  const [textos, setTextos] = useState({});
  const [assunto, setAssunto] = useState("");
  const [cc, setCc] = useState("");
  const [busy, setBusy] = useState("");
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [enviados, setEnviados] = useState({});

  // Canais já pedidos nesta abertura. É ref e não estado porque mudar isto
  // não repinta nada, e sem ele um erro viraria laço de chamadas ao modelo.
  const jaPediu = useRef(new Set());

  const texto = textos[canal] || "";
  const setTexto = (v) => setTextos((t) => ({ ...t, [canal]: v }));
  const enviada = !!enviados[canal];
  const contato = contatos.find((c) => c.id === contatoId) || null;
  const proxima = tentativasNo(tentativas, canal) + 1;
  const desde = tempoDesde(empresa.ultimaCompra);
  const semCanal = liberados.length === 0;

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

  useEffect(() => {
    if (!canal || textos[canal] || busy || jaPediu.current.has(canal)) return;
    jaPediu.current.add(canal);
    gerar();
    // Só o canal na lista: incluir o texto faria a geração recomeçar sozinha
    // a cada tecla digitada na caixa.
  }, [canal]);

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
      if (canal === "email") {
        // O assunto vira campo próprio: repetido dentro do corpo, ele sai no
        // e-mail como primeira linha do texto, o que ninguém escreve à mão.
        const { assunto: a, corpo } = separaAssunto(d.texto, "");
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
    jaPediu.current.delete(canal);
    setErro("");
    gerar();
  }

  async function enviar() {
    setBusy("enviar");
    setErro("");
    setAviso("");
    try {
      const d = await chama("PUT", { texto, assunto, cc });
      setEnviados((e) => ({ ...e, [canal]: true }));
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

  const faltaEnviar =
    !texto.trim() || (canal === "email" && (!assunto.trim() || !contato?.email));

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
                          onClick={() => { setCanal(c.key); setErro(""); setAviso(""); }}
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
                  // Assunto e cópia são campos, não texto corrido: o assunto
                  // dentro do corpo saía como primeira linha do e-mail.
                  <div className="msg-env">
                    <div>
                      <span className="ctx-lab">De</span>
                      <span className="msg-fixo">{ctx.remetente || "sua conta"}</span>
                    </div>
                    <div>
                      <span className="ctx-lab">Para</span>
                      <span className="msg-fixo">
                        {contato?.email || <span className="err">sem e-mail</span>}
                      </span>
                    </div>
                    <div>
                      <label className="ctx-lab" htmlFor="msg-cc">Cópia</label>
                      <input
                        id="msg-cc"
                        className="est-input"
                        value={cc}
                        placeholder="opcional, separe por vírgula"
                        onChange={(e) => setCc(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="ctx-lab" htmlFor="msg-assunto">Assunto</label>
                      <input
                        id="msg-assunto"
                        className="est-input"
                        value={assunto}
                        placeholder={busy === "gerar" ? "Escrevendo…" : "Assunto do e-mail"}
                        onChange={(e) => { setAssunto(e.target.value); setEnviados((x) => ({ ...x, email: false })); }}
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
                      : "Leia e ajuste antes de enviar."
                  }
                  onChange={(e) => { setTexto(e.target.value); setEnviados((x) => ({ ...x, [canal]: false })); }}
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
              {/* Só aparece quando a geração falhou. Fora disso não há botão de
                  gerar: a mensagem chega pronta e o farmer ajusta o que quiser. */}
              {erro && (
                <button className="btn-ghost" onClick={tentarDeNovo} disabled={!!busy}>
                  {busy === "gerar" ? "Escrevendo…" : "Tentar de novo"}
                </button>
              )}
              <button className="btn-primary" onClick={enviar} disabled={!!busy || faltaEnviar || enviada}>
                {busy === "enviar" ? ACAO[canal]?.fazendo : ACAO[canal]?.rotulo}
              </button>
            </>
          )}
        </footer>
      </div>
    </div>
  );
}
