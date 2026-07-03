// Tests de integración: dominio de órdenes contra Postgres real (Fase 5).
//
// LA suite más crítica del sistema: reserva atómica de stock (sin oversell
// bajo concurrencia), máquina de estados de pago manual (SPEI/efectivo),
// commit/liberación de inventario y expiración de órdenes.
//
// Fixtures PROPIOS (patrón schema.test.ts): emails/slugs aleatorios para no
// depender del seed. Cada test parte de inventario conocido: afterEach borra
// las órdenes del comprador (cascada: order_items, stock_holds, payments) y
// restaura inventory a stock 5 / reservado 0.
//
// Nota: el dominio ("@/lib/orders") usa el cliente de la app ("@/db"), que
// abre su PROPIO pool; hay que cerrarlo también en afterAll (db.$client) o
// Vitest queda colgado (mismo patrón que cart.test.ts).
import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import {
  users,
  vendors,
  vendorMembers,
  products,
  productVariants,
  inventory,
  orders,
  orderItems,
  stockHolds,
  payments,
} from "@/db/schema";
import { db, closeDb } from "./helpers/db";
import { db as dbApp } from "@/db";
import {
  crearOrden,
  registrarComprobante,
  verificarPago,
  rechazarPago,
  confirmarEfectivo,
  expirarOrden,
  barrerOrdenesExpiradas,
} from "@/lib/orders";

// Fixtures base (creados una sola vez para toda la suite).
let compradorId: string; // comprador de todas las órdenes
let ownerId: string; // miembro owner del vendor: puede verificar/rechazar pagos
let ajenoId: string; // usuario SIN membresía: no debe poder verificar nada
let vendorId: string;
let variantId: string;

const STOCK_BASE = 5;
const HORA_MS = 60 * 60 * 1000;

beforeAll(async () => {
  // Tres usuarios con roles distintos frente al vendor.
  const [comprador] = await db
    .insert(users)
    .values({ email: `orders-comprador-${randomUUID()}@example.com` })
    .returning({ id: users.id });
  compradorId = comprador.id;

  const [owner] = await db
    .insert(users)
    .values({ email: `orders-owner-${randomUUID()}@example.com` })
    .returning({ id: users.id });
  ownerId = owner.id;

  const [ajeno] = await db
    .insert(users)
    .values({ email: `orders-ajeno-${randomUUID()}@example.com` })
    .returning({ id: users.id });
  ajenoId = ajeno.id;

  // Vendor ACTIVO con el owner como miembro.
  const [vendor] = await db
    .insert(vendors)
    .values({
      slug: `orders-test-${randomUUID()}`,
      nombre: "Vendor de prueba (orders.test)",
      tipo: "club",
      estado: "activo",
    })
    .returning({ id: vendors.id });
  vendorId = vendor.id;

  await db
    .insert(vendorMembers)
    .values({ vendorId, userId: ownerId, rol: "owner" });

  // Producto ACTIVO con una variante con precio comunidad (debe congelarse
  // "80.00" en order_items, no el precio público "100.00").
  const [product] = await db
    .insert(products)
    .values({
      vendorId,
      nombre: "Sudadera de prueba (orders.test)",
      estado: "activo",
    })
    .returning({ id: products.id });

  const [variant] = await db
    .insert(productVariants)
    .values({
      productId: product.id,
      atributos: { talla: "M" },
      precio: "100.00",
      precioComunidad: "80.00",
    })
    .returning({ id: productVariants.id });
  variantId = variant.id;

  await db
    .insert(inventory)
    .values({ variantId, stock: STOCK_BASE, reservado: 0 });
});

afterEach(async () => {
  // Borra TODAS las órdenes del comprador de prueba (cascada: order_items,
  // stock_holds y payments) y restaura el inventario al estado base.
  await db.delete(orders).where(eq(orders.compradorId, compradorId));
  await db
    .update(inventory)
    .set({ stock: STOCK_BASE, reservado: 0 })
    .where(eq(inventory.variantId, variantId));
});

afterAll(async () => {
  // Las órdenes referencian vendor y users SIN cascade: se borran primero.
  await db.delete(orders).where(eq(orders.compradorId, compradorId));
  // El delete del vendor cascada a members → products → variants → inventory.
  await db.delete(vendors).where(eq(vendors.id, vendorId));
  await db
    .delete(users)
    .where(inArray(users.id, [compradorId, ownerId, ajenoId]));
  // Cierra ambos pools: el del helper y el del cliente de la app.
  await closeDb();
  await dbApp.$client.end();
});

// ---------------------------------------------------------------------------
// Helpers de la suite
// ---------------------------------------------------------------------------

