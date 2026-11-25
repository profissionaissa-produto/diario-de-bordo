// Busca de notícia na web, para a estratégia "Conteúdo ou notícia do segmento".
//
// Entrega só a notícia, de propósito. A página oficial da lei chegou a entrar
// aqui em 23/11/2026 e saiu no mesmo dia: em quatro rodadas medidas no negócio
// 68100289579 ela voltou de um repositório interno de órgão, depois como PDF
// numa universidade, depois como formulário de busca da Câmara e depois como
// índice do portal do Senado. A busca escolhe a página que quiser dentro do
// domínio, e cada trava derrubava num buraco novo. Decisão do usuário: fica a
// notícia, que se repetiu certa, e a página da lei o closer cola à mão no
// campo de referência quando quiser.
//
// O que se procura vem, por ordem, de duas fontes:
//
// 1. "Objetivos do evento" do negócio, que é o que o próprio cliente escreveu
//    sobre o que o levou a procurar o tema. É ali que mora o ponto concreto:
//    uma lei, uma reestruturação, uma categoria profissional, um momento do
//    ano. Notícia sobre ESSE ponto fala da vida dele, não do mercado em geral.
// 2. O setor da empresa, quando o campo acima vem vazio ou com lixo.
//
// Medido em 23/11/2026, em 200 negócios abertos com a propriedade preenchida:
// 134 têm texto de 30 caracteres ou mais, 33 têm tema curto porém válido, e 33
// trazem só ".", "NA" ou traço. Daí o filtro de lixo e a queda para o setor.
//
// Usa a busca embutida da OpenAI, pela mesma chave que já escreve as mensagens
// do Diário. É o caminho que não pede nada novo: sem conta nova, sem cartão
// novo, sem chave que expira.
//
// O caminho anterior era o Custom Search do Google e morreu por fora: ele foi
// fechado para clientes novos, e projeto que nunca usou recebe 403
// PERMISSION_DENIED mesmo com tudo configurado certo. Medido em 23/11/2026,
// com a API ativada e as duas variáveis no lugar.
//
// Existe pelo mesmo motivo do lib/youtube.js: o modelo não navega sozinho na
// geração da mensagem. Pedir a notícia a ele devolvia manchete plausível e
// inexistente. Aqui a busca é um passo separado, e o que volta é link citado.

// Não chamar de URL: isso sombreia o construtor URL do runtime, e a extração
// do domínio passa a falhar calada dentro do try.
const ENDERECO = "https://api.openai.com/v1/responses";
// Busca não é escrita: o modelo pequeno basta e custa menos. Separado do
// OPENAI_MODELO de propósito, para trocar o modelo das mensagens não mexer
// aqui sem querer.
const MODELO = process.env.OPENAI_MODELO_BUSCA || "gpt-5-mini";

export const buscaWebPronta = () => !!(process.env.OPENAI_API_KEY || "").trim();

// O que o time digita quando não tem o que digitar. Mandar isso para a busca
// gastava a chamada para voltar manchete aleatória, que é pior do que cair
// para o setor.
const LIXO = /^(\.+|-+|_+|x|na|n\/a|nada|n[ãa]o informado|a definir|indefinido)$/i;

// O texto do cliente, limpo, ou vazio quando não dá para usar. Texto de uma ou
// duas palavras ainda serve: "SIPAT" e "Fake News" são tema de busca.
export function objetivoUtil(texto) {
  const t = String(texto || "").trim().replace(/\s+/g, " ");
  return t.length >= 4 && !LIXO.test(t) ? t : "";
}

