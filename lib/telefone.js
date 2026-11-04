// Normalização de telefone para o link do wa.me, que aceita só dígitos com
// DDI e sem "+". O CRM tem número em E.164 (+5511961448410), número solto com
// DDD (61999540302) e número de fora do Brasil, e os três precisam sair certos.

const BR = "55";

// Celular brasileiro tem 11 dígitos depois do DDI: 2 de DDD e 9 do número.
// Fixo tem 10. Abaixo disso não dá para adivinhar o que falta.
const MIN_NACIONAL = 10;

export function soDigitos(valor) {
  return String(valor || "").replace(/\D+/g, "");
}

// Devolve o número pronto para o wa.me, ou "" quando não dá para confiar.
// Nunca chuta DDD: número sem DDD não vira link, vira aviso na tela.
export function paraWhatsApp(valor) {
  const cru = String(valor || "").trim();
  let d = soDigitos(cru);
  if (!d) return "";

  // O "+" (ou o 00 de discagem) diz que o DDI já está ali. Sem esse sinal não
  // dá para separar um fixo brasileiro de 10 dígitos de um dinamarquês de 10,
  // então ele é o que decide, não o tamanho.
  const temDDI = cru.startsWith("+") || d.startsWith("00");
  if (d.startsWith("00")) d = d.slice(2);
  if (temDDI) return d.length >= 8 ? d : "";

  // Já veio com o 55 colado, sem o mais.
  if (d.startsWith(BR) && (d.length === 12 || d.length === 13)) return d;

  // Nacional: DDD mais o número, só falta o DDI.
  if (d.length === MIN_NACIONAL || d.length === 11) return BR + d;

  return "";
}

export function linkWhatsApp(telefone, texto) {
  const numero = paraWhatsApp(telefone);
  if (!numero) return "";
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto || "")}`;
}

// Exibição, sem prometer formatação bonita para número de fora.
export function telefoneLegivel(valor) {
  const d = paraWhatsApp(valor);
  if (!d) return "";
  if (d.startsWith(BR) && d.length === 13) return `(${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
  if (d.startsWith(BR) && d.length === 12) return `(${d.slice(2, 4)}) ${d.slice(4, 8)}-${d.slice(8)}`;
  return "+" + d;
}
