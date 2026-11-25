// node lib/busca-web.check.mjs — o que se procura e o que volta da busca.
// Sem rede: depender de saldo para rodar teste é teste que ninguém roda.
const { noticiasDaResposta, termoDaNoticia, objetivoUtil, chaveDaNoticia, ehDoProprioCliente } = await import("./busca-web.js");

let falhou = false;
const ok = (cond, msg) => {
  if (!cond) falhou = true;
  console.log((cond ? "ok: " : "FALHOU: ") + msg);
};

// O que o time digita quando não tem o que digitar. Medido em 23/11/2026: de
// 200 negócios abertos com a propriedade preenchida, 33 traziam só isto.
ok(objetivoUtil(".") === "", "ponto sozinho não é objetivo");
ok(objetivoUtil("NA") === "", "NA não é objetivo");
ok(objetivoUtil("  n/a ") === "", "n/a não é objetivo");
ok(objetivoUtil("---") === "", "traço não é objetivo");
ok(objetivoUtil("A definir") === "", "a definir não é objetivo");
ok(objetivoUtil("SIPAT") === "SIPAT", "tema de uma palavra vale");
ok(objetivoUtil(" Palestra sobre   Fake News ") === "Palestra sobre Fake News", "espaço em volta sai e no meio junta");

// Com objetivo, quem acha o ponto chave é a busca: o texto do cliente mistura
// motivo, sentimento e formato, e o ponto pesquisável está no meio disso.
const OBJETIVO =
  "Realizar um evento de encerramento de ano após a reestruturação administrativa no órgão pela Lei nº 15.367. " +
  "Como você gostaria que os espectadores se sentissem: acolhidos e motivados";
const comObjetivo = termoDaNoticia(OBJETIVO, "Público / Governo", "Ministério da Cultura");
ok(comObjetivo.includes("Lei nº 15.367"), "o texto do cliente vai inteiro para a busca");
ok(/O cliente é: Ministério da Cultura/.test(comObjetivo), "o nome do cliente vai junto, senão acha a reforma errada");
ok(/termos pesquisáveis, como estão escritos/.test(comObjetivo), "e a ordem é copiar o termo como está escrito");
ok(/PROIBIDO trocar o termo por sinônimo/i.test(comObjetivo), "trocar o termo por descrição do assunto é proibido");
// Medido em produção: combinar o termo com o nome do cliente zerou o
// resultado, e o termo entre aspas sozinho achou.
ok(/entre aspas, SOZINHO/.test(comObjetivo), "a primeira busca é o termo sozinho entre aspas");
ok(/VÁRIAS buscas/.test(comObjetivo), "e é mais de uma busca, não uma só");
ok(/MESMO fato/.test(comObjetivo), "vale a matéria do mesmo fato, mesmo sem o termo no título");
// O que volta é matéria publicada. Texto de lei e página de portal saíram em
// 23/11/2026, depois de quatro rodadas medidas em que cada trava derrubava num
// buraco novo: repositório de órgão, PDF de universidade, formulário de busca
// da Câmara e índice do portal do Senado.
ok(/PROIBIDO texto de lei/.test(comObjetivo), "texto de lei não é o que se pede aqui");
ok(/índice, portal, lista de resultados/.test(comObjetivo), "nem índice nem portal nem lista de resultados");
ok(!comObjetivo.includes("setor Público / Governo"), "com objetivo preenchido o setor não manda");
ok(/sentimento/i.test(comObjetivo), "a parte de sentimento é mandada fora: não é assunto de notícia");
// Empresa sem nome no CRM não pode derrubar a busca nem deixar linha solta.
ok(!/O cliente é:/.test(termoDaNoticia(OBJETIVO, "", "")), "sem nome de cliente, a linha dele não aparece vazia");

// Sem objetivo, cai para o setor.
ok(
  termoDaNoticia("", "Financeiro") === "Busque notícias recentes do setor Financeiro no Brasil, dos últimos três meses.",
  "sem objetivo o termo amarra setor, país e recorte de tempo"
);
ok(termoDaNoticia(".", "  Agronegócio  ").includes("Agronegócio"), "objetivo lixo cai para o setor, com espaço aparado");
ok(termoDaNoticia("", "") === "", "sem objetivo e sem setor não monta termo");

// O texto longo não pode estourar o prompt da busca: só os 900 primeiros
// caracteres do que o cliente escreveu entram, o resto é a instrução fixa.
const gigante = termoDaNoticia("x".repeat(5000), "", "Empresa X");
ok(!gigante.includes("x".repeat(901)), "objetivo gigante entra cortado em 900");
ok(gigante.length < 2800, "e o que vai para a busca cabe no prompt");

