// Tests de integración: resolverCarrito contra Postgres real (Fase 4).
//
// Usa fixtures PROPIOS (slugs/UUIDs aleatorios, patrón de schema.test.ts) para
// no depender del seed; todo se limpia en afterAll vía cascada del vendor.
//
// Nota: resolverCarrito consulta a través del cliente de la app ("@/db"), que
// abre su PROPIO pool contra la misma DATABASE_URL; hay que cerrarlo también
// en afterAll (db.$client) o Vitest queda colgado.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { vendors, products, productVariants, inventory } from "@/db/schema";
import { db, closeDb } from "./helpers/db";
import { db as dbApp } from "@/db";
import { resolverCarrito } from "@/lib/cart";

// Fixtures base (creados una sola vez para toda la suite).
let vendorId: string;
let vendorSlug: string;
// v1: con precioComunidad y stock parcialmente reservado (disponible 4).
let variantConComunidadId: string;
// v2: sin precioComunidad y sin stock (disponible 0).
let variantSinComunidadId: string;
// v3: variante de un producto INACTIVO (borrador) → debe descartarse.
let variantInactivaId: string;

beforeAll(async () => {
  vendorSlug = `cart-test-${randomUUID()}`;
  const [vendor] = await db
    .insert(vendors)
    .values({
      slug: vendorSlug,
      nombre: "Vendor de prueba (cart.test)",
      tipo: "club",
      estado: "activo", // el JOIN de resolverCarrito exige vendor activo
      aulaDefault: "Salón A-101",
    })
    .returning({ id: vendors.id });
  vendorId = vendor.id;

  // Producto ACTIVO con dos variantes.
  const [productoActivo] = await db
    .insert(products)
    .values({
      vendorId,
      nombre: "Playera de prueba (cart.test)",
      estado: "activo",
      imagenes: ["https://example.com/playera.jpg"],
    })
    .returning({ id: products.id });

  const [v1] = await db
    .insert(productVariants)
    .values({
      productId: productoActivo.id,
      atributos: { talla: "M" },
      precio: "150.00",
      precioComunidad: "99.99", // debe mandar sobre `precio`
    })
    .returning({ id: productVariants.id });
  variantConComunidadId = v1.id;

  const [v2] = await db
    .insert(productVariants)
    .values({
      productId: productoActivo.id,
      atributos: { talla: "G" },
      precio: "50.00", // sin precioComunidad: se usa el precio público
    })
    .returning({ id: productVariants.id });
  variantSinComunidadId = v2.id;

  await db.insert(inventory).values([
    { variantId: variantConComunidadId, stock: 5, reservado: 1 }, // disponible 4
    { variantId: variantSinComunidadId, stock: 0, reservado: 0 }, // disponible 0
  ]);

  // Producto INACTIVO (estado por defecto "borrador") con su variante.
  const [productoInactivo] = await db
    .insert(products)
    .values({ vendorId, nombre: "Producto borrador (cart.test)" })
    .returning({ id: products.id });

  const [v3] = await db
    .insert(productVariants)
    .values({ productId: productoInactivo.id, precio: "10.00" })
    .returning({ id: productVariants.id });
  variantInactivaId = v3.id;
  await db.insert(inventory).values({ variantId: variantInactivaId, stock: 10 });
});

afterAll(async () => {
  // El delete del vendor cascada a products → product_variants → inventory.
  await db.delete(vendors).where(eq(vendors.id, vendorId));
  // Cierra ambos pools: el del helper y el del cliente de la app.
  await closeDb();
  await dbApp.$client.end();
});

describe("resolverCarrito — precios", () => {
  it("usa precioComunidad cuando existe y precio cuando no", async () => {
    const resuelto = await resolverCarrito([
      { variantId: variantConComunidadId, qty: 1 },
      { variantId: variantSinComunidadId, qty: 1 },
    ]);

    const lineas = resuelto.grupos.flatMap((g) => g.lineas);
    const conComunidad = lineas.find(
      (l) => l.variantId === variantConComunidadId
    );
    const sinComunidad = lineas.find(
      (l) => l.variantId === variantSinComunidadId
    );

    expect(conComunidad?.precioUnit).toBe("99.99");
    expect(sinComunidad?.precioUnit).toBe("50.00");
  });
});

