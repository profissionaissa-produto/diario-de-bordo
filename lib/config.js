// Configuração de domínio, papéis e mapeamentos de negócio.

export const ALLOWED_DOMAIN = "profissionaissa.com";

// Admins veem todos os closers / ambos os segmentos.
// Padrão abaixo; env ADMIN_EMAILS (CSV) sobrescreve se definida.
const DEFAULT_ADMINS = [
  "marcio.spagnolo@profissionaissa.com",
  "crm.psa@profissionaissa.com",
  "mattheus.santos@profissionaissa.com",
  "leonardo.moreira@profissionaissa.com",
];
export const ADMIN_EMAILS = (process.env.ADMIN_EMAILS
  ? process.env.ADMIN_EMAILS.split(",")
  : DEFAULT_ADMINS
)
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

// Funil do HubSpot de cada segmento. Não existe funil "Farmer" na conta
// (conferido), então o segmento aponta para o funil de Vendas B2B.
// ponytail: isso vem de quando Farmer era um time de closers do B2B. Agora
// Farmer é o time de CS, e o funil dos negócios deles precisa ser confirmado —
// enquanto não for, a tabela deles mostra os deals que tiverem no B2B.
export const PIPELINES_POR_SEG = {
  B2B: ["default"],
  B2C: ["725182862"],
  Farmer: ["default"],
};

// Pipelines que contam como "funil de closer" (id do HubSpot -> rótulo do segmento).
export const CLOSER_PIPELINES = { default: "B2B", "725182862": "B2C" };

// Closers por segmento (ownerId do HubSpot). Define quem aparece no seletor do admin
// quando B2B ou B2C está selecionado. Ids confirmados na conta.
// Nome fica aqui de propósito: buscar os owners no HubSpot a cada tela pagina
// centenas de registros e consome a cota diária da API à toa.
// As tramitações são do processo de CS, que no Diário é o segmento Farmer.
export const SEG_TRAMITACOES = "Farmer";

// Equipes dentro de um segmento. Quem ainda não tem equipe aparece só em
// "Todas": some de um filtro de equipe, então as telas mostram quantos estão
// nessa situação em vez de deixar gente desaparecer calada.
// O B2B saiu daqui em 03/11/2026: Dani e Vince viraram um squad só, e segmento
// sem equipe some do filtro em vez de mostrar uma pílula única sem função.
export const EQUIPES = {
  // A Leticia saiu em 03/11/2026, junto com os dois farmers que a compunham.
  Farmer: ["Katyeli", "Camila"],
};

export const CLOSERS = {
  // Squad único desde 03/11/2026. Sem `equipe`: o B2B não está mais dividido.
  B2B: [
    { id: "80454588", nome: "João Gabriel Marins Pereira" },
    { id: "92333469", nome: "Rafael Oliveira Alves" },
    { id: "80454586", nome: "Rafael Teixeira" },
    { id: "86859895", nome: "Mateus Mariano" },
    { id: "80454576", nome: "Eduardo Vince" },
    { id: "80454584", nome: "Cesar Luiz dos Santos Filho" },
    { id: "79760744", nome: "Diego Iram Conceição da Silva" },
    { id: "85002012", nome: "Bruna Machado" },
    { id: "87159365", nome: "João Lucas Backmann" },
    // Veio do Farmer em 03/11/2026 e passou a atuar como closer comum: saiu de
    // LIDERES junto, então não aprova mais briefing de ninguém.
    { id: "80454577", nome: "Daniel Bento Sias" },
  ],
  // Time de CS (farmers). Ids confirmados um a um nos owners do HubSpot.
  // Squads redistribuídos em 03/11/2026: ninguém mais fora de equipe.
  Farmer: [
    { id: "93599591", nome: "Bruna Halfen Saraiva", equipe: "Katyeli" },
    { id: "85846971", nome: "Francielle Teles Lenz", equipe: "Katyeli" },
    { id: "94316537", nome: "Maria Julia Heredia Beck de Azevedo", equipe: "Katyeli" },
    { id: "89632472", nome: "Maria Eduarda Porto Guimaraes", equipe: "Katyeli" },

    { id: "88200239", nome: "Luiza Teixeira Basteiro Rodriguez", equipe: "Camila" },
    { id: "92704130", nome: "Talita Santos Cruz", equipe: "Camila" },
    { id: "81033487", nome: "Gustavo Stivanin Pacheco", equipe: "Camila" },
    { id: "97763591", nome: "Leonardo Bitencourt Machado", equipe: "Camila" },
  ],
  B2C: [
    { id: "99956263", nome: "Indira Bauer" },
    { id: "99230962", nome: "Andrea Maria de Vargas" },
    { id: "79760676", nome: "Amanda de Oliveira" },
    { id: "79760746", nome: "Mayda Quadros" },
    { id: "89632494", nome: "Willker Santos Belous" },
    { id: "88628309", nome: "João Paulo da Silveira Araújo" },
    { id: "88628313", nome: "Gabrielly Milani da Silva" },
  ],
};