/** Crea una orden SPEI (por defecto) del comprador y devuelve su id. */
async function crearOrdenOk(
  opts: { qty?: number; metodoPago?: "spei" | "efectivo" } = {}
): Promise<string> {
  const res = await crearOrden({
    compradorId,
    vendorId,
    items: [{ variantId, qty: opts.qty ?? 1 }],
    metodoPago: opts.metodoPago ?? "spei",
    metodoEntrega: "aula",
    aula: "Salón B-202",
  });
  expect(res.ok).toBe(true);
  if (!res.ok) throw new Error(`crearOrden falló: ${res.error}`);
  return res.orderId;
}

/** Lee la orden completa desde BD. */
async function ordenEnBd(orderId: string) {
  const [orden] = await db.select().from(orders).where(eq(orders.id, orderId));
  return orden;
}

/** Lee el payment más reciente de una orden. */
async function pagoDeOrden(orderId: string) {
  const filas = await db
    .select()
    .from(payments)
    .where(eq(payments.orderId, orderId));
  expect(filas.length).toBeGreaterThan(0);
  // El más reciente al final (createdAt defaultNow); suele haber solo uno.
  return filas[filas.length - 1];
}

/** Lee stock/reservado de la variante de prueba. */
async function inv() {
  const [fila] = await db
    .select({ stock: inventory.stock, reservado: inventory.reservado })
    .from(inventory)
    .where(eq(inventory.variantId, variantId));
  return fila;
}

/** Cuenta los stock_holds de una orden. */
async function holdsDeOrden(orderId: string) {
  return db.select().from(stockHolds).where(eq(stockHolds.orderId, orderId));
}

/** Fuerza expira_en de una orden al pasado (simula el paso del tiempo). */
async function vencerOrden(orderId: string) {
  await db
    .update(orders)
    .set({ expiraEn: new Date(Date.now() - 60_000) })
    .where(eq(orders.id, orderId));
}

// ---------------------------------------------------------------------------
// 1-2. crearOrden — camino feliz
// ---------------------------------------------------------------------------

describe("crearOrden — camino feliz", () => {
  it("crea orden pendiente_pago con referencia AG-, items, holds, payment y reserva", async () => {
    const res = await crearOrden({
      compradorId,
      vendorId,
      items: [{ variantId, qty: 1 }],
      metodoPago: "spei",
      metodoEntrega: "aula",
      aula: "Salón B-202",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const orden = await ordenEnBd(res.orderId);
    expect(orden.estado).toBe("pendiente_pago");
    expect(orden.referenciaPago).toMatch(/^AG-/);
    expect(orden.expiraEn).not.toBeNull();
    expect(orden.expiraEn!.getTime()).toBeGreaterThan(Date.now());

    // order_items congela el precio COMUNIDAD (80.00), no el público (100.00).
    const items = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, res.orderId));
    expect(items).toHaveLength(1);
    expect(items[0].precioUnit).toBe("80.00");
    expect(items[0].cantidad).toBe(1);

    // stock_holds creados para la reserva.
    const holds = await holdsDeOrden(res.orderId);
    expect(holds).toHaveLength(1);
    expect(holds[0].cantidad).toBe(1);

    // payment pendiente con método spei.
    const pago = await pagoDeOrden(res.orderId);
    expect(pago.metodo).toBe("spei");
    expect(pago.estado).toBe("pendiente");

    // La reserva quedó registrada en inventario.
    const { stock, reservado } = await inv();
    expect(stock).toBe(STOCK_BASE); // el stock NO baja hasta verificar el pago
    expect(reservado).toBe(1);
  });

  it("calcula el total con el precio comunidad (2 × 80.00 = 160.00)", async () => {
    const orderId = await crearOrdenOk({ qty: 2 });
    const orden = await ordenEnBd(orderId);
    expect(orden.total).toBe("160.00");
  });
});

// ---------------------------------------------------------------------------
// 3-4. Reserva atómica de stock (CONCURRENCIA — el corazón del sistema)
// ---------------------------------------------------------------------------

