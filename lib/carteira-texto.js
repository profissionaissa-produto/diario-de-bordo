// Frases da carteira que as telas mostram. Separado de carteira-hubspot.js de
// propósito: aquele importa o banco e o HubSpot, e as telas do farmer são
// client. Importar lá de dentro arrastaria o driver do Postgres para o
// navegador.
//
// Nada aqui toca rede.

// O que a gravação no CRM conseguiu fazer, em uma frase. Vale para a tela do
// farmer ao iniciar o dia e para a do líder ao revisar.
export function resumoDoHubspot(h) {
  if (!h) return "";
  const avisos = [];
  if (h.gravadas) avisos.push(`${h.gravadas} empresa(s) gravada(s) no HubSpot`);
  if (h.semPropriedade?.length) {
    avisos.push("a conta não tem a propriedade " + h.semPropriedade.join(" nem ") + " em empresas");
  }
  if (h.falhas?.length) avisos.push("falhou em " + h.falhas.join(", "));
  return avisos.join(" · ") || "nada a gravar neste dia";
}