// Derivados de CLOSERS: acrescentar um segmento acima basta, sem mexer aqui.
export const SEGMENTOS = Object.keys(CLOSERS);

export const CLOSERS_BY_SEG = Object.fromEntries(
  SEGMENTOS.map((s) => [s, CLOSERS[s].map((c) => c.id)])
);

export const EQUIPES_DE = (seg) => EQUIPES[seg] || [];

export const EQUIPE_CLOSER = Object.fromEntries(
  SEGMENTOS.flatMap((s) => CLOSERS[s].filter((c) => c.equipe).map((c) => [c.id, c.equipe]))
);

// Closers de um segmento, opcionalmente de uma equipe. Equipe inválida (ou
// ausente) devolve o time inteiro.
export function closersDe(seg, equipe) {
  const lista = CLOSERS[seg] || [];
  if (!equipe || !EQUIPES_DE(seg).includes(equipe)) return lista;
  return lista.filter((c) => c.equipe === equipe);
}

// Quantos ainda estão sem equipe num segmento que já tem equipes definidas.
export function semEquipe(seg) {
  if (EQUIPES_DE(seg).length === 0) return 0;
  return (CLOSERS[seg] || []).filter((c) => !c.equipe).length;
}

// Líderes são closers com funil próprio que também aprovam, reprovam e editam
// os briefings do time deles — diferente do admin, que alcança todos os
// segmentos. O valor é o segmento que a pessoa lidera.
// Eduardo, Cesar e Diego também são closers do B2B (constam em CLOSERS); o Nicollas
// apenas lidera o B2C, sem funil próprio.
// O valor pode ser um segmento ou uma lista deles. O Cesar liderava B2B e
// Farmer quando Farmer era um grupo de closers no mesmo funil; desde a
// reorganização de 22/09/2026, Farmer é o time de CS e não é dele.
export const LIDERES = {
  "eduardo.vince@profissionaissa.com": "B2B",
  "cesar.filho@profissionaissa.com": "B2B",
  "diego.conceicao@profissionaissa.com": "B2B",
  "nicollas.lenuzza@profissionaissa.com": "B2C",
  // O Daniel Sias saiu daqui em 03/11/2026: virou closer de B2B e não aprova
  // mais briefing.
  // Lideram o Farmer sem funil próprio, como o Nicollas no B2C.
  "ana.machado@profissionaissa.com": "Farmer",
  // O Leandro é gestor da Katyeli e da Camila. Como hoje elas são as duas
  // únicas equipes do Farmer, liderar o segmento é exatamente isso. Se entrar
  // uma terceira equipe que não seja dele, aqui vira liderança de equipe
  // múltipla e LIDERES_EQUIPE precisa aceitar mais de uma.
  "leandro.bengochea@profissionaissa.com": "Farmer",
};

// Quem cadastra estratégia nova, e em qual segmento. É mais estreito do que
// liderar: liderar o segmento não dá esse direito, senão todo líder passaria a
// mexer na lista que o time inteiro usa.
export const CURADORES_ESTRATEGIA = {
  "cesar.filho@profissionaissa.com": "B2B",
  "ana.machado@profissionaissa.com": "Farmer",
};

export const segCuradoPor = (email) =>
  CURADORES_ESTRATEGIA[String(email || "").toLowerCase()] || null;

// Liderança de uma equipe, não do segmento inteiro: aprova, reprova e edita
// só os briefings da própria equipe. Diferente de LIDERES, que alcança o
// segmento todo. E-mails conferidos nos owners do HubSpot.
export const LIDERES_EQUIPE = {
  "katyeli.madril@profissionaissa.com": { seg: "Farmer", equipe: "Katyeli" },
  "camila.fay@profissionaissa.com": { seg: "Farmer", equipe: "Camila" },
  // A Leticia saiu junto com o squad dela: sem equipe não há o que liderar, e
  // deixá-la aqui apontaria para uma equipe que não existe mais.
};

export const equipeLideradaPor = (email) =>
  LIDERES_EQUIPE[String(email || "").toLowerCase()] || null;

