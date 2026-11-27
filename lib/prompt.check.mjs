// node lib/prompt.check.mjs — o prompt que vai para a IA. A resposta do
// modelo não dá para testar, mas o que vai nela dá, e foi ali que a mensagem
// saiu genérica: a abordagem escolhida na tela não chegava ao prompt.
// Vale para qualquer provedor: o prompt é o mesmo.
const { montaPrompt } = await import("./prompt.js");
const { tempoDesde } = await import("./tempo.js");
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
// A frase vem do relógio de hoje, não escrita à mão: montaPrompt usa a data
// corrente, então "há 11 meses" cravado aqui quebrava sozinho ao virar o ano.
const desde = tempoDesde(caso.ultimaCompra);
ok(p.includes(desde), "o tempo desde a última compra entra em palavras");
ok(p.includes("01/12/2025"), "a data também entra, para o modelo não recontar");
ok(p.includes(`Escreva "${desde}", nunca a data crua`), "a regra manda usar o tempo, não a data");

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
// Procura o tempo decorrido em si, "há 11 meses", e não a palavra "há" solta:
// ela aparece em prosa legítima, como "Não há registro de quem palestrou".
ok(!/há \d+ (dia|mês|mes|meses|ano)/i.test(novo), "sem compra não aparece tempo decorrido");

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

// ---------------------------------------- o farmer não faz proposta ao cliente
// Veio de uma mensagem real para a ANFARMAG em 27/11/2026: ela oferecia
// "palestra de 60 minutos com foco em recuperação de clientes" e perguntava se
// podia mandar a proposta. Nada disso é papel do farmer.
const comHistorico = montaPrompt({
  ...caso,
  contratacao: { palestrantes: ["Leandro Karnal"], tema: "Liderança" },
});
ok(/VOCÊ NÃO FAZ PROPOSTA/.test(comHistorico), "o prompt diz que o farmer não faz proposta");
ok(/PROIBIDO oferecer palestra, formato, duração/.test(comHistorico), "e proíbe oferecer formato e duração");
ok(/Quem monta proposta é o closer/.test(comHistorico), "e nomeia de quem é esse papel");

// A abordagem é decisão interna. Contá-la ao cliente entrega que ele entrou
// numa lista, que foi a segunda reclamação da mesma mensagem.
ok(/PROIBIDO contar ao cliente a estratégia ou a abordagem/.test(comHistorico), "a abordagem do dia não vai para o cliente");
ok(/reativar clientes parados/.test(comHistorico), "e a frase que vazou está nomeada como exemplo do que não dizer");

// Com histórico, a mensagem cita quem palestrou. É o que a tira do genérico.
ok(/quem palestrou foi: Leandro Karnal/.test(comHistorico), "quem palestrou da última vez entra nos dados");
ok(/O tema daquele evento foi: Liderança/.test(comHistorico), "e o tema também");
ok(/TEM que citar pelo nome quem palestrou/.test(comHistorico), "e a regra manda citar o nome");

// Sem histórico, não inventa. Medido em 26/11/2026: de 200 empresas com
// última compra, só 80 têm item de linha, que é onde mora o palestrante.
const semHistorico = montaPrompt({ ...caso, contratacao: null });
ok(/Não há registro de quem palestrou/.test(semHistorico), "sem registro o prompt diz isso com todas as letras");
ok(!/TEM que citar pelo nome quem palestrou/.test(semHistorico), "e não manda citar nome nenhum");
ok(/PROIBIDO inventar nome de palestrante/.test(semHistorico), "inventar palestrante fica proibido");



console.log(falhou ? "prompt: tem falha." : "prompt: tudo certo.");
process.exit(falhou ? 1 : 0);