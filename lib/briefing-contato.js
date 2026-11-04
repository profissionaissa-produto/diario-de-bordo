import { rotuloCanal } from "./canal.js";
import { numeroDa } from "./estrategias.js";

// Briefing do contato: o que foi feito com a empresa, em texto corrido.
// Montado dos dados, não gerado por IA: é registro, e registro não pode mudar
// de redação a cada vez que a tela abre.

const ORDINAL = ["", "1ª", "2ª", "3ª", "4ª", "5ª"];
const ordinal = (n) => ORDINAL[n] || `${n}ª`;

const diaBR = (iso) => (iso ? `${String(iso).slice(8, 10)}/${String(iso).slice(5, 7)}` : "");

// "OFERTA PARA REATIVAÇÃO" grita no meio de uma frase.
const minuscula = (s) => {
  const t = String(s || "").trim();
  if (!t) return "";
  return t === t.toUpperCase() ? t.toLowerCase() : t;
};

// `contatos` são as tentativas da empresa, da mais antiga para a mais nova:
// [{ canal, dia, tentativaNoCanal }]. Devolve "" quando não houve contato.
export function briefingDoContato({ contatos = [], abordagem, estrategia }) {
  if (contatos.length === 0) return "";

  const trechos = contatos.map((c) => {
    const quando = diaBR(c.dia);
    const vez = ordinal(c.tentativaNoCanal);
    // O canal sempre em minúscula: "por E-mail" no meio da frase é tropeço.
    const canal = (rotuloCanal(c.canal) || c.canal).toLowerCase();
    return `${quando}: ${vez} tentativa por ${canal}`;
  });

  const como = [];
  if (abordagem) como.push(`abordagem de ${minuscula(abordagem)}`);
  if (estrategia) {
    const n = numeroDa(estrategia.id);
    como.push(`estratégia${n ? ` ${n}` : ""}, ${estrategia.titulo}`);
  }

  const inicio = trechos.join(". ");
  if (como.length === 0) return `${inicio}.`;
  const lista = como.length === 2 ? `${como[0]} e a ${como[1]}` : como[0];
  return `${inicio}. Usando a ${lista}.`;
}
