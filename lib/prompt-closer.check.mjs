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


// ----------------------------------------- contra o "texto corrido"
// Reclamação direta do time em 23/11/2026: a mensagem dizia tudo certo e soava
// relatório. As quatro causas, cada uma virou regra.
ok(/SEPARADOS POR LINHA EM BRANCO/.test(montaPromptCloser({ ...BASE, canal: "whatsapp" })),
  "WhatsApp sai em blocos, não em parede de texto");
ok(/PROIBIDO ponto e vírgula/.test(montaPromptCloser({ ...BASE, canal: "whatsapp" })),
  "ponto e vírgula fora: é o que mais cola duas ideias numa frase só");
ok(/palavras que o PRÓPRIO CLIENTE usou/.test(p), "manda usar o vocabulário do cliente");
ok(/PROIBIDO explicar o encaixe por adjetivo/.test(p), "encaixe se explica por fato, não por adjetivo");
ok(/tem o tom leve que você quer/.test(p), "e o exemplo que saiu de verdade está citado");
ok(/PROIBIDO narrar de volta a logística/.test(p), "não repete o que o cliente já sabe");
ok(/conforme combinado/.test(p), "frase de escritório está nomeada para ser evitada");


// --------------------------------------- quem assina é o dono do negócio
// O resumo do Copiloto narra o closer em terceira pessoa. Sem esta regra saía
// "o João consultou os palestrantes" numa mensagem assinada pelo próprio João,
// porque o modelo copiava a forma do resumo.
const comDono = montaPromptCloser({ ...BASE, remetente: "João" });
ok(/VOCÊ É João/.test(comDono), "o prompt diz quem a pessoa é, não só quem assina");
ok(/Onde ele diz "João", a mensagem diz "eu"/.test(comDono), "e manda trocar para primeira pessoa");
ok(/PROIBIDO escrever sobre si mesmo em terceira pessoa/.test(comDono), "escrever de si em terceira pessoa é proibido");
ok(
  !/terceira pessoa/.test(montaPromptCloser({ ...BASE, remetente: "" })),
  "sem nome de quem assina, a regra não aparece falando de ninguém"
);


// ------------------------------------------- notícia do segmento do cliente
// A estratégia pede notícia do setor DA EMPRESA do negócio, não notícia em
// geral. O setor mora na empresa, não no negócio, e está vazio em boa parte
// da base: 19.983 empresas sem ele, medido em 23/11/2026.
const DE_NOTICIA = { titulo: "Nutrição - Conteúdo ou notícia do segmento", desc: "x" };
const comSegmento = montaPromptCloser({
  ...BASE,
  empresaNome: "Banco ABC Brasil",
  segmento: "Financeiro",
  estrategia: DE_NOTICIA,
});
ok(/Empresa do cliente: Banco ABC Brasil/.test(comSegmento), "a empresa do negócio entra no prompt");
ok(/Segmento de mercado dela: Financeiro/.test(comSegmento), "e o segmento dela também");
ok(/TEM que ser do setor de Financeiro/.test(comSegmento), "o assunto é amarrado ao setor do cliente");
ok(/PROIBIDO assunto genérico de mercado/.test(comSegmento), "e assunto genérico fica proibido");

// Sem segmento no CRM, deduzir pelo nome da empresa é chute. "Banco" no nome
// sugere financeiro, mas sugerir não é saber, e chegar com o setor errado é
// pior do que perguntar.
const semSegmento = montaPromptCloser({ ...BASE, empresaNome: "Banco ABC Brasil", estrategia: DE_NOTICIA });
ok(/PROIBIDO deduzir o setor pelo nome/.test(semSegmento), "sem segmento, proíbe deduzir pelo nome");
ok(!/TEM que ser do setor de/.test(semSegmento), "e não manda falar de setor nenhum");

// A regra é só desta estratégia: nas outras, segmento é contexto, não pauta.
ok(
  !/TEM que ser do setor de/.test(
    montaPromptCloser({ ...BASE, segmento: "Financeiro", estrategia: { titulo: "Pré-briefing", desc: "x" } })
  ),
  "em outra estratégia a regra do setor não aparece"
);

// ---------------------------------------- o que o cliente escreveu do evento
// "Objetivos do evento" vem acima do setor: o setor serve para qualquer
// empresa dele, o motivo que o cliente deu serve só para ele. Caso real do
// Ministério da Cultura, negócio 68100289579.
const OBJETIVO =
  "O que motivou a procurar por essa tematica: Realizar um evento de encerramento de ano após um " +
  "período de reestruturação administrativa no órgão (centralização dos servidores pela Lei nº 15.367)";
const comObjetivo = montaPromptCloser({
  ...BASE,
  empresaNome: "Ministério da Cultura",
  segmento: "Público / Governo",
  objetivoEvento: OBJETIVO,
  temaEvento: "Motivação",
  estrategia: DE_NOTICIA,
});
ok(/Lei nº 15\.367/.test(comObjetivo), "o que o cliente escreveu entra inteiro no prompt");
ok(/Tema do evento: Motivação/.test(comObjetivo), "e o tema do evento também");
ok(/amarrar com o que o cliente escreveu/.test(comObjetivo), "o assunto é amarrado ao que ele escreveu");
ok(!/TEM que ser do setor de/.test(comObjetivo), "com objetivo preenchido, o setor não manda na pauta");

// Lixo na propriedade é como propriedade vazia: cai para o setor.
const objetivoLixo = montaPromptCloser({ ...BASE, segmento: "Financeiro", objetivoEvento: ".", estrategia: DE_NOTICIA });
ok(/TEM que ser do setor de Financeiro/.test(objetivoLixo), "objetivo com ponto sozinho cai para o setor");
ok(!/O que o cliente escreveu sobre o evento dele/.test(objetivoLixo), "e o lixo não vira contexto no prompt");

// Sem os dois, não há pauta para chegar com assunto nenhum.
const semNada = montaPromptCloser({ ...BASE, estrategia: DE_NOTICIA });
ok(/Nem os objetivos do evento nem o segmento/.test(semNada), "sem objetivo e sem setor, a regra diz que faltam os dois");

console.log(falhou ? "\nFALHOU" : "\ntudo certo");
process.exit(falhou ? 1 : 0);
