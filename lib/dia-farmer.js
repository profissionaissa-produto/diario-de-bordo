import "server-only";
import { getCarteira, empresasNoFunil } from "./hubspot";
import { getListaDia, salvarListaDia, getHistoricoCarteira, registrarAcesso, trocarListaDoDia } from "./db";
import { montaListaDoDia, montaHistorico, classifica, precisaAuxilio, emDescanso, contatadaHaPouco, EMPRESAS_DO_DIA, VERSAO_REGRAS } from "./carteira";
import { cotaDoFarmer } from "./config";
import { dayKey } from "./week";

// A lista do dia do farmer. Gera na primeira abertura e congela: reabrir a
// tela não pode reembaralhar o compromisso do dia.
// Só gera para hoje — dia passado é registro, não se remonta.
export async function listaDoDia(ownerId, dia = dayKey(), { registraAcesso = false } = {}) {
  // Só conta como acesso quando é o próprio farmer abrindo: líder navegando
  // pelo seletor não pode parecer que o farmer entrou.
  if (registraAcesso && dia === dayKey()) {
    await registrarAcesso(ownerId, dia).catch(() => {});
  }
  const jaTem = await getListaDia(ownerId, dia);
  // Dia passado é registro, não se remonta.
  if (dia !== dayKey()) return { itens: jaTem, gerada: false };

  const cota = cotaDoFarmer(ownerId, EMPRESAS_DO_DIA);
  // Uma pergunta só, e ela é definitiva: esta lista foi montada pelas regras
  // de agora? Se foi, é ela que vale pelo resto do dia, do tamanho que tiver.
  //
  // Não entra tamanho nesta conta. Conferir "tem 50?" remontava sem parar
  // quando a carteira não dava 50, e cada remontagem apagava as estratégias
  // que a pessoa tinha escolhido. A lista do dia tem que parar de pé.
  if (jaTem.length > 0 && jaTem.every((e) => e.regras === VERSAO_REGRAS)) {
    return { itens: jaTem, gerada: false };
  }
  // Lista montada com regra velha. O que já tem resultado fica, o resto dá
  // lugar às próximas da fila.
  const { jaVistas, mantidas } = jaTem.length > 0
    ? await trocarListaDoDia(ownerId, dia, VERSAO_REGRAS)
    : { jaVistas: [], mantidas: 0 };

  const [carteira, noFunil, linhas] = await Promise.all([
    getCarteira(ownerId),
    empresasNoFunil(ownerId).catch((e) => {
      // Sem esta lista o farmer receberia empresas já em negociação. Melhor
      // falhar alto do que entregar a lista errada em silêncio.
      console.error("[carteira] não consegui apurar os negócios abertos:", e?.message);
      throw e;
    }),
    getHistoricoCarteira(ownerId, dia),
  ]);

  const historico = montaHistorico(linhas);
  // As que já apareceram hoje não voltam na remontagem: é justamente delas que
  // o farmer está tentando sair.
  //
  // Até 25/11/2026 entrava aqui também a empresa com troca de segmento em
  // aberto, e ela só voltava quando o líder decidisse. Como ninguém trabalhava
  // aquela fila, eram 44 empresas fora do rodízio por tempo indeterminado,
  // encolhendo a lista do farmer todo dia. O painel do líder saiu junto.
  const pendentes = new Set(jaVistas);
  const escolhidas = montaListaDoDia(
    carteira.map((e) => ({ ...e, noFunil: noFunil.has(String(e.id)) })),
    dia,
    historico,
    pendentes,
    Math.max(0, cota - mantidas)
  );

  await salvarListaDia(ownerId, dia, escolhidas, { regras: VERSAO_REGRAS, desde: mantidas });
  return { itens: await getListaDia(ownerId, dia), gerada: true };
}

// Números que explicam a lista: de onde ela saiu e o que ficou de fora.
export async function resumoDaCarteira(ownerId, dia = dayKey()) {
  const [carteira, noFunil, linhas] = await Promise.all([
    getCarteira(ownerId),
    empresasNoFunil(ownerId).catch(() => new Set()),
    getHistoricoCarteira(ownerId, dia),
  ]);
  const historico = montaHistorico(linhas);
  const inicioMes = dia.slice(0, 7) + "-01";

  const porBalde = {};
  for (const e of carteira) {
    const { balde } = classifica(e.ultimaCompra, dia);
    porBalde[balde] = (porBalde[balde] || 0) + 1;
  }

  return {
    carteira: carteira.length,
    comHistorico: carteira.filter((e) => e.ultimaCompra).length,
    porBalde,
    noFunil: carteira.filter((e) => noFunil.has(String(e.id))).length,
    // Sem esta linha a conta não fecha: o farmer vê 994 na carteira, 20 na
    // lista, e nada explica as centenas que sumiram pela janela sem contato.
    contatadasHaPouco: carteira.filter((e) =>
      contatadaHaPouco(e.ultimoContato, dia, historico.get(String(e.id))?.ultimoContatoFeito)
    ).length,
    emDescanso: carteira.filter((e) => emDescanso(historico.get(String(e.id)), dia)).length,
    precisandoAuxilio: carteira.filter((e) => precisaAuxilio(historico.get(String(e.id)))).length,
    // Régua de cobertura: quanto da carteira foi realmente tocada no mês.
    contatoNoMes: carteira.filter((e) => e.ultimoContato && e.ultimoContato >= inicioMes).length,
  };
}
