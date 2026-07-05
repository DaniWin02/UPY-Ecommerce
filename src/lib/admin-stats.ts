// admin-stats.ts — consultas de SOLO SERVIDOR para el dashboard del SuperAdmin
// (página índice /admin). Mismo patrón que src/lib/analytics-queries.ts:
//
//  - Todas las consultas corren en un Promise.all (una sola ronda a la BD).
//  - Dinero: numeric llega como string desde pg; la aritmética se hace en
//    CENTAVOS enteros y se expone como string "1234.50". Nunca flotantes.
//  - SQL parametrizado vía drizzle; sin `any`.
//  - Serie de 7 días: los días sin órdenes se rellenan con 0 y la etiqueta
//    es corta ("lun 30"), igual que la serie del dashboard del vendor.
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { orders } from "@/db/schema/orders";
import { payments } from "@/db/schema/payments";
import { users } from "@/db/schema/users";
import { vendors } from "@/db/schema/vendors";
import { messageReports } from "@/db/schema/messaging";

// ---------------------------------------------------------------------------
// Contrato público.
// ---------------------------------------------------------------------------

export type StatsPlataforma = {
  usuarios: number;
  usuariosNuevos30d: number;
  tiendasActivas: number;
  tiendasPendientes: number;
  ordenes30d: number;
  /** GMV con pago verificado en 30 días, en pesos como string "1234.50". */
  gmvVerificado30d: string;
  /** Todas las órdenes históricas agrupadas por estado (orden canónico). */
  ordenesPorEstado: Array<{ estado: string; n: number }>;
  reportesPendientes: number;
  comprobantesEnRevision: number;
  /** 7 puntos (día -6 … hoy); fecha en formato corto "lun 30". */
  serieOrdenes7d: Array<{ fecha: string; n: number }>;
};

// ---------------------------------------------------------------------------
// Helpers de dinero y fechas (mismo patrón que analytics-queries.ts).
// ---------------------------------------------------------------------------

/** "1234.50" → 123450 (centavos enteros; nunca comparar/sumar floats). */
function aCentavos(monto: string): number {
  return Math.round(Number(monto) * 100);
}

/** 123450 → "1234.50". */
function aPesos(centavos: number): string {
  return (centavos / 100).toFixed(2);
}

/** Fecha local como "YYYY-MM-DD" (mismo formato que to_char en la consulta). */
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

// Orden canónico de la máquina de estados para listar "Pedidos por estado"
// de forma estable (los estados ausentes simplemente no aparecen).
const ORDEN_ESTADOS = [
  "pendiente_pago",
  "comprobante_enviado",
  "pago_verificado",
  "preparando",
  "listo_entrega",
  "entregado",
  "rechazado",
  "expirado",
  "cancelado",
] as const;

// ---------------------------------------------------------------------------
// Consulta principal del dashboard de plataforma.
// ---------------------------------------------------------------------------

/**
 * statsPlataforma — resumen global para el SuperAdmin: usuarios, tiendas,
 * órdenes/GMV de 30 días, colas pendientes y serie de órdenes de 7 días.
 */
