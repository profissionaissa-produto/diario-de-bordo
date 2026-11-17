"use client";

import { useState } from "react";
import { BALDES } from "../lib/carteira";
import { resumoDoHubspot } from "../lib/carteira-texto";

// O dia do farmer não espera aprovação: ou ele clicou em iniciar, ou não.
// Dia antigo, de antes de o botão existir, conta como iniciado quando já tem
// resultado registrado: ninguém vai voltar lá para clicar.
const iniciou = (f) => f.brief?.status === "iniciado" || f.situacao?.chave === "fechado";

const STATUS_CLS = {
  fechado: "aprovado",
  iniciado: "enviado",
  mapeando: "enviado",
  nao_iniciado: "rascunho",
  sem_lista: "rascunho",
};

// Troca de segmento em aberto: a empresa está parada até alguém decidir.
function Troca({ t, ownerId, onDecidido }) {
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");

  async function decidir(decisao) {
    setBusy(true);
    setErro("");
    try {
      const res = await fetch("/api/carteira/lider", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "troca", ownerId, companyId: t.id, decisao }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Falha ao registrar.");
      }
      onDecidido(t.id);
    } catch (e) {
      setErro(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="troca-item">
      <div className="troca-cab">
        <a className="emp-nome" href={t.url} target="_blank" rel="noreferrer">{t.nome}</a>
        {erro && <span className="err">{erro}</span>}
      </div>
      {t.motivo && <div className="troca-motivo">{t.motivo}</div>}
      <div className="tram-acoes">
        <button className="btn-ghost" onClick={() => decidir("mantido")} disabled={busy}>
          Segmento está certo
        </button>
        <button className="btn-primary" onClick={() => decidir("trocado")} disabled={busy}>
          Troquei no HubSpot
        </button>
      </div>
    </div>
  );
}

// Empresa travada em três tentativas: o líder responde com uma orientação.
function Auxilio({ e, ownerId }) {
  const [texto, setTexto] = useState(e.orientacao?.texto || "");
  const [salvo, setSalvo] = useState(!!e.orientacao);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");

  async function salvar() {
    setBusy(true);
    setErro("");
    try {
      const res = await fetch("/api/carteira/lider", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "orientacao", ownerId, companyId: e.id, texto }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Falha ao salvar.");
      }
      setSalvo(true);
    } catch (err) {
      setErro(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="aux-item">
      <div className="troca-cab">
        <a className="emp-nome" href={e.url} target="_blank" rel="noreferrer">{e.nome}</a>
        <span className="emp-tag auxilio">{e.historico?.tentativasSeguidas || 3} tentativas</span>
      </div>
      <textarea
        className="obs"
        placeholder="O que o farmer deve fazer nesta empresa?"
        value={texto}
        onChange={(ev) => {
          setTexto(ev.target.value);
          setSalvo(false);
        }}
      />
      <div className="fech-rodape">
        {erro && <span className="err">{erro}</span>}
        {salvo && !erro && <span className="saved">orientação enviada ✓</span>}
        <button className="btn-primary" onClick={salvar} disabled={busy || salvo || texto.trim().length < 10}>
          {busy ? "Salvando…" : salvo ? "Enviada" : "Enviar orientação"}
        </button>
      </div>
    </div>
  );
}

const brl = (n) => "R$ " + Number(n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 });

// O líder comenta e revisa o dia do farmer. Revisar é separado de comentar:
// dá para revisar sem escrever nada, e comentar sem ter revisado.
function Comentario({ ownerId, dia, inicial }) {
  const [texto, setTexto] = useState(inicial?.comentario || "");
  const [salvo, setSalvo] = useState(!!inicial?.comentario);
  const [revisado, setRevisado] = useState(!!inicial?.revisado);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");
  const [crm, setCrm] = useState("");

  async function revisar() {
    setBusy(true);
    setErro("");
    setCrm("");
    try {
      const res = await fetch("/api/carteira/lider", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "revisado", ownerId, dia }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Falha ao marcar.");
      setRevisado(true);
      // Quem leva o plano ao CRM é o farmer, ao iniciar o dia. Revisar
      // regrava como rede, e o líder precisa ver o que chegou lá: sem isto
      // descobre semanas depois com o campo vazio.
      if (d.hubspot) setCrm(resumoDoHubspot(d.hubspot));
    } catch (e) {
      setErro(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function salvar() {
    setBusy(true);
    setErro("");
    try {
      const res = await fetch("/api/carteira/lider", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "comentario", ownerId, dia, texto }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Falha ao salvar.");
      }
      setSalvo(true);
    } catch (e) {
      setErro(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="dia-comentario">
      <summary>
        {revisado ? "Dia revisado" : salvo ? "Comentário enviado" : "Comentar ou revisar"}
      </summary>
      <div className="dia-revisar">
        {/* Revisar é o líder dizendo que leu. Não libera nada: o farmer já
            iniciou o dia e o plano já está no CRM. */}
        {revisado ? (
          <span className="fech-ok">
            revisado{inicial?.revisadoPor ? ` por ${inicial.revisadoPor}` : ""}
          </span>
        ) : (
          <button className="btn-ghost" onClick={revisar} disabled={busy}>
            Marcar como revisado
          </button>
        )}
        {crm && <span className="emp-editado">{crm}</span>}
      </div>
      <textarea
        className="obs"
        placeholder="O que este dia diz?"
        value={texto}
        onChange={(e) => { setTexto(e.target.value); setSalvo(false); }}
      />
      <div className="fech-rodape">
        {erro && <span className="err">{erro}</span>}
        {inicial?.comentadoPor && salvo && <span className="fech-opcional">por {inicial.comentadoPor}</span>}
        <button className="btn-ghost" onClick={salvar} disabled={busy || salvo || !texto.trim()}>
          {salvo ? "Enviado" : "Enviar"}
        </button>
      </div>
    </details>
  );
}

export default function AgendaFarmers({ farmers, diaLabel, dia, resumo }) {
  const [resolvidas, setResolvidas] = useState({});

  const trocas = farmers.flatMap((f) =>
    (f.trocas || [])
      .filter((t) => !resolvidas[f.ownerId + "|" + t.id])
      .map((t) => ({ ...t, ownerId: f.ownerId, farmer: f.nome }))
  );
  // Agrupa por equipe, na ordem em que os farmers chegam do cadastro.
  const grupos = [];
  for (const f of farmers) {
    const chave = f.equipe || "Sem equipe";
    let g = grupos.find((x) => x.equipe === chave);
    if (!g) {
      g = { equipe: chave, farmers: [] };
      grupos.push(g);
    }
    g.farmers.push(f);
  }
  for (const g of grupos) {
    const total = g.farmers.reduce((s, f) => s + f.placar.total, 0);
    const efetivo = g.farmers.reduce((s, f) => s + f.placar.efetivo, 0);
    g.pct = total ? Math.round((efetivo / total) * 100) : 0;
    g.fechados = g.farmers.filter((f) => f.situacao.chave === "fechado").length;
  }

  const auxilios = farmers.flatMap((f) =>
    (f.itens || []).filter((e) => e.precisaAuxilio).map((e) => ({ ...e, ownerId: f.ownerId, farmer: f.nome }))
  );

  return (
    <>
      {resumo && (
        <div className="kpis">
          <div className="kpi"><div className="lab">Oportunidades no mês</div><div className="val a">{resumo.oportunidades}</div><div className="sub">criadas pelo time</div></div>
          <div className="kpi"><div className="lab">Receita gerada</div><div className="val">{brl(resumo.receita)}</div><div className="sub">negócios ganhos no mês</div></div>
          <div className="kpi"><div className="lab">Tickets ativos</div><div className="val">{resumo.ticketsAtivos}</div><div className="sub">eventos em execução</div></div>
          <div className="kpi"><div className="lab">Carteira tocada</div><div className="val o">{resumo.pctContato}%</div><div className="sub">{resumo.comContato} de {resumo.carteira} empresas no mês</div></div>
        </div>
      )}

      {trocas.length > 0 && (
        <div className="painel-troca">
          <div className="painel-titulo">
            Trocas de segmento ({trocas.length}) — a empresa fica fora do rodízio até decidir
          </div>
          <div className="painel-lista">
            {trocas.map((t) => (
              <div key={t.ownerId + t.id}>
                <div className="painel-quem">{t.farmer}</div>
                <Troca
                  t={t}
                  ownerId={t.ownerId}
                  onDecidido={(id) => setResolvidas((r) => ({ ...r, [t.ownerId + "|" + id]: true }))}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {auxilios.length > 0 && (
        <div className="painel-aux">
          <div className="painel-titulo">
            Pedidos de auxílio ({auxilios.length}) — três tentativas sem contato
          </div>
          <div className="painel-lista">
            {auxilios.map((e) => (
              <div key={e.ownerId + e.id}>
                <div className="painel-quem">{e.farmer}</div>
                <Auxilio e={e} ownerId={e.ownerId} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quem enxerga mais de uma equipe vê cada uma com o próprio subtotal —
          sem isso, 17 cartões viram uma lista sem dono. */}
      {grupos.length > 1
        ? grupos.map((g) => (
            <div key={g.equipe}>
              <div className="grupo-cab">
                <span className="grupo-nome">{g.equipe}</span>
                <span className="grupo-nums">
                  {g.farmers.length} farmer{g.farmers.length === 1 ? "" : "s"} ·{" "}
                  <b>{g.pct}%</b> efetivo · {g.fechados} de {g.farmers.length} com o dia fechado
                </span>
              </div>
              <Cartoes farmers={g.farmers} dia={dia} />
            </div>
          ))
        : <Cartoes farmers={farmers} dia={dia} />}
    </>
  );
}

const RESULTADO = {
  efetivo: "falou",
  tentativa: "tentou",
  nao_abordei: "não abordou",
  trocar_segmento: "pediu troca",
};

// O cartão do farmer, no mesmo molde do cartão do closer da agenda geral:
// cabeça com quem é e quanto, e uma linha por empresa dizendo o que vai ser
// feito nela hoje.
//
// Antes mostrava só o nome das empresas em etiquetas, e os dois números em
// destaque eram "% efetivo" e "sem registro", que falam do fechamento. De
// manhã, que é quando a agenda é olhada, os dois davam zero em todo mundo e
// a tela não respondia a pergunta que o gestor faz: o que cada um marcou
// que vai fazer hoje.
function Cartoes({ farmers, dia }) {
  return (
      <div className="dia-grid">
        {farmers.map((f) => {
          // No Farmer, o que a pessoa marca que vai fazer fica na abordagem,
          // que é a coluna Estratégia da tela dela.
          const comEstrategia = f.itens.filter((e) => e.abordagem).length;
          const fechou = f.placar.total - f.placar.sem_registro;
          // Um estado só, e a cor dele é a do texto. Antes o texto vinha do
          // clique em iniciar e a cor vinha do preenchimento: davam "Dia
          // iniciado" em verde num farmer e em azul noutro, sem a tela dizer
          // que a diferença era um ter fechado o dia e o outro não.
          const estado = iniciou(f)
            ? f.situacao.chave === "fechado"
              ? { cls: "fechado", label: "Dia fechado" }
              : { cls: "iniciado", label: "Dia iniciado" }
            : { cls: "parado", label: f.itens.length ? "Não iniciado" : "Sem lista" };
          // A moldura responde a uma pergunta só, e é a que o líder faz ao
          // bater o olho na grade: esta pessoa começou o dia? Verde começou,
          // vermelho não. O resto do estado continua nos selos e no placar.
          return (
          <div
            className={
              "dia-card farmer st-" + (STATUS_CLS[f.situacao.chave] || "rascunho") +
              (iniciou(f) ? " d-iniciado" : " d-parado")
            }
            key={f.ownerId}
          >
            <div className="dia-head">
              <span className="aprov-pfp">
                {f.foto ? <img src={f.foto} alt={f.nome} /> : f.nome.slice(0, 2).toUpperCase()}
              </span>
              <div className="dia-quem">
                <span className="dia-nome" title={f.nome}>{f.nome}</span>
                <span className="dia-meta">
                  {f.itens.length
                    ? `${f.placar.total} empresas · ${comEstrategia} com estratégia`
                    : "não abriu o diário hoje"}
                </span>
              </div>
              <span className={"plan-badge e-" + estado.cls}>{estado.label}</span>
            </div>

            {/* O placar do dia só aparece depois que alguém começou a fechar:
                antes disso ele é zero em todo mundo e não informa nada. */}
            {fechou > 0 && (
              <div className="dia-nums">
                <span><b>{f.placar.pct}%</b> efetivo</span>
                <span>{fechou} de {f.placar.total} fechadas</span>
              </div>
            )}

            {f.itens.length > 0 ? (
              <div className="dia-itens">
                {f.itens.map((e) => (
                  <a
                    className={"dia-item r-" + (e.resultado || "vazio")}
                    key={e.id}
                    href={e.url}
                    target="_blank"
                    rel="noreferrer"
                    title={BALDES[e.balde]?.label}
                  >
                    <span className="dia-item-nome">{e.nome}</span>
                    <span className="dia-item-evo">
                      <span className={"mini" + (e.abordagem ? " forte" : "")}>
                        {e.abordagem || "sem estratégia"}
                      </span>
                      {e.resultado && <span className="dia-item-val">{RESULTADO[e.resultado] || e.resultado}</span>}
                    </span>
                  </a>
                ))}
              </div>
            ) : (
              <div className="dia-vazio">Ainda não abriu o diário hoje</div>
            )}

            <Comentario ownerId={f.ownerId} dia={dia} inicial={f.brief} />
          </div>
          );
        })}
      </div>
  );
}
