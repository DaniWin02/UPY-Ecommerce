// Seed de Ágora Campus: carga data/samples/json/agora-sample-data.json a PostgreSQL
// TRANSFORMANDO los datos (el sample NO coincide 1:1 con el esquema real).
// Ejecutar con: npm run db:seed  (tsx scripts/seed.ts)
// ADVERTENCIA: este script TRUNCA las tablas que puebla. Nunca correr en producción.
import "dotenv/config";

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { Pool } from "pg";
// Imports RELATIVOS a propósito: tsx no resuelve el alias "@/" del tsconfig.
import * as schema from "../src/db/schema";
import { hashPassword } from "../src/lib/password";

// ---------------------------------------------------------------------------
// Guardas de seguridad
// ---------------------------------------------------------------------------
if (!process.env.DATABASE_URL) {
  console.error(
    "[seed] Falta DATABASE_URL en el entorno. Define la cadena de conexión en .env antes de correr el seed."
  );
  process.exit(1);
}

if (process.env.NODE_ENV === "production") {
  console.error(
    "[seed] Rehusando ejecutar en NODE_ENV=production: este seed TRUNCA tablas."
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Pool y Drizzle LOCALES al script (no importamos el de src/db) para poder
// cerrar la conexión limpiamente con pool.end() al terminar.
// ---------------------------------------------------------------------------
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema });

// ---------------------------------------------------------------------------
// Tipos del sample JSON (la forma EXACTA que trae el archivo de muestra)
// ---------------------------------------------------------------------------
interface SampleInstitution {
  id: string;
  nombre: string;
  siglas: string;
  dominios: string; // "a;b" separado por ";"
  ciudad: string;
}

interface SampleUser {
  id: string;
  nombre: string;
  email: string;
  rol_global: string;
  institution_id: string;
  verificado: string; // "true" | "false" como string
  created_at: string;
}

interface SampleVendor {
  id: string;
  slug: string;
  nombre: string;
  tipo: string;
  clabe: string;
  estado: string;
  aula_default: string;
}

interface SampleProduct {
  id: string;
  vendor_id: string;
  nombre: string;
  tipo: string;
  estado: string; // "publicado" | "borrador" (no coincide con el enum real)
  precio_base: number; // NO existe en el esquema: se ignora
  created_at: string;
}

interface SampleVariant {
  id: string;
  product_id: string;
  sku: string;
  talla: string;
  color: string;
  precio: number;
  precio_comunidad: number;
  stock: number; // va aparte, a la tabla inventory
}

interface SampleOrder {
  id: string;
  comprador_id: string;
  vendor_id: string;
  estado: string;
  total: number;
  referencia_pago: string;
  metodo_entrega: string;
  aula_entrega: string; // la columna real se llama "aula"
  created_at: string;
}

interface SampleOrderItem {
  id: string;
  order_id: string;
  variant_id: string;
  cantidad: number;
  precio_unit: number;
}

interface SamplePayment {
  id: string;
  order_id: string;
  metodo: string;
  referencia: string;
  monto_declarado: number;
  estado: string;
  comprobante_url: string; // "" → null
}

interface SampleData {
  institutions: SampleInstitution[];
  users: SampleUser[];
  vendors: SampleVendor[];
  products: SampleProduct[];
  product_variants: SampleVariant[];
  orders: SampleOrder[];
  order_items: SampleOrderItem[];
  payments: SamplePayment[];
}

// Tipos de inserción inferidos por Drizzle (tipado estricto, sin `any`)
type InstitutionInsert = typeof schema.institutions.$inferInsert;
type UserInsert = typeof schema.users.$inferInsert;
type VendorInsert = typeof schema.vendors.$inferInsert;
type VendorMemberInsert = typeof schema.vendorMembers.$inferInsert;
type ProductInsert = typeof schema.products.$inferInsert;
type VariantInsert = typeof schema.productVariants.$inferInsert;
type InventoryInsert = typeof schema.inventory.$inferInsert;
type OrderInsert = typeof schema.orders.$inferInsert;
type OrderItemInsert = typeof schema.orderItems.$inferInsert;
type PaymentInsert = typeof schema.payments.$inferInsert;

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

/** Trocea un arreglo en bloques de tamaño `size` (para inserts en lote). */
function chunk<T>(items: T[], size = 500): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

