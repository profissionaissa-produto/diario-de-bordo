// Estratégias que o closer pode usar ao atuar no negócio, por segmento.
// O id é gravado no briefing ("b2b-3"), então não pode mudar depois de usado —
// para reescrever um item, altere título/descrição e mantenha o id.
const _EST = {
  B2B: [
    {
      id: "b2b-1",
      titulo: "Conteúdo ou notícia do segmento",
      desc: '"Vi e lembrei de vocês". Pesquisa pública, zero dependência. Usa a leitura do cliente que você já faz antes da reunião.',
    },
    {
      id: "b2b-2",
      titulo: "Vulnerabilidade (história do Busch)",
      desc: "Técnica de conversa pura. Sem custo, sem ativo, sem aprovação. É a de maior alavancagem da lista porque destrava o motivo real do silêncio.",
    },
    {
      id: "b2b-3",
      titulo: "Pré-briefing",
      desc: "Só depende de agenda sua com o cliente. É a lógica Smacna: vender método de curadoria antes de nome.",
    },
    {
      id: "b2b-4",
      titulo: "Short ou corte de palestra do nome indicado",
      desc: "Autônoma se o conteúdo já for público (YouTube, Instagram do palestrante). Se precisar de material bruto interno, vira dependente.",
    },
    {
      id: "b2b-5",
      titulo: "Case do palestrante em empresa do mesmo segmento",
      desc: "Autônoma, mas hoje exige garimpo deal a deal no HubSpot. Executável sozinho, só é lento.",
    },
    {
      id: "b2b-6",
      titulo: "Case próprio (evento semelhante bem-sucedido)",
      desc: "Você tem os seus cases. Não precisa do Felipe para contar um evento que você mesmo fechou.",
    },
    {
      id: "b2b-7",
      titulo: "PSA Experience",
      desc: 'Compartilha o case e sonda: "quem ou qual linha você gostaria de assistir?". A pergunta devolve o perfil desejado sem queimar nome.',
    },
    {
      id: "b2b-8",
      titulo: "TBS e TBW",
      desc: "Mapear leads com aderência é análise da sua própria base. Com a final da 3ª edição em 21/11, a janela é sua.",
    },
    {
      id: "b2b-9",
      titulo: "Troca de jogador dentro da shortlist já curada",
      desc: "Se o substituto já passou por curadoria e screening, é decisão comercial. Se exige nome novo, vira demanda de curadoria e sai da lista.",
    },
    {
      id: "b2b-10",
      titulo: "Escassez com lastro verificável no CRM",
      desc: "Cheque no HubSpot se existe outro deal aberto com o mesmo palestrante na mesma data. Isso é escassez real e defensável. Reajuste de cachê não entra: depende do palestrante.",
    },
  ],
  B2C: [
    {
      id: "b2c-1",
      titulo: "Demanda do B2B que ele poderia ser indicado",
      desc: "Enviar demanda do B2B em que ele poderia ser indicado se estivesse no TBW.",
    },
    {
      id: "b2c-2",
      titulo: "Print da rede social do cliente",
      desc: "Printar a rede social do cliente e perguntar se o contratante fecharia vendo aquilo / se está claro o que ele resolve.",
    },
    {
      id: "b2c-3",
      titulo: "Evidências dos temas mais vendidos",
      desc: "Enviar evidências dos temas mais vendidos e mostrar que tem dinheiro na mesa.",
    },
    {
      id: "b2c-4",
      titulo: "Comparação com palestrante do mesmo tema",
      desc: "Mandar rede social de palestrante do mesmo tema/cachê e perguntar qual é o diferencial do lead e por que o cliente escolheria ele.",
    },
    {
      id: "b2c-5",
      titulo: "Contato de ex-alunos do mesmo tema",
      desc: "Enviar nomes e contatos de ex-alunos do mesmo tema para ele conversar.",
    },
    {
      id: "b2c-6",
      titulo: "Chamar o NICO para a reunião de FUP",
      desc: "Trazer o NICO para a reunião de follow-up.",
    },
    {
      id: "b2c-7",
      titulo: "Desconto vinculado ao lote de fechamento",
      desc: "R$ 12k essa semana → R$ 15k semana que vem → R$ 18k em setembro.",
    },
    {
      id: "b2c-8",
      titulo: "Vídeo de depoimento de ex-participante",
      desc: "Enviar vídeo de depoimento de quem já participou.",
    },
    {
      id: "b2c-9",
      titulo: "Chamar o lead para LIVE com o Márcio",
      desc: "Convidar o lead para uma live com o Márcio.",
    },
    {
      id: "b2c-10",
      titulo: "Cadeira no TBD ou Plataforma",
      desc: "Dar cadeira no TBD ou Plataforma para fechar TBW.",
    },
  ],
};

