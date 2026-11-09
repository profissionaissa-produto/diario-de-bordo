"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  RESULTADOS_TRAMITACAO,
  TRAMITACAO_EXIGE_OBSERVACAO,
  ABORDAGENS_TRAMITACAO,
  clienteDo,
  palestranteDo,
} from "../lib/tramitacoes";
import { ABORDAGEM_DO_ONBOARDING, estrategiaDaTentativa } from "../lib/financeiro";
import MensagemFinanceiro from "./MensagemFinanceiro";
import { numeroDa } from "../lib/estrategias";

const MIN_TEXTO = 10;
const dataBR = (d) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "");

// Janela do registro do dia. É modal e não painel dentro do card porque o card
// vive numa coluna de 310px: abordagem, estratégia e um texto de verdade não
// cabem ali sem virar sopa.
//
// O texto é escrito no futuro porque o Diário é a primeira coisa do dia: aqui
// a pessoa marca o que vai fazer. Quem diz se aconteceu é "como andou", que é
// leitura de fim de dia.
//
// ponytail: os dois momentos ainda salvam juntos, "como andou" continua
// obrigatório para gravar. Separar o plano da manhã do fechamento da tarde é
// decisão de processo e não está feito.
//
// O que for escrito aqui vira observação no ticket de CS.
//
// A mesma janela serve a Tramitação e ao seguimento financeiro. O que muda é a
// lista de abordagem, que vem de fora, e a tarefa, que só o financeiro abre.
export default function RegistroTramitacao({
  p,
  ticket,
  estrategias = [],
  evolucao,
  ehGestor,
  onFechar,
  abordagens = ABORDAGENS_TRAMITACAO,
  financeiro = false,
}) {
  const router = useRouter();
  const [abordagem, setAbordagem] = useState(evolucao?.abordagem || "");
  // No financeiro a estratégia é definida pela tentativa, não escolhida a
  // esmo: a 1ª cobrança é o lembrete, a 2ª o aviso de atraso, a 3ª em diante
  // o escalonamento. Vem escolhida e pode ser trocada. O que já foi
  // registrado hoje manda, senão corrigir um registro trocaria a escolha de
  // quem o fez.
  const [estrategia, setEstrategia] = useState(
    evolucao?.estrategia || (financeiro ? estrategiaDaTentativa(p.tentativa, estrategias) : "")
  );
  const [resultado, setResultado] = useState(evolucao?.resultado || "");
  const [texto, setTexto] = useState(evolucao?.observacao || "");
  // Padrão ligado: a cobrança que não vira compromisso com data é recado, e o
  // documento do financeiro trata a tarefa como o caminho normal.
  const [tarefa, setTarefa] = useState(true);
  const [busy, setBusy] = useState("");
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [salvo, setSalvo] = useState(false);
  const [abrirDevolver, setAbrirDevolver] = useState(false);
  const [motivo, setMotivo] = useState("");

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

  async function chamar(metodo, corpo) {
    const res = await fetch("/api/tramitacoes", {
      method: metodo,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticketId: p.ticketId, tipo: p.tipo, ...corpo }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.error || "Falha ao registrar.");
    return d;
  }

  async function registrar() {
    setBusy("registrar");
    setErro("");
    setAviso("");
    try {
      const d = await chamar("PUT", {
        resultado,
        observacao: texto,
        abordagem,
        estrategia,
        // Só o financeiro manda estes. A rota ignora o que não for do tipo
        // dela, e assim a Tramitação continua gravando exatamente o que
        // gravava antes.
        ...(financeiro
          ? { tarefa, tentativa: p.tentativa || 0, vence: p.data || "", assunto: ticket?.assunto || "" }
          : {}),
      });
      setSalvo(true);
      if (d.aviso) setAviso(d.aviso);
      router.refresh();
    } catch (e) {
      setErro(e.message);
    } finally {
      setBusy("");
    }
  }

  async function decidir(corpo) {
    setBusy("decidir");
    setErro("");
    try {
      await chamar("PATCH", corpo);
      router.refresh();
      onFechar();
    } catch (e) {
      setErro(e.message);
      setBusy("");
    }
  }

  async function marcarFeito() {
    setBusy("feito");
    setErro("");
    try {
      await chamar("POST", {});
      router.refresh();
      onFechar();
    } catch (e) {
      setErro(e.message);
      setBusy("");
    }
  }

  const escolhida = estrategias.find((s) => s.id === estrategia) || null;
  const exigeTexto = TRAMITACAO_EXIGE_OBSERVACAO.includes(resultado);
  const faltam = Math.max(0, MIN_TEXTO - texto.trim().length);
  // Sem texto não há evidência: a observação no ticket sairia vazia.
  const naoPode = !resultado || faltam > 0;

  return (
    <div className="modal-fundo" onMouseDown={(e) => e.target === e.currentTarget && onFechar()}>
      <div className="modal modal-estreito" role="dialog" aria-modal="true" aria-label="Registrar o dia">
        <header className="modal-topo">
          <div>
            <h2>{clienteDo(ticket?.assunto || "") || `Ticket ${p.ticketId}`}</h2>
            <div className="modal-sub">
              <span className={`tram-ponto p-${p.nivel}`} />
              <span>{p.label}</span>
              {palestranteDo(ticket?.assunto || "") && <span>· {palestranteDo(ticket.assunto)}</span>}
              {p.evento && <span>· evento {dataBR(p.evento)}</span>}
              {financeiro && p.tentativa > 0 && <span>· {p.tentativa}ª tentativa</span>}
              {financeiro && p.data && <span>· vence {dataBR(p.data)}</span>}
            </div>
          </div>
          <button className="modal-x" onClick={onFechar} aria-label="Fechar">×</button>
        </header>

        <div className="modal-principal reg-corpo">
          <p className="reg-grav">{p.motivo}</p>

          <label className="est-campo">
            <span className="ctx-lab">O que vou fazer hoje</span>
            <div className="select-wrap">
              <select className="emp-abordagem" value={abordagem} onChange={(e) => { setAbordagem(e.target.value); setSalvo(false); }}>
                <option value="">Escolher o que vou fazer…</option>
                {abordagens.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>
          </label>

          <label className="est-campo">
            <span className="ctx-lab">Estratégia</span>
            <div className="select-wrap">
              <select
                className="emp-abordagem"
                value={estrategia}
                disabled={estrategias.length === 0}
                onChange={(e) => { setEstrategia(e.target.value); setSalvo(false); }}
              >
                <option value="">
                  {estrategias.length ? "Escolher estratégia…" : "Nenhuma cadastrada"}
                </option>
                {estrategias.map((s) => (
                  <option key={s.id} value={s.id} title={s.desc}>
                    {numeroDa(s.id)}. {s.titulo}
                  </option>
                ))}
              </select>
            </div>
            {/* No financeiro a estratégia é instrução, não rótulo: ela diz o
                tom, o que citar e por qual canal. Escondida no title do option
                ninguém lê. */}
            {financeiro && escolhida?.desc && <p className="reg-dica">{escolhida.desc}</p>}
          </label>

          <div className="est-campo">
            <span className="ctx-lab">No fim do dia, como andou</span>
            <div className="fech-opcoes">
              {RESULTADOS_TRAMITACAO.map((r) => (
                <button
                  key={r.key}
                  className={"fech-op " + r.cls + (resultado === r.key ? " on" : "")}
                  onClick={() => { setResultado(r.key); setSalvo(false); setErro(""); }}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {financeiro && (
            <div className="est-campo">
              <span className="ctx-lab">Abrir tarefa no ticket</span>
              <div className="fech-opcoes">
                <button
                  className={"fech-op ok" + (tarefa ? " on" : "")}
                  onClick={() => setTarefa(true)}
                >
                  Sim
                </button>
                <button
                  className={"fech-op nao" + (!tarefa ? " on" : "")}
                  onClick={() => setTarefa(false)}
                >
                  Não
                </button>
              </div>
              <p className="reg-dica">
                {tarefa
                  ? abordagem === ABORDAGEM_DO_ONBOARDING
                    ? "A tarefa vai para o onboarding, que é quem fala com o palestrante."
                    : p.data
                      ? `A tarefa vence em ${dataBR(p.data)}, a data combinada com o cliente.`
                      : "Sem data combinada no ticket, a tarefa vence hoje."
                  : "Fica só como registro no histórico do ticket."}
              </p>
            </div>
          )}

          {/* A mensagem vem depois da ação escolhida, porque é a ação que diz
              para quem ela vai: cobrança é com quem paga, NF com quem emite. */}
          {financeiro && (
            <MensagemFinanceiro
              c={p}
              abordagem={abordagem}
              estrategia={estrategia}
              observacao={texto}
            />
          )}

          <label className="est-campo">
            <span className="ctx-lab">
              Como vou fazer {faltam > 0 && <em className="est-falta">faltam {faltam}</em>}
            </span>
            <textarea
              className="obs reg-texto"
              value={texto}
              placeholder={
                exigeTexto
                  ? "O que travou? De quem depende?"
                  : "Diga como vai fazer. Este texto vira observação no ticket de CS."
              }
              onChange={(e) => { setTexto(e.target.value); setSalvo(false); }}
            />
          </label>
        </div>

        <footer className="modal-rodape">
          {erro && <span className="err">{erro}</span>}
          {aviso && !erro && <span className="err">{aviso}</span>}
          {salvo && !erro && !aviso && <span className="saved">registrado no ticket</span>}

          {/* A baixa em duas mãos é da Tramitação. No financeiro não existe:
              o que fecha a etapa é o ticket sair dela no HubSpot, e um botão
              que grava onde ninguém lê é pior do que botão nenhum. */}
          {!financeiro && p.status === "aguardando" && ehGestor && (
            <>
              <button className="btn-ghost" onClick={() => setAbrirDevolver((v) => !v)} disabled={!!busy}>
                Devolver
              </button>
              <button className="btn-ghost" onClick={() => decidir({ decisao: "confirmado" })} disabled={!!busy}>
                Confirmar baixa
              </button>
            </>
          )}
          {!financeiro && p.status !== "aguardando" && (
            <button className="btn-ghost" onClick={marcarFeito} disabled={!!busy}>
              {busy === "feito" ? "…" : "Marcar como feito"}
            </button>
          )}

          <button className="btn-primary" onClick={registrar} disabled={!!busy || naoPode || salvo}>
            {busy === "registrar" ? "Registrando…" : salvo ? "Registrado" : "Registrar no ticket"}
          </button>
        </footer>

        {abrirDevolver && (
          <div className="reprova">
            <input
              className="reprova-input"
              placeholder="Por que está voltando?"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            />
            <button className="btn-danger" onClick={() => decidir({ decisao: "devolvido", motivo })} disabled={!!busy}>
              Devolver
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
