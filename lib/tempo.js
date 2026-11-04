// Tempo decorrido em palavras. Vive fora do gemini.js porque a tela também
// precisa dele, e o gemini.js lê a chave do ambiente.

// "há 11 meses" diz o que "01/12/2025" não diz. É a informação que faz a
// mensagem soar como quem conhece o cliente, e sem ela o modelo ignora a data.
export function tempoDesde(iso, hoje = new Date()) {
  if (!iso) return "";
  const d = new Date(`${String(iso).slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return "";
  const meses = Math.max(0, Math.round((hoje - d) / (1000 * 60 * 60 * 24 * 30.44)));
  if (meses === 0) return "neste mês";
  if (meses === 1) return "há 1 mês";
  if (meses < 12) return `há ${meses} meses`;
  const anos = Math.floor(meses / 12);
  const resto = meses % 12;
  const base = anos === 1 ? "há 1 ano" : `há ${anos} anos`;
  return resto === 0 ? base : `${base} e ${resto} ${resto === 1 ? "mês" : "meses"}`;
}
