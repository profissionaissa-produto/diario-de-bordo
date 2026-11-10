// Cronômetro das telas.
//
// Existe porque a primeira rodada de otimização foi no alvo errado: cacheei a
// leitura dos negócios e a tela do farmer, que nem usa negócios, continuou
// pesada. Chutar onde dói custa mais caro que medir.
//
// Imprime uma linha por carregamento no log da Vercel:
//   [tempo] carteira total=4210ms lista=1800ms contatos=1200ms tentativas=90ms
//
// Nada aqui toca rede, e o custo é um Date.now() por bloco.

export function medidor(nome) {
  const t0 = Date.now();
  const marcas = [];

  return {
    // Envolve um trecho e guarda quanto ele levou, mesmo se estourar: bloco
    // que falha devagar é justamente o que interessa ver.
    async passo(rotulo, fn) {
      const a = Date.now();
      try {
        return await fn();
      } finally {
        marcas.push(`${rotulo}=${Date.now() - a}ms`);
      }
    },
    marca(rotulo, ms) {
      marcas.push(`${rotulo}=${ms}ms`);
    },
    fim(extra = "") {
      const total = Date.now() - t0;
      console.log(`[tempo] ${nome} total=${total}ms ${marcas.join(" ")}${extra ? " " + extra : ""}`);
      return total;
    },
  };
}
