// Quem recebe a mensagem de um ticket de CS.
//
// Três tipos de gente convivem no mesmo ticket, medido em 09/11/2026 nos
// tickets da etapa de NF do palestrante:
//   palestrante   quem vai palestrar, ou o escritório que fala por ele
//   contratante   quem paga a fatura, do lado do cliente
//   PSA           funcionário nosso, associado ao ticket junto com os outros
//
// O terceiro é o motivo deste arquivo existir. ana.machado@ aparece como
// contato em 12 tickets, luciana.freitas@ em 10, elenice.dias@ em 8. Pegar "o
// primeiro contato associado" mandaria a cobrança para dentro de casa.
//
// A classificação é palpite informado, não verdade: serve para ordenar a lista
// e escolher o padrão. Quem decide é quem está na tela, e por isso o seletor
// mostra os três tipos em vez de esconder o que não casou.
//
// Nada aqui toca rede.

import { ALLOWED_DOMAIN } from "./config.js";

const semAcento = (s) => String(s || "").normalize("NFD").replace(/\p{Diacritic}/gu, "");
const limpa = (s) => semAcento(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// Partícula e título não identificam ninguém, e "Dr. Drauzio Varella" precisa
// casar com "Drauzio Varella".
const IGNORA = new Set(["de", "da", "do", "dos", "das", "e", "dr", "dra", "prof", "professor", "sr", "sra"]);
const tokens = (s) => limpa(s).split(" ").filter((t) => t.length >= 3 && !IGNORA.has(t));

// A propriedade do ticket vem em dois formatos na mesma conta:
//   "Giva Pereira"
//   "Clovis de Barros Filho (Clovis-de-Barros-Filho)"
//   "Ilson-Júnior"
// O parêntese é repetição do próprio nome com hífen, então sai fora.
export function nomeDoPalestrante(bruto) {
  return String(bruto || "")
    .replace(/\s*\([^)]*\)\s*$/, "")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const dominioDe = (email) => limpa(String(email || "").split("@")[1] || "").replace(/ /g, "");

// Casa pelo nome: a lista menor tem que caber inteira na maior. É o que faz
// "Nathan Osipe" casar com "NATHAN BARROS OSIPE" sem fazer "Marco Souza" casar
// com "Marco Aurélio", que seria chute em cima de um primeiro nome comum.
export function nomeBate(nomeContato, nomePalestrante) {
  const a = tokens(nomeContato);
  const b = tokens(nomePalestrante);
  if (a.length < 2 || b.length < 2) return false;
  const [menor, maior] = a.length <= b.length ? [a, b] : [b, a];
  return menor.every((t) => maior.includes(t));
}

// Casa pelo domínio do e-mail: palestrante costuma atender por um endereço do
// próprio nome, e aí o contato nem sempre tem nome preenchido.
// Exemplos medidos: contato@marikruger.com, palestra@giovanegavio.com,
// palestras@drauziovarella.com.br, waldemar@niclevicz.com.br.
export function dominioBate(email, nomePalestrante) {
  const d = dominioDe(email);
  if (!d) return false;
  const b = tokens(nomePalestrante);
  if (b.length === 0) return false;
  if (b.join("").length >= 6 && d.includes(b.join(""))) return true;
  // Sobrenome longo sozinho também serve: "niclevicz.com.br". Seis letras é o
  // piso para não casar "costa" ou "lima" com domínio de cliente qualquer.
  return b.some((t) => t.length >= 6 && d.includes(t));
}

export const TIPOS = {
  contratante: { label: "Contratante", ordem: 1 },
  palestrante: { label: "Palestrante", ordem: 2 },
  psa: { label: "PSA", ordem: 3 },
};

// Em que caixa este contato cai. O e-mail da casa manda: funcionário nosso
// nunca é destinatário de cobrança, mesmo que o nome bata com o do palestrante.
export function classificaContato(contato, palestrantePrincipal) {
  const email = String(contato?.email || "").toLowerCase();
  if (email.endsWith("@" + ALLOWED_DOMAIN)) return "psa";

  const nome = nomeDoPalestrante(palestrantePrincipal);
  if (nome && (nomeBate(contato?.nome, nome) || dominioBate(email, nome))) return "palestrante";

  return "contratante";
}

// A lista pronta para a tela: classificada, e ordenada por quem tem mais chance
// de ser o destinatário certo. Dentro do mesmo tipo, quem tem e-mail e telefone
// vem antes de quem não tem, senão o padrão cai num contato sem como falar.
export function classificaContatos(contatos = [], palestrantePrincipal) {
  return contatos
    .map((c) => {
      const tipo = classificaContato(c, palestrantePrincipal);
      return { ...c, tipo, tipoLabel: TIPOS[tipo].label };
    })
    .sort(
      (a, b) =>
        TIPOS[a.tipo].ordem - TIPOS[b.tipo].ordem ||
        alcance(b) - alcance(a) ||
        String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR")
    );
}

const alcance = (c) => (c.email ? 2 : 0) + (c.telefone ? 1 : 0);

// O destinatário certo para o que vai ser feito. Quem recebe pedido de NF é o
// palestrante; todo o resto é cobrança, e cobrança vai para quem paga.
export function escolheDestinatario(contatos = [], destino) {
  const doTipo = contatos.filter((c) => c.tipo === destino && (c.email || c.telefone));
  if (doTipo.length) return doTipo[0];
  // Sem ninguém do tipo pedido, não cai no outro lado calado: devolve nada e a
  // tela diz que falta o contato. Mandar cobrança de NF para o cliente seria
  // pior do que não mandar.
  return null;
}
