// auth.ts — configuración central de Auth.js v5 para Ágora Campus.
// Providers: Google OAuth + Resend (magic link). Adaptador: Drizzle sobre PostgreSQL.
// La ÚNICA puerta de entrada es el dominio de correo institucional (comunidad cerrada).
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Resend from "next-auth/providers/resend";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users, accounts, sessions, verificationTokens } from "@/db/schema";
import { isEmailDomainAllowed } from "./auth-domains";

// Re-export para compatibilidad: otros módulos/tests pueden seguir importando
// la validación de dominios desde "@/lib/auth".
export { isEmailDomainAllowed, allowedEmailDomains } from "./auth-domains";

// Rol global tal como vive en la fila de users (enum rol_global de la BD).
type RolGlobal = "comprador" | "vendor" | "superadmin";

export const { handlers, auth, signIn, signOut } = NextAuth({
  // OJO: el mapeo de tablas es OBLIGATORIO — nuestros nombres (users, accounts,
  // sessions, verificationTokens) difieren de los defaults del adaptador.
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  // Sesiones en base de datos: revocables al instante — imprescindible en una
  // comunidad cerrada (expulsar a alguien = borrar sus filas de sessions).
  session: { strategy: "database" },
  // trustHost: necesario en self-host/VPS y CI, donde Auth.js no puede
  // inferir el host confiable de la plataforma (como sí hace en Vercel).
  trustHost: true,
  providers: [
    // Google verifica el email por nosotros; allowDangerousEmailAccountLinking
    // permite que quien entró primero por magic link luego use Google con el
    // MISMO correo sin chocar con "OAuthAccountNotLinked". Es seguro aquí
    // porque Google garantiza la propiedad del correo institucional.
    Google({ allowDangerousEmailAccountLinking: true }),
    // Magic link por correo vía Resend — OPCIONAL: solo se registra si hay
    // RESEND_API_KEY en el entorno. Sin la key, el login queda solo-Google
    // (la página de login oculta el formulario de correo en ese caso).
    // Con la API key de prueba de Resend, el remitente debe ser onboarding@resend.dev.
    ...(process.env.RESEND_API_KEY
      ? [
          Resend({
            from: process.env.EMAIL_FROM ?? "Ágora Campus <onboarding@resend.dev>",
          }),
        ]
      : []),
  ],
  pages: {
    signIn: "/auth/login",
    // Tras pedir el magic link, se vuelve al login con aviso de "correo enviado".
    verifyRequest: "/auth/login?enviado=1",
    // Errores (dominio rechazado, OAuth fallido…) también aterrizan en el login.
    error: "/auth/login",
  },
  callbacks: {
    // signIn — ÚNICA puerta: solo correos de dominios institucionales permitidos.
    // Aplica igual a Google (profile.email) y a Resend/magic link (user.email).
    async signIn({ user, profile }) {
      const email = user?.email ?? profile?.email;
      return isEmailDomainAllowed(email);
    },
    // session — expone id y rolGlobal al cliente/servidor vía useSession()/auth().
    // Con strategy "database", `user` es la fila COMPLETA de users que devuelve
    // el adaptador (incluye rolGlobal), aunque el tipo AdapterUser no lo sepa.
    async session({ session, user }) {
      session.user.id = user.id;
      session.user.rolGlobal =
        (user as typeof user & { rolGlobal?: RolGlobal }).rolGlobal ??
        "comprador";
      return session;
    },
  },
  events: {
    // createUser — al crearse el usuario ya pasó el filtro de dominio del
    // callback signIn, así que lo marcamos como verificado de COMUNIDAD.
    // (verificadoEn es NUESTRO campo; emailVerified lo escribe el adaptador.)
    async createUser({ user }) {
      if (!user.id) return;
      await db
        .update(users)
        .set({ verificadoEn: new Date() })
        .where(eq(users.id, user.id));
    },
  },
});

// Fin de auth.ts
