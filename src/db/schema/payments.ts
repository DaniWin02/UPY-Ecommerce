// Dominio: pagos manuales (efectivo + SPEI con comprobante) y su verificación.
// STUB válido de Drizzle: columnas clave, enums y FKs; índices/campos pendientes en TODO.
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  numeric,
  timestamp,
} from "drizzle-orm/pg-core";
import { orders } from "./orders";
import { users } from "./users";

// Método de pago manual.
export const metodoPagoEnum = pgEnum("metodo_pago", ["efectivo", "spei"]);

// Estado del pago dentro de la cola de verificación humana.
export const pagoEstadoEnum = pgEnum("pago_estado", [
  "pendiente",
  "enviado",
  "verificado",
  "rechazado",
]);

// Pagos: 1..N por orden (reintentos/rechazos). El SPEI sube comprobante; el efectivo se cobra en sitio.
export const payments = pgTable("payments", {
  id: uuid("id").defaultRandom().primaryKey(),
  orderId: uuid("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  metodo: metodoPagoEnum("metodo").notNull(),
  // Referencia capturada por el comprador / folio del SPEI.
  referencia: text("referencia"),
  // URL/clave en S3/R2 del comprobante (foto o PDF); null en efectivo.
  comprobanteUrl: text("comprobante_url"),
  // Monto declarado por el comprador (se concilia contra el total y el estado de cuenta).
  montoDeclarado: numeric("monto_declarado", { precision: 12, scale: 2 }),
  estado: pagoEstadoEnum("estado").notNull().default("pendiente"),
  // Quién (vendor/admin) verificó el pago y cuándo.
  verificadoPor: uuid("verificado_por").references(() => users.id),
  verificadoEn: timestamp("verificado_en", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  // TODO: índice por (estado) para la cola de comprobantes por verificar del vendor.
  // TODO: campos de OCR (V2): banco_detectado, monto_detectado, discrepancia (Claude Vision).
});

// Fin del dominio de pagos.
