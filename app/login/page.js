import { redirect } from "next/navigation";
import { auth, signIn } from "../../auth";
import { ALLOWED_DOMAIN } from "../../lib/config";

// O NextAuth devolve para cá com ?error= quando a entrada é recusada. Sem
// traduzir, a pessoa só via a mesma tela de novo e não sabia o que fazer.
const ERROS = {
  AccessDenied: `Essa conta não é do domínio @${ALLOWED_DOMAIN}. Entre com o seu e-mail da PSA; conta pessoal não tem acesso.`,
  Verification: "O link de acesso expirou. Tente entrar de novo.",
  Configuration: "O login está mal configurado no servidor. Avise quem cuida do painel.",
};

export default async function LoginPage({ searchParams }) {
  const session = await auth();
  if (session?.user) redirect("/");

  const cod = searchParams?.error;
  const erro = cod ? ERROS[cod] || `Não foi possível entrar (${cod}). Tente de novo.` : "";

  return (
    <div className="login">
      <div className="login-card">
        <img className="login-logo" src="/logo-psa-laranja.png" alt="PSA" />
        <h1>Diário de Bordo</h1>

        {erro && <p className="login-erro">{erro}</p>}

        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/" });
          }}
        >
          <button className="gbtn" type="submit">Entrar com Google</button>
        </form>

        <p className="login-rodape">
          Use a sua conta <b>@{ALLOWED_DOMAIN}</b>. Se entrar e aparecer
          &quot;sem cadastro&quot;, é o seu usuário do HubSpot que precisa ser
          vinculado. Fale com quem cuida do painel.
        </p>
      </div>
    </div>
  );
}