describe("crearOrden — reserva atómica de stock", () => {
  it("con stock 1, dos órdenes SIMULTÁNEAS: exactamente una gana y la otra es SIN_STOCK", async () => {
    // Deja UNA sola unidad disponible.
    await db
      .update(inventory)
      .set({ stock: 1, reservado: 0 })
      .where(eq(inventory.variantId, variantId));

    // Dos compradores compiten por la última unidad AL MISMO TIEMPO.
    const pedir = () =>
      crearOrden({
        compradorId,
        vendorId,
        items: [{ variantId, qty: 1 }],
        metodoPago: "spei",
        metodoEntrega: "aula",
        aula: "Salón B-202",
      });
    const resultados = await Promise.all([pedir(), pedir()]);

    const exitosas = resultados.filter((r) => r.ok);
    const fallidas = resultados.filter((r) => !r.ok);
    expect(exitosas).toHaveLength(1);
    expect(fallidas).toHaveLength(1);
    expect(fallidas[0]).toMatchObject({ ok: false, error: "SIN_STOCK" });

    // No hubo oversell: solo 1 unidad reservada.
    const { reservado } = await inv();
    expect(reservado).toBe(1);

    // El intento fallido NO dejó orden ni holds huérfanos.
    const ordenesDelComprador = await db
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.compradorId, compradorId));
    expect(ordenesDelComprador).toHaveLength(1);

    const holdsDeVariante = await db
      .select()
      .from(stockHolds)
      .where(eq(stockHolds.variantId, variantId));
    expect(holdsDeVariante).toHaveLength(1);
  });

  it("devuelve SIN_STOCK sin efectos cuando qty > disponible", async () => {
    const res = await crearOrden({
      compradorId,
      vendorId,
      items: [{ variantId, qty: STOCK_BASE + 1 }], // 6 > 5 disponibles
      metodoPago: "spei",
      metodoEntrega: "aula",
      aula: "Salón B-202",
    });
    expect(res).toMatchObject({ ok: false, error: "SIN_STOCK" });

    // Cero efectos: nada reservado, ninguna orden creada.
    const { reservado } = await inv();
    expect(reservado).toBe(0);
    const ordenesDelComprador = await db
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.compradorId, compradorId));
    expect(ordenesDelComprador).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 5-6. registrarComprobante
// ---------------------------------------------------------------------------

