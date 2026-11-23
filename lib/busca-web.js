// Busca na web para a estratégia "Conteúdo ou notícia do segmento". São as
// duas coisas, como o nome diz: a matéria de imprensa e o conteúdo de
// referência, que é a página oficial da lei, da norma ou da portaria que o
// cliente citou.
//
// O que se procura vem, por ordem, de duas fontes:
//
// 1. "Objetivos do evento" do negócio, que é o que o próprio cliente escreveu
//    sobre o que o levou a procurar o tema. É ali que mora o ponto concreto:
//    uma lei, uma reestruturação, uma categoria profissional, um momento do
//    ano. Material sobre ESSE ponto fala da vida dele, não do mercado em geral.
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
// Sem o objetivo, cai para o setor. Notícia de setor envelhece rápido, e
// matéria de dois anos atrás numa mensagem de nutrição é pior do que nada.
export function termoDaNoticia(objetivo, segmento, empresa) {
  const o = objetivoUtil(objetivo);
  const quem = String(empresa || "").trim();
  if (o) {
    return [
      "Procure material sobre o fato concreto que ESTE cliente citou, não sobre o tema em geral.",
      "Serve notícia de imprensa e serve conteúdo de referência: a página oficial da lei, da norma, " +
        "da portaria ou do programa citado. Os dois entram na mesma lista. " +
        "Para texto de lei, prefira nesta ordem planalto.gov.br, camara.leg.br e legis.senado.leg.br, " +
        "que são as páginas que o cliente reconhece, e não um repositório interno de órgão.",
      quem ? `O cliente é: ${quem}.` : "",
      "Passo 1: copie do texto abaixo os termos pesquisáveis, como estão escritos. " +
        "Número e ano de lei, nome de órgão, de programa, de plano de cargos, de categoria profissional, datas. " +
        "PROIBIDO trocar o termo por sinônimo ou por descrição do assunto: " +
        'procurar "reestruturação administrativa" no lugar de "Lei 15.367" devolve a reforma errada.',
      "Passo 2: faça VÁRIAS buscas e junte o que achar. Para cada termo, nesta ordem:",
      '  a) o termo entre aspas, SOZINHO. Esta costuma ser a que acha, e combinar o termo com o nome do cliente costuma zerar o resultado;',
      "  b) o termo entre aspas mais uma ou duas palavras do texto do cliente;",
      quem ? `  c) o termo entre aspas mais "${quem}".` : "",
      "Passo 3: se o texto do cliente citar lei, norma, portaria ou programa, inclua também a página " +
        "oficial dela na lista, junto com as matérias. Tem que ser a página do texto em si. " +
        "PROIBIDO mandar formulário de pesquisa, índice, portal, lista de resultados ou página inicial.",
      "Passo 4: se nenhum termo achar nada, aí sim busque o assunto do texto em palavras suas.",
      "Vale o item que trate do MESMO fato, ainda que o título não repita o termo. " +
        "Descarte o que só divide o assunto genérico, como reforma, mudança ou mercado em geral.",
      "Ignore a parte que fala de sentimento e de formato do evento: ela não é assunto de notícia.",
      `O que o cliente escreveu: "${o.slice(0, 900)}"`,
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
export function noticiasDaResposta(json, max = 3) {
  const saida = Array.isArray(json?.output) ? json.output : [];
  const vistos = new Set();
  const fora = [];

  for (const bloco of saida) {
    for (const parte of Array.isArray(bloco?.content) ? bloco.content : []) {
      for (const a of Array.isArray(parte?.annotations) ? parte.annotations : []) {
        const url = semRastreio(String(a?.url || "").trim());
        if (!url || a?.type !== "url_citation" || vistos.has(url)) continue;
        const titulo = String(a.title || "").trim();
        if (
          !tituloDeVerdade(titulo) ||
          !paginaDeVerdade(url) ||
          !fonteCombina(titulo, url) ||
          indiceDePortal(titulo, url)
        ) {
          continue;
        }
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
// Título ilegível também cai. Visto em produção em 23/11/2026: o Senado voltou
// com o título em caixinhas, e isso ia para o cliente como se fosse o nome do
// material.
function tituloDeVerdade(titulo) {
  if (!titulo) return true;
  if (titulo.length > 140 || /(\.\.\.|…)$/.test(titulo)) return false;
  return !/[�□\u0000-\u0008]/.test(titulo);
}

// Página de busca não é material. Visto em produção em 23/11/2026: com a trava
// de domínio, a busca passou a citar "Busca de legislação - Portal da Câmara
// dos Deputados", que é o formulário de pesquisa, e a mensagem mandou aquilo
// ao cliente como referência.
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

// Texto de lei só vale da fonte oficial.
//
// Pedir isso por instrução não grudou, e foi medido duas vezes em produção em
// 23/11/2026, no negócio 68100289579: a Lei 15.367 voltou primeiro de um
// repositório interno de órgão e depois como PDF hospedado numa universidade.
// Os dois abrem, mas o cliente é um ministério: mandar a lei dele num PDF de
// faculdade queima o remetente.
//
// A regra pega só o item que SE ANUNCIA como norma pelo título, e isso pede o
// "nº" com o número logo depois: "LEI Nº 15.367, DE 30 DE MARÇO DE 2026".
// Sem essa exigência a regra derrubava manchete de jornal que começa com a
// palavra, como "Lei reestrutura carreiras no Executivo", que é notícia e vale
// de qualquer veículo. Na dúvida o item passa: perder matéria boa é pior do
// que deixar passar uma norma de fonte estranha, que o closer ainda confere.
const NORMA =
  /^(lei|decreto|portaria|medida provis[óo]ria|instru[çc][ãa]o normativa|resolu[çc][ãa]o|emenda constitucional)\b[\s\S]{0,60}?n[º°o]\s*\d/i;
const OFICIAL = /(^|\.)(gov\.br|leg\.br|jus\.br|mp\.br)$/i;

function fonteCombina(titulo, url) {
  if (!NORMA.test(titulo)) return true;
  return OFICIAL.test(dominioDe(url));
}

// Índice de portal oficial não é documento. Visto em produção em 23/11/2026:
// depois de travar o domínio, a busca passou a citar "Legislação Federal -
// Senado Federal", que é a porta de entrada do portal, e antes disso a página
// de busca da Câmara.
//
// O que separa o documento do índice, nos três casos vistos: documento de
// órgão carrega número no título, lei, portaria, ofício, e índice carrega o
// nome da casa. O endereço raso completa: página de documento mora fundo.
//
// Vale só para domínio oficial. Notícia publicada em gov.br continua entrando,
// porque o endereço dela é fundo.
function indiceDePortal(titulo, url) {
  try {
    const u = new URL(url);
    if (!OFICIAL.test(u.hostname.replace(/^www\./, ""))) return false;
    if (/\d/.test(titulo)) return false;
    return u.pathname.split("/").filter(Boolean).length <= 2;
  } catch {
    return false;
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

// A chave do cache, e ela segue o que foi buscado.
//
// Pelo objetivo do evento, a busca é daquele negócio e de mais nenhum: a chave
// é o negócio. Pelo setor, a resposta serve a todo closer e todo negócio
// daquele setor hoje, e a chave é o setor. Sem cache, cada mensagem gastava
// perto de um minuto e uma chamada paga para repetir a resposta anterior.
// Muda junto com o que se pede à busca. Sem isto, o resultado ruim de hoje
// ficaria guardado o dia inteiro e a correção só apareceria amanhã.
export const VERSAO_BUSCA = "2026-11-23h";

export const chaveDaNoticia = ({ dealId, objetivo, segmento }, dia) =>
  objetivoUtil(objetivo)
    ? `noticias:${VERSAO_BUSCA}:negocio:${String(dealId || "")}:${dia}`
    : `noticias:${VERSAO_BUSCA}:${String(segmento || "").trim().toLowerCase()}:${dia}`;

export async function buscaNoticias({ objetivo, segmento, empresa }, max = 3) {
  const chave = (process.env.OPENAI_API_KEY || "").trim();
  if (!chave) throw new Error("OPENAI_API_KEY não está definida no ambiente.");
  const termo = termoDaNoticia(objetivo, segmento, empresa);
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
        `${termo}\n\nListe até ${max} itens, só o título e a fonte, sem resumo. ` +
        "Nada de release nem página de produto. " +
        "Um item certo já serve; três que não falam do fato não servem.",
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
  return noticiasDaResposta(corpo, max);
}
