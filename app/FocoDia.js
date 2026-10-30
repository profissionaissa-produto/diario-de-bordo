import { TEMP_STYLE, dealUrl } from "../lib/config";
import { estrategiaPorId as SEMENTES_IDX, numeroDa } from "../lib/estrategias";
import BotaoWhats from "./BotaoWhats";

const brl = (n) => (n == null ? "—" : "R$ " + n.toLocaleString("pt-BR", { maximumFractionDigits: 0 }));

const STATUS = {
  rascunho: { txt: "Não enviado", cls: "rascunho" },
  enviado: { txt: "Aguardando aprovação", cls: "enviado" },
  aprovado: { txt: "Aprovado", cls: "aprovado" },
  reprovado: { txt: "Reprovado", cls: "reprovado" },
};

// Visão pessoal do closer: só o que ele decidiu tocar hoje, em cartões.
export default function FocoDia({ rows, briefing, ctx, options = [], estrat }) {
  const estrategiaPorId = estrat?.idx || SEMENTES_IDX;
  const items = briefing?.items || {};
  const status = briefing?.status || "rascunho";
  const label = (v) => options.find((o) => o.value === v)?.label || v;

  const doDia = rows.filter((r) => r.id in items);
  // Atrasado primeiro: é o que o dia cobra.
  const ordenados = [...doDia].sort((a, b) => {
    const p = (r) => (r.next.pill?.cls === "late" ? 0 : r.next.pill?.cls === "today" ? 1 : 2);
    return p(a) - p(b);
  });

  const valor = doDia.reduce((s, r) => s + (r.amount || 0), 0);
  const atrasados = doDia.filter((r) => r.next.pill?.cls === "late").length;
  const semAlvo = doDia.filter((r) => !items[r.id]?.para).length;
  const semEstrategia = doDia.filter((r) => !items[r.id]?.estrategia).length;

  if (doDia.length === 0) {
    return (
      <div className="card">
        <div className="foco-vazio">
          <h3>Seu dia ainda está em branco</h3>
          <p>
            Vá para a <b>Tabela</b>, marque os negócios que vai atuar hoje e escolha para onde
            pretende levar cada um.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="foco">
      <div className="foco-topo">
        <div className="foco-resumo">
          <span className={"foco-status " + STATUS[status].cls}>{STATUS[status].txt}</span>
          <span className="foco-dia">{ctx.diaLabel}</span>
        </div>
        {status === "aprovado" && (
          <BotaoWhats
            closer={ctx.closerName || ""}
            diaLabel={ctx.diaLabel}
            estrategiaPorId={estrat?.idx}
            itens={ordenados.map((r) => ({
              nome: r.name,
              valor: r.amount,
              de: items[r.id].de ? label(items[r.id].de) : "",
              para: items[r.id].para ? label(items[r.id].para) : "",
              estrategia: items[r.id].estrategia,
              atrasada: r.next?.pill?.cls === "late",
            }))}
          />
        )}
        <div className="foco-nums">
          <span><b>{doDia.length}</b> negócio{doDia.length === 1 ? "" : "s"}</span>
          <span><b>{brl(valor)}</b> em jogo</span>
          {atrasados > 0 && <span className="foco-alerta"><b>{atrasados}</b> com atividade atrasada</span>}
          {semAlvo > 0 && <span className="foco-alerta"><b>{semAlvo}</b> sem evolução definida</span>}
          {semEstrategia > 0 && <span className="foco-alerta"><b>{semEstrategia}</b> sem estratégia</span>}
        </div>
      </div>

      {status === "reprovado" && briefing?.motivo && (
        <div className="foco-motivo">Reprovado — {briefing.motivo}</div>
      )}

      <div className="foco-grid">
        {ordenados.map((r) => {
          const it = items[r.id];
          const atrasado = r.next.pill?.cls === "late";
          return (
            <div className={"foco-card" + (atrasado ? " atrasado" : "")} key={r.id}>
              <div className="foco-card-topo">
                <span className="stage">
                  <span className={"dot" + (r.adv ? " adv" : "")} />
                  {r.stageLabel}
                </span>
                <span className="foco-val">{r.amountText}</span>
              </div>

              <a className="foco-nome" href={r.url} target="_blank" rel="noreferrer">
                {r.name}
              </a>

              {/* A estratégia é o "como": vem antes do "para onde". */}
              {it.estrategia && estrategiaPorId[it.estrategia] && (
                <div className="foco-estrat">
                  <span className="foco-estrat-num">{numeroDa(it.estrategia)}</span>
                  <span>
                    <b>{estrategiaPorId[it.estrategia].titulo}</b>
                    <span className="foco-estrat-desc">{estrategiaPorId[it.estrategia].desc}</span>
                  </span>
                </div>
              )}

              <div className="foco-evo">
                <span className={"temp-atual t-" + (TEMP_STYLE[it.de] || "none")}>
                  {it.de ? label(it.de) : "sem temperatura"}
                </span>
                <span className="evo-seta">→</span>
                <span className={"temp-alvo t-" + (TEMP_STYLE[it.para] || "none")}>
                  {it.para ? label(it.para) : "definir evolução"}
                </span>
              </div>

              <div className="foco-rodape">
                <span className={"date" + (r.next.none ? " none" : "")}>
                  {r.next.dateText}
                  {r.next.pill && <span className={"pill-date " + r.next.pill.cls}>{r.next.pill.text}</span>}
                </span>
                {r.nextStep && <span className="foco-passo">{r.nextStep}</span>}
              </div>

              {r.observacoes && <div className="foco-obs">{r.observacoes}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
