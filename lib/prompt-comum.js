// O que os três prompts têm que dizer igual.
//
// Existe por uma reclamação direta do time: as mensagens saíam sem bom dia,
// sem oi, sem nada, e isso soa cobrança. A regra de abertura mora aqui porque
// carteira, financeiro e closer têm que cumprimentar do mesmo jeito, e uma
// regra copiada em três arquivos vira três regras diferentes no primeiro
// ajuste.
//
// Nada aqui toca rede.

// Bom dia, boa tarde ou boa noite, no relógio de Brasília, que é o de quem
// escreve e o de quem recebe. Sem isto o modelo chuta, e chutar "bom dia" às
// sete da noite é pior do que não cumprimentar.
export function saudacaoDoDia(agora = new Date()) {
  const h = Number(
    new Intl.DateTimeFormat("pt-BR", {
      hour: "2-digit",
      hour12: false,
      timeZone: "America/Sao_Paulo",
    }).format(agora)
  );
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

// A regra de abertura por canal. O WhatsApp e o e-mail abrem com a saudação;
// a ligação é roteiro falado, então a saudação entra na boca do operador.
export function regraDeAbertura(canal, agora = new Date()) {
  const s = saudacaoDoDia(agora);

  if (canal === "ligacao") {
    return (
      `A ligação TEM que começar cumprimentando: "${s}, [primeiro nome]", ` +
      "e logo depois você se identifica pelo nome e diz que é da PSA. " +
      "Cordialidade antes do assunto, sempre."
    );
  }

  return (
    `A mensagem TEM que começar cumprimentando a pessoa pelo primeiro nome: "${s}, [primeiro nome]". ` +
    "Pode ser seguida de um \"tudo bem?\" ou equivalente curto. " +
    "Tom coloquial e respeitoso, de quem conhece a pessoa, nunca seco nem direto demais."
  );
}

// O que continua proibido: enrolação que ocupa linha e não diz nada. Não
// confundir com cumprimentar, que agora é obrigatório.
export const PROIBIDO_ENROLAR =
  "PROIBIDO enrolar depois do cumprimento: nada de \"espero que esteja tudo certo\", " +
  "\"passando para saber\", \"fico pensando aqui\", \"espero que este e-mail o encontre bem\". " +
  "Depois de cumprimentar, a próxima frase já entra no assunto.";
