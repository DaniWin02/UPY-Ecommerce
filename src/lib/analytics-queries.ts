// analytics-queries.ts — consultas de SOLO SERVIDOR para el dashboard de
// analytics del vendedor (Fase 6).
//
// Patrón de datos (ver src/db/schema/analytics.ts):
//  - HISTÓRICO (días -6 a -1): rollups precalculados en analytics_vendor_diario
//    y analytics_producto_diario (los llena un job; pueden estar vacíos hoy).
//  - HOY: counts directos sobre analytics_events (índice vendor_id+created_at,
//    created_at >= date_trunc('day', now())) + orders/payments creados hoy.
//  - El resumen 7d = suma de ambas fuentes (sin doble conteo: los rollups se
//    filtran con fecha < current_date).
//
// Dinero: la aritmética SIEMPRE en centavos enteros (numeric llega como string
// desde pg); se expone como string "1234.50". Sin `any`; SQL parametrizado.
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  analyticsEvents,
  analyticsProductoDiario,
  analyticsVendorDiario,
} from "@/db/schema/analytics";
import { orderItems, orders } from "@/db/schema/orders";
import { payments } from "@/db/schema/payments";
import { products, productVariants } from "@/db/schema/products";

// ---------------------------------------------------------------------------
// Contrato público.
// ---------------------------------------------------------------------------

export type ResumenVendor = {
  visitasTienda7d: number;
  vistasProducto7d: number;
  addsCarrito7d: number;
  ordenesCreadas7d: number;
  pagosVerificados7d: number;
  /** Ingreso verificado 7d en pesos como string "1234.50". */
  ingresoVerificado7d: string;
  /** 7 puntos (día -6 … hoy); fecha en formato corto "lun 30". */
  serieDiaria: Array<{ fecha: string; vistas: number }>;
  topProductos: Array<{
    productId: string;
    nombre: string;
    vistas: number;
    ingresoVerificado: string;
  }>;
  funnel: { vistas: number; carrito: number; ordenes: number; verificados: number };
};

// ---------------------------------------------------------------------------
// Helpers de dinero y fechas.
// ---------------------------------------------------------------------------

/** "1234.50" → 123450 (centavos enteros; nunca comparar/sumar floats). */
function aCentavos(monto: string): number {
  return Math.round(Number(monto) * 100);
}

/** 123450 → "1234.50". */
function aPesos(centavos: number): string {
  return (centavos / 100).toFixed(2);
}