/** Inserta en lotes de 500 y devuelve el total de filas insertadas. */
async function insertInChunks<T extends Record<string, unknown>>(
  table: Parameters<typeof db.insert>[0],
  rows: T[]
): Promise<number> {
  for (const block of chunk(rows)) {
    // Cast necesario porque la tabla llega genérica; los rows ya están tipados arriba.
    await db.insert(table).values(block as never);
  }
  return rows.length;
}

/** Resuelve un sample ID a su UUID generado, o truena con mensaje claro. */
function resolveId(map: Map<string, string>, sampleId: string, entidad: string): string {
  const uuid = map.get(sampleId);
  if (!uuid) {
    throw new Error(`[seed] FK rota: no existe ${entidad} con sample id "${sampleId}"`);
  }
  return uuid;
}

// ---------------------------------------------------------------------------
// Seed principal
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  // Carga del sample (ruta relativa al propio script, robusta ante el cwd)
  const dataUrl = new URL("../data/samples/json/agora-sample-data.json", import.meta.url);
  const data = JSON.parse(readFileSync(dataUrl, "utf-8")) as SampleData;

  console.log("[seed] Sample cargado. Truncando tablas...");

  // Idempotencia: TRUNCATE de TODAS las tablas a poblar en una sola sentencia.
  // RESTART IDENTITY reinicia secuencias; CASCADE arrastra tablas dependientes
  // (p. ej. stock_holds que referencia orders).
  await db.execute(sql`
    TRUNCATE TABLE
      payments,
      order_items,
      orders,
      inventory,
      product_variants,
      products,
      vendor_members,
      vendors,
      users,
      institutions
    RESTART IDENTITY CASCADE
  `);

  // Mapas sample-id ("usr_001", "ven_01", ...) → UUID real generado
  const institutionIds = new Map<string, string>();
  const userIds = new Map<string, string>();
  const vendorIds = new Map<string, string>();
  const productIds = new Map<string, string>();
  const variantIds = new Map<string, string>();
  const orderIds = new Map<string, string>();

  const resumen = new Map<string, number>();

  // --- 1) institutions ------------------------------------------------------
  // Transformación: dominios "a;b" → string[]; siglas/ciudad no tienen columna
  // propia → se guardan en el jsonb `config` para no perder información.
  const institutionRows: InstitutionInsert[] = data.institutions.map((inst) => {
    const id = randomUUID();
    institutionIds.set(inst.id, id);
    return {
      id,
      nombre: inst.nombre,
      dominios: inst.dominios.split(";").map((d) => d.trim()).filter(Boolean),
      config: { siglas: inst.siglas, ciudad: inst.ciudad },
    };
  });
  resumen.set("institutions", await insertInChunks(schema.institutions, institutionRows));

  // --- 2) users --------------------------------------------------------------
  // Transformación: nombre → name (así se llama la propiedad, por Auth.js);
  // verificado "true"/"false" (string) → verificadoEn = createdAt o null.
  // El sample trae emails duplicados (users.email es UNIQUE): se deduplican
  // de forma determinista con el sufijo +<sampleId> en la parte local.
  // Login propio: se hashea UNA sola vez la password de desarrollo "agora123"
  // (scrypt es costoso a propósito) y se asigna a TODOS los usuarios del seed.
  const passwordHashSeed = await hashPassword("agora123");
  const emailsUsados = new Set<string>();
  const userRows: UserInsert[] = data.users.map((u) => {
    const id = randomUUID();
    userIds.set(u.id, id);
    const createdAt = new Date(u.created_at);
    let email = u.email;
    if (emailsUsados.has(email)) {
      const [local, dominio] = email.split("@");
      email = `${local}+${u.id}@${dominio}`;
      console.warn(`[seed] Email duplicado "${u.email}" (${u.id}) → "${email}"`);
    }
    emailsUsados.add(email);
    return {
      id,
      email,
      name: u.nombre,
      rolGlobal: u.rol_global as UserInsert["rolGlobal"],
      institutionId: resolveId(institutionIds, u.institution_id, "institution"),
      verificadoEn: u.verificado === "true" ? createdAt : null,
      passwordHash: passwordHashSeed,
      createdAt,
    };
  });
  resumen.set("users", await insertInChunks(schema.users, userRows));

  // --- 3) vendors -------------------------------------------------------------
  // Transformación: mapeo casi directo; aula_default → aulaDefault (camelCase).
  const vendorRows: VendorInsert[] = data.vendors.map((v) => {
    const id = randomUUID();
    vendorIds.set(v.id, id);
    return {
      id,
      slug: v.slug,
      nombre: v.nombre,
      tipo: v.tipo as VendorInsert["tipo"],
      clabe: v.clabe,
      estado: v.estado as VendorInsert["estado"],
      aulaDefault: v.aula_default,
    };
  });
  resumen.set("vendors", await insertInChunks(schema.vendors, vendorRows));

  // --- 4) vendor_members -------------------------------------------------------
  // NO existe en el sample: se generan aquí. Los users con rol_global "vendor"
  // se asignan como "owner" de los vendors por round-robin determinista
  // (ambas listas ordenadas por su sample id); si hay menos users que vendors, se cicla.
  const vendorUsers = data.users
    .filter((u) => u.rol_global === "vendor")
    .sort((a, b) => a.id.localeCompare(b.id));
  const vendorsOrdenados = [...data.vendors].sort((a, b) => a.id.localeCompare(b.id));
  if (vendorUsers.length === 0) {
    throw new Error("[seed] No hay users con rol_global 'vendor' para asignar owners");
  }
  // Mapa vendor sample-id → user sample-id del owner (se reutiliza en payments)
  const ownerPorVendor = new Map<string, string>();
  const vendorMemberRows: VendorMemberInsert[] = vendorsOrdenados.map((v, i) => {
    const owner = vendorUsers[i % vendorUsers.length];
    ownerPorVendor.set(v.id, owner.id);
    return {
      vendorId: resolveId(vendorIds, v.id, "vendor"),
      userId: resolveId(userIds, owner.id, "user"),
      rol: "owner",
    };
  });
  resumen.set("vendor_members", await insertInChunks(schema.vendorMembers, vendorMemberRows));

  // --- 5) products --------------------------------------------------------------
  // Transformación: estado "publicado" → "activo" (el enum real es
  // borrador|activo|agotado|archivado); "borrador" se queda igual.
  // descripcion no viene en el sample → se genera una breve en español.
  // precio_base NO existe en el esquema (el precio vive en las variantes) → se ignora.
  const vendorNombrePorId = new Map(data.vendors.map((v) => [v.id, v.nombre]));
  const productRows: ProductInsert[] = data.products.map((p) => {
    const id = randomUUID();
    productIds.set(p.id, id);
    const vendorNombre = vendorNombrePorId.get(p.vendor_id) ?? "la comunidad";
    return {
      id,
      vendorId: resolveId(vendorIds, p.vendor_id, "vendor"),
      nombre: p.nombre,
      descripcion: `Producto oficial de ${vendorNombre}.`,
      estado: (p.estado === "publicado" ? "activo" : p.estado) as ProductInsert["estado"],
      tipo: p.tipo as ProductInsert["tipo"],
      createdAt: new Date(p.created_at),
    };
  });
  resumen.set("products", await insertInChunks(schema.products, productRows));

  // --- 6) product_variants --------------------------------------------------------
  // Transformación: talla/color → jsonb `atributos`; precios numéricos → string
  // (numeric de Drizzle acepta string y evita errores de coma flotante).
  // El stock NO va aquí: se inserta aparte en `inventory`.
  const variantRows: VariantInsert[] = data.product_variants.map((v) => {
    const id = randomUUID();
    variantIds.set(v.id, id);
    return {
      id,
      productId: resolveId(productIds, v.product_id, "product"),
      sku: v.sku,
      atributos: { talla: v.talla, color: v.color },
      precio: String(v.precio),
      precioComunidad: String(v.precio_comunidad),
    };
  });
  resumen.set("product_variants", await insertInChunks(schema.productVariants, variantRows));

  // --- 7) inventory -----------------------------------------------------------------
  // El stock de cada variante del sample se traduce a una fila de inventario
  // con reservado = 0 (sin holds activos en datos de muestra).
  const inventoryRows: InventoryInsert[] = data.product_variants.map((v) => ({
    variantId: resolveId(variantIds, v.id, "variant"),
    stock: v.stock,
    reservado: 0,
  }));
  resumen.set("inventory", await insertInChunks(schema.inventory, inventoryRows));

  // --- 8) orders -----------------------------------------------------------------------
  // Transformación: aula_entrega → columna real `aula`; total → string;
  // expiraEn = createdAt + 48h SOLO si la orden sigue en "pendiente_pago".
  // Los estados del sample ya son válidos en el enum (ya no existe "carrito").
  const MS_48H = 48 * 60 * 60 * 1000;
  const orderCreatedAt = new Map<string, Date>(); // se reutiliza en payments
  const orderRows: OrderInsert[] = data.orders.map((o) => {
    const id = randomUUID();
    orderIds.set(o.id, id);
    const createdAt = new Date(o.created_at);
    orderCreatedAt.set(o.id, createdAt);
    return {
      id,
      compradorId: resolveId(userIds, o.comprador_id, "user"),
      vendorId: resolveId(vendorIds, o.vendor_id, "vendor"),
      estado: o.estado as OrderInsert["estado"],
      total: String(o.total),
      referenciaPago: o.referencia_pago,
      metodoEntrega: o.metodo_entrega as OrderInsert["metodoEntrega"],
      aula: o.aula_entrega,
      expiraEn: o.estado === "pendiente_pago" ? new Date(createdAt.getTime() + MS_48H) : null,
      createdAt,
    };
  });
  resumen.set("orders", await insertInChunks(schema.orders, orderRows));

  // --- 9) order_items ----------------------------------------------------------------------
  // Transformación: precio_unit numérico → string (numeric).
  const orderItemRows: OrderItemInsert[] = data.order_items.map((it) => ({
    id: randomUUID(),
    orderId: resolveId(orderIds, it.order_id, "order"),
    variantId: resolveId(variantIds, it.variant_id, "variant"),
    cantidad: it.cantidad,
    precioUnit: String(it.precio_unit),
  }));
  resumen.set("order_items", await insertInChunks(schema.orderItems, orderItemRows));

  // --- 10) payments ---------------------------------------------------------------------------
  // Transformación: monto_declarado → string; comprobante_url "" → null;
  // si estado === "verificado": verificadoEn = createdAt de la orden y
  // verificadoPor = owner del vendor de esa orden (del mapa de vendor_members).
  const vendorPorOrden = new Map(data.orders.map((o) => [o.id, o.vendor_id]));
  const paymentRows: PaymentInsert[] = data.payments.map((p) => {
    const createdAtOrden = orderCreatedAt.get(p.order_id) ?? new Date();
    const esVerificado = p.estado === "verificado";
    // Owner del vendor de la orden → usuario que verificó el pago
    const vendorSampleId = vendorPorOrden.get(p.order_id);
    const ownerSampleId = vendorSampleId ? ownerPorVendor.get(vendorSampleId) : undefined;
    return {
      id: randomUUID(),
      orderId: resolveId(orderIds, p.order_id, "order"),
      metodo: p.metodo as PaymentInsert["metodo"],
      referencia: p.referencia,
      comprobanteUrl: p.comprobante_url === "" ? null : p.comprobante_url,
      montoDeclarado: String(p.monto_declarado),
      estado: p.estado as PaymentInsert["estado"],
      verificadoEn: esVerificado ? createdAtOrden : null,
      verificadoPor:
        esVerificado && ownerSampleId ? resolveId(userIds, ownerSampleId, "user") : null,
      createdAt: createdAtOrden,
    };
  });
  resumen.set("payments", await insertInChunks(schema.payments, paymentRows));

  // --- Resumen final -----------------------------------------------------------
  console.log("\n[seed] Listo. Filas insertadas por tabla:");
  for (const [tabla, filas] of resumen) {
    console.log(`  ${tabla.padEnd(18)} ${filas}`);
  }
  console.log("\n[seed] Password de todos los usuarios seed: agora123");
}

// try/catch global: cualquier fallo cierra el pool y sale con código 1.
main()
  .then(async () => {
    await pool.end();
    console.log("\n[seed] Conexión cerrada. Seed completado con éxito.");
  })
  .catch(async (err: unknown) => {
    console.error("\n[seed] Error durante el seed:", err);
    await pool.end().catch(() => undefined);
    process.exit(1);
  });
