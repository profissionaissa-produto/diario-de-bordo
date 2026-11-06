// A foto de quem está logado, nos cabeçalhos.
//
// Ordem de preferência: a foto do Google, depois a cadastrada em FOTOS por
// ownerId, depois as iniciais. A do Google vem de graça com o login e está
// sempre atualizada; o mapa fixo cobre 18 das 25 pessoas e envelhece a cada
// troca de time.
export function iniciais(nome) {
  return String(nome || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

export default function Avatar({ foto, nome, className = "pfp" }) {
  if (!foto) return <div className={className}>{iniciais(nome)}</div>;
  return (
    <div className={className}>
      {/* referrerPolicy: sem ela o googleusercontent recusa a imagem quando o
          Referer é outro domínio, e a foto some sem erro visível. */}
      <img src={foto} alt={nome || ""} referrerPolicy="no-referrer" />
    </div>
  );
}