describe("resolverCarrito — disponibilidad", () => {
  it("disponible = stock - reservado (4) y 0 sin stock; qty no se recorta", async () => {
    const resuelto = await resolverCarrito([
      { variantId: variantConComunidadId, qty: 2 },
      { variantId: variantSinComunidadId, qty: 3 }, // qty > disponible (0)
    ]);

    const lineas = resuelto.grupos.flatMap((g) => g.lineas);
    const conStock = lineas.find((l) => l.variantId === variantConComunidadId);
    const sinStock = lineas.find((l) => l.variantId === variantSinComunidadId);

    expect(conStock?.disponible).toBe(4); // 5 - 1
    expect(sinStock?.disponible).toBe(0);
    // La página avisa del exceso, pero resolverCarrito conserva la qty pedida.
    expect(sinStock?.qty).toBe(3);
  });
});

describe("resolverCarrito — descartes", () => {
  it("descarta la variante de un producto inactivo (descartados = 1)", async () => {
    const resuelto = await resolverCarrito([
      { variantId: variantInactivaId, qty: 1 },
    ]);
    expect(resuelto.grupos).toEqual([]);
    expect(resuelto.descartados).toBe(1);
    expect(resuelto.total).toBe("0.00");
  });

  it("descarta un variantId inexistente sin afectar al resto", async () => {
    const resuelto = await resolverCarrito([
      { variantId: randomUUID(), qty: 2 }, // no existe en BD
      { variantId: variantConComunidadId, qty: 1 },
    ]);
    expect(resuelto.descartados).toBe(1);
    const lineas = resuelto.grupos.flatMap((g) => g.lineas);
    expect(lineas).toHaveLength(1);
    expect(lineas[0].variantId).toBe(variantConComunidadId);
  });
});

describe("resolverCarrito — agrupación y totales", () => {
  it("agrupa todo bajo el vendor con subtotales en centavos exactos", async () => {
    const resuelto = await resolverCarrito([
      { variantId: variantConComunidadId, qty: 2 }, // 2 × 99.99 = 199.98
      { variantId: variantSinComunidadId, qty: 1 }, // 1 × 50.00 = 50.00
    ]);

    // Un único grupo: ambas variantes son del mismo vendor.
    expect(resuelto.grupos).toHaveLength(1);
    const grupo = resuelto.grupos[0];
    expect(grupo.vendor).toEqual({
      id: vendorId,
      slug: vendorSlug,
      nombre: "Vendor de prueba (cart.test)",
      aulaDefault: "Salón A-101",
    });

    // 2 × "99.99" debe dar "199.98" exacto (nada de 199.98000000000002).
    const lineaComunidad = grupo.lineas.find(
      (l) => l.variantId === variantConComunidadId
    );
    expect(lineaComunidad?.subtotal).toBe("199.98");
    expect(grupo.subtotal).toBe("249.98"); // 199.98 + 50.00
  });

  it("total = suma de subtotales de grupos y totalItems = suma de qty", async () => {
    const resuelto = await resolverCarrito([
      { variantId: variantConComunidadId, qty: 2 },
      { variantId: variantSinComunidadId, qty: 1 },
    ]);

    // Suma de subtotales recomputada en centavos desde los grupos.
    const sumaCentavos = resuelto.grupos.reduce(
      (suma, g) => suma + Math.round(Number(g.subtotal) * 100),
      0
    );
    expect(resuelto.total).toBe((sumaCentavos / 100).toFixed(2));
    expect(resuelto.total).toBe("249.98");
    expect(resuelto.totalItems).toBe(3);
    expect(resuelto.descartados).toBe(0);
  });
});
