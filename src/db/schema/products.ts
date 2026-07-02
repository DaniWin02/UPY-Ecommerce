// Dominio: catálogo (productos, variantes, inventario y reservas de stock).
// STUB válido de Drizzle: columnas clave, enums y FKs; índices/campos pendientes en TODO.
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  jsonb,
  integer,
  numeric,
  timestamp,
} from "drizzle-orm/pg-core";
import { vendors } from "./vendors";

// Tipo de producto: físico normal, preventa (umbral) o exclusivo de drop.
export const productTipoEnum = pgEnum("product_tipo", [
  "fisico",
  "preventa",
  "drop",
]);

// Estado de publicación del producto.
export const productEstadoEnum = pgEnum("product_estado", [
  "borrador",
  "activo",
  "agotado",
  "archivado",
]);

// Productos: pertenecen a un vendor (multivendedor por vendor_id).
export const products = pgTable("products", {
  id: uuid("id").defaultRandom().primaryKey(),
  vendorId: uuid("vendor_id")
    .notNull()
    .references(() => vendors.id, { onDelete: "cascade" }),
  nombre: text("nombre").notNull(),
  descripcion: text("descripcion"),
  estado: productEstadoEnum("estado").notNull().default("borrador"),
  tipo: productTipoEnum("tipo").notNull().default("fisico"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  // TODO: slug por vendor, imágenes (text[]), categoría, índice por (vendor_id, estado).
});

// Variantes (SKU): cada combinación vendible (talla/color) con precios.
export const productVariants = pgTable("product_variants", {
  id: uuid("id").defaultRandom().primaryKey(),
  productId: uuid("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  sku: text("sku").unique(),
  // Atributos libres de la variante: { talla, color, ... }.
  atributos: jsonb("atributos").notNull().default({}),
  // Precio público y precio solo-comunidad (numeric para evitar errores de coma flotante en MXN).
  precio: numeric("precio", { precision: 12, scale: 2 }).notNull(),
  precioComunidad: numeric("precio_comunidad", { precision: 12, scale: 2 }),
  // TODO: índice por product_id; campo imagen propia de la variante.
});

// Inventario por variante (stock disponible y reservado por holds activos).
export const inventory = pgTable("inventory", {
  variantId: uuid("variant_id")
    .primaryKey()
    .references(() => productVariants.id, { onDelete: "cascade" }),
  stock: integer("stock").notNull().default(0),
  reservado: integer("reservado").notNull().default(0),
  // Disponible = stock - reservado (calculado en consulta/transacción).
  // TODO: CHECK (reservado <= stock); updated_at para auditoría de movimientos.
});

// Nota: las reservas temporales de stock (stockHolds) viven en orders.ts,
// donde pueden tener FK real a orders.id sin ciclo de imports.

// Fin del dominio de catálogo e inventario.
