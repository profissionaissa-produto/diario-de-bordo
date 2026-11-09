// node lib/prompt-financeiro.check.mjs — o prompt da cobrança.
//
// O que este arquivo protege é o que já deu errado na carteira: prompt que
// recebe o dado e não o usa sai genérico, e ninguém percebe porque o texto
// parece bom. Aqui cada critério que o time pediu tem que aparecer no prompt.
const { montaPromptFinanceiro } = await import("./prompt-financeiro.js");

let falhou = false;
const ok = (cond, msg) => {
  if (!cond) falhou = true;
  console.log((cond ? "ok: " : "FALHOU: ") + msg);
};

const BASE = {
  cliente: "ADOP",
  palestrante: "Nelson Freitas",
  evento: "2026-01-30",
  etapa: "Solicitar NF do palestrante",
  destino: "contratante",
  contato: { nome: "Camila Melo", cargo: "Financeiro" },
  canal: "whatsapp",
  tentativa: 1,
  abordagem: "Cobrar o pagamento",
  estrategia: { titulo: "Lembrete cordial no vencimento", desc: "Tom cordial, com o valor e a data." },
  situacao: "vencida",
  dias: 353,
  parcela: 1,
  totalParcelas: 2,
  data: "2025-11-21",
  valor: 30000,
  cache: 30000,
  remetente: "Yaskara",
};

const p = montaPromptFinanceiro(BASE);

// ------------------------------------------- os critérios pedidos pelo time
ok(p.includes("ADOP"), "o cliente entra no prompt");
ok(p.includes("Nelson Freitas"), "o palestrante entra no prompt");
ok(p.includes("Solicitar NF do palestrante"), "a etapa entra no prompt");
ok(p.includes("Cobrar o pagamento"), "a abordagem entra no prompt");
ok(p.includes("Lembrete cordial no vencimento"), "a estratégia entra pelo título");
ok(p.includes("Tom cordial, com o valor e a data."), "e pela instrução dela, que é o que manda agir");
ok(p.includes("Camila Melo"), "o contato entra no prompt");
ok(p.includes("Financeiro"), "o cargo do contato entra junto");
ok(/Tentativa 1 de 3/.test(p), "a tentativa entra no prompt");
ok(/Canal: whatsapp/.test(p), "o canal entra no prompt");

// --------------------------------------------------- vencida contra prevista
ok(p.includes("21/11/2025"), "a data da parcela sai em português");
ok(p.includes("353 dias"), "os dias de atraso entram escritos");
ok(/1ª parcela de 2/.test(p), "diz qual parcela de quantas");
ok(/data já passou/.test(p), "vencida manda dizer que a data passou");

const prev = montaPromptFinanceiro({ ...BASE, situacao: "prevista", dias: -5, data: "2026-11-14" });
ok(/daqui a 5 dias/.test(prev), "prevista conta o que falta, não o que passou");
ok(/é lembrete, não cobrança/.test(prev), "prevista proíbe acusar");
ok(/PROIBIDO escrever atraso/.test(prev), "prevista proíbe a palavra atraso");
ok(!/data já passou/.test(prev), "prevista não manda dizer que passou");

const hoje = montaPromptFinanceiro({ ...BASE, situacao: "hoje", dias: 0, data: "2026-11-09" });
ok(/vence hoje, 09\/11\/2026/.test(hoje), "vence hoje é dito como hoje");

const sem = montaPromptFinanceiro({ ...BASE, situacao: "sem-data", data: "", dias: null });
ok(/não há data de pagamento combinada/.test(sem), "sem data diz que não há data");
ok(/serve para combinar uma/.test(sem), "sem data vira conversa para combinar, não cobrança");

// ----------------------------------------------- contratante ou palestrante
ok(/CLIENTE CONTRATANTE, que é quem paga a PSA/.test(p), "para o cliente, diz que ele é quem paga");
ok(/Valor total do contrato: R\$/.test(p), "para o cliente, entra o valor do contrato");
ok(!/Cachê a pagar/.test(p), "para o cliente, o cachê do palestrante fica de fora");