// O Farmer nasceu herdando as dez do B2B, e isso estava errado: aquelas
// dez são técnicas de fechamento de contrato, de closer em negociação, e
// apareciam na tela de quem cuida de cliente que já comprou. Saíram em
// 04/11/2026. A lista do Farmer agora é só o que for cadastrado nela.
//
// Os ids b2b-* continuam no índice pelo B2B, então o briefing antigo de
// farmer que gravou um deles continua mostrando o nome da estratégia.
// As três do Financeiro não são invenção nossa: estão escritas no documento
// do processo, na etapa "Estratégias por tentativa", e por isso entram como
// semente. O Farmer segue vazio porque ali nunca houve lista escrita.
//
// A ordem importa: a 1ª estratégia é a da 1ª tentativa, e é isso que
// lib/financeiro.js usa para sugerir a da vez. Mexer no id quebra a amarração,
// então para reescrever uma delas troque título e descrição, nunca o id.
const _FIN = [
  {
    id: "fin-1",
    titulo: "Lembrete cordial no vencimento",
    desc: "Primeira cobrança. Tom cordial, com o valor, a data de vencimento e os dados para pagamento. E-mail e WhatsApp no dia do vencimento.",
  },
  {
    id: "fin-2",
    titulo: "Aviso de atraso, com multa e juros",
    desc: "Segunda cobrança. Avisa o atraso citando a multa e os juros previstos em contrato, e pede previsão de pagamento ou o comprovante. WhatsApp primeiro, e-mail formal em seguida.",
  },
  {
    id: "fin-3",
    titulo: "Escalonamento com o gestor",
    desc: "Terceira cobrança em diante. Procura o responsável no cliente, propõe nova data e envolve o Charlau. Ligação e e-mail com cópia ao gestor.",
  },
];

export const SEMENTES = { ..._EST, Farmer: [], Financeiro: _FIN };

// Prefixo do id por segmento. Farmer tem o seu porque uma estratégia nova dele
// não pode colidir com uma nova do B2B.
const PREFIXO = { B2B: "b2b", B2C: "b2c", Farmer: "farmer", Financeiro: "fin" };
const SEG_DO_PREFIXO = Object.fromEntries(
  Object.entries(PREFIXO).map(([seg, p]) => [p, seg])
);

// Junta as sementes com o que foi cadastrado no banco. Segmento desconhecido
// é descartado em vez de criar uma lista fantasma que ninguém vê.
// Junta as dez originais do código com o que está no banco.
//
// Linha do banco com o mesmo id de uma original NÃO é duplicata: é a edição
// dela. Substitui no lugar, preservando a ordem, senão a estratégia editada
// pularia para o fim da lista e trocaria de número.
export function montaEstrategias(extras = []) {
  const out = Object.fromEntries(Object.entries(SEMENTES).map(([s, l]) => [s, [...l]]));
  for (const e of extras) {
    if (!out[e.seg]) continue;
    const i = out[e.seg].findIndex((x) => x.id === e.id);
    if (i >= 0) out[e.seg][i] = { ...out[e.seg][i], ...e };
    else out[e.seg].push(e);
  }
  return out;
}

