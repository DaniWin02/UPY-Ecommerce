// Dominio: pedidos y sus partidas (máquina de estados con pagos manuales).
// STUB válido de Drizzle: columnas clave, enums y FKs; índices/campos pendientes en TODO.
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  numeric,
  timestamp,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import { vendors } from "./vendors";
import { productVariants } from "./products";

// Máquina de estados del pedido (ver PLAN.md §5). Orden = un solo vendor.
export const orderEstadoEnum = pgEnum("order_estado", [
  "carrito",
  "pendiente_pago",
  "comprobante_enviado",
  "pago_verificado",
  "rechazado",
  "preparando",
  "listo_entrega",
  "entregado",
  "expirado",
  "cancelado",
]);

// Método de entrega: en el aula del vendor o en un punto de entrega/cajero.
export const metodoEntregaEnum = pgEnum("metodo_entrega", ["aula", "punto"]);

// Pedidos: un carrito que avanza por la máquina de estados hasta entregado/cerrado.
export const orders = pgTable("orders", {
  id: uuid("id").defaultRandom().primaryKey(),
  compradorId: uuid("comprador_id")
    .notNull()
    .references(() => users.id),
  vendorId: uuid("vendor_id")
    .notNull()
    .references(() => vendors.id),
  estado: orderEstadoEnum("estado").notNull().default("carrito"),
  // Total del pedido en MXN (numeric para precisión monetaria).
  total: numeric("total", { precision: 12, scale: 2 }).notNull().default("0"),
  // Referencia/concepto único usado en el SPEI para conciliar el pago.
  referenciaPago: text("referencia_pago").unique(),
  metodoEntrega: metodoEntregaEnum("metodo_entrega").notNull().default("aula"),
  // Destino de entrega: aula (texto del salón) o punto (id/nombre del punto).
  aula: text("aula"),
  punto: text("punto"),
  // Vencimiento de la reserva/pago; al expirar se libera el stock.
  expiraEn: timestamp("expira_en", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  // TODO: índices por (comprador_id) y (vendor_id, estado) para colas y "mis pedidos".
  // TODO: updated_at; campo de notas/observaciones.
});

// Partidas del pedido: variante + cantidad + precio congelado al momento de la compra.
export const orderItems = pgTable("order_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  orderId: uuid("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  variantId: uuid("variant_id")
    .notNull()
    .references(() => productVariants.id),
  cantidad: integer("cantidad").notNull(),
  // Precio unitario aplicado (público o de comunidad) al crear la partida.
  precioUnit: numeric("precio_unit", { precision: 12, scale: 2 }).notNull(),
  // TODO: índice por order_id; UNIQUE (order_id, variant_id) para evitar duplicados.
});

// Fin del dominio de pedidos.
