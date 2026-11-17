// Leva o plano do dia da carteira para o CRM.
//
// Morava dentro da rota do líder, de quando aprovar era o que mandava o plano
// para o HubSpot. A aprovação saiu: agora quem grava é o próprio farmer ao
// iniciar o dia. A rota do líder continua usando isto no "marcar como
// revisado", que é reenvio inofensivo, porque gravar a mesma propriedade com
// o mesmo valor não muda nada no HubSpot.
//
// Devolve o que foi escrito e o que não foi, com o motivo: um dia dado como
// iniciado sem nada ter chegado ao CRM é pior do que um erro na tela.

import { getListaDia, listarEstrategias } from "./db";
import { propriedadeEmpresa, updateCompany } from "./hubspot";
import { montaEstrategias, indexaPorId, valorDaEstrategia, valorNaOpcao } from "./estrategias";

export async function gravarNoHubspot(ownerId, dia) {
  const itens = (await getListaDia(ownerId, dia)).filter((e) => e.abordagem || e.estrategia);
  if (itens.length === 0) return { gravadas: 0, falhas: [], semPropriedade: [] };

  const [propAbordagem, propEstrategia] = await Promise.all([
    propriedadeEmpresa("abordagem"),
    propriedadeEmpresa("estrategia"),
  ]);
  const idx = indexaPorId(montaEstrategias(await listarEstrategias()));

  const semPropriedade = [];
  if (!propAbordagem) semPropriedade.push("abordagem");
  if (!propEstrategia) semPropriedade.push("estrategia");
  for (const nome of semPropriedade) {
    console.error(`[carteira] a conta não tem a propriedade "${nome}" em empresas, nada foi gravado nesse campo`);
  }

  let gravadas = 0;
  const falhas = [];
  for (const e of itens) {
    const props = {};
    if (e.abordagem) {
      const v = valorNaOpcao(propAbordagem, [e.abordagem], `[carteira] abordagem "${e.abordagem}"`);
      if (v !== undefined) props.abordagem = v;
    }
    if (e.estrategia) {
      const v = valorDaEstrategia(propEstrategia, e.estrategia, idx);
      if (v !== undefined) props.estrategia = v;
    }
    if (Object.keys(props).length === 0) continue;
    try {
      await updateCompany(e.id, props);
      gravadas++;
    } catch (err) {
      console.error(`[carteira] falha ao gravar a empresa ${e.id}:`, err);
      falhas.push(e.nome || e.id);
    }
  }
  return { gravadas, falhas, semPropriedade };
}

// A frase que as telas mostram sobre isto vive em carteira-texto.js, que não
// importa nada: as telas do farmer são client e não podem puxar o banco.
