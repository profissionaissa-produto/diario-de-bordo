import { estrategiaPorId as SEMENTES_IDX, numeroDa } from "./estrategias";

const brl = (n) =>
  n == null ? "" : "R$ " + n.toLocaleString("pt-BR", { maximumFractionDigits: 0 });

// O WhatsApp aceita no máximo 12 opções por enquete.
const MAX_OPCOES = 12;

// Encurta o nome para caber na opção: tira as datas do fim e o excesso de
// segmentos separados por "|".
function nomeCurto(nome, limite = 70) {
  const partes = String(nome)
    .split("|")
    .map((p) => p.trim())
    .filter((p) => p && !/^\d{2}\/\d{2}/.test(p));
  const base = partes.slice(0, 2).join(" | ") || String(nome).trim();
  return base.length > limite ? base.slice(0, limite - 1).trimEnd() + "…" : base;
}

// Enquete do WhatsApp: uma pergunta e uma opção por negócio, para o closer
// colar em "+ → Enquete". O app não aceita enquete por link, só digitada.
export function enqueteWhatsApp({ closer, diaLabel, itens }) {
  const primeiroNome = String(closer || "").split(" ")[0];
  return {
    pergunta: `${primeiroNome} — o que foi feito hoje? (${diaLabel})`,
    opcoes: itens.slice(0, MAX_OPCOES).map((i) => nomeCurto(i.nome)),
    cortados: Math.max(0, itens.length - MAX_OPCOES),
  };
}

// Resumo do briefing aprovado, no formato do WhatsApp (*negrito*).
// Texto puro: sem link nem markdown, para colar em qualquer conversa.
export function resumoWhatsApp({ closer, diaLabel, itens, estrategiaPorId = SEMENTES_IDX }) {
  const total = itens.reduce((s, i) => s + (i.valor || 0), 0);
  const linhas = [
    `*Diário de bordo — ${diaLabel}*`,
    closer,
    "",
    `${itens.length} negócio${itens.length === 1 ? "" : "s"} para hoje${total ? ` · ${brl(total)}` : ""}`,
    "",
  ];

  itens.forEach((i, n) => {
    linhas.push(`${n + 1}. *${i.nome}*${i.valor ? ` — ${brl(i.valor)}` : ""}`);
    if (i.de || i.para) linhas.push(`   ${i.de || "—"} → ${i.para || "—"}`);
    const e = estrategiaPorId[i.estrategia];
    if (e) linhas.push(`   Estratégia ${numeroDa(i.estrategia)}: ${e.titulo}`);
    if (i.atrasada) linhas.push(`   ⚠️ atividade atrasada`);
    linhas.push("");
  });

  return linhas.join("\n").trim();
}
