// Dominio: vendedores (facultades, clubes, emprendimientos) y sus miembros.
// STUB válido de Drizzle: columnas clave, enums y FKs; índices/campos pendientes en TODO.
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  primaryKey,
} from "drizzle-orm/pg-core";
import { users } from "./users";

// Tipo de vendedor (escaparate) dentro del campus.
export const vendorTipoEnum = pgEnum("vendor_tipo", [
  "facultad",
  "club",
  "emprendimiento",
]);

// Estado de aprobación/operación del vendedor (lo aprueba el SuperAdmin).
export const vendorEstadoEnum = pgEnum("vendor_estado", [
  "pendiente",
  "activo",
  "suspendido",
]);

// Rol de un miembro dentro del equipo del vendedor.
export const vendorRolEnum = pgEnum("vendor_rol", ["owner", "staff"]);

// Vendedores: cada facultad/club/emprendimiento con su escaparate y CLABE propia.
export const vendors = pgTable("vendors", {
  id: uuid("id").defaultRandom().primaryKey(),
  slug: text("slug").notNull().unique(),
  nombre: text("nombre").notNull(),
  tipo: vendorTipoEnum("tipo").notNull(),
  // CLABE interbancaria del vendor: el dinero (SPEI) va directo (la plataforma no custodia fondos).
  clabe: text("clabe"),
  estado: vendorEstadoEnum("estado").notNull().default("pendiente"),
  // Aula por defecto para entregas (encaja con compras grupales por aula).
  aulaDefault: text("aula_default"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  // TODO: institution_id (FK), descripcion, logo_url, comisión pactada, política de entrega.
  // TODO: índice por estado para la cola de aprobación del SuperAdmin.
});

// Miembros del equipo del vendor (owner + staff). PK compuesta vendor_id + user_id.
export const vendorMembers = pgTable(
  "vendor_members",
  {
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendors.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    rol: vendorRolEnum("rol").notNull().default("staff"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (vm) => ({
    pk: primaryKey({ columns: [vm.vendorId, vm.userId] }),
    // TODO: índice por user_id para resolver "mis tiendas" del usuario.
  })
);

// Fin del dominio de vendedores.
