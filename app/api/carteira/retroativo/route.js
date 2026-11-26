import { auth } from "../../../../auth";
import { criarNotaNaEmpresa } from "../../../../lib/hubspot";
import { resultadosSemRegistroNoCrm, dbReady } from "../../../../lib/db";
import { NOME_CLOSER } from "../../../../lib/config";

// Leva ao HubSpot o que ficou registrado só no Diário.
//
// Até 26/11/2026 os resultados "não abordei" e "trocar de segmento" não
// escreviam nada no CRM. A regra mudou, mas o que já estava gravado continuou
// preso, e o time não vai refazer registro à mão.
//
// GET  simula: diz quantos são e mostra os primeiros, sem escrever nada.
// POST grava de verdade.
//
// Só admin, e de propósito: é escrita em lote na timeline de dezenas de
// empresas, não é operação de dia a dia.

export const maxDuration = 300;

const LABEL = { nao_abordei: "não abordou", trocar_segmento: "pediu troca de segmento" };

const corpoDa = (r) =>
  [
    `<p><b>Diário de bordo · ${LABEL[r.resultado] || r.resultado}</b></p>`,
    r.observacao ? `<p>${String(r.observacao).replace(/\n/g, "<br>")}</p>` : "",
    `<p><i>registrado no Diário em ${r.dia}${
      r.editado_por ? ` por ${r.editado_por}` : NOME_CLOSER[String(r.owner_id)] ? ` por ${NOME_CLOSER[String(r.owner_id)]}` : ""
    }, levado ao HubSpot depois</i></p>`,
  ]
    .filter(Boolean)
    .join("");

async function pendentes() {
  const linhas = await resultadosSemRegistroNoCrm();
  return linhas.map((r) => ({ ...r, corpo: corpoDa(r) }));
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.isAdmin) return Response.json({ error: "Apenas admin." }, { status: 403 });
  if (!dbReady()) return Response.json({ error: "Banco não configurado." }, { status: 503 });

  const linhas = await pendentes();
  const porResultado = {};
  const porDia = {};
  const porFarmer = {};
  for (const r of linhas) {
    porResultado[r.resultado] = (porResultado[r.resultado] || 0) + 1;
    porDia[r.dia] = (porDia[r.dia] || 0) + 1;
    const quem = NOME_CLOSER[String(r.owner_id)] || r.owner_id;
    porFarmer[quem] = (porFarmer[quem] || 0) + 1;
  }
  return Response.json({
    ok: true,
    simulacao: true,
    total: linhas.length,
    porResultado,
    porFarmer,
    porDia,
    amostra: linhas.slice(0, 5).map((r) => ({ dia: r.dia, empresa: r.nome, resultado: r.resultado, corpo: r.corpo })),
  });
}

export async function POST() {
  const session = await auth();
  if (!session?.user?.isAdmin) return Response.json({ error: "Apenas admin." }, { status: 403 });
  if (!dbReady()) return Response.json({ error: "Banco não configurado." }, { status: 503 });

  const linhas = await pendentes();
  let gravadas = 0;
  const falhas = [];
  for (const r of linhas) {
    try {
      await criarNotaNaEmpresa(r.company_id, { corpo: r.corpo, ownerId: r.owner_id });
      gravadas += 1;
    } catch (e) {
      // Uma empresa que falha não derruba o lote, mas também não some: volta
      // na resposta com o motivo, para a carga poder ser refeita só nelas.
      console.error(`[retroativo] falhou na empresa ${r.company_id}:`, e?.message);
      falhas.push({ companyId: r.company_id, empresa: r.nome, dia: r.dia, motivo: e?.message || "erro" });
    }
  }
  return Response.json({ ok: true, total: linhas.length, gravadas, falhas });
}
