// Dominio: comercio por oleadas (drops), preventas y listas de espera.
// STUB válido de Drizzle: columnas clave, enums y FKs; índices/campos pendientes en TODO.
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  jsonb,
  timestamp,
  primaryKey,
} from "drizzle-orm/pg-core";
import { vendors } from "./vendors";
import { products, productVariants } from "./products";
import { users } from "./users";

// Estado de una preventa (umbral de unidades para producir).
export const preorderEstadoEnum = pgEnum("preorder_estado", [
  "abierta",
  "alcanzada",
  "produciendo",
  "cerrada",
  "cancelada",
]);

// Drops: lanzamientos agendados con cuenta regresiva y stock limitado.
export const drops = pgTable("drops", {
  id: uuid("id").defaultRandom().primaryKey(),
  vendorId: uuid("vendor_id")
    .notNull()
    .references(() => vendors.id, { onDelete: "cascade" }),
  titulo: text("titulo").notNull(),
  iniciaEn: timestamp("inicia_en", { withTimezone: true }).notNull(),
  terminaEn: timestamp("termina_en", { withTimezone: true }),
  // Stock total del drop (límite agregado del lanzamiento).
  stockTotal: integer("stock_total"),
  // Reglas del drop: límite por persona, acceso por cola, descuentos, etc.
  reglas: jsonb("reglas").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  // TODO: slug de la landing; índice por (vendor_id, inicia_en) para el calendario de drops.
});

// Relación N:M drop ↔ productos incluidos.
export const dropProducts = pgTable(
  "drop_products",
  {
    dropId: uuid("drop_id")
      .notNull()
      .references(() => drops.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
  },
  (dp) => ({
    pk: primaryKey({ columns: [dp.dropId, dp.productId] }),
  })
);

// Preventas: se vende antes de producir; se produce si se alcanza la meta de unidades.
export const preorders = pgTable("preorders", {
  id: uuid("id").defaultRandom().primaryKey(),
  productId: uuid("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  // Umbral de unidades para activar la producción.
  metaUnidades: integer("meta_unidades").notNull(),
  fechaLimite: timestamp("fecha_limite", { withTimezone: true }),
  estado: preorderEstadoEnum("estado").notNull().default("abierta"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  // TODO: contador de unidades comprometidas; índice por estado.
});

// Listas de espera: avisar cuando hay restock o nuevo drop de una variante.
export const waitlists = pgTable(
  "waitlists",
  {
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (w) => ({
    pk: primaryKey({ columns: [w.variantId, w.userId] }),
    // TODO: campo "notificado_en" para no avisar dos veces por el mismo restock.
  })
);

// Fin del dominio de drops y preventas.
