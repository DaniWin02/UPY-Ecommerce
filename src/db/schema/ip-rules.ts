// Dominio: control de acceso por IP (reglas CIDR) y bitácora de auditoría.
// STUB válido de Drizzle: columnas clave, enums y FKs; índices/campos pendientes en TODO.
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  boolean,
  jsonb,
  timestamp,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import { vendors } from "./vendors";

// Alcance de la regla de IP (toda la tienda, panel admin, o acciones de un vendor).
export const ipScopeEnum = pgEnum("ip_scope", ["global", "admin", "vendor"]);

// Acción de la regla: permitir o denegar el rango.
export const ipAccionEnum = pgEnum("ip_accion", ["allow", "deny"]);

// Reglas de IP evaluadas en el middleware (match CIDR sobre x-forwarded-for).
// Listas blancas/negras combinables por prioridad (ver PLAN.md §6).
export const ipRules = pgTable("ip_rules", {
  id: uuid("id").defaultRandom().primaryKey(),
  scope: ipScopeEnum("scope").notNull(),
  // Rango en notación CIDR (p. ej. "10.0.0.0/8" para la red del campus).
  cidr: text("cidr").notNull(),
  accion: ipAccionEnum("accion").notNull(),
  // Mayor prioridad gana al resolver conflictos entre reglas.
  prioridad: integer("prioridad").notNull().default(0),
  // Solo para scope=vendor: a qué vendor aplica (null en global/admin).
  vendorId: uuid("vendor_id").references(() => vendors.id, { onDelete: "cascade" }),
  activo: boolean("activo").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  // TODO: índice por (scope, activo, prioridad) para evaluación rápida en el middleware.
});

// Bitácora de auditoría: quién hizo qué, con snapshots antes/después.
export const auditLog = pgTable("audit_log", {
  id: uuid("id").defaultRandom().primaryKey(),
  // Actor de la acción; null si fue el sistema (jobs de pg-boss).
  actorId: uuid("actor_id").references(() => users.id),
  accion: text("accion").notNull(),
  // Entidad afectada (p. ej. "order:<id>", "payment:<id>", "ip_rule:<id>").
  entidad: text("entidad").notNull(),
  antes: jsonb("antes"),
  despues: jsonb("despues"),
  ts: timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
  // TODO: índices por (entidad) y (actor_id, ts) para investigaciones.
});

// Fin del dominio de reglas de IP y auditoría.
