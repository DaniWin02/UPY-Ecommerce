// Dominio: analítica (eventos crudos + rollups diarios por producto/vendor).
// STUB válido de Drizzle: columnas clave, enums y FKs; índices/campos pendientes en TODO.
//
// PRIVACIDAD: no se persisten IP ni user-agent completo en ninguna tabla de este dominio;
// los rollups (analytics_producto_diario, analytics_vendor_diario) NO llevan user_id.
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  jsonb,
  integer,
  numeric,
  date,
  timestamp,
  primaryKey,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import { vendors } from "./vendors";
import { products } from "./products";
import { orders } from "./orders";

// Tipo de evento de analítica capturado en el flujo de compra.
export const analyticsEventTipoEnum = pgEnum("analytics_event_tipo", [
  "busqueda",
  "vista_tienda",
  "vista_producto",
  "click_producto",
  "add_carrito",
  "orden_creada",
  "pago_verificado",
]);

// Tipo de dispositivo inferido del user-agent (sin persistir el user-agent completo).
export const deviceTipoEnum = pgEnum("device_tipo", [
  "mobile",
  "desktop",
  "tablet",
  "desconocido",
]);

// Eventos crudos append-only: cada interacción relevante del funnel de compra.
export const analyticsEvents = pgTable(
  "analytics_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    eventType: analyticsEventTipoEnum("event_type").notNull(),
    // Usuario autenticado; null en eventos anónimos (visitantes sin sesión).
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    sessionId: text("session_id").notNull(),
    vendorId: uuid("vendor_id").references(() => vendors.id, { onDelete: "set null" }),
    productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
    ruta: text("ruta").notNull(),
    // Solo ruta interna previa (p. ej. "/tienda/x"), nunca URL externa completa (referrer de terceros).
    referrerInterno: text("referrer_interno"),
    // Solo aplica a event_type = "busqueda": término buscado.
    query: text("query"),
    device: deviceTipoEnum("device").notNull().default("desconocido"),
    // Datos libres adicionales del evento (p. ej. posición en listado, filtros aplicados).
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    // TODO: el índice BRIN sobre created_at se añade en migración custom
    // (drizzle-kit no expone BRIN); retención de 180 días vía job pg-boss.
  },
  (table) => ({
    eventTypeCreatedAtIdx: index("analytics_events_event_type_created_at_idx").on(
      table.eventType,
      table.createdAt
    ),
    productIdCreatedAtIdx: index("analytics_events_product_id_created_at_idx").on(
      table.productId,
      table.createdAt
    ),
    vendorIdCreatedAtIdx: index("analytics_events_vendor_id_created_at_idx").on(
      table.vendorId,
      table.createdAt
    ),
    sessionIdIdx: index("analytics_events_session_id_idx").on(table.sessionId),
  })
);

// Rollup diario por producto: agregados precalculados para dashboards del vendor.
export const analyticsProductoDiario = pgTable(
  "analytics_producto_diario",
  {
    fecha: date("fecha").notNull(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    // Denormalizado desde products.vendor_id para filtrar por vendor sin JOIN.
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendors.id, { onDelete: "cascade" }),
    vistas: integer("vistas").notNull().default(0),
    clicks: integer("clicks").notNull().default(0),
    addsCarrito: integer("adds_carrito").notNull().default(0),
    ordenesCreadas: integer("ordenes_creadas").notNull().default(0),
    unidadesVerificadas: integer("unidades_verificadas").notNull().default(0),
    ingresoVerificado: numeric("ingreso_verificado", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.fecha, table.productId] }),
    vendorIdFechaIdx: index("analytics_producto_diario_vendor_id_fecha_idx").on(
      table.vendorId,
      table.fecha
    ),
  })
);

// Rollup diario por vendor: agregados precalculados para el dashboard general de la tienda.
export const analyticsVendorDiario = pgTable(
  "analytics_vendor_diario",
  {
    fecha: date("fecha").notNull(),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendors.id, { onDelete: "cascade" }),
    visitasTienda: integer("visitas_tienda").notNull().default(0),
    vistasProducto: integer("vistas_producto").notNull().default(0),
    addsCarrito: integer("adds_carrito").notNull().default(0),
    ordenesCreadas: integer("ordenes_creadas").notNull().default(0),
    ordenesPagoVerificado: integer("ordenes_pago_verificado").notNull().default(0),
    ingresoVerificado: numeric("ingreso_verificado", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.fecha, table.vendorId] }),
  })
);

// Fin del dominio de analítica.
