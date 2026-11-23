import { auth } from "../../../auth";
import { buscaPalestrantes, dashPronto } from "../../../lib/dash";

// Busca de palestrante por nome, para o closer escolher de quem a mensagem vai
// falar. A base é o Dash, que é onde o cadastro vive.
//
// Só lê e só devolve nome: nada de telefone nem e-mail. Esta mensagem vai para
// o CLIENTE e fala sobre o palestrante, não para o palestrante.
export async function GET(req) {
  const session = await auth();
  if (!session?.user?.email) return Response.json({ error: "Não autenticado." }, { status: 401 });

  if (!dashPronto()) {
    return Response.json(
      { error: "A busca de palestrante não está configurada. Falta PSA_API_KEY no ambiente." },
      { status: 503 }
    );
  }

  const q = new URL(req.url).searchParams.get("q") || "";
  if (q.trim().length < 3) return Response.json({ ok: true, itens: [] });

  try {
    return Response.json({ ok: true, itens: await buscaPalestrantes(q) });
  } catch (e) {
    // O motivo vai inteiro para o log e resumido para a tela: chave recusada e
    // Dash fora do ar mandam procurar em lugares diferentes.
    console.error("[palestrantes] falha na busca:", e);
    return Response.json({ error: e.message || "Falha ao buscar no Dash." }, { status: 502 });
  }
}