export async function statsPlataforma(): Promise<StatsPlataforma> {
  const ventana30d = sql`now() - interval '30 days'`;

  const [
    usuariosRow,
    vendorsPorEstado,
    ordenes30dRow,
    gmvRow,
    ordenesPorEstadoRaw,
    reportesRow,
    comprobantesRow,
    serieRaw,
  ] = await Promise.all([
    // Usuarios: total + nuevos en 30 días en un solo scan (FILTER).
    db
      .select({
        total: sql<number>`count(*)`.mapWith(Number),
        nuevos30d:
          sql<number>`count(*) filter (where ${users.createdAt} > ${ventana30d})`.mapWith(
            Number
          ),
      })
      .from(users),

    // Tiendas agrupadas por estado (activo / pendiente / suspendido).
    db
      .select({
        estado: vendors.estado,
        n: sql<number>`count(*)`.mapWith(Number),
      })
      .from(vendors)
      .groupBy(vendors.estado),

    // Órdenes creadas en los últimos 30 días.
    db
      .select({ total: sql<number>`count(*)`.mapWith(Number) })
      .from(orders)
      .where(sql`${orders.createdAt} > ${ventana30d}`),

    // GMV verificado 30d: SUM(orders.total) de órdenes cuyo pago fue
    // verificado dentro de la ventana (join por verificado_en, no created_at).
    db
      .select({ suma: sql<string>`coalesce(sum(${orders.total}), 0)` })
      .from(payments)
      .innerJoin(orders, eq(payments.orderId, orders.id))
      .where(
        and(
          eq(payments.estado, "verificado"),
          sql`${payments.verificadoEn} > ${ventana30d}`
        )
      ),

    // Todas las órdenes históricas agrupadas por estado.
    db
      .select({
        estado: orders.estado,
        n: sql<number>`count(*)`.mapWith(Number),
      })
      .from(orders)
      .groupBy(orders.estado),

    // Reportes de mensajería esperando revisión del admin.
    db
      .select({ total: sql<number>`count(*)`.mapWith(Number) })
      .from(messageReports)
      .where(eq(messageReports.estado, "pendiente")),

    // Comprobantes SPEI en cola de verificación (los revisa cada tienda).
    db
      .select({ total: sql<number>`count(*)`.mapWith(Number) })
      .from(payments)
      .where(eq(payments.estado, "enviado")),

    // Órdenes por día de los últimos 7 días (día -6 … hoy); los días sin
    // filas se rellenan con 0 abajo, en JS.
    db
      .select({
        dia: sql<string>`to_char(${orders.createdAt}, 'YYYY-MM-DD')`,
        n: sql<number>`count(*)`.mapWith(Number),
      })
      .from(orders)
      .where(sql`${orders.createdAt} >= current_date - 6`)
      .groupBy(sql`to_char(${orders.createdAt}, 'YYYY-MM-DD')`),
  ]);

  // --- Tiendas por estado ----------------------------------------------------
  const porEstadoVendor = new Map(vendorsPorEstado.map((v) => [v.estado, v.n]));

  // --- Pedidos por estado en orden canónico de la máquina ---------------------
  const conteoPorEstado = new Map(
    ordenesPorEstadoRaw.map((fila) => [fila.estado, fila.n])
  );
  const ordenesPorEstado: StatsPlataforma["ordenesPorEstado"] = [];
  for (const estado of ORDEN_ESTADOS) {
    const n = conteoPorEstado.get(estado);
    if (n !== undefined) ordenesPorEstado.push({ estado, n });
  }

  // --- Serie 7d: 7 puntos, días sin órdenes rellenados con 0 ------------------
  const porDia = new Map(serieRaw.map((fila) => [fila.dia, fila.n]));
  const ahora = new Date();
  const serieOrdenes7d: StatsPlataforma["serieOrdenes7d"] = [];
  for (let i = 6; i >= 0; i--) {
    const dia = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() - i);
    serieOrdenes7d.push({
      fecha: etiquetaCorta(dia),
      n: porDia.get(claveLocal(dia)) ?? 0,
    });
  }

  return {
    usuarios: usuariosRow[0]?.total ?? 0,
    usuariosNuevos30d: usuariosRow[0]?.nuevos30d ?? 0,
    tiendasActivas: porEstadoVendor.get("activo") ?? 0,
    tiendasPendientes: porEstadoVendor.get("pendiente") ?? 0,
    ordenes30d: ordenes30dRow[0]?.total ?? 0,
    gmvVerificado30d: aPesos(aCentavos(gmvRow[0]?.suma ?? "0")),
    ordenesPorEstado,
    reportesPendientes: reportesRow[0]?.total ?? 0,
    comprobantesEnRevision: comprobantesRow[0]?.total ?? 0,
    serieOrdenes7d,
  };
}

// Fin: consultas del dashboard de plataforma (SuperAdmin).
