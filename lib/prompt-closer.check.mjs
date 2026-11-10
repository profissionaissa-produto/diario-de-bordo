// node lib/prompt-closer.check.mjs — o prompt da mensagem do closer.
//
// O que este arquivo protege é o que já deu errado duas vezes no painel:
// critério que chega ao prompt e não é usado sai como texto genérico, e
// ninguém percebe porque o resultado parece bom.
const { montaPromptCloser, conversaEmTexto, TETO_TRANSCRICAO } = await import("./prompt-closer.js");

let falhou = false;
const ok = (cond, msg) => {
  if (!cond) falhou = true;
  console.log((cond ? "ok: " : "FALHOU: ") + msg);
};

const BASE = {
  negocio: "Inbound - Premier Turismo - Diessica Paulista",
  etapa: "Proposta enviada | 1° Follow",
  contato: { nome: "Diessica Paulista", cargo: "Marketing", papel: "DECISION_MAKER" },
  canal: "whatsapp",
  tentativa: 1,
  estrategia: { titulo: "Pré-briefing", desc: "Só depende de agenda sua com o cliente." },
  temperaturaAtual: "Café com leite",
  temperaturaPretendida: "Vou vender",
  proximaAtividade: "2026-11-13",
  proximoPasso: "Enviar proposta com os 10 nomes",
  observacao: "Cliente pediu os valores por escrito",
  eventoEm: "2027-05-06",
  valor: 1960,
  remetente: "Mattheus",
};

const p = montaPromptCloser(BASE);

// ------------------------------------------- os critérios pedidos pelo time
ok(p.includes("Premier Turismo"), "o negócio entra no prompt");
ok(p.includes("Proposta enviada | 1° Follow"), "a etapa atual entra no prompt");
ok(p.includes("Pré-briefing"), "a estratégia entra pelo título");
ok(p.includes("Só depende de agenda sua com o cliente."), "e pela descrição, que é o 'quando usar'");
ok(/Enviar proposta com os 10 nomes/.test(p), "o próximo passo do CRM entra");
ok(/13\/11\/2026/.test(p), "a próxima atividade entra em português");
ok(/Cliente pediu os valores por escrito/.test(p), "a observação do closer entra");
ok(/Tentativa 1 de 3/.test(p), "a tentativa entra");
ok(/Canal: whatsapp/.test(p), "o canal entra");
ok(/06\/05\/2027/.test(p), "a data do evento entra");
ok(/R\$/.test(p) && /1\.960/.test(p), "o valor entra em reais");
ok(/quem decide/.test(p), "o papel de decisor é dito");

// ------------------------------------------------- a evolução pretendida
// É o critério que o farmer não tem: um objetivo declarado pelo closer.
ok(/Como está hoje: "Café com leite"/.test(p), "a temperatura atual entra pelo rótulo");
ok(/Para onde o closer quer levar hoje: "Vou vender"/.test(p), "a pretendida entra pelo rótulo");
ok(/conversa morna, o cliente não se comprometeu/.test(p), "e traduzida, senão é jargão de sistema");
ok(/confiança alta de que fecha/.test(p), "a de destino também é traduzida");
ok(
  /TEM que servir para mover este negócio para "Vou vender"/.test(p),
  "e vira regra, não só dado"
);
const semAlvo = montaPromptCloser({ ...BASE, temperaturaPretendida: "" });
ok(!/TEM que servir para mover/.test(semAlvo), "sem evolução pretendida, a regra não aparece");

// --------------------------------------------- a conversa da última reunião
const RESUMO = "Conexão: closer apresentou a PSA.\nDiagnóstico: cliente quer economista.\nCombinado (cliente): retorno dia 13/11.";
const comResumo = montaPromptCloser({ ...BASE, resumoReuniao: RESUMO });
ok(/RESUMO DA ÚLTIMA REUNIÃO/.test(comResumo), "o resumo do Copiloto entra com o rótulo dele");
ok(comResumo.includes(RESUMO), "e entra inteiro");
ok(/TEM que retomar o que ficou combinado/.test(comResumo), "e vira regra");

