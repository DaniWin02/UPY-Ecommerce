// Dominio: usuarios e instituciones (comunidad cerrada del campus).
// STUB válido de Drizzle: columnas clave, enums y FKs; índices/campos pendientes en TODO.
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  jsonb,
  timestamp,
  primaryKey,
  integer,
} from "drizzle-orm/pg-core";

// Rol global del usuario dentro de la plataforma.
export const rolGlobalEnum = pgEnum("rol_global", [
  "comprador",
  "vendor",
  "superadmin",
]);

// Instituciones (universidades) dueñas de la comunidad. Una por despliegue, multi-tenant a futuro.
export const institutions = pgTable("institutions", {
  id: uuid("id").defaultRandom().primaryKey(),
  nombre: text("nombre").notNull(),
  // Dominios de correo permitidos (p. ej. ["@uni.mx", "@alumnos.uni.mx"]).
  dominios: text("dominios").array().notNull().default([]),
  // Configuración libre: flags (IP_GATE_ENABLED), branding, comisiones, etc.
  config: jsonb("config").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  // TODO: índice único sobre nombre/slug institucional si se vuelve multi-tenant.
});

// Usuarios: alumnos/docentes/staff verificados + vendors + superadmins.
export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  nombre: text("nombre"),
  rolGlobal: rolGlobalEnum("rol_global").notNull().default("comprador"),
  institutionId: uuid("institution_id").references(() => institutions.id),
  // Marca de verificación de comunidad (SSO institucional u OTP); null = no verificado.
  verificadoEn: timestamp("verificado_en", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  // TODO: campos Auth.js (image, emailVerified) si se usa el adaptador estándar.
  // TODO: índice por institution_id para listados de comunidad.
});

// --- Tablas del adaptador de Auth.js v5 (@auth/drizzle-adapter) ---
// STUB: estructura mínima para que el adaptador funcione; revisar contra la forma oficial.

// Cuentas OAuth/credenciales ligadas a un usuario (Google, etc.).
export const accounts = pgTable(
  "accounts",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    // TODO: tokens y metadatos OAuth (access_token, refresh_token, expires_at, scope, id_token...).
  },
  (account) => ({
    pk: primaryKey({ columns: [account.provider, account.providerAccountId] }),
  })
);

// Sesiones activas (estrategia de base de datos de Auth.js).
export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { withTimezone: true }).notNull(),
  // TODO: índice por user_id para invalidar sesiones de un usuario.
});

// Tokens de verificación (magic link / OTP por correo).
export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { withTimezone: true }).notNull(),
    // TODO: campo extra "intentos" si se limita el OTP.
    _placeholder: integer("_placeholder"), // TODO: eliminar; placeholder para mantener el stub válido.
  },
  (vt) => ({
    pk: primaryKey({ columns: [vt.identifier, vt.token] }),
  })
);

// Fin del dominio de usuarios e instituciones.
