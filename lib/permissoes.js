// Extensão explícita: assim o lib/config.check.mjs consegue importar este
// módulo direto no Node, sem passar pelo bundler.
import { SEG_CLOSER, SEGMENTOS, SEG_TRAMITACOES, EQUIPE_CLOSER } from "./config.js";

// Quem pode aprovar, reprovar e editar briefings: o admin em qualquer segmento,
// o líder apenas no time dele. Closer comum não gere ninguém.
// Um líder pode responder por mais de um segmento, então "lidera" é sempre
// tratado como lista.
const lidera = (user) => {
  const v = user?.lidera;
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
};

// Quem lidera só uma equipe dentro do segmento: { seg, equipe } ou null.
export const equipeLiderada = (user) => user?.lideraEquipe || null;

export function ehGestor(user) {
  return !!user?.isAdmin || lidera(user).length > 0 || !!equipeLiderada(user);
}

// Segmentos que a pessoa alcança. Admin vê todos; líder de segmento, os dele;
// líder de equipe, apenas o segmento onde fica a equipe dela.
export function segmentosDe(user) {
  if (user?.isAdmin) return SEGMENTOS;
  const meus = new Set(lidera(user));
  const eq = equipeLiderada(user);
  if (eq) meus.add(eq.seg);
  // Na ordem do cadastro, para as abas não dançarem entre as telas.
  return SEGMENTOS.filter((s) => meus.has(s));
}

// O líder não decide sobre closer de segmento que não é dele — e o líder de
// equipe, nem sobre closer de outra equipe do mesmo segmento.
export function podeGerirCloser(user, ownerId) {
  if (user?.isAdmin) return true;
  const seg = SEG_CLOSER[String(ownerId)];
  if (lidera(user).includes(seg)) return true;
  const eq = equipeLiderada(user);
  return !!eq && eq.seg === seg && EQUIPE_CLOSER[String(ownerId)] === eq.equipe;
}

// Regra única de quais briefings a pessoa enxerga. O contador e a tela usavam
// filtros diferentes — a tela exigia closer cadastrado em config.js, o contador
// não. Quem enviava sem estar no cadastro aparecia no número e em tela nenhuma,
// ficando impossível de aprovar.
export function briefingsGeriveis(user, briefings) {
  return briefings.filter((b) => podeGerirCloser(user, b.ownerId));
}

// Tramitações são do time de CS: quem executa são os farmers, não os closers.
// Admin e quem lidera o segmento enxergam o board inteiro.
export function podeVerTramitacoes(user, ownerId) {
  if (user?.isAdmin) return true;
  if (lidera(user).includes(SEG_TRAMITACOES)) return true;
  // Líder de equipe do CS entra e vê a equipe dele.
  if (equipeLiderada(user)?.seg === SEG_TRAMITACOES) return true;
  return SEG_CLOSER[String(ownerId)] === SEG_TRAMITACOES;
}

// A Evolução mede empresas da carteira, e carteira é só do time de CS. Para
// closer ela não tem o que mostrar — some da navegação em vez de abrir vazia.
export function podeVerEvolucao(user) {
  return segmentosDe(user).includes(SEG_TRAMITACOES);
}

// Cadastrar estratégia é mais estreito do que liderar: mexe na lista que o
// time inteiro usa, então vale só para quem foi nomeado curador do segmento.
export const segCurado = (user) => user?.curaEstrategia || null;

// Segmentos cuja lista a pessoa configura. Curador, o dele; admin, todos —
// quem mantém o painel precisa conseguir abrir e conferir a própria tela.
export function segsConfiguraveis(user) {
  if (user?.isAdmin) return SEGMENTOS;
  const seg = segCurado(user);
  return seg ? [seg] : [];
}

export const podeConfigurar = (user) => segsConfiguraveis(user).length > 0;

export function podeCriarEstrategia(user, seg) {
  return !!seg && segsConfiguraveis(user).includes(seg);
}