// A transcrição crua só entra quando não há resumo, e cortada pelo fim, que é
// onde está o combinado. O começo é apresentação.
const LONGA = "a".repeat(TETO_TRANSCRICAO + 5000) + "COMBINADO NO FIM";
const comLonga = montaPromptCloser({ ...BASE, transcricao: LONGA });
ok(/TRECHO FINAL DA TRANSCRIÇÃO/.test(comLonga), "transcrição longa é marcada como trecho final");
ok(comLonga.includes("COMBINADO NO FIM"), "e o fim é o que sobra");
ok(comLonga.length < LONGA.length, "o prompt não leva a conversa inteira");
ok(
  conversaEmTexto({ transcricao: LONGA }).texto.length === TETO_TRANSCRICAO,
  "o corte respeita o teto"
);

// Resumo ganha da transcrição quando os dois existem.
const dois = conversaEmTexto({ resumoReuniao: RESUMO, transcricao: LONGA });
ok(dois.fonte === "resumo", "com os dois, vale o resumo");
ok(dois.texto === RESUMO, "e a transcrição fica de fora");

// Registro de 2 caracteres existe no CRM e é sujeira.
ok(conversaEmTexto({ transcricao: "ok" }).texto === "", "transcrição de 2 caracteres é descartada");
ok(conversaEmTexto({ resumoReuniao: "ok" }).texto === "", "resumo curto demais também");
ok(conversaEmTexto({}).fonte === "", "sem nada, não inventa fonte");

// Sem conversa nenhuma, o prompt tem que proibir inventar o que foi falado.
ok(/PROIBIDO inventar o que foi falado/.test(p), "sem registro, proíbe inventar a conversa");
ok(!/RESUMO DA ÚLTIMA REUNIÃO/.test(p), "e não abre um bloco vazio");

// ----------------------------------------- o que não pode vazar no texto
ok(/PROIBIDO usar a linguagem interna do CRM/.test(p), "jargão de CRM é proibido no texto");
ok(/não escreva temperatura, forecast, funil/.test(p), "e os termos são nomeados");
ok(/Não use travessão/.test(p), "a regra do travessão vale aqui também");
ok(/Não escreva nada entre parênteses/.test(p), "a dos parênteses também");

// ------------------------------------------------------------- formato e tom
for (const canal of ["whatsapp", "email", "ligacao"]) {
  const t = montaPromptCloser({ ...BASE, canal });
  ok(/FORMATO:/.test(t), `${canal} tem formato`);
  ok(/TOM:/.test(t), `${canal} tem tom`);
}
ok(/Primeira linha exatamente 'Assunto: /.test(montaPromptCloser({ ...BASE, canal: "email" })), "e-mail pede assunto");
ok(/roteiro para o closer falar/.test(montaPromptCloser({ ...BASE, canal: "ligacao" })), "ligação é roteiro");
ok(/primeira tentativa/.test(montaPromptCloser({ ...BASE, tentativa: 1 })), "tom da 1ª");
ok(/terceira e última/.test(montaPromptCloser({ ...BASE, tentativa: 9 })), "acima de 3 continua a 3ª");

// -------------------------------------------------------- contexto da PSA
const comCtx = montaPromptCloser({ ...BASE, contextoBase: "  A PSA nunca promete exclusividade.  " });
ok(/CONTEXTO DA PSA E DO PROCESSO/.test(comCtx), "o contexto institucional entra quando existe");
ok(/A PSA nunca promete exclusividade\./.test(comCtx), "e sem o espaço em volta");
ok(!/CONTEXTO DA PSA/.test(p), "sem contexto cadastrado, o bloco não aparece vazio");

console.log(falhou ? "\nFALHOU" : "\ntudo certo");
process.exit(falhou ? 1 : 0);