const pal = montaPromptFinanceiro({
  ...BASE,
  destino: "palestrante",
  abordagem: "Pedir a NF ao palestrante",
  contato: { nome: "Nelson Freitas" },
});
ok(/lado do PALESTRANTE/.test(pal), "para o palestrante, diz de que lado ele está");
ok(/PROIBIDO tratá-lo como devedor/.test(pal), "o palestrante não é devedor, a PSA é que paga");
ok(/Cachê a pagar ao palestrante: R\$/.test(pal), "para o palestrante, entra o cachê");
ok(!/Valor total do contrato/.test(pal), "para o palestrante, o valor do contrato fica de fora");

// ----------------------------------------- o que não pode ser inventado
ok(/PROIBIDO citar multa, juros ou percentual/.test(p), "multa e juros não existem no sistema");
const semValor = montaPromptFinanceiro({ ...BASE, valor: 0 });
ok(/PROIBIDO inventar valor/.test(semValor), "sem valor no ticket, proíbe inventar quantia");
ok(!/Valor total do contrato/.test(semValor), "e não escreve um valor zerado nos dados");
const semCache = montaPromptFinanceiro({ ...BASE, destino: "palestrante", cache: 0 });
ok(/O cachê não está preenchido/.test(semCache), "sem cachê, proíbe inventar também");
ok(/PROIBIDO inventar: número de nota, dados bancários/.test(p), "dados de pagamento não se inventam");
ok(/Não use travessão/.test(p), "a regra do travessão vale aqui também");

// ------------------------------------------------------------- formato e tom
for (const canal of ["whatsapp", "email", "ligacao"]) {
  const t = montaPromptFinanceiro({ ...BASE, canal });
  ok(/FORMATO:/.test(t), `${canal} tem formato`);
  ok(/TOM:/.test(t), `${canal} tem tom`);
}
ok(/mensagem de WhatsApp/.test(montaPromptFinanceiro({ ...BASE, canal: "whatsapp" })), "WhatsApp é mensagem curta");
ok(/Primeira linha exatamente 'Assunto: /.test(montaPromptFinanceiro({ ...BASE, canal: "email" })), "e-mail pede assunto");
ok(
  /roteiro para falar ao telefone/.test(montaPromptFinanceiro({ ...BASE, canal: "ligacao" })),
  "ligação é roteiro, não texto para enviar"
);
// O discador é o do HubSpot e não vai ter outro: o roteiro é o produto aqui.
ok(
  /Se não puder pagar agora:/.test(montaPromptFinanceiro({ ...BASE, canal: "ligacao" })),
  "o roteiro da ligação tem saída para quem não pode pagar na hora"
);

ok(/primeira tentativa/.test(montaPromptFinanceiro({ ...BASE, tentativa: 1 })), "tom da 1ª");
ok(/segunda tentativa/.test(montaPromptFinanceiro({ ...BASE, tentativa: 2 })), "tom da 2ª");
ok(/terceira e última/.test(montaPromptFinanceiro({ ...BASE, tentativa: 3 })), "tom da 3ª");
ok(/terceira e última/.test(montaPromptFinanceiro({ ...BASE, tentativa: 9 })), "acima de 3 continua a 3ª");
ok(/primeira tentativa/.test(montaPromptFinanceiro({ ...BASE, tentativa: 0 })), "tentativa zero não quebra");

// -------------------------------------------------------- contexto da PSA
const comCtx = montaPromptFinanceiro({ ...BASE, contextoBase: "  A PSA nunca promete desconto.  " });
ok(/CONTEXTO DA PSA E DO PROCESSO/.test(comCtx), "o contexto institucional entra quando existe");
ok(/A PSA nunca promete desconto\./.test(comCtx), "e entra sem o espaço em volta");
ok(!/CONTEXTO DA PSA/.test(p), "sem contexto cadastrado, o bloco não aparece vazio");

console.log(falhou ? "\nFALHOU" : "\ntudo certo");
process.exit(falhou ? 1 : 0);
