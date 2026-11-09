// Partes do e-mail que são só texto. Ficam fora do lib/gmail.js porque a tela
// precisa delas para montar a prévia, e o gmail.js importa node:crypto, que
// não existe no navegador.

// Travessão não passa, e isso não pode depender do modelo obedecer. A regra
// está no prompt desde o começo e mesmo assim saiu "valor R$ 30.000,00 — falta
// a nota fiscal" numa mensagem de verdade em 09/11/2026. Regra que vale sempre
// se aplica no código, não se pede.
//
// Vira vírgula, não ponto: vírgula nunca exige maiúscula na palavra seguinte,
// então a frase continua lendo certo sem precisar entender a frase.
export const semTravessao = (texto) =>
  String(texto || "")
    .replace(/\s*[—–]\s*/g, ", ")
    .replace(/,\s*,/g, ",")
    .replace(/\s+,/g, ",");

// O Gemini devolve o e-mail com "Assunto: ..." na primeira linha. Separar aqui
// mantém a caixa da tela como um texto só, que é o que a pessoa edita.
export function separaAssunto(texto, padrao = "Contato da PSA") {
  const linhas = String(texto || "").split("\n");
  const i = linhas.findIndex((l) => l.trim());
  if (i < 0) return { assunto: padrao, corpo: "" };
  const m = linhas[i].match(/^\s*assunto\s*:\s*(.+)$/i);
  if (!m) return { assunto: padrao, corpo: linhas.join("\n").trim() };
  return { assunto: m[1].trim() || padrao, corpo: linhas.slice(i + 1).join("\n").trim() };
}

// Texto puro vira HTML simples. Sem markdown: o que a pessoa leu na caixa é o
// que o cliente recebe, com as quebras de linha preservadas.
export function paraHtml(texto) {
  const esc = String(texto || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return esc
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
    .join("\n");
}
