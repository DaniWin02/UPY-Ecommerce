// Tests de integración: integridad del esquema contra Postgres real.
//
// Usa datos PROPIOS (UUIDs/emails/slugs aleatorios) para no depender del seed
// ni pisarlo; todo lo insertado se limpia en afterEach/afterAll con deletes
// dirigidos (los fixtures base se borran vía cascada del vendor).
import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import {
  users,
  vendors,
  products,
  productVariants,
  inventory,
  orders,
  orderItems,
  stockHolds,
} from "@/db/schema";
import { db, closeDb } from "./helpers/db";

// Fixtures base compartidos por la suite (creados una sola vez).
let userId: string;
let vendorId: string;
let variantId: string;

// Órdenes creadas por cada test; se borran en afterEach (cascada limpia
// order_items y stock_holds asociados).
const createdOrderIds: string[] = [];

beforeAll(async () => {
  // Usuario comprador propio (email aleatorio para no chocar con el seed).
  const [user] = await db
    .insert(users)
    .values({ email: `schema-test-${randomUUID()}@example.com` })
    .returning({ id: users.id });
  userId = user.id;

  // Vendor + producto + variante + inventario mínimos propios.
  const [vendor] = await db
    .insert(vendors)
    .values({
      slug: `schema-test-${randomUUID()}`,
      nombre: "Vendor de prueba (schema.test)",
      tipo: "club",
    })
    .returning({ id: vendors.id });
  vendorId = vendor.id;

  const [product] = await db
    .insert(products)
    .values({ vendorId, nombre: "Producto de prueba (schema.test)" })
    .returning({ id: products.id });

  const [variant] = await db
    .insert(productVariants)
    .values({ productId: product.id, precio: "100.00" })
    .returning({ id: productVariants.id });
  variantId = variant.id;

  await db.insert(inventory).values({ variantId, stock: 10, reservado: 0 });
});

afterEach(async () => {
  // Borra las órdenes creadas por el test (cascada: order_items, stock_holds).
  if (createdOrderIds.length > 0) {
    await db.delete(orders).where(inArray(orders.id, createdOrderIds));
    createdOrderIds.length = 0;
  }
  // Restaura el inventario base por si un test movió `reservado`.
  await db
    .update(inventory)
    .set({ reservado: 0 })
    .where(eq(inventory.variantId, variantId));
});

afterAll(async () => {
  // El delete del vendor cascada a products -> product_variants -> inventory.
  await db.delete(vendors).where(eq(vendors.id, vendorId));
  await db.delete(users).where(eq(users.id, userId));
  await closeDb();
});

// Crea una orden mínima propia y la registra para limpieza.
async function crearOrden(referenciaPago?: string): Promise<string> {
  const [order] = await db
    .insert(orders)
    .values({ compradorId: userId, vendorId, referenciaPago })
    .returning({ id: orders.id });
  createdOrderIds.push(order.id);
  return order.id;
}

describe("CHECK de inventory (0 <= reservado <= stock)", () => {
  it("rechaza reservado = stock + 1", async () => {
    await expect(
      db
        .update(inventory)
        .set({ reservado: 11 }) // stock del fixture = 10
        .where(eq(inventory.variantId, variantId))
    ).rejects.toThrow();
  });

  it("acepta reservado = stock (límite exacto)", async () => {
    await db
      .update(inventory)
      .set({ reservado: 10 })
      .where(eq(inventory.variantId, variantId));

    const [fila] = await db
      .select({ reservado: inventory.reservado })
      .from(inventory)
      .where(eq(inventory.variantId, variantId));
    expect(fila.reservado).toBe(10);
  });

  it("rechaza reservado negativo", async () => {
    await expect(
      db
        .update(inventory)
        .set({ reservado: -1 })
        .where(eq(inventory.variantId, variantId))
    ).rejects.toThrow();
  });
});

describe("Restricciones UNIQUE", () => {
  it("rechaza dos orders con la misma referencia_pago", async () => {
    const referencia = `TEST-REF-${randomUUID()}`;
    await crearOrden(referencia);

    // La segunda inserción con la misma referencia debe violar el UNIQUE.
    await expect(
      db
        .insert(orders)
        .values({ compradorId: userId, vendorId, referenciaPago: referencia })
    ).rejects.toThrow();
  });

  it("rechaza dos users con el mismo email", async () => {
    // Reutiliza el email del usuario base: no crea filas extra que limpiar.
    const [usuarioBase] = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, userId));

    await expect(
      db.insert(users).values({ email: usuarioBase.email })
    ).rejects.toThrow();
  });
});

describe("Enum order_estado", () => {
  it("rechaza un estado inválido vía SQL crudo", async () => {
    // El enum order_estado NO incluye "carrito" ni valores arbitrarios.
    await expect(
      db.execute(
        sql`insert into orders (comprador_id, vendor_id, estado)
            values (${userId}, ${vendorId}, ${"estado_que_no_existe"})`
      )
    ).rejects.toThrow();
  });
});

describe("CASCADE al borrar una order", () => {
  it("elimina stock_holds y order_items de la orden borrada", async () => {
    const orderId = await crearOrden();

    await db.insert(orderItems).values({
      orderId,
      variantId,
      cantidad: 1,
      precioUnit: "100.00",
    });
    await db.insert(stockHolds).values({
      orderId,
      variantId,
      cantidad: 1,
      expiraEn: new Date(Date.now() + 60_000),
    });

    // Borra la orden directamente: las hijas deben caer por ON DELETE CASCADE.
    await db.delete(orders).where(eq(orders.id, orderId));

    const [itemsRestantes] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(orderItems)
      .where(eq(orderItems.orderId, orderId));
    const [holdsRestantes] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(stockHolds)
      .where(eq(stockHolds.orderId, orderId));

    expect(itemsRestantes.n).toBe(0);
    expect(holdsRestantes.n).toBe(0);
  });
});

describe("FK de order_items", () => {
  it("rechaza un order_item con variant_id inexistente", async () => {
    const orderId = await crearOrden();

    await expect(
      db.insert(orderItems).values({
        orderId,
        variantId: randomUUID(), // UUID aleatorio: no existe en product_variants
        cantidad: 1,
        precioUnit: "50.00",
      })
    ).rejects.toThrow();
  });
});