// Quem entra no Google com um e-mail diferente do que está cadastrado no owner
// do HubSpot. Sem isto o login morre em "sem cadastro no HubSpot", porque a
// busca é feita pelo e-mail. Conferido owner a owner na API.
// Hoje está vazio: os dois casos suspeitos (Francielle Sotoriva e Rafael
// Brack) foram conferidos e o login bate com o owner. O mecanismo fica porque
// o problema é real e silencioso — quem cair nele simplesmente não entra.
export const OWNER_POR_EMAIL = {};

// Sempre uma lista, para quem consome não precisar saber da diferença.
export const segLideradoPor = (email) => {
  const v = LIDERES[String(email || "").toLowerCase()];
  if (!v) return null;
  return Array.isArray(v) ? v : [v];
};

export const NOME_CLOSER = Object.fromEntries(
  SEGMENTOS.flatMap((s) => CLOSERS[s].map((c) => [c.id, c.nome]))
);

export const SEG_CLOSER = Object.fromEntries(
  SEGMENTOS.flatMap((s) => CLOSERS[s].map((c) => [c.id, s]))
);

// Etapas de Ganho/Fechado/Perdido a EXCLUIR da contagem de "ativo no funil".
// As flags nativas do HubSpot (hs_is_closed / isClosed) estão inconsistentes nesta
// conta (ex: a etapa "Ganho / Contrato assinado" não é marcada como fechada), então
// listamos explicitamente. Medido contra o HubSpot: sem estas, Rafael = 47 ativos no B2B.
//   B2B (default):  1076664460 Ganho/Contrato · 1076664462 Negócio fechado · 1076664461 Perdido
//   B2C (725182862): 1105295876 Ganho · 1059939760 Perdido
export const CLOSED_STAGES = [
  "1076664460",
  "1076664462",
  "1076664461",
  "1105295876",
  "1059939760",
];

// Estilo visual por valor da propriedade temperatura_atual (valor interno -> classe).
// Valores vêm do HubSpot; um valor sem estilo cai no visual neutro.
export const TEMP_STYLE = {
  Forecast: "fc",
  "Vou vender": "vv",
  "Não levo fé": "lm", // rótulo exibido: "Larguei de mão"
  "Café com leite": "cl",
};

// Link para o registro do negócio no HubSpot.
export const HUBSPOT_PORTAL_ID = process.env.HUBSPOT_PORTAL_ID || "49656171";
export const empresaUrl = (id) =>
  `https://app.hubspot.com/contacts/${HUBSPOT_PORTAL_ID}/record/0-2/${id}`;
export const dealUrl = (id) =>
  `https://app.hubspot.com/contacts/${HUBSPOT_PORTAL_ID}/record/0-3/${id}`;

// HubSpot não expõe a foto do usuário pela API; guardamos uma por closer.
// e-mail -> caminho em /public. Sem entrada = avatar de iniciais.
// Foto por ownerId (o HubSpot não expõe avatar pela API). Vinculado ao id, não
// ao e-mail, para não depender de adivinhar endereços.
export const FOTOS = {
  "80454586": "/avatars/rafael.jpg", // Rafael Teixeira
  "92704130": "/avatars/talita.jpg", // Talita Santos Cruz
  "92333469": "/avatars/rafael-alves.jpg", // Rafael Oliveira Alves
  "86859895": "/avatars/mateus.jpg", // Mateus Mariano
  "80454588": "/avatars/joao-gabriel.jpg", // João Gabriel Marins Pereira
  "89632494": "/avatars/willker.jpg", // Willker Santos Belous
  "79760676": "/avatars/amanda.jpg", // Amanda de Oliveira
  "79760746": "/avatars/mayda.jpg", // Mayda Quadros
  "88628309": "/avatars/joao-paulo.jpg", // João Paulo da Silveira Araújo
  "88628313": "/avatars/gabrielly.jpg", // Gabrielly Milani da Silva
  "88200239": "/avatars/luiza.jpg", // Luiza Rodriguez
  "80454576": "/avatars/eduardo-vince.jpg", // Eduardo Vince (líder B2B)
  "80454584": "/avatars/cesar.jpg", // Cesar Luiz dos Santos Filho (líder B2B)
  "79760744": "/avatars/diego.jpg", // Diego Iram Conceição da Silva (líder B2B)
  "85002012": "/avatars/bruna-machado.jpg", // Bruna Machado
  "81033487": "/avatars/gustavo-pacheco.jpg", // Gustavo Stivanin Pacheco
  "89632472": "/avatars/maria-eduarda.jpg", // Maria Eduarda Porto Guimaraes
  "87159365": "/avatars/joao-lucas.jpg", // João Lucas Backmann
};

export const fotoDe = (ownerId) => FOTOS[String(ownerId)] || null;