// A chave do cache segue o que foi buscado: pelo objetivo a resposta é daquele
// negócio, pelo setor ela serve a todo negócio do setor naquele dia.
const { VERSAO_BUSCA } = await import("./busca-web.js");
ok(
  chaveDaNoticia({ dealId: "681", objetivo: OBJETIVO, segmento: "Público" }, "2026-11-23") ===
    `noticias:${VERSAO_BUSCA}:negocio:681:2026-11-23`,
  "com objetivo a chave é o negócio"
);
ok(
  chaveDaNoticia({ dealId: "681", objetivo: "NA", segmento: "Financeiro" }, "2026-11-23") ===
    `noticias:${VERSAO_BUSCA}:financeiro:2026-11-23`,
  "sem objetivo a chave é o setor, e dois negócios do mesmo setor compartilham"
);
// Sem a versão na chave, o resultado ruim ficaria guardado o dia inteiro e a
// correção só apareceria amanhã.
ok(
  chaveDaNoticia({ dealId: "681", objetivo: OBJETIVO }, "2026-11-23").includes(VERSAO_BUSCA),
  "a versão do que se pede à busca entra na chave"
);

// A busca devolve as fontes como anotações de url dentro do texto.
const RESPOSTA = {
  output: [
    {
      content: [
        {
          annotations: [
            { type: "url_citation", url: "https://valor.globo.com/a", title: "Bancos projetam alta" },
            // Repetida: o modelo cita a mesma matéria duas vezes e o closer
            // escolheria entre dois itens iguais.
            { type: "url_citation", url: "https://valor.globo.com/a", title: "Bancos projetam alta" },
            // Anotação que não é citação de url não tem link para mandar.
            { type: "file_citation", url: "https://exemplo.com/x", title: "Outra coisa" },
            { type: "url_citation", url: "https://www.exame.com/b", title: "Segunda" },
            { type: "url_citation", url: "https://infomoney.com.br/c", title: "Terceira" },
            { type: "url_citation", url: "https://estadao.com.br/d", title: "Quarta" },
            // A busca carimba o link com utm_source=openai, e ele ia inteiro
            // para o cliente dentro da mensagem.
            {
              type: "url_citation",
              url: "https://diariodocomercio.com.br/legislacao/lei-x/?id=7&utm_source=openai&utm_medium=x",
              title: "Lei reestrutura carreiras",
            },
          ],
        },
      ],
    },
  ],
};

const n = noticiasDaResposta(RESPOSTA, 3);
ok(n.length === 3, "respeita o máximo pedido");

// O rastreio sai; o que a página precisa para abrir fica.
const todas = noticiasDaResposta(RESPOSTA, 10);
const comUtm = todas.find((x) => x.url.includes("diariodocomercio"));
ok(!/utm_/.test(comUtm.url), "o carimbo da busca não vai para o cliente");
ok(comUtm.url.includes("id=7"), "e o parâmetro que a página usa fica");
ok(comUtm.fonte === "diariodocomercio.com.br", "a fonte segue sendo o domínio");
ok(new Set(n.map((x) => x.url)).size === 3, "link repetido entra uma vez só");
ok(!n.some((x) => x.url.includes("exemplo.com")), "anotação que não é citação de url fica de fora");
ok(n[0].fonte === "valor.globo.com", "a fonte é o domínio, que é o que diz se presta");
ok(n[1].fonte === "exame.com", "e o www sai do domínio");
ok(n[0].titulo === "Bancos projetam alta", "o título vem da citação");

// Página cujo título é um pedaço do corpo do texto. Visto em produção em
// 23/11/2026: entrou um parágrafo sobre ingresso de servidores do CPNU 2 no
// lugar de um título, e o prompt manda contar ao cliente o título da linha.
const PARAGRAFO = {
  output: [
    {
      content: [
        {
          annotations: [
            {
              type: "url_citation",
              url: "https://gov.br/nota",
              title:
                "Os órgãos participantes do CPNU 2 devem realizar o ingresso dos servidores por meio do " +
                "Sigepe Requerimento, observando o código aplicável: utilizar o código CPNU202501, quando...",
            },
            { type: "url_citation", url: "https://condsef.org.br/a", title: "Servidores da Cultura denunciam insegurança" },
          ],
        },
      ],
    },
  ],
};
const p = noticiasDaResposta(PARAGRAFO, 3);
ok(p.length === 1, "parágrafo no lugar do título fica de fora");
ok(p[0].fonte === "condsef.org.br", "e a manchete de verdade continua entrando");


