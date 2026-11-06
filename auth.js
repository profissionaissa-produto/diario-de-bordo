import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { ADMIN_EMAILS, ALLOWED_DOMAIN, segLideradoPor, equipeLideradaPor, segCuradoPor } from "./lib/config";

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true, // confia no host do deploy (Vercel) — exigido pelo NextAuth v5
  pages: { signIn: "/login" },
  providers: [Google],
  callbacks: {
    // Só e-mails do domínio da empresa entram.
    async signIn({ profile }) {
      const email = (profile?.email || "").toLowerCase();
      return email.endsWith("@" + ALLOWED_DOMAIN);
    },
    async session({ session }) {
      const email = (session.user?.email || "").toLowerCase();
      session.user.isAdmin = ADMIN_EMAILS.includes(email);
      // Segmento que a pessoa lidera (null se não for líder).
      session.user.lidera = segLideradoPor(email);
      // Quem lidera só uma equipe dentro do segmento (null se não for o caso).
      session.user.lideraEquipe = equipeLideradaPor(email);
      // Segmento em que a pessoa pode cadastrar estratégia (null se nenhum).
      session.user.curaEstrategia = segCuradoPor(email);
      // A foto do perfil do Google. Vem de graça com o login e está sempre
      // atualizada, diferente do mapa fixo por ownerId em config.js, que
      // cobre 18 das 25 pessoas e envelhece a cada troca de time.
      session.user.foto = session.user.image || null;
      return session;
    },
    // Usado pelo middleware: exige sessão.
    authorized({ auth }) {
      return !!auth?.user;
    },
  },
});
