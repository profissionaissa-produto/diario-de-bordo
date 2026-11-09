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
  whatsapp: { rotulo: "Abrir no WhatsApp", fazendo: "Registrando…", feito: "Tentativa registrada e gravada no HubSpot." },
  email: { rotulo: "Enviar e-mail", fazendo: "Enviando…", feito: "E-mail enviado pela sua caixa, com cópia para a timeline." },
  ligacao: { rotulo: "Registrar e abrir no HubSpot", fazendo: "Registrando…", feito: "Tentativa registrada. A chamada em si é o HubSpot que registra." },
};

// A mensagem de cobrança. Mesma forma da janela do farmer: o de/para, o
// assunto e a cópia são campos, e o texto tem uma caixa grande para ser lido
// antes de sair. Amontoado num bloco estreito ninguém revisa o que manda.
//
// Ela só aparece depois que a ação do dia está escolhida, porque é a ação que
// decide para quem o texto vai: cobrança é com quem paga, NF é com quem emite,
// e renegociar prazo pode ser com qualquer um dos dois, e aí pergunta.
export default function MensagemFinanceiro({ c, abordagem, estrategia, observacao }) {
  const destinoDaAcao = destinoDa(abordagem);
  const precisaEscolher = destinoDaAcao === "ambos";

  const [carregando, setCarregando] = useState(true);
  const [contatos, setContatos] = useState([]);
  const [dash, setDash] = useState(null);
  const [remetente, setRemetente] = useState(null);
  const [tentativas, setTentativas] = useState({});
  const [erro, setErro] = useState("");

  // O lado só é estado quando a ação cabe nos dois. Nos outros casos ele é
  // derivado da ação, e tem que ser: guardado em useState ele sobrevivia à
  // troca de ação e ficava um render inteiro com o valor velho.
  const [escolhido, setEscolhido] = useState("");
  const destino = precisaEscolher ? escolhido : destinoDaAcao;
  const [contatoId, setContatoId] = useState("");
  const [canal, setCanal] = useState("");
  const [texto, setTexto] = useState("");
  const [assunto, setAssunto] = useState("");
  const [cc, setCc] = useState("");
  const [busy, setBusy] = useState("");
  const [feito, setFeito] = useState("");

  // Carrega quando a janela abre, e não junto com o board: são centenas de
  // leituras no HubSpot e no Dash para desenhar uma tela usada um ticket por vez.
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const res = await fetch(`/api/financeiro/mensagem?ticketId=${c.ticketId}`);
        const d = await res.json().catch(() => ({}));
        if (!vivo) return;
        if (!res.ok) throw new Error(d.error || "Falha ao ler os contatos.");
        setContatos(d.contatos || []);
        setDash(d.dash || null);
        setRemetente(d.remetente || null);
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

  // Trocou a ação, o texto já gerado é descartado: ele foi escrito para outra
  // pessoa, com outro objetivo.
  useEffect(() => {
    setEscolhido("");
    setTexto("");
    setFeito("");
  }, [abordagem]);

  const doLado = contatos.filter((x) => x.tipo === destino);
  useEffect(() => {
    const primeiro = doLado.find((x) => x.email || x.telefone) || doLado[0];
    setContatoId(primeiro ? String(primeiro.id) : "");
    setTexto("");
    // O palestrante marca no Dash por onde quer ser procurado. Respeitar isso
    // é o combinado que ele fez com a PSA, então o canal já abre nele. Se
    // aquele canal já esgotou as 3 tentativas, mantém o sugerido pela cascata.
    const pref = primeiro?.contatarPor;
    if (pref && canaisLiberados(tentativas).includes(pref)) setCanal(pref);
  }, [destino, contatos.length]);

  const contato = contatos.find((x) => String(x.id) === contatoId) || null;
  const liberados = canaisLiberados(tentativas);
  const tentativa = canal ? tentativasNo(tentativas, canal) + 1 : 0;
  const prefEsgotada = contato?.contatarPor && !liberados.includes(contato.contatarPor);

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
      // No e-mail o assunto é campo próprio, não a primeira linha do corpo:
      // mandado junto, ele saía escrito dentro da mensagem.
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

  async function enviar() {
    setBusy("enviar");
    setErro("");
    try {
      const d = await chamar("PUT", { texto, assunto, cc });
      setFeito(d.aviso || ACAO[canal]?.feito || `Tentativa ${d.tentativa} registrada.`);
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
  if (!abordagem) {
    return (
      <p className="msg-sem">
        Escolha o que vai fazer hoje, ao lado. É a ação que decide para quem a mensagem vai.
      </p>
    );
  }
  if (destinoDaAcao === "nenhum") {
    return (
      <p className="msg-sem">
        <b>{abordagem}</b> é trabalho interno: não há mensagem para enviar. Registre o que foi feito ao lado.
      </p>
    );
  }

  const semTelefone = canal !== "email" && contato && !contato.telefone;
  const semEmail = canal === "email" && contato && !contato.email;
  const naoPodeGerar = !destino || !contato || !canal || !!busy || semTelefone || semEmail;
  const naoPodeEnviar =
    !texto.trim() || !!busy || (canal === "email" && (!assunto.trim() || !contato?.email));

  return (
    <>
      {/* Só aparece quando a ação cabe dos dois lados. Nas outras o destino já
          está decidido e perguntar seria pergunta com uma resposta só. */}
      {precisaEscolher && (
        <div className="msg-linha">
          <span className="ctx-lab">Com quem</span>
          <div className="seg-toggle">
            {Object.entries(DESTINOS).map(([k, label]) => (
              <button key={k} type="button" className={destino === k ? "on" : ""} onClick={() => setEscolhido(k)}>
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {carregando ? (
        <p className="msg-sem">Lendo os contatos do ticket e do Dash…</p>
      ) : !destino ? (
        <p className="msg-sem">Escolha acima com quem é essa conversa.</p>
      ) : (
        <>
          <div className="msg-linha">
            <span className="ctx-lab">Para</span>
            {doLado.length === 0 ? (
              // Curto, para caber na linha como o nome caberia. A frase inteira
              // virava uma faixa vermelha atravessando a janela.
              <span className="err">sem contato do lado {String(DESTINOS[destino] || "").toLowerCase()}</span>
            ) : doLado.length === 1 ? (
              <span className="msg-contato">
                {contato?.fonte === "dash" && <span className="emp-tag">Dash</span>}
                {contato?.nome}
                <span className="est-sem">
                  {canal === "email"
                    ? contato?.email || "sem e-mail"
                    : telefoneLegivel(contato?.telefone) || "sem telefone"}
                </span>
              </span>
            ) : (
              <div className="select-wrap">
                <select
                  className="emp-abordagem"
                  value={contatoId}
                  onChange={(e) => {
                    setContatoId(e.target.value);
                    setTexto("");
                  }}
                >
                  {doLado.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.fonte === "dash" ? "Dash · " : ""}
                      {x.nome}
                      {x.email ? ` · ${x.email}` : " · sem e-mail"}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Do lado do palestrante quem manda é o Dash. Quando ele não achou,
              o motivo aparece: é a diferença entre "não está cadastrado" e "a
              chave foi recusada", e some no log se não for dito aqui. */}
          {doLado.length === 0 && (
            <p className="msg-nota">
              {destino === "palestrante"
                ? "Cadastre o palestrante no Dash, ou associe um contato dele ao ticket no HubSpot."
                : "É preciso associar um contato do cliente ao ticket no HubSpot."}
            </p>
          )}
          {destino === "palestrante" && dash?.motivo && <p className="msg-nota">{dash.motivo}</p>}
          {contato?.porAssessoria && (
            <p className="msg-nota">
              Ele atende pela assessoria: no Dash o contato principal é ela, então a mensagem vai para lá.
            </p>
          )}
          {contato?.contatarPor && (
            <p className="msg-nota">
              Prefere ser procurado por <b>{rotuloCanal(contato.contatarPor)}</b>, conforme o cadastro dele no Dash.
              {prefEsgotada ? ` Esse canal já teve ${LIMITE_POR_CANAL} tentativas sem resposta.` : ""}
            </p>
          )}

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
                    onClick={() => {
                      setCanal(x.key);
                      setTexto("");
                      setErro("");
                      setFeito("");
                    }}
                  >
                    {x.label}
                    <span className="msg-cont">
                      {tentativasNo(tentativas, x.key)}/{LIMITE_POR_CANAL}
                    </span>
                  </button>
                );
              })}
            </div>
            {canal && (
              <span className="msg-nota">
                tentativa {tentativa} de {LIMITE_POR_CANAL} neste canal
              </span>
            )}
          </div>

          {liberados.length === 0 && (
            <p className="msg-sem">
              Os três canais já tiveram {LIMITE_POR_CANAL} tentativas sem resposta neste ticket.
            </p>
          )}
          {semTelefone && <p className="msg-nota">{contato.nome} não tem telefone no HubSpot nem no Dash.</p>}
          {semEmail && <p className="msg-nota">{contato.nome} não tem e-mail no HubSpot nem no Dash.</p>}

          {canal === "email" && (
            // Assunto e cópia são campos, não texto corrido: o assunto dentro
            // do corpo saía como primeira linha do e-mail.
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
                <label className="ctx-lab" htmlFor="fin-cc">Cópia</label>
                <input
                  id="fin-cc"
                  className="est-input"
                  value={cc}
                  placeholder="opcional, separe por vírgula"
                  onChange={(e) => setCc(e.target.value)}
                />
              </div>
              <div>
                <label className="ctx-lab" htmlFor="fin-assunto">Assunto</label>
                <input
                  id="fin-assunto"
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
                  : "Gere a mensagem e leia antes de mandar."
            }
            onChange={(e) => {
              setTexto(e.target.value);
              setFeito("");
            }}
          />

          <div className="msg-rodape">
            {erro && <span className="err">{erro}</span>}
            {feito && !erro && <span className="saved">{feito}</span>}
            <button className="btn-ghost" onClick={gerar} disabled={naoPodeGerar}>
              {busy === "gerar" ? "Escrevendo…" : texto ? "Gerar outra" : "Gerar mensagem"}
            </button>
            {ACAO[canal] && (
              <button className="btn-primary" onClick={enviar} disabled={naoPodeEnviar}>
                {busy === "enviar" ? ACAO[canal].fazendo : ACAO[canal].rotulo}
              </button>
            )}
          </div>
        </>
      )}
    </>
  );
}
