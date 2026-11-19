// Quem escreve a mensagem. O provedor é trocável por variável de ambiente
// porque já trocamos uma vez: o Gemini saiu em 04/11/2026 por limite do tier
// gratuito, e deixar o caminho de volta aberto custa estas poucas linhas.
//
// O prompt é o mesmo nos dois, em lib/prompt.js. O que muda aqui é só por
// onde ele passa.
import * as openai from "./openai.js";
import * as gemini from "./gemini.js";
import { semTravessao, semParenteses } from "./gmail-texto.js";

const PROVEDORES = { openai, gemini };

export const nomeDoProvedor = () => {
  const n = String(process.env.IA_PROVEDOR || "openai").toLowerCase();
  return PROVEDORES[n] ? n : "openai";
};

const atual = () => PROVEDORES[nomeDoProvedor()];

// A tela desabilita o que não dá para fazer em vez de deixar clicar e falhar.
export const iaPronta = () =>
  nomeDoProvedor() === "gemini" ? gemini.geminiPronto() : openai.openaiPronto();

// A limpeza passa por aqui e não por quem chama: vale para toda mensagem
// gerada, da carteira, do financeiro e do closer, e deixar na mão de cada
// rota garantiria que uma delas esquecesse.
//
// Travessão e parênteses são proibidos por regra do time, estão escritos no
// prompt e mesmo assim saíram em mensagem de verdade. Regra que vale sempre
// se aplica no código, não se pede.
export async function geraMensagem(dados) {
  return semParenteses(semTravessao(await atual().geraMensagem(dados)));
}
