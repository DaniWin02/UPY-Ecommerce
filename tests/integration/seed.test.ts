// Tests de integración: verificación del seed (`npm run db:seed`).
//
// El CI aplica migraciones y corre el seed ANTES de esta suite, así que aquí
// solo se LEEN datos (ninguna escritura). Los counts esperados son el contrato
// exacto del script de seed; si el seed cambia, estos números deben cambiar
// con él de forma deliberada.
import { describe, it, expect, afterAll } from "vitest";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import {
  institutions,
  users,
  vendors,
  vendorMembers,
  products,
  productVariants,
  inventory,
  orders,
  orderItems,
  payments,
} from "@/db/schema";
import { db, closeDb } from "./helpers/db";

afterAll(async () => {
  await closeDb();
});

// count(*) de una tabla como número JS.
async function contar(tabla: PgTable): Promise<number> {
  const [fila] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(tabla);
  return fila.n;
}

describe("Counts exactos del seed", () => {
  // [nombre legible, tabla, count esperado] — contrato del seed.
  const esperados: Array<[string, PgTable, number]> = [
    ["institutions", institutions, 1],
    ["users", users, 60],
    ["vendors", vendors, 8],
    ["products", products, 37],
    ["product_variants", productVariants, 72],
    ["inventory", inventory, 72],
    ["orders", orders, 50],
    ["order_items", orderItems, 99],
    ["payments", payments, 50],
  ];

  it.each(esperados)(
    "la tabla %s tiene el count exacto del contrato del seed",
    async (_nombre, tabla, esperado) => {
      expect(await contar(tabla)).toBe(esperado);
    }
  );
});

describe("Reglas de negocio del seed", () => {
  it("existe al menos un vendor_member", async () => {
    expect(await contar(vendorMembers)).toBeGreaterThan(0);
  });

  it("no hay products con estado 'publicado' (el seed lo mapea a 'activo')", async () => {
    // 'publicado' no existe en el enum product_estado: se compara casteando a
    // text para que la consulta no reviente por el cast del enum.
    const [fila] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(products)
      .where(sql`${products.estado}::text = 'publicado'`);
    expect(fila.n).toBe(0);
  });

  it("toda order en pendiente_pago tiene expira_en no nulo", async () => {
    const [fila] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(orders)
      .where(and(eq(orders.estado, "pendiente_pago"), isNull(orders.expiraEn)));
    expect(fila.n).toBe(0);
  });

  it("ningún payment tiene comprobante_url = '' (debe ser null o texto no vacío)", async () => {
    const [fila] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(payments)
      .where(eq(payments.comprobanteUrl, ""));
    expect(fila.n).toBe(0);
  });

  it("no hay order_items con order_id huérfano", async () => {
    // LEFT JOIN a orders: si la orden no existe, orders.id sale null.
    const [fila] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(orderItems)
      .leftJoin(orders, eq(orderItems.orderId, orders.id))
      .where(isNull(orders.id));
    expect(fila.n).toBe(0);
  });
});
