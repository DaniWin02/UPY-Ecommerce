// Tests de integración: rollups diarios de analytics contra Postgres real (Fase 6).
//
// Verifica ejecutarRollup (agregación de eventos crudos + órdenes/pagos en
// analytics_producto_diario y analytics_vendor_diario), su IDEMPOTENCIA
// (re-ejecutar no duplica ni acumula) y purgarEventosAntiguos (retención).
//
// Fixtures PROPIOS (patrón cart.test.ts / orders.test.ts): vendor, producto,
// variante e inventario con UUIDs/slugs aleatorios; los eventos llevan un
// sessionId único de la suite para poder limpiarlos quirúrgicamente.
//
// Nota: ejecutarRollup usa el cliente de la app ("@/db"), que abre su PROPIO
// pool; hay que cerrarlo también en afterAll (db.$client) o Vitest queda
// colgado (mismo patrón que cart.test.ts).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import {
  users,
  vendors,
  products,
  productVariants,
  inventory,
  orders,
  orderItems,
  payments,
  analyticsEvents,
  analyticsProductoDiario,
  analyticsVendorDiario,
} from "@/db/schema";
import { db, closeDb } from "./helpers/db";
import { db as dbApp } from "@/db";
import { ejecutarRollup, purgarEventosAntiguos } from "@/lib/rollups";

// Fixtures base (creados una sola vez para toda la suite).
let compradorId: string;
let vendorId: string;
let productId: string;
let variantId: string;
let orderId: string;

// sessionId único de la suite: identifica TODOS los eventos del fixture.
const SESION = `analytics-test-${randomUUID()}`;

const MS_DIA = 24 * 60 * 60 * 1000;

// Día de HOY en UTC ("YYYY-MM-DD"), la clave `fecha` de ambos rollups.
const hoyUtc = new Date().toISOString().slice(0, 10);

/** Lee la fila de rollup por vendor de HOY (o undefined). */
async function rollupVendorHoy() {
  const filas = await db
    .select()
    .from(analyticsVendorDiario)
    .where(
      and(
        eq(analyticsVendorDiario.fecha, hoyUtc),
        eq(analyticsVendorDiario.vendorId, vendorId),
      ),
    );
  return { fila: filas[0], total: filas.length };
}

/** Lee la fila de rollup por producto de HOY (o undefined). */
async function rollupProductoHoy() {
  const filas = await db
    .select()
    .from(analyticsProductoDiario)
    .where(
      and(
        eq(analyticsProductoDiario.fecha, hoyUtc),
        eq(analyticsProductoDiario.productId, productId),
      ),
    );
  return { fila: filas[0], total: filas.length };
}

beforeAll(async () => {
  // Comprador de la orden del fixture.
  const [comprador] = await db
    .insert(users)
    .values({ email: `analytics-comprador-${randomUUID()}@example.com` })
    .returning({ id: users.id });
  compradorId = comprador.id;

  // Vendor + producto + variante + inventario propios de la suite.
  const [vendor] = await db
    .insert(vendors)
    .values({
      slug: `analytics-test-${randomUUID()}`,
      nombre: "Vendor de prueba (analytics.test)",
      tipo: "club",
      estado: "activo",
    })
    .returning({ id: vendors.id });
  vendorId = vendor.id;

  const [producto] = await db
    .insert(products)
    .values({
      vendorId,
      nombre: "Termo de prueba (analytics.test)",
      estado: "activo",
    })
    .returning({ id: products.id });
  productId = producto.id;

  const [variante] = await db
    .insert(productVariants)
    .values({ productId, atributos: { color: "negro" }, precio: "80.00" })
    .returning({ id: productVariants.id });
  variantId = variante.id;

  await db.insert(inventory).values({ variantId, stock: 10, reservado: 0 });

  // Eventos crudos de HOY: vista_tienda ×3, vista_producto ×5, add_carrito ×2
  // y click_producto ×4, todos con el vendor/producto del fixture.
  const base = { sessionId: SESION, vendorId, ruta: "/tienda/analytics-test" };
  await db.insert(analyticsEvents).values([
    ...Array.from({ length: 3 }, () => ({
      ...base,
      eventType: "vista_tienda" as const,
    })),
    ...Array.from({ length: 5 }, () => ({
      ...base,
      eventType: "vista_producto" as const,
      productId,
    })),
    ...Array.from({ length: 2 }, () => ({
      ...base,
      eventType: "add_carrito" as const,
      productId,
    })),
    ...Array.from({ length: 4 }, () => ({
      ...base,
      eventType: "click_producto" as const,
      productId,
    })),
  ]);

  // Orden REAL por BD creada HOY con pago verificado HOY: 2 × 80.00 = 160.00.
  const [orden] = await db
    .insert(orders)
    .values({
      compradorId,
      vendorId,
      estado: "pago_verificado",
      total: "160.00",
      referenciaPago: `AGR-ANALYTICS-${randomUUID().slice(0, 8)}`,
    })
    .returning({ id: orders.id });
  orderId = orden.id;

  await db
    .insert(orderItems)
    .values({ orderId, variantId, cantidad: 2, precioUnit: "80.00" });

  await db.insert(payments).values({
    orderId,
    metodo: "spei",
    referencia: `AGR-ANALYTICS-${randomUUID().slice(0, 8)}`,
    montoDeclarado: "160.00",
    estado: "verificado",
    verificadoEn: new Date(),
  });

  // Primer rollup: las lecturas de los tests parten de aquí.
  await ejecutarRollup();
});

