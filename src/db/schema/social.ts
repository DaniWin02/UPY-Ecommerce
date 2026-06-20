// Dominio: capa social (compras grupales por aula, wishlists, follows, notificaciones).
// STUB válido de Drizzle: columnas clave, enums y FKs; índices/campos pendientes en TODO.
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  jsonb,
  boolean,
  timestamp,
  primaryKey,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import { vendors } from "./vendors";
import { products } from "./products";
import { payments } from "./payments";

// Estado de una compra grupal por aula.
export const groupBuyEstadoEnum = pgEnum("group_buy_estado", [
  "abierta",
  "meta_alcanzada",
  "cerrada",
  "cancelada",
]);

// Compras grupales: un líder abre una compra por aula con meta de cantidad y fecha límite.
// Clave anti-reembolso: se cobran los comprobantes solo al alcanzar la meta.
export const groupBuys = pgTable("group_buys", {
  id: uuid("id").defaultRandom().primaryKey(),
  productId: uuid("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  // Aula/grupo objetivo de la compra grupal.
  aula: text("aula").notNull(),
  liderId: uuid("lider_id")
    .notNull()
    .references(() => users.id),
  metaCantidad: integer("meta_cantidad").notNull(),
  fechaLimite: timestamp("fecha_limite", { withTimezone: true }),
  estado: groupBuyEstadoEnum("estado").notNull().default("abierta"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  // TODO: índice por (estado, fecha_limite) para cierres automáticos vía pg-boss.
});

// Miembros que se suman a una compra grupal con su cantidad y (al cobrar) su pago.
export const groupBuyMembers = pgTable(
  "group_buy_members",
  {
    groupBuyId: uuid("group_buy_id")
      .notNull()
      .references(() => groupBuys.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    cantidad: integer("cantidad").notNull().default(1),
    // Pago asociado (se crea/concilia al alcanzar la meta); null mientras no se cobra.
    paymentId: uuid("payment_id").references(() => payments.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (gbm) => ({
    pk: primaryKey({ columns: [gbm.groupBuyId, gbm.userId] }),
  })
);

// Wishlists (incluye colaborativas: "kit de bienvenida de mi carrera").
export const wishlists = pgTable("wishlists", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  nombre: text("nombre").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  // TODO: visibilidad (privada/compartida), token de compartir; tabla wishlist_items.
});

// Colaboradores invitados a una wishlist compartida.
export const wishlistCollaborators = pgTable(
  "wishlist_collaborators",
  {
    wishlistId: uuid("wishlist_id")
      .notNull()
      .references(() => wishlists.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (wc) => ({
    pk: primaryKey({ columns: [wc.wishlistId, wc.userId] }),
  })
);

// Seguir tiendas (feed de novedades y avisos de drops).
export const follows = pgTable(
  "follows",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendors.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (f) => ({
    pk: primaryKey({ columns: [f.userId, f.vendorId] }),
  })
);

// Notificaciones in-app (espejo de correo/WhatsApp) por cambios de estado y eventos sociales.
export const notifications = pgTable("notifications", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  // Tipo de evento (p. ej. "pago_verificado", "pedido_listo", "drop_inicia").
  tipo: text("tipo").notNull(),
  // Datos del evento para renderizar el aviso (orderId, dropId, etc.).
  payload: jsonb("payload").notNull().default({}),
  leido: boolean("leido").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  // TODO: índice por (user_id, leido, created_at) para la bandeja del usuario.
});

// Fin del dominio social.
