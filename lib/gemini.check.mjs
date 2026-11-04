// node lib/gemini.check.mjs — o prompt. A resposta do modelo não dá para
// testar, mas o que vai nela dá, e foi ali que a mensagem saiu genérica: a
// abordagem escolhida na tela não chegava ao prompt.
const { montaPrompt, tempoDesde, leErroDeCota } = await import("./gemini.js");
const { BALDES, OBJETIVO_ABORDAGEM, ABORDAGENS } = await import("./carteira.js");

let falhou = false;
const ok = (cond, msg) => {
  if (!cond) falhou = true;
  console.log((cond ? "ok: " : "FALHOU: ") + msg);
};

const HOJE = new Date("2026-11-04T12:00:00Z");
ok(tempoDesde("2025-12-01", HOJE) === "há 11 meses", "quase um ano vira 'há 11 meses'");
ok(tempoDesde("2026-10-01", HOJE) === "há 1 mês", "mês único no singular");
ok(tempoDesde("2026-10-28", HOJE) === "neste mês", "compra recente não vira contagem de meses");
ok(tempoDesde("2024-11-04", HOJE) === "há 2 anos", "dois anos redondos");
ok(tempoDesde("2024-08-04", HOJE) === "há 2 anos e 3 meses", "ano com resto de meses");
ok(tempoDesde("") === "" && tempoDesde("texto") === "", "sem data não inventa tempo");

const caso = {
  empresa: "Grupo Comolatti",
  contato: { nome: "Juliana Takeuti", cargo: "Gerente" },
  canal: "whatsapp",
  tentativa: 2,
  abordagem: "OFERTA PARA REATIVAÇÃO",
  objetivoAbordagem: OBJETIVO_ABORDAGEM["OFERTA PARA REATIVAÇÃO"],
  fase: BALDES.recompra.label,
  faseFaixa: BALDES.recompra.faixa,
  ultimaCompra: "2025-12-01",
};
const p = montaPrompt(caso);

// O que faltava e gerou a reclamação.
ok(p.includes("OFERTA PARA REATIVAÇÃO"), "a abordagem escolhida entra no prompt");
ok(p.includes(OBJETIVO_ABORDAGEM["OFERTA PARA REATIVAÇÃO"]), "o objetivo da abordagem entra junto");
ok(p.includes("Recompra"), "a fase da carteira entra");
ok(p.includes("8 a 12 meses"), "a faixa da fase entra, para a mensagem saber o que a fase significa");

// A data crua sozinha não diz nada; o tempo decorrido é o que o cliente sente.
ok(p.includes("há 11 meses"), "o tempo desde a última compra entra em palavras");
ok(p.includes("01/12/2025"), "a data também entra, para o modelo não recontar");
ok(p.includes('Escreva "há 11 meses", nunca a data crua'), "a regra manda usar o tempo, não a data");

// O que a mensagem anterior fez de errado vira proibição explícita.
ok(p.includes("fico pensando aqui"), "a abertura vazia que saiu antes está proibida por escrito");
ok(p.includes("PROIBIDO inventar"), "inventar palestrante, data ou valor está proibido");
ok(p.includes("Não use travessão."), "a regra do travessão vai no prompt");

ok(p.includes("Tentativa 2 de 3"), "a tentativa entra com o teto do canal");
ok(p.includes("TOM: segunda tentativa"), "o tom acompanha o número da tentativa");
ok(p.includes("FORMATO: mensagem de WhatsApp"), "o formato é o do canal escolhido");
ok(!p.includes("FORMATO: e-mail"), "formato de outro canal não vaza");

// Cada canal pede uma coisa diferente.
const pe = montaPrompt({ ...caso, canal: "email" });
ok(pe.includes("Assunto: ..."), "o e-mail pede a linha de assunto");
ok(pe.includes("nunca genérico"), "o e-mail proíbe assunto genérico");
const pl = montaPrompt({ ...caso, canal: "ligacao" });
ok(pl.includes("Se disser não:"), "o roteiro de ligação tem a saída para o não");
ok(pl.includes("não texto para enviar"), "o roteiro deixa claro que é para falar");

// Empresa que nunca comprou não pode receber "há X meses".
const novo = montaPrompt({ ...caso, ultimaCompra: null, fase: BALDES.primeiro_contato.label });
ok(novo.includes("Nunca comprou"), "sem compra o prompt diz que nunca comprou");
ok(!novo.includes("há "), "sem compra não aparece tempo decorrido");

// Sem abordagem o prompt não finge que tem uma.
const semAb = montaPrompt({ ...caso, abordagem: null, objetivoAbordagem: null });
ok(semAb.includes("Sem abordagem definida"), "sem abordagem o prompt assume retomada");

// Toda abordagem da tela precisa de objetivo, senão o modelo lê só o rótulo.
for (const a of ABORDAGENS) {
  ok(!!OBJETIVO_ABORDAGEM[a], `a abordagem "${a}" tem objetivo escrito`);
}

// O contexto institucional é a camada que impede a mensagem de sair
// desconexa quando o caso concreto diz pouco.
const comBase = montaPrompt({ ...caso, contextoBase: "A PSA cobra cachê do palestrante mais despesas." });
ok(comBase.includes("CONTEXTO DA PSA E DO PROCESSO"), "o contexto institucional entra no prompt");
ok(comBase.includes("A PSA cobra cachê do palestrante mais despesas."), "o texto do contexto vai inteiro");
ok(
  comBase.indexOf("CONTEXTO DA PSA") < comBase.indexOf("DADOS DESTA EMPRESA"),
  "o contexto vem antes dos dados da empresa"
);
ok(!p.includes("CONTEXTO DA PSA"), "sem contexto cadastrado o bloco não aparece");

// O 429 do Google diz o motivo e o tempo de espera. A tela precisa disso em
// português, não de um "veja o log".
const porMinuto = leErroDeCota(JSON.stringify({ error: { code: 429, details: [
  { "@type": "type.googleapis.com/google.rpc.QuotaFailure", violations: [{ quotaId: "GenerateRequestsPerMinutePerProjectPerModel" }] },
  { "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "18s" },
] } }));
ok(porMinuto.segundos === 18, "o tempo de espera é lido do erro");
ok(!porMinuto.porDia, "limite por minuto não é confundido com cota do dia");
ok(porMinuto.mensagem.includes("18 segundos"), "a espera aparece na mensagem da tela");

const porDia = leErroDeCota(JSON.stringify({ error: { details: [
  { "@type": "type.googleapis.com/google.rpc.QuotaFailure", violations: [{ quotaId: "GenerateRequestsPerDayPerProjectPerModel" }] },
] } }));
ok(porDia.porDia, "cota do dia é reconhecida");
ok(porDia.mensagem.includes("cota diária"), "a mensagem do dia fala em cota diária");
ok(!porDia.mensagem.includes("segundos"), "cota do dia não promete espera curta");

ok(leErroDeCota("<html>502</html>").mensagem.length > 0, "corpo que não é JSON ainda vira mensagem");
ok(leErroDeCota("").segundos === 0, "sem RetryInfo não inventa tempo");

console.log(falhou ? "gemini: tem falha." : "gemini: tudo certo.");
process.exit(falhou ? 1 : 0);