describe("registrarComprobante", () => {
  it("el comprador dueño sube comprobante: order → comprobante_enviado, payment → enviado con url", async () => {
    const orderId = await crearOrdenOk();
    const url = "/uploads/comprobante-test.jpg";

    const res = await registrarComprobante(orderId, compradorId, url, "80.00");
    expect(res.ok).toBe(true);

    const orden = await ordenEnBd(orderId);
    expect(orden.estado).toBe("comprobante_enviado");

    const pago = await pagoDeOrden(orderId);
    expect(pago.estado).toBe("enviado");
    expect(pago.comprobanteUrl).toBe(url);
  });

  it("un usuario que NO es el comprador es rechazado sin efectos", async () => {
    const orderId = await crearOrdenOk();

    const res = await registrarComprobante(
      orderId,
      ajenoId, // no es el dueño de la orden
      "/uploads/intruso.jpg"
    );
    expect(res.ok).toBe(false);

    // Sin efectos: la orden y el pago siguen como estaban.
    const orden = await ordenEnBd(orderId);
    expect(orden.estado).toBe("pendiente_pago");
    const pago = await pagoDeOrden(orderId);
    expect(pago.estado).toBe("pendiente");
    expect(pago.comprobanteUrl).toBeNull();
  });

  it("una orden comprobante_enviado NO expira (la reserva queda congelada)", async () => {
    const orderId = await crearOrdenOk();
    await registrarComprobante(orderId, compradorId, "/uploads/c.jpg");

    const res = await expirarOrden(orderId);
    expect(res).toMatchObject({ ok: false, error: "NO_EXPIRABLE" });

    // La reserva sigue intacta mientras el vendor decide.
    const { reservado } = await inv();
    expect(reservado).toBe(1);
    const holds = await holdsDeOrden(orderId);
    expect(holds).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 7-9. verificarPago / rechazarPago
// ---------------------------------------------------------------------------

describe("verificarPago / rechazarPago", () => {
  it("el miembro del vendor verifica: payment verificado, order pago_verificado, COMMIT de stock", async () => {
    const orderId = await crearOrdenOk({ qty: 2 });
    await registrarComprobante(orderId, compradorId, "/uploads/c.jpg");
    const pagoAntes = await pagoDeOrden(orderId);

    const res = await verificarPago(pagoAntes.id, ownerId);
    expect(res.ok).toBe(true);

    const pago = await pagoDeOrden(orderId);
    expect(pago.estado).toBe("verificado");
    expect(pago.verificadoPor).toBe(ownerId);

    const orden = await ordenEnBd(orderId);
    expect(orden.estado).toBe("pago_verificado");

    // COMMIT: el stock real baja y la reserva se libera; holds borrados.
    const { stock, reservado } = await inv();
    expect(stock).toBe(STOCK_BASE - 2);
    expect(reservado).toBe(0);
    const holds = await holdsDeOrden(orderId);
    expect(holds).toHaveLength(0);
  });

  it("un usuario AJENO al vendor NO puede verificar (sin efectos)", async () => {
    const orderId = await crearOrdenOk();
    await registrarComprobante(orderId, compradorId, "/uploads/c.jpg");
    const pagoAntes = await pagoDeOrden(orderId);

    const res = await verificarPago(pagoAntes.id, ajenoId);
    expect(res.ok).toBe(false);

    // Sin efectos: todo sigue en espera del vendor.
    const pago = await pagoDeOrden(orderId);
    expect(pago.estado).toBe("enviado");
    const orden = await ordenEnBd(orderId);
    expect(orden.estado).toBe("comprobante_enviado");
    const { stock, reservado } = await inv();
    expect(stock).toBe(STOCK_BASE);
    expect(reservado).toBe(1);
  });

  it("rechazarPago: order/payment rechazados, expira_en extendido y se permite re-subir", async () => {
    const orderId = await crearOrdenOk();
    await registrarComprobante(orderId, compradorId, "/uploads/borroso.jpg");
    const pagoAntes = await pagoDeOrden(orderId);

    const res = await rechazarPago(pagoAntes.id, ownerId, "Comprobante ilegible");
    expect(res.ok).toBe(true);

    const orden = await ordenEnBd(orderId);
    expect(orden.estado).toBe("rechazado");
    const pago = await pagoDeOrden(orderId);
    expect(pago.estado).toBe("rechazado");

    // El rechazo da +24h para reintentar (toleramos > ahora + 23h).
    expect(orden.expiraEn).not.toBeNull();
    expect(orden.expiraEn!.getTime()).toBeGreaterThan(Date.now() + 23 * HORA_MS);

    // Re-subida: rechazado → comprobante_enviado otra vez.
    const reintento = await registrarComprobante(
      orderId,
      compradorId,
      "/uploads/nitido.jpg"
    );
    expect(reintento.ok).toBe(true);
    const ordenTrasReintento = await ordenEnBd(orderId);
    expect(ordenTrasReintento.estado).toBe("comprobante_enviado");
  });
});

// ---------------------------------------------------------------------------
// 10-11. expirarOrden / confirmarEfectivo
// ---------------------------------------------------------------------------

describe("expirarOrden", () => {
  it("expira una orden pendiente_pago vencida: estado expirado, reserva liberada, holds borrados", async () => {
    const orderId = await crearOrdenOk({ qty: 2 });
    await vencerOrden(orderId); // simula el paso del tiempo en BD

    const res = await expirarOrden(orderId);
    expect(res.ok).toBe(true);

    const orden = await ordenEnBd(orderId);
    expect(orden.estado).toBe("expirado");

    // Reserva liberada SIN tocar el stock real; holds borrados.
    const { stock, reservado } = await inv();
    expect(stock).toBe(STOCK_BASE);
    expect(reservado).toBe(0);
    const holds = await holdsDeOrden(orderId);
    expect(holds).toHaveLength(0);
  });
});

describe("confirmarEfectivo", () => {
  it("orden en efectivo confirmada por miembro: pago_verificado + commit de stock; en SPEI falla", async () => {
    const orderId = await crearOrdenOk({ metodoPago: "efectivo" });

    const res = await confirmarEfectivo(orderId, ownerId);
    expect(res.ok).toBe(true);

    const orden = await ordenEnBd(orderId);
    expect(orden.estado).toBe("pago_verificado");
    const { stock, reservado } = await inv();
    expect(stock).toBe(STOCK_BASE - 1);
    expect(reservado).toBe(0);
    const holds = await holdsDeOrden(orderId);
    expect(holds).toHaveLength(0);

    // Una orden SPEI no se puede confirmar como efectivo.
    const speiId = await crearOrdenOk({ metodoPago: "spei" });
    const resSpei = await confirmarEfectivo(speiId, ownerId);
    expect(resSpei.ok).toBe(false);
    const ordenSpei = await ordenEnBd(speiId);
    expect(ordenSpei.estado).toBe("pendiente_pago");
  });
});

// ---------------------------------------------------------------------------
// 12. barrerOrdenesExpiradas
// ---------------------------------------------------------------------------

describe("barrerOrdenesExpiradas", () => {
  // Timeout amplio: el barrido previo puede expirar muchas órdenes residuales
  // del seed y cada una es una transacción — contra Neon remoto supera los 5s.
  it("expira exactamente las órdenes vencidas y respeta la vigente", { timeout: 60_000 }, async () => {
    // Barrido previo: limpia órdenes vencidas residuales (p. ej. del seed)
    // para poder afirmar el conteo EXACTO de este test.
    await barrerOrdenesExpiradas();

    const vencidaA = await crearOrdenOk();
    const vencidaB = await crearOrdenOk();
    const vigente = await crearOrdenOk();
    await vencerOrden(vencidaA);
    await vencerOrden(vencidaB);

    const n = await barrerOrdenesExpiradas();
    expect(n).toBe(2);

    expect((await ordenEnBd(vencidaA)).estado).toBe("expirado");
    expect((await ordenEnBd(vencidaB)).estado).toBe("expirado");
    expect((await ordenEnBd(vigente)).estado).toBe("pendiente_pago");

    // Solo queda reservada la unidad de la orden vigente.
    const { reservado } = await inv();
    expect(reservado).toBe(1);
  });
});
