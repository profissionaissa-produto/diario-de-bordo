// Canal de contato do farmer e a regra que decide qual ainda pode ser usado.
//
// Cada canal tem teto de 3 tentativas sem sucesso na mesma empresa. Estourar o
// teto fecha aquele canal e deixa os outros de pé: 3x no WhatsApp sem resposta
// libera e-mail e ligação, 3x no e-mail depois disso deixa só a ligação.
//
// A ordem importa para a sugestão do próximo canal, não para destravar: o
// e-mail não espera o WhatsApp acabar para existir. Se a intenção for escada
// estrita, com um canal aberto de cada vez, é só esta função mudar.

export const CANAIS = [
  { key: "whatsapp", label: "WhatsApp" },
  { key: "email", label: "E-mail" },
  { key: "ligacao", label: "Ligação" },
];

export const LIMITE_POR_CANAL = 3;

export const CANAL_VALIDO = (k) => CANAIS.some((c) => c.key === k);

export const rotuloCanal = (k) => CANAIS.find((c) => c.key === k)?.label || "";

// `tentativas` é { whatsapp: 2, email: 0, ... }. Canal ausente conta zero.
export const tentativasNo = (tentativas, key) => Number(tentativas?.[key]) || 0;

export const canalEsgotado = (tentativas, key) =>
  tentativasNo(tentativas, key) >= LIMITE_POR_CANAL;

// Canais que ainda podem ser usados, na ordem de preferência.
export function canaisLiberados(tentativas = {}) {
  return CANAIS.filter((c) => !canalEsgotado(tentativas, c.key)).map((c) => c.key);
}

// O que oferecer por padrão: o primeiro liberado. Null quando os três
// estouraram, e aí não é mais caso de mensagem, é caso de decisão do líder.
export function canalSugerido(tentativas = {}) {
  return canaisLiberados(tentativas)[0] || null;
}

export const semCanal = (tentativas = {}) => canaisLiberados(tentativas).length === 0;

// Quantas restam no canal, para a mensagem saber que é a última chance.
export const restamNo = (tentativas, key) =>
  Math.max(0, LIMITE_POR_CANAL - tentativasNo(tentativas, key));
