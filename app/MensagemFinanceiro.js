"use client";

import { useEffect, useRef, useState } from "react";
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

// A mensagem de cobrança, igual à janela do farmer.
//
// Igual inclui o que mais importa: ela chega escrita. Escolhida a ação do dia,
// o texto é pedido sozinho, como lá. Pedir um clique em "Gerar" depois de a
// pessoa já ter dito o que vai fazer é pedir a mesma coisa duas vezes.
//
// A ação é que decide para quem o texto vai: cobrança é com quem paga, NF é
// com quem emite, e renegociar prazo pode ser com qualquer um dos dois, e aí
// pergunta.
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

  // Um texto por combinação de ação, lado, contato e canal. Trocar de canal e
  // voltar não pode apagar o que já estava escrito nem cobrar uma geração
  // nova, que é como a janela do farmer se comporta.
  const [textos, setTextos] = useState({});
  const [assuntos, setAssuntos] = useState({});
  const [cc, setCc] = useState("");
  const [busy, setBusy] = useState("");
  const [feito, setFeito] = useState("");
  const [enviados, setEnviados] = useState({});

  // Combinações já pedidas nesta abertura. É ref e não estado porque mudar
  // isto não repinta nada, e sem ele um erro viraria laço de chamadas ao
  // modelo.
  const jaPediu = useRef(new Set());

  const chave = `${abordagem}|${destino}|${contatoId}|${canal}`;
  const texto = textos[chave] || "";
  const setTexto = (v) => setTextos((t) => ({ ...t, [chave]: v }));
  const assunto = assuntos[chave] || "";
  const setAssunto = (v) => setAssuntos((a) => ({ ...a, [chave]: v }));
  const enviada = !!enviados[chave];

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

  useEffect(() => {
    setEscolhido("");
    setErro("");
    setFeito("");
  }, [abordagem]);

  const doLado = contatos.filter((x) => x.tipo === destino);
  useEffect(() => {
    const primeiro = doLado.find((x) => x.email || x.telefone) || doLado[0];
    setContatoId(primeiro ? String(primeiro.id) : "");
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
  const semTelefone = canal !== "email" && contato && !contato.telefone;
  const semEmail = canal === "email" && contato && !contato.email;
  const podeGerar = !!abordagem && !!destino && !!contato && !!canal && !semTelefone && !semEmail;

  // A mensagem chega escrita, como na janela do farmer. Só o que identifica a
  // combinação entra na lista: incluir o texto faria a geração recomeçar
  // sozinha a cada tecla digitada na caixa.
  useEffect(() => {
    if (!podeGerar || textos[chave] || busy || jaPediu.current.has(chave)) return;
    jaPediu.current.add(chave);
    gerar();
  }, [chave, podeGerar]);

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

  if (!abordagem) {
    return <p className="msg-sem">Escolha o que vai fazer hoje, ao lado. É a ação que decide para quem a mensagem vai.</p>;
  }
  // Ação interna não tem mensagem: emitir nota, conferir NF e aguardar retorno
  // são trabalho nosso, e oferecer geração neles sugeriria mandar texto para
  // quem não tem o que receber.
  if (destinoDaAcao === "nenhum") {
    return (
      <p className="msg-sem">
        <b>{abordagem}</b> é trabalho interno: não há mensagem para enviar. Registre o que foi feito ao lado.
      </p>
    );
  }
  if (carregando) return <p className="msg-sem">Lendo os contatos do ticket e do Dash…</p>;

  const faltaEnviar =
    !texto.trim() || !!busy || enviada || (canal === "email" && (!assunto.trim() || !contato?.email));

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

      {!destino ? (
        <p className="msg-sem">Escolha acima com quem é essa conversa.</p>
      ) : liberados.length === 0 ? (
        <p className="msg-sem">
          Os três canais já tiveram {LIMITE_POR_CANAL} tentativas sem resposta neste ticket. Registre o
          resultado ao lado e leve o caso para o gestor.
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
                    onClick={() => {
                      setCanal(x.key);
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
            <span className="msg-nota">
              tentativa {tentativa} de {LIMITE_POR_CANAL} neste canal
            </span>
          </div>

          <div className="msg-linha">
            <span className="ctx-lab">Para</span>
            {doLado.length === 0 ? (
              <span className="err">
                sem contato do lado {String(DESTINOS[destino] || "").toLowerCase()} neste ticket
              </span>
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
                <select className="emp-abordagem" value={contatoId} onChange={(e) => setContatoId(e.target.value)}>
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

          {/* Uma linha só para o que o Dash tem a dizer. Em três linhas
              separadas isso empurrava a mensagem para fora da tela. */}
          {destino === "palestrante" && (dash?.motivo || contato?.porAssessoria || contato?.contatarPor) && (
            <p className="msg-nota">
              {[
                contato?.porAssessoria ? "Atende pela assessoria, e é para lá que a mensagem vai." : "",
                contato?.contatarPor
                  ? `Prefere ${rotuloCanal(contato.contatarPor)}${prefEsgotada ? ", mas esse canal já esgotou" : ""}.`
                  : "",
                doLado.length === 0 ? dash?.motivo : "",
              ]
                .filter(Boolean)
                .join(" ")}
            </p>
          )}
          {doLado.length === 0 && (
            <p className="msg-nota">
              {destino === "palestrante"
                ? "Cadastre o palestrante no Dash, ou associe um contato dele ao ticket no HubSpot."
                : "É preciso associar um contato do cliente ao ticket no HubSpot."}
            </p>
          )}
          {semTelefone && <p className="msg-nota">{contato.nome} está sem telefone no HubSpot e no Dash.</p>}
          {semEmail && <p className="msg-nota">{contato.nome} está sem e-mail no HubSpot e no Dash.</p>}

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
                : podeGerar
                  ? "Leia e ajuste antes de mandar."
                  : "Escolha o contato e o canal para a mensagem ser escrita."
            }
            onChange={(e) => {
              setTexto(e.target.value);
              setEnviados((x) => ({ ...x, [chave]: false }));
              setFeito("");
            }}
          />

          <div className="msg-rodape">
            {erro && <span className="err">{erro}</span>}
            {feito && !erro && <span className="saved">{feito}</span>}
            {/* Só aparece quando a geração falhou. Fora disso não há botão de
                gerar: a mensagem chega pronta e a pessoa ajusta o que quiser. */}
            {erro && (
              <button className="btn-ghost" onClick={tentarDeNovo} disabled={!!busy}>
                {busy === "gerar" ? "Escrevendo…" : "Tentar de novo"}
              </button>
            )}
            {ACAO[canal] && (
              <button className="btn-primary" onClick={enviar} disabled={faltaEnviar}>
                {busy === "enviar" ? ACAO[canal].fazendo : ACAO[canal].rotulo}
              </button>
            )}
          </div>
        </>
      )}
    </>
  );
}
