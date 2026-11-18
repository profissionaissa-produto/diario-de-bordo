import "server-only";
import { getCarteira, empresasNoFunil } from "./hubspot";
import { getListaDia, salvarListaDia, getHistoricoCarteira, getTrocasPendentes, registrarAcesso, trocarListaDoDia } from "./db";
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
  if (jaTem.length > 0 && cumpreAsRegras(jaTem, cota)) {
    return { itens: jaTem, gerada: false };
  }
  // Lista montada com regra velha, ou menor que a cota de hoje. O que já tem
  // resultado fica, o resto dá lugar às próximas da fila.
  const { jaVistas, mantidas } = jaTem.length > 0
    ? await trocarListaDoDia(ownerId, dia)
    : { jaVistas: [], mantidas: 0 };

  const [carteira, noFunil, linhas, trocas] = await Promise.all([
    getCarteira(ownerId),
    empresasNoFunil(ownerId).catch((e) => {
      // Sem esta lista o farmer receberia empresas já em negociação. Melhor
      // falhar alto do que entregar a lista errada em silêncio.
      console.error("[carteira] não consegui apurar os negócios abertos:", e?.message);
      throw e;
    }),
    getHistoricoCarteira(ownerId, dia),
    getTrocasPendentes([ownerId]),
  ]);

  const historico = montaHistorico(linhas);
  // Empresa com troca em aberto é o problema, não a tarefa: só volta quando
  // o líder disser que o segmento está certo.
  const pendentes = new Set([
    ...(trocas[String(ownerId)] || []).map((t) => String(t.id)),
    // As que já apareceram hoje não voltam na remontagem: é justamente delas
    // que o farmer está tentando sair.
    ...jaVistas,
  ]);
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

// A lista gravada ainda vale? Duas perguntas só, e as duas baratas: foi
// montada pelas regras de agora, e tem o tamanho que este farmer precisa.
// Empresa a empresa não dá para conferir sem ir ao HubSpot a cada abertura,
// e o carimbo das regras já cobre isso: mudou a regra, a lista se refaz.
function cumpreAsRegras(itens, cota) {
  if (itens.some((e) => e.regras !== VERSAO_REGRAS)) return false;
  return itens.filter((e) => !e.extra).length >= cota;
}

// Troca as empresas de hoje pelas próximas da fila.
//
// Não é "sortear de novo": não existe sorteio. A escolha é um ranking fixo
// (compra mais antiga em recompra e nutrição, mais recente em reativação,
// desempate por quem está há mais tempo sem contato), então remontar com os
// mesmos dados devolve exatamente as mesmas vinte. O que muda a lista é pular
// as que já apareceram hoje, e é isso que esta função faz.
export async function outrasEmpresas(ownerId, dia = dayKey()) {
  // Dia passado é registro, não se remonta.
  if (dia !== dayKey()) throw new Error("Só dá para trocar a lista de hoje.");

  const { jaVistas, mantidas } = await trocarListaDoDia(ownerId, dia);

  const [carteira, noFunil, linhas, trocas] = await Promise.all([
    getCarteira(ownerId),
    empresasNoFunil(ownerId).catch((e) => {
      console.error("[carteira] não consegui apurar os negócios abertos:", e?.message);
      throw e;
    }),
    getHistoricoCarteira(ownerId, dia),
    getTrocasPendentes([ownerId]),
  ]);

  // As já vistas hoje entram no mesmo conjunto das trocas pendentes: as duas
  // coisas significam "não me ofereça esta empresa agora".
  const fora = new Set([
    ...(trocas[String(ownerId)] || []).map((t) => String(t.id)),
    ...jaVistas,
  ]);
  const escolhidas = montaListaDoDia(
    carteira.map((e) => ({ ...e, noFunil: noFunil.has(String(e.id)) })),
    dia,
    montaHistorico(linhas),
    fora,
    Math.max(0, cotaDoFarmer(ownerId, EMPRESAS_DO_DIA) - mantidas)
  );

  await salvarListaDia(ownerId, dia, escolhidas, { regras: VERSAO_REGRAS, desde: mantidas });
  const itens = await getListaDia(ownerId, dia);
  // Carteira pequena devolve lista curta ou vazia, e isso tem que aparecer em
  // vez de a tela ficar em branco sem explicação.
  return { itens, trocadas: jaVistas.length, novas: itens.length };
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
    // lista, e nada explica as centenas que sumiram pela regra dos 30 dias.
    contatadasHaPouco: carteira.filter((e) =>
      contatadaHaPouco(e.ultimoContato, dia, historico.get(String(e.id))?.ultimoContatoFeito)
    ).length,
    emDescanso: carteira.filter((e) => emDescanso(historico.get(String(e.id)), dia)).length,
    precisandoAuxilio: carteira.filter((e) => precisaAuxilio(historico.get(String(e.id)))).length,
    // Régua de cobertura: quanto da carteira foi realmente tocada no mês.
    contatoNoMes: carteira.filter((e) => e.ultimoContato && e.ultimoContato >= inicioMes).length,
  };
}