// O que procurar. A extração do ponto chave é trabalho da própria busca: o
// texto do cliente é corrido e mistura motivo, sentimento e logística, e regex
// nenhuma acha "Lei nº 15.367" ali dentro sem errar na frase seguinte.
//
// Mas pedir só "o ponto pesquisável" não basta, e isso foi medido em produção
// em 23/11/2026, no negócio 68100289579: o texto citava a Lei nº 15.367, que
// internalizou os servidores do Ministério da Cultura, e a busca devolveu
// matéria sobre recomposição de cargos no Executivo federal, que é outra
// história. Faltavam duas coisas, e as duas estão aqui agora.
//
// A primeira é o nome do cliente: sem ele, "reestruturação" casa com qualquer
// reforma do país. A segunda é a ordem de buscar o termo LITERAL, número de
// lei e nome de órgão como estão escritos, antes de alargar para o tema.
//
// E a busca do termo junto com o nome do cliente zera o resultado, medido na
// mesma rodada: por isso o termo entre aspas sozinho vem primeiro.
//
// Sem o objetivo, cai para o setor. Notícia de setor envelhece rápido, e
// matéria de dois anos atrás numa mensagem de nutrição é pior do que nada.
export function termoDaNoticia(objetivo, segmento, empresa, { tema = "", palestrante = "" } = {}) {
  const o = objetivoUtil(objetivo);
  const quem = String(empresa || "").trim();
  const t = objetivoUtil(tema);
  const p = String(palestrante || "").trim();
  // Quando o texto do cliente é só sentimento, não há termo para procurar, e
  // foi aí que a busca devolveu a home do próprio cliente por falta de coisa
  // melhor. A saída é o palestrante falando do tema: isso existe, é público e
  // serve ao closer, que vai justamente propor aquele nome.
  const porPalestrante =
    p && t
      ? `Passo 4: se nada disso der termo concreto, porque o cliente só falou de sentimento, ` +
        `troque a busca para o palestrante com o tema: "${p}" e "${t}". ` +
        `Quero entrevista, artigo ou matéria em que ${p} fale sobre ${t}. ` +
        `PROIBIDO, nesse caso, página institucional, perfil de palestras e site de agência: quero conteúdo dele sobre o tema.`
      : "";
  if (o) {
    return [
      "Procure notícia sobre o fato concreto que ESTE cliente citou, não sobre o tema em geral.",
      quem ? `O cliente é: ${quem}.` : "",
      "Passo 1: copie do texto abaixo os termos pesquisáveis, como estão escritos. " +
        "Número e ano de lei, nome de órgão, de programa, de plano de cargos, de categoria profissional, datas. " +
        "PROIBIDO trocar o termo por sinônimo ou por descrição do assunto: " +
        'procurar "reestruturação administrativa" no lugar de "Lei 15.367" devolve a reforma errada.',
      "Passo 2: faça VÁRIAS buscas e junte o que achar. Para cada termo, nesta ordem:",
      "  a) o termo entre aspas, SOZINHO. Esta costuma ser a que acha, e combinar o termo com o nome do cliente costuma zerar o resultado;",
      "  b) o termo entre aspas mais uma ou duas palavras do texto do cliente;",
      quem ? `  c) o termo entre aspas mais "${quem}".` : "",
      "Passo 3: se nenhum termo achar nada, aí sim busque o assunto do texto em palavras suas.",
      porPalestrante,
      "Quero matéria publicada, de veículo de imprensa, de entidade de classe ou de sala de imprensa de órgão. " +
        "PROIBIDO texto de lei, formulário de pesquisa, índice, portal, lista de resultados e página inicial.",
      quem
        ? `PROIBIDO o site do próprio cliente, ${quem}, em qualquer página dele. ` +
          "Ele conhece o próprio site, e mandar isso de volta queima quem envia. " +
          "Quero o que SAIU SOBRE ele ou sobre o fato, escrito por outra pessoa."
        : "",
      "Vale a matéria que trate do MESMO fato, ainda que o título não repita o termo. " +
        "Descarte a que só divide o assunto genérico, como reforma, mudança ou mercado em geral.",
      "Ignore a parte que fala de sentimento e de formato do evento: ela não é assunto de notícia.",
      `O que o cliente escreveu: "${o.slice(0, 900)}"`,
    ]
      .filter(Boolean)
      .join("\n");
  }
  // Sem o texto do cliente, o palestrante com o tema vem antes do setor: ele é
  // o que o closer vai propor, e matéria de setor serve a qualquer empresa.
  if (p && t) {
    return [
      `Busque entrevista, artigo ou matéria em que ${p} fale sobre ${t}.`,
      `Faça as buscas com "${p}" entre aspas, somando ${t} e palavras do mesmo campo.`,
      "PROIBIDO página institucional, perfil de palestras e site de agência de palestrantes: " +
        "quero conteúdo em que ele fala do tema, não página que vende a palestra dele.",
      quem ? `PROIBIDO também o site de ${quem}, que é o cliente.` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }
  const s = String(segmento || "").trim();
  return s ? `Busque notícias recentes do setor ${s} no Brasil, dos últimos três meses.` : "";
}

// As citações da resposta viram o que o prompt usa. Função pura: é aqui que
// mora o formato, e testar isso não pode depender de rede nem de saldo.
//
// A busca devolve as fontes como anotações de url dentro do texto. Link
// repetido acontece quando o modelo cita a mesma matéria duas vezes, e entrar
// duas vezes na lista faria o closer escolher entre dois itens iguais.
// O site do próprio cliente não é notícia.
//
// Visto em produção em 25/11/2026 na Rottas Construtora: a busca devolveu
// "Home - Rottas Construtora", a home deles, e a mensagem saiu dizendo que
// estava mandando a página da Rottas para a Rottas. O cliente conhece o
// próprio site, e mandar isso queima o remetente.
//
// Compara pelo domínio sem o www e aceita subdomínio: blog.rottas.com.br
// também é deles.
export function ehDoProprioCliente(url, dominioDoCliente) {
  const d = String(dominioDoCliente || "").trim().toLowerCase().replace(/^www\./, "");
  if (!d) return false;
  const host = dominioDe(url).toLowerCase();
  return host === d || host.endsWith(`.${d}`);
}

export function noticiasDaResposta(json, max = 3, { dominioDoCliente = "" } = {}) {
  const saida = Array.isArray(json?.output) ? json.output : [];
  const vistos = new Set();
  const fora = [];

  for (const bloco of saida) {
    for (const parte of Array.isArray(bloco?.content) ? bloco.content : []) {
      for (const a of Array.isArray(parte?.annotations) ? parte.annotations : []) {
        const url = semRastreio(String(a?.url || "").trim());
        if (!url || a?.type !== "url_citation" || vistos.has(url)) continue;
        const titulo = String(a.title || "").trim();
        if (!tituloDeVerdade(titulo) || !paginaDeVerdade(url)) continue;
        if (ehDoProprioCliente(url, dominioDoCliente)) continue;
        vistos.add(url);
        fora.push({
          titulo: titulo || url,
          // O domínio é o que diz ao closer se a fonte presta antes de ele
          // mandar o link para um cliente.
          fonte: dominioDe(url),
          resumo: "",
          url,
        });
      }
    }
  }
  return fora.slice(0, max);
}

// Há página cujo título vem como um pedaço do corpo do texto, cortado no meio.
// Visto em produção em 23/11/2026: a lista do closer trouxe um parágrafo sobre
// ingresso de servidores do CPNU 2 no lugar de um título. O prompt manda contar
// ao cliente o título da linha escolhida, então parágrafo ali vira frase sem pé
// nem cabeça na mensagem.
//
// Manchete de verdade não passa de 140 caracteres e não termina em reticências.
// Título vazio continua valendo: o endereço entra no lugar dele.
//
// Título ilegível também cai. Visto na mesma data: o Senado voltou com o título
// em caixinhas, e isso ia para o cliente como se fosse o nome do material.
function tituloDeVerdade(titulo) {
  if (!titulo) return true;
  if (titulo.length > 140 || /(\.\.\.|…)$/.test(titulo)) return false;
  return !/[�□\u0000-\u0008]/.test(titulo);
}

// Página de busca não é matéria. Visto em produção em 23/11/2026: a busca citou
// "Busca de legislação - Portal da Câmara dos Deputados", que é o formulário de
// pesquisa, e a mensagem mandou aquilo ao cliente como referência.
const PAGINA_DE_BUSCA = /(\/|^)(busca|buscar|pesquisa|pesquisar|search|consulta)(\/|$|\?)/i;
const QUERY_DE_BUSCA = /(^|&)(q|query|termo|geral|palavra|texto|busca)=/i;

function paginaDeVerdade(url) {
  try {
    const u = new URL(url);
    return !PAGINA_DE_BUSCA.test(u.pathname) && !QUERY_DE_BUSCA.test(u.search.slice(1));
  } catch {
    return true;
  }
}

const dominioDe = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};

