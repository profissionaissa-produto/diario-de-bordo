// node lib/travessao.check.mjs — nenhum travessão no texto das telas.
//
// Regra do produto, não de estilo: travessão é proibido no que o usuário lê.
// Já saiu em tela mais de uma vez porque depende de eu lembrar, e lembrar não
// é mecanismo. Isto quebra o `npm run check` antes de ir para o ar.
//
// O que ele olha: texto dentro de aspas, de crase e entre tags JSX. Comentário
// de código não conta, porque ninguém lê comentário na tela.
//
// Não confundir com semTravessao(), em lib/gmail-texto.js: aquilo limpa o que
// a IA escreve, em tempo de execução. Isto pega o que eu escrevo, antes.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// Arquivos que precisam do caractere para existir: um limpa travessão, o
// outro testa que ele limpa.
const LIBERADOS = new Set(["lib/gmail-texto.js", "lib/gmail.check.mjs", "lib/travessao.check.mjs"]);

const TRAVESSAO = /[—–]/;

function arquivos(dir, achados = []) {
  for (const nome of readdirSync(dir)) {
    if (nome === "node_modules" || nome === ".next" || nome === ".git") continue;
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) arquivos(caminho, achados);
    else if (/\.(js|mjs|jsx)$/.test(nome)) achados.push(caminho.replace(/\\/g, "/"));
  }
  return achados;
}

// Tira o que não é texto de tela: comentário de linha, comentário de bloco e
// o travessão sozinho, que é marcador de campo vazio e não frase.
function soTexto(linha) {
  return linha
    .replace(/\/\/.*$/, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(["'`])\s*[—–]\s*\1/g, "$1$1")
    .replace(/>\s*[—–]\s*</g, "><");
}

let falhou = false;
const achados = [];

for (const arquivo of [...arquivos("app"), ...arquivos("lib")]) {
  if (LIBERADOS.has(arquivo)) continue;
  const linhas = readFileSync(arquivo, "utf8").split(/\r?\n/);
  let dentroDeBloco = false;
  linhas.forEach((linha, i) => {
    // Comentário de bloco de várias linhas: o conteúdo do meio não é tela.
    if (dentroDeBloco) {
      if (linha.includes("*/")) dentroDeBloco = false;
      return;
    }
    if (/\/\*/.test(linha) && !/\*\//.test(linha)) {
      dentroDeBloco = true;
      return;
    }
    if (TRAVESSAO.test(soTexto(linha))) {
      falhou = true;
      achados.push(`${arquivo}:${i + 1}  ${linha.trim().slice(0, 100)}`);
    }
  });
}

if (falhou) {
  console.log("FALHOU: travessão no texto da tela\n");
  for (const a of achados) console.log("  " + a);
  console.log("\nUse ponto, vírgula ou dois-pontos.");
} else {
  console.log(`ok: nenhum travessão no texto das telas`);
  console.log("travessão: tudo certo.");
}
process.exit(falhou ? 1 : 0);
