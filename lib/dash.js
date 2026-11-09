// A base de palestrantes do Dash da PSA.
//
// Por que existe: o contato do palestrante não é confiável no ticket. Medido
// em 09/11/2026, parte dos tickets da etapa de NF não tem o palestrante
// associado, e quando tem pode ser o escritório, com grafia diferente do nome
// na propriedade. O Dash é a base onde o palestrante se cadastra, e lá estão
// o telefone, o e-mail e por qual canal ele quer ser procurado.
//
// Rotas e auth conferidas em C:\Dev\solicitacao-palestrante, que é quem já
// consome esta API em produção:
//   /internal/palestrante/search?nome=&limite=20  -> { items:[{id,nome,email,ativo}], total }
//   /internal/palestrante/{id}/profile            -> { usuario, contatarPor, contatoPrincipal, adminFields }
//
// A chave vive só no ambiente, como as outras: nunca no repositório.

import { nomeDoPalestrante, nomeBate } from "./contato-ticket.js";

const BASE = "https://services-prd.profissionaissa.com/login-psa-ms";

export const dashPronto = () => !!(process.env.PSA_API_KEY || "").trim();

async function dash(path) {
  const key = (process.env.PSA_API_KEY || "").trim();
  if (!key) throw new Error("PSA_API_KEY não está definida no ambiente.");

  const res = await fetch(BASE + path, { headers: { "x-api-key": key } });
  const texto = await res.text();
  let corpo = null;
  try {
    corpo = texto ? JSON.parse(texto) : null;
  } catch {
    // Resposta que não é JSON não tem o que extrair; o erro abaixo diz o status.
  }
  if (!res.ok) {
    // O motivo vai para o log inteiro. Chave recusada e palestrante inexistente
    // são problemas diferentes, e engolir os dois num "falhou" faria alguém
    // procurar no lugar errado.
    console.error(`[dash] ${path}: ${res.status} ${corpo?.message || res.statusText}`);
    throw new Error(
      res.status === 401 || res.status === 403
        ? "O Dash recusou a chave. Confira PSA_API_KEY no ambiente."
        : `O Dash respondeu ${res.status}.`
    );
  }
  return corpo;
}

const semAcento = (s) => String(s || "").normalize("NFD").replace(/\p{Diacritic}/gu, "");
const chave = (s) => semAcento(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// Qual dos resultados é o palestrante do ticket. Nome igual manda; depois,
// nome que cabe dentro do outro, que é o que faz "Nathan Osipe" casar com
// "NATHAN BARROS OSIPE". Ativo tem preferência sobre desativado.
//
// Devolve null quando há mais de um candidato igualmente bom: escolher um no
// par ou ímpar mandaria a cobrança da NF para o palestrante errado.
export function escolhePalestrante(items = [], nomeBruto) {
  const alvo = nomeDoPalestrante(nomeBruto);
  if (!alvo) return null;

  const ativos = items.filter((i) => i.ativo !== false);
  const pool = ativos.length ? ativos : items;

  const exatos = pool.filter((i) => chave(i.nome) === chave(alvo));
  if (exatos.length === 1) return exatos[0];
  if (exatos.length > 1) return null;

  const parecidos = pool.filter((i) => nomeBate(i.nome, alvo));
  return parecidos.length === 1 ? parecidos[0] : null;
}

// O termo que vai para a busca. O nome inteiro primeiro; se não vier nada, o
// token mais longo, que costuma ser o sobrenome. Duas chamadas no pior caso.
export function termosDeBusca(nomeBruto) {
  const alvo = nomeDoPalestrante(nomeBruto);
  if (!alvo) return [];
  const tokens = chave(alvo).split(" ").filter((t) => t.length >= 3);
  const maior = tokens.sort((a, b) => b.length - a.length)[0];
  return maior && chave(maior) !== chave(alvo) ? [alvo, maior] : [alvo].filter(Boolean);
}

// Por onde falar com o palestrante, já resolvido.
//
// `contatoPrincipal === 'assessoria'` significa que quem atende é o escritório,
// e aí o telefone e o e-mail são os dele. Mandar direto para o palestrante
// nesse caso é furar o combinado que ele fez com a PSA.
export function contatoDoPerfil(perfil, palestranteId) {
  const u = perfil?.usuario || {};
  const assessoria = perfil?.adminFields?.assessoria || {};
  const porAssessoria = perfil?.contatoPrincipal === "assessoria";
  const nomePalestrante = [u.nome, u.sobrenome].filter(Boolean).join(" ").trim();

  const fonte = porAssessoria ? assessoria : u;
  return {
    id: `dash:${palestranteId}`,
    palestranteId: String(palestranteId),
    nome: porAssessoria
      ? `${assessoria.nome || "Assessoria"} · assessoria de ${nomePalestrante}`
      : nomePalestrante,
    cargo: porAssessoria ? "assessoria" : "palestrante",
    email: fonte.email || "",
    telefone: fonte.telefone || "",
    tipo: "palestrante",
    tipoLabel: "Palestrante",
    fonte: "dash",
    porAssessoria,
    // whatsapp | email | ligacao, as mesmas chaves de lib/canal.js. Vazio
    // significa que ele não marcou preferência, não que tanto faz.
    contatarPor: CANAL_VALIDO_DASH(perfil?.contatarPor) ? perfil.contatarPor : "",
  };
}

// Só aceita o que o Diário sabe fazer. Valor novo do lado do Dash não vira
// canal inventado aqui: fica vazio e a tela diz que não há preferência.
const CANAL_VALIDO_DASH = (v) => ["whatsapp", "email", "ligacao"].includes(String(v || ""));

// O palestrante do ticket, do Dash. Devolve null quando não dá para ter
// certeza de quem é, e nesses casos quem chama mostra o motivo em vez de
// escolher por conta própria.
export async function palestranteDoDash(nomeBruto) {
  if (!dashPronto()) throw new Error("PSA_API_KEY não está definida no ambiente.");

  const termos = termosDeBusca(nomeBruto);
  if (termos.length === 0) return { contato: null, motivo: "O ticket não tem palestrante principal preenchido." };

  let achado = null;
  let viuAlgum = false;
  for (const termo of termos) {
    const r = await dash(`/internal/palestrante/search?nome=${encodeURIComponent(termo)}&limite=20`);
    const items = r?.items || [];
    if (items.length) viuAlgum = true;
    achado = escolhePalestrante(items, nomeBruto);
    if (achado) break;
  }

  if (!achado) {
    return {
      contato: null,
      motivo: viuAlgum
        ? `A busca no Dash por "${nomeDoPalestrante(nomeBruto)}" não deu um resultado único.`
        : `"${nomeDoPalestrante(nomeBruto)}" não foi encontrado na base do Dash.`,
    };
  }

  const perfil = await dash(`/internal/palestrante/${achado.id}/profile`);
  const contato = contatoDoPerfil(perfil, achado.id);
  if (!contato.email && !contato.telefone) {
    return { contato: null, motivo: `${contato.nome} está no Dash, mas sem e-mail nem telefone.` };
  }
  return { contato, motivo: "" };
}