// A busca devolve o link carimbado com ?utm_source=openai, e esse link vai
// inteiro para o cliente dentro da mensagem. Cliente não precisa ver de onde
// o closer tirou a matéria, e tirar o rastreio não muda a página aberta.
//
// Só os parâmetros de campanha saem: há site que precisa de id ou página na
// query, e cortar a query toda levaria o leitor para o lugar errado.
function semRastreio(url) {
  try {
    const u = new URL(url);
    for (const k of [...u.searchParams.keys()]) {
      if (/^(utm_|fbclid$|gclid$|igshid$|ref$|source$)/i.test(k)) u.searchParams.delete(k);
    }
    return u.toString();
  } catch {
    return url;
  }
}

// Muda junto com o que se pede à busca. Sem isto, o resultado ruim de hoje
// ficaria guardado o dia inteiro e a correção só apareceria amanhã.
export const VERSAO_BUSCA = "2026-11-25b";

// A chave do cache, e ela segue o que foi buscado.
//
// Pelo objetivo do evento, a busca é daquele negócio e de mais nenhum: a chave
// é o negócio. Pelo setor, a resposta serve a todo closer e todo negócio
// daquele setor hoje, e a chave é o setor. Sem cache, cada mensagem gastava
// perto de um minuto e uma chamada paga para repetir a resposta anterior.
// O palestrante entra na chave porque a busca pode cair nele: trocar de
// palestrante na tela tem que trocar o resultado, senão o closer vê a matéria
// do nome anterior.
export const chaveDaNoticia = ({ dealId, objetivo, segmento, palestrante }, dia) => {
  const quem = String(palestrante || "").trim().toLowerCase();
  const sufixo = quem ? `:${quem}` : "";
  return objetivoUtil(objetivo)
    ? `noticias:${VERSAO_BUSCA}:negocio:${String(dealId || "")}${sufixo}:${dia}`
    : `noticias:${VERSAO_BUSCA}:${String(segmento || "").trim().toLowerCase()}${sufixo}:${dia}`;
};

