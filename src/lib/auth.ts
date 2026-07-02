// auth.ts — configuración central de Auth.js v5 para Ágora Campus.
// Login PRIMARIO: auth propio (email institucional + contraseña) en
// src/lib/auth-actions.ts, que crea filas en `sessions` + cookie — auth() las
// honra igual que un login de provider (strategy "database").
// Google y Resend son OPCIONALES: solo se registran si su env está presente
// (providers puede quedar [] — Auth.js lo acepta y auth()/signOut siguen
// funcionando con las sesiones de BD).
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
    // Google — OPCIONAL: solo se registra si hay AUTH_GOOGLE_ID en el entorno
    // (la página de login oculta el botón en ese caso). Google verifica el
    // email por nosotros; allowDangerousEmailAccountLinking permite que quien
    // entró primero por otro método luego use Google con el MISMO correo sin
    // chocar con "OAuthAccountNotLinked". Es seguro aquí porque Google
    // garantiza la propiedad del correo institucional.
    ...(process.env.AUTH_GOOGLE_ID
      ? [Google({ allowDangerousEmailAccountLinking: true })]
      : []),
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
    // linkAccount — al vincularse una cuenta OAuth verificada (Google), se
    // ANULA la contraseña local del usuario. Evita account-takeover: con
    // allowDangerousEmailAccountLinking, un atacante pudo registrar el correo
    // de la víctima con contraseña ANTES de que ella entrara con Google; si esa
    // contraseña siguiera viva, el atacante conservaría acceso a la cuenta ya
    // legítima. Google garantiza la propiedad del correo, así que el dueño real
    // es quien acaba de vincular — la contraseña previa deja de ser confiable.
    async linkAccount({ user }) {
      if (!user.id) return;
      await db
        .update(users)
        .set({ passwordHash: null })
        .where(eq(users.id, user.id));
    },
  },
});

// Fin de auth.ts