afterAll(async () => {
  // Limpieza quirúrgica: eventos por sessionId, rollups por sus claves,
  // orden (cascada: order_items + payments) ANTES que el vendor (orders no
  // tiene onDelete cascade hacia vendors), vendor (cascada: products →
  // variants → inventory) y por último el usuario.
  await db.delete(analyticsEvents).where(eq(analyticsEvents.sessionId, SESION));
  await db
    .delete(analyticsProductoDiario)
    .where(eq(analyticsProductoDiario.productId, productId));
  await db
    .delete(analyticsVendorDiario)
    .where(eq(analyticsVendorDiario.vendorId, vendorId));
  await db.delete(orders).where(eq(orders.id, orderId));
  await db.delete(vendors).where(eq(vendors.id, vendorId));
  await db.delete(users).where(eq(users.id, compradorId));
  // Cierra ambos pools: el del helper y el del cliente de la app.
  await closeDb();
  await dbApp.$client.end();
});

describe("ejecutarRollup — analytics_vendor_diario", () => {
  it("agrega los eventos del día: visitasTienda 3, vistasProducto 5, addsCarrito 2", async () => {
    const { fila } = await rollupVendorHoy();
    expect(fila).toBeDefined();
    expect(fila.visitasTienda).toBe(3);
    expect(fila.vistasProducto).toBe(5);
    expect(fila.addsCarrito).toBe(2);
  });

  it("agrega órdenes y pagos del día: 1 creada, 1 verificada, ingreso 160.00", async () => {
    const { fila } = await rollupVendorHoy();
    expect(fila.ordenesCreadas).toBe(1);
    expect(fila.ordenesPagoVerificado).toBe(1);
    expect(fila.ingresoVerificado).toBe("160.00");
  });
});

describe("ejecutarRollup — analytics_producto_diario", () => {
  it("agrega los eventos del día: vistas 5, clicks 4, addsCarrito 2, vendor denormalizado", async () => {
    const { fila } = await rollupProductoHoy();
    expect(fila).toBeDefined();
    expect(fila.vistas).toBe(5);
    expect(fila.clicks).toBe(4);
    expect(fila.addsCarrito).toBe(2);
    // vendor_id denormalizado desde products (permite filtrar sin JOIN).
    expect(fila.vendorId).toBe(vendorId);
  });

  it("agrega la orden del día: 1 creada, 2 unidades verificadas, ingreso 160.00", async () => {
    const { fila } = await rollupProductoHoy();
    expect(fila.ordenesCreadas).toBe(1);
    // 2 unidades × 80.00 de la orden cuyo pago se verificó HOY.
    expect(fila.unidadesVerificadas).toBe(2);
    expect(fila.ingresoVerificado).toBe("160.00");
  });
});

describe("ejecutarRollup — idempotencia", () => {
  it("re-ejecutar deja los MISMOS números en el vendor (no duplica ni acumula)", async () => {
    // Default: ayer y hoy (UTC) → 2 días procesados.
    const resultado = await ejecutarRollup();
    expect(resultado.dias).toBe(2);

    const { fila, total } = await rollupVendorHoy();
    expect(total).toBe(1); // sigue habiendo UNA fila por (fecha, vendor)
    expect(fila.visitasTienda).toBe(3);
    expect(fila.vistasProducto).toBe(5);
    expect(fila.addsCarrito).toBe(2);
    expect(fila.ordenesCreadas).toBe(1);
    expect(fila.ordenesPagoVerificado).toBe(1);
    expect(fila.ingresoVerificado).toBe("160.00");
  });

  it("re-ejecutar deja los MISMOS números en el producto", async () => {
    await ejecutarRollup();

    const { fila, total } = await rollupProductoHoy();
    expect(total).toBe(1); // UNA fila por (fecha, producto)
    expect(fila.vistas).toBe(5);
    expect(fila.clicks).toBe(4);
    expect(fila.addsCarrito).toBe(2);
    expect(fila.ordenesCreadas).toBe(1);
    expect(fila.unidadesVerificadas).toBe(2);
    expect(fila.ingresoVerificado).toBe("160.00");
  });

  it("con rango explícito de un solo día procesa exactamente 1 día", async () => {
    const hoy = new Date();
    const resultado = await ejecutarRollup(hoy, hoy);
    expect(resultado.dias).toBe(1);
  });
});

describe("purgarEventosAntiguos — retención", () => {
  it("borra el evento de hace 200 días y conserva el de hoy", async () => {
    // Evento ANTIGUO (createdAt forzado a hace 200 días) y evento fresco de
    // control, ambos identificables por id.
    const [antiguo] = await db
      .insert(analyticsEvents)
      .values({
        eventType: "vista_tienda",
        sessionId: SESION,
        vendorId,
        ruta: "/tienda/analytics-test",
        createdAt: new Date(Date.now() - 200 * MS_DIA),
      })
      .returning({ id: analyticsEvents.id });

    const [fresco] = await db
      .insert(analyticsEvents)
      .values({
        eventType: "vista_tienda",
        sessionId: SESION,
        vendorId,
        ruta: "/tienda/analytics-test",
      })
      .returning({ id: analyticsEvents.id });

    // >= 1 (y no exactamente 1) por robustez: la purga es GLOBAL y otra
    // suite/seed podría haber dejado eventos antiguos en la misma BD.
    const borrados = await purgarEventosAntiguos(180);
    expect(borrados).toBeGreaterThanOrEqual(1);

    // El antiguo desapareció; el de hoy sobrevive.
    const quedanAntiguo = await db
      .select({ id: analyticsEvents.id })
      .from(analyticsEvents)
      .where(eq(analyticsEvents.id, antiguo.id));
    expect(quedanAntiguo).toHaveLength(0);

    const quedanFresco = await db
      .select({ id: analyticsEvents.id })
      .from(analyticsEvents)
      .where(eq(analyticsEvents.id, fresco.id));
    expect(quedanFresco).toHaveLength(1);
  });
});