export async function buscaNoticias({ objetivo, segmento, empresa, dominio, tema, palestrante }, max = 3) {
  const chave = (process.env.OPENAI_API_KEY || "").trim();
  if (!chave) throw new Error("OPENAI_API_KEY não está definida no ambiente.");
  const termo = termoDaNoticia(objetivo, segmento, empresa, { tema, palestrante });
  if (!termo) return [];

  const res = await fetch(ENDERECO, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${chave}` },
    body: JSON.stringify({
      model: MODELO,
      tools: [{ type: "web_search" }],
      // Força a busca: sem isto o modelo às vezes responde de memória, e
      // memória não tem link.
      tool_choice: { type: "web_search" },
      // Aqui não se pensa, se procura. O raciocínio longo dobrava o tempo
      // sem melhorar a lista de matérias.
      reasoning: { effort: "low" },
      input:
        `${termo}\n\nListe até ${max} matérias, só o título e o veículo, sem resumo. ` +
        "Nada de release nem página de produto. " +
        "Uma matéria certa já serve; três que não falam do fato não servem.",
    }),
  });

  const texto = await res.text();
  let corpo = null;
  try {
    corpo = texto ? JSON.parse(texto) : null;
  } catch {
    // Resposta que não é JSON não tem o que extrair; o status diz o bastante.
  }
  if (!res.ok) {
    console.error(`[busca-web] ${res.status}: ${corpo?.error?.message || res.statusText}`);
    const e = new Error(corpo?.error?.message || `A busca na web respondeu ${res.status}.`);
    e.bruto = corpo?.error || { status: res.status };
    throw e;
  }
  return noticiasDaResposta(corpo, max, { dominioDoCliente: dominio });
}