/** Fecha local como "YYYY-MM-DD" (mismo formato que drizzle devuelve en `date`). */
function claveLocal(d: Date): string {
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

const FORMATO_DIA_CORTO = new Intl.DateTimeFormat("es-MX", {
  weekday: "short",
  day: "numeric",
});

/** Etiqueta corta de eje: "lun 30" (sin puntos ni comas de la abreviatura CLDR). */
function etiquetaCorta(d: Date): string {
  return FORMATO_DIA_CORTO.format(d).replace(/[.,]/g, "");
}

// Inicio del día actual, calculado en el servidor de BD (misma frontera que
// usará el job de rollups al cerrar el día).
const inicioHoy = () => sql`date_trunc('day', now())`;

// ---------------------------------------------------------------------------
// Consulta principal del dashboard.
// ---------------------------------------------------------------------------

/**
 * Resumen de los últimos 7 días (incluyendo hoy) para un vendor:
 * stats, serie diaria de vistas de producto, top 5 productos y funnel.
 */
export async function resumenVendor(vendorId: string): Promise<ResumenVendor> {
  const [
    rollupVendor,
    eventosHoy,
    ordenesHoyRow,
    pagosHoyRow,
    rollupProducto,
    vistasProductoHoy,
    ingresoProductoHoy,
  ] = await Promise.all([
    // Histórico por día del vendor (días -6 a -1; hoy se calcula en vivo).
    db
      .select({
        fecha: analyticsVendorDiario.fecha,
        visitasTienda: analyticsVendorDiario.visitasTienda,
        vistasProducto: analyticsVendorDiario.vistasProducto,
        addsCarrito: analyticsVendorDiario.addsCarrito,
        ordenesCreadas: analyticsVendorDiario.ordenesCreadas,
        pagosVerificados: analyticsVendorDiario.ordenesPagoVerificado,
        ingresoVerificado: analyticsVendorDiario.ingresoVerificado,
      })
      .from(analyticsVendorDiario)
      .where(
        and(
          eq(analyticsVendorDiario.vendorId, vendorId),
          sql`${analyticsVendorDiario.fecha} >= current_date - 6`,
          sql`${analyticsVendorDiario.fecha} < current_date`
        )
      ),

    // HOY: un solo scan de eventos crudos del vendor, agrupado por tipo.
    db
      .select({
        tipo: analyticsEvents.eventType,
        total: sql<number>`count(*)`.mapWith(Number),
      })
      .from(analyticsEvents)
      .where(
        and(
          eq(analyticsEvents.vendorId, vendorId),
          gte(analyticsEvents.createdAt, inicioHoy())
        )
      )
      .groupBy(analyticsEvents.eventType),

    // HOY: órdenes creadas, directo de la tabla de pedidos (fuente de verdad).
    db
      .select({ total: sql<number>`count(*)`.mapWith(Number) })
      .from(orders)
      .where(and(eq(orders.vendorId, vendorId), gte(orders.createdAt, inicioHoy()))),

    // HOY: pagos verificados + ingreso (total de la orden) verificado hoy.
    db
      .select({
        pagos: sql<number>`count(*)`.mapWith(Number),
        ingreso: sql<string>`coalesce(sum(${orders.total}), 0)`,
      })
      .from(payments)
      .innerJoin(orders, eq(payments.orderId, orders.id))
      .where(
        and(
          eq(orders.vendorId, vendorId),
          eq(payments.estado, "verificado"),
          gte(payments.verificadoEn, inicioHoy())
        )
      ),

    // Histórico por producto (rollup): vistas e ingreso de días -6 a -1.
    db
      .select({
        productId: analyticsProductoDiario.productId,
        vistas: sql<number>`coalesce(sum(${analyticsProductoDiario.vistas}), 0)`.mapWith(
          Number
        ),
        ingreso: sql<string>`coalesce(sum(${analyticsProductoDiario.ingresoVerificado}), 0)`,
      })
      .from(analyticsProductoDiario)
      .where(
        and(
          eq(analyticsProductoDiario.vendorId, vendorId),
          sql`${analyticsProductoDiario.fecha} >= current_date - 6`,
          sql`${analyticsProductoDiario.fecha} < current_date`
        )
      )
      .groupBy(analyticsProductoDiario.productId),

    // HOY por producto: vistas crudas.
    db
      .select({
        productId: analyticsEvents.productId,
        vistas: sql<number>`count(*)`.mapWith(Number),
      })
      .from(analyticsEvents)
      .where(
        and(
          eq(analyticsEvents.vendorId, vendorId),
          eq(analyticsEvents.eventType, "vista_producto"),
          gte(analyticsEvents.createdAt, inicioHoy()),
          sql`${analyticsEvents.productId} is not null`
        )
      )
      .groupBy(analyticsEvents.productId),

    // HOY por producto: ingreso de partidas de órdenes con pago verificado hoy.
    db
      .select({
        productId: productVariants.productId,
        ingreso: sql<string>`coalesce(sum(${orderItems.cantidad} * ${orderItems.precioUnit}), 0)`,
      })
      .from(payments)
      .innerJoin(orders, eq(payments.orderId, orders.id))
      .innerJoin(orderItems, eq(orderItems.orderId, orders.id))
      .innerJoin(productVariants, eq(orderItems.variantId, productVariants.id))
      .where(
        and(
          eq(orders.vendorId, vendorId),
          eq(payments.estado, "verificado"),
          gte(payments.verificadoEn, inicioHoy())
        )
      )
      .groupBy(productVariants.productId),
  ]);

  // --- HOY por tipo de evento -----------------------------------------------
  const hoyPorTipo = new Map(eventosHoy.map((e) => [e.tipo, e.total]));
  const hoyVisitasTienda = hoyPorTipo.get("vista_tienda") ?? 0;
  const hoyVistasProducto = hoyPorTipo.get("vista_producto") ?? 0;
  const hoyAddsCarrito = hoyPorTipo.get("add_carrito") ?? 0;
  const hoyOrdenes = ordenesHoyRow[0]?.total ?? 0;
  const hoyPagos = pagosHoyRow[0]?.pagos ?? 0;
  const hoyIngresoCentavos = aCentavos(pagosHoyRow[0]?.ingreso ?? "0");

  // --- Totales 7d = histórico (rollups) + hoy (crudo) ------------------------
  let histVisitas = 0;
  let histVistas = 0;
  let histAdds = 0;
  let histOrdenes = 0;
  let histPagos = 0;
  let histIngresoCentavos = 0;
  const vistasPorFecha = new Map<string, number>();
  for (const fila of rollupVendor) {
    histVisitas += fila.visitasTienda;
    histVistas += fila.vistasProducto;
    histAdds += fila.addsCarrito;
    histOrdenes += fila.ordenesCreadas;
    histPagos += fila.pagosVerificados;
    histIngresoCentavos += aCentavos(fila.ingresoVerificado);
    vistasPorFecha.set(fila.fecha, fila.vistasProducto);
  }

  // --- Serie diaria: 7 puntos, días sin fila rellenados con 0 ----------------
  const ahora = new Date();
  const claveHoy = claveLocal(ahora);
  const serieDiaria: ResumenVendor["serieDiaria"] = [];
  for (let i = 6; i >= 0; i--) {
    const dia = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() - i);
    const clave = claveLocal(dia);
    serieDiaria.push({
      fecha: etiquetaCorta(dia),
      vistas: clave === claveHoy ? hoyVistasProducto : vistasPorFecha.get(clave) ?? 0,
    });
  }

  // --- Top productos: merge rollup + hoy, top 5 por vistas --------------------
  const porProducto = new Map<string, { vistas: number; ingresoCentavos: number }>();
  const acumular = (productId: string, vistas: number, ingresoCentavos: number) => {
    const previo = porProducto.get(productId) ?? { vistas: 0, ingresoCentavos: 0 };
    porProducto.set(productId, {
      vistas: previo.vistas + vistas,
      ingresoCentavos: previo.ingresoCentavos + ingresoCentavos,
    });
  };
  for (const fila of rollupProducto) {
    acumular(fila.productId, fila.vistas, aCentavos(fila.ingreso));
  }
  for (const fila of vistasProductoHoy) {
    if (fila.productId !== null) acumular(fila.productId, fila.vistas, 0);
  }
  for (const fila of ingresoProductoHoy) {
    acumular(fila.productId, 0, aCentavos(fila.ingreso));
  }

  const topIds = [...porProducto.entries()]
    .sort((a, b) => b[1].vistas - a[1].vistas)
    .slice(0, 5)
    .map(([productId]) => productId);

  // Nombres de los top 5 (solo si hay algo que nombrar).
  const nombres =
    topIds.length > 0
      ? await db
          .select({ id: products.id, nombre: products.nombre })
          .from(products)
          .where(inArray(products.id, topIds))
      : [];
  const nombrePorId = new Map(nombres.map((p) => [p.id, p.nombre]));

  const topProductos: ResumenVendor["topProductos"] = topIds.map((productId) => {
    const datos = porProducto.get(productId) ?? { vistas: 0, ingresoCentavos: 0 };
    return {
      productId,
      nombre: nombrePorId.get(productId) ?? "Producto eliminado",
      vistas: datos.vistas,
      ingresoVerificado: aPesos(datos.ingresoCentavos),
    };
  });

  const vistasProducto7d = histVistas + hoyVistasProducto;
  const addsCarrito7d = histAdds + hoyAddsCarrito;
  const ordenesCreadas7d = histOrdenes + hoyOrdenes;
  const pagosVerificados7d = histPagos + hoyPagos;

  return {
    visitasTienda7d: histVisitas + hoyVisitasTienda,
    vistasProducto7d,
    addsCarrito7d,
    ordenesCreadas7d,
    pagosVerificados7d,
    ingresoVerificado7d: aPesos(histIngresoCentavos + hoyIngresoCentavos),
    serieDiaria,
    topProductos,
    funnel: {
      vistas: vistasProducto7d,
      carrito: addsCarrito7d,
      ordenes: ordenesCreadas7d,
      verificados: pagosVerificados7d,
    },
  };
}

// Fin: consultas de analytics del vendedor.