// Tira da lista o que o curador removeu. Só para escolher e exibir: o índice
// continua sendo montado da lista inteira, senão o briefing já gravado com uma
// estratégia removida perderia o nome dela.
export function semOcultas(porSeg, ocultas = {}) {
  return Object.fromEntries(
    Object.entries(porSeg).map(([s, l]) => [s, l.filter((e) => !ocultas[s]?.[e.id])])
  );
}

export function indexaPorId(porSeg) {
  const out = {};
  for (const lista of Object.values(porSeg || {})) for (const e of lista) out[e.id] = e;
  return out;
}

// Índice só das sementes: serve de piso para quem roda sem banco.
export const ESTRATEGIAS = SEMENTES;
export const estrategiaPorId = indexaPorId(SEMENTES);

// "3. Pré-briefing" — o número ajuda o closer a falar dela na reunião.
export const numeroDa = (id) => Number(String(id).split("-")[1]) || "";

// Próximo id livre do segmento. Numera dentro da lista inteira (sementes mais
// cadastradas), senão a segunda estratégia nova repetiria o número da primeira.
export function proximoId(seg, lista = []) {
  if (!PREFIXO[seg]) return null;
  const maior = lista.reduce((m, e) => Math.max(m, Number(numeroDa(e.id)) || 0), 0);
  return `${PREFIXO[seg]}-${maior + 1}`;
}

// Texto que vai para o HubSpot: "B2B 3. Pré-briefing". Leva o segmento porque
// b2b-3 e b2c-3 são estratégias diferentes, e o número porque é assim que o
// closer se refere a ela na reunião.
export function rotuloDa(id, idx = estrategiaPorId) {
  const e = idx[id];
  if (!e) return "";
  const seg = SEG_DO_PREFIXO[String(id).split("-")[0]] || "B2B";
  return `${seg.toUpperCase()} ${numeroDa(id)}. ${e.titulo}`;
}

// Valor da estratégia a enviar ao HubSpot, resolvido contra a propriedade real:
//   propriedade inexistente -> undefined (não manda nada)
//   campo de texto          -> o rótulo legível
//   dropdown                -> o valor interno da opção correspondente
// Num dropdown, valor fora da lista é descartado sem erro, então preferimos
// não mandar nada a gravar algo que o HubSpot vai ignorar calado.
const semAcento = (s) =>
  String(s || "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();

// Resolve um valor nosso contra a propriedade real da conta. `candidatos` são
// as formas que a opção pode ter lá; a primeira é a que vai num campo de texto.
export function valorNaOpcao(prop, candidatos, ondeFalhou = `"${candidatos[0]}"`) {
  const formas = candidatos.filter(Boolean);
  if (!prop || formas.length === 0) return undefined;
  if (prop.opcoes.length === 0) return formas[0]; // campo de texto

  // Compara contra o valor interno e o rótulo, sem acento, porque os dois
  // variam conforme quem criou a opção.
  const alvos = new Set(formas.map(semAcento));
  const achou = prop.opcoes.find(
    (o) => alvos.has(semAcento(o.value)) || alvos.has(semAcento(o.label))
  );
  if (!achou) {
    console.error(`${ondeFalhou} não tem opção correspondente na propriedade`);
    return undefined;
  }
  return achou.value;
}

export function valorDaEstrategia(prop, id, idx = estrategiaPorId) {
  const e = idx[id];
  if (!e) return undefined;
  // A ordem importa só em campo de texto, onde vale a primeira: grava o
  // título limpo, igual aos 878 negócios que o seletor antigo já preencheu.
  // O rótulo com segmento e número é posição e muda quando a lista é
  // reordenada, então não serve de valor gravado.
  //
  // Em dropdown a ordem não muda nada: a busca percorre todas as formas.
  return valorNaOpcao(
    prop,
    [e.titulo, rotuloDa(id, idx), id],
    `[briefing] estratégia ${id} ("${e.titulo}")`
  );
}
