// O esqueleto que aparece enquanto a próxima tela é montada no servidor.
//
// Sem este arquivo o Next segura a página ANTIGA na tela, congelada, até o
// servidor terminar. Clicar numa aba não dava retorno nenhum: nem spinner,
// nem mudança, nada. Medido, a tela responde em 148ms com a instância quente
// e passa de 2s com ela fria, e nesse intervalo o painel parecia travado.
//
// O esqueleto não deixa nada mais rápido. Deixa honesto: diz que o clique
// foi recebido e que a tela está vindo.
export default function Carregando() {
  return (
    <div className="wrap">
      <div className="esq-topo">
        <div className="esq esq-logo" />
        <div className="esq esq-titulo" />
      </div>

      <div className="esq-barra">
        <div className="esq esq-aba" />
        <div className="esq esq-aba" />
        <div className="esq esq-aba" />
      </div>

      <div className="card esq-card">
        <div className="esq-linha-topo">
          <div className="esq esq-chip" />
          <div className="esq esq-chip curto" />
        </div>
        {/* Dez linhas: é o tamanho da lista do dia, então o esqueleto ocupa
            mais ou menos a altura do que vai chegar e a página não pula. */}
        {Array.from({ length: 10 }).map((_, i) => (
          <div className="esq-linha" key={i}>
            <div className="esq esq-celula larga" />
            <div className="esq esq-celula" />
            <div className="esq esq-celula" />
            <div className="esq esq-celula media" />
          </div>
        ))}
      </div>
    </div>
  );
}