// Página de busca e título ilegível. Os dois foram vistos em produção em
// 23/11/2026: a Câmara voltou com o formulário de pesquisa e o Senado com o
// título em caixinhas, e os dois iam para o cliente dentro da mensagem.
const RUINS = {
  output: [
    {
      content: [
        {
          annotations: [
            {
              type: "url_citation",
              url: "https://www.camara.leg.br/legislacao/busca?ano=2026&geral=tabela+de+valores",
              title: "Busca de legislação - Portal da Câmara dos Deputados",
            },
            { type: "url_citation", url: "https://legis.senado.leg.br/norma/42966204", title: "����" },
            { type: "url_citation", url: "https://agenciabrasil.ebc.com.br/x?materia=1", title: "Lei reestrutura carreiras" },
          ],
        },
      ],
    },
  ],
};
const limpos = noticiasDaResposta(RUINS, 10);
ok(limpos.length === 1, "formulário de pesquisa e título ilegível ficam de fora");
ok(limpos[0].fonte === "agenciabrasil.ebc.com.br", "e a matéria com query comum continua entrando");

ok(
  noticiasDaResposta({
    output: [{ content: [{ annotations: [{ type: "url_citation", url: "https://x.com/a" }] }] }],
  })[0]?.url === "https://x.com/a",
  "citação sem título ainda vale: o endereço entra no lugar dele"
);
ok(noticiasDaResposta(null).length === 0, "resposta vazia não quebra");
ok(noticiasDaResposta({ output: "nao e lista" }).length === 0, "nem saída que não é lista");
ok(
  noticiasDaResposta({ output: [{ content: [{ annotations: [{ type: "url_citation" }] }] }] }).length === 0,
  "citação sem url é descartada"
);

// O site do próprio cliente não é notícia. Visto em produção em 25/11/2026 na
// Rottas Construtora: a busca devolveu a home deles e a mensagem saiu dizendo
// que mandava a página da Rottas para a Rottas.
ok(ehDoProprioCliente('https://rottasconstrutora.com.br/rottas/', 'rottasconstrutora.com.br') === true, 'o site do cliente é reconhecido');
ok(ehDoProprioCliente('https://www.rottasconstrutora.com.br/x', 'rottasconstrutora.com.br') === true, 'com www também');
ok(ehDoProprioCliente('https://blog.rottasconstrutora.com.br/x', 'rottasconstrutora.com.br') === true, 'e o subdomínio dele também é dele');
ok(ehDoProprioCliente('https://rottasconstrutora.com.br/x', 'www.rottasconstrutora.com.br') === true, 'o www no cadastro não atrapalha');
ok(ehDoProprioCliente('https://valor.globo.com/rottas', 'rottasconstrutora.com.br') === false, 'matéria de jornal sobre ele continua valendo');
ok(ehDoProprioCliente('https://outrarottas.com.br/x', 'rottasconstrutora.com.br') === false, 'domínio parecido não é o mesmo');
ok(ehDoProprioCliente('https://valor.globo.com/a', '') === false, 'sem domínio cadastrado não corta nada');

const DO_CLIENTE = {
  output: [{ content: [{ annotations: [
    { type: 'url_citation', url: 'https://rottasconstrutora.com.br/rottas/', title: 'Home - Rottas Construtora' },
    { type: 'url_citation', url: 'https://valor.globo.com/a', title: 'Construtoras do PR projetam alta' },
  ] }] }],
};
const semOCliente = noticiasDaResposta(DO_CLIENTE, 3, { dominioDoCliente: 'rottasconstrutora.com.br' });
ok(semOCliente.length === 1, 'a home do cliente fica de fora');
ok(semOCliente[0].fonte === 'valor.globo.com', 'e a matéria de verdade entra');
ok(noticiasDaResposta(DO_CLIENTE, 3).length === 2, 'sem domínio cadastrado, nada é cortado');

const comDominio = termoDaNoticia(OBJETIVO, '', 'Rottas Construtora');
ok(/PROIBIDO o site do próprio cliente/.test(comDominio), 'a busca é avisada para não trazer o site do cliente');

console.log(falhou ? "\nFALHOU" : "\ntudo certo");
process.exit(falhou ? 1 : 0);
