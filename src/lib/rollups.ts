// rollups.ts — agregación diaria de analítica (Fase 6): eventos crudos +
// órdenes/pagos → rollups precalculados por producto y por vendor.
//
// DISEÑO:
//  - RE-EJECUTABLE (idempotente): cada sentencia es un
//    INSERT ... SELECT ... ON CONFLICT DO UPDATE que RECALCULA el día completo
//    desde las fuentes; correr el rollup dos veces produce exactamente los
//    mismos números (SET con el valor recalculado, nunca acumulando).
//  - Días en UTC: cada día se procesa como el rango [00:00 UTC, 24:00 UTC),
//    comparando created_at / verificado_en (timestamptz) contra los límites
//    del rango — así se aprovechan los índices por created_at en lugar de
//    castear la columna a date en el WHERE.
//  - Parámetros SIEMPRE vía sql`${...}` (placeholders $n de Postgres);
//    nada se interpola en el texto SQL.
//  - Métricas de dinero/pedidos: los eventos `orden_creada` NO llevan
//    product_id, así que las métricas por producto (ordenesCreadas,
//    unidadesVerificadas, ingresoVerificado) se calculan desde las tablas
//    transaccionales (orders + order_items + payments), no desde eventos.
import { sql } from "drizzle-orm";
import { db } from "@/db";

const MS_DIA = 24 * 60 * 60 * 1000;

/** Trunca una fecha al inicio de su día UTC (00:00:00.000Z). */
function inicioDiaUtc(fecha: Date): Date {
  return new Date(
    Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate()),
  );
}

/**
 * rollupDia — consolida UN día UTC en ambas tablas de rollup.
 * Seis UPSERTs independientes: cada uno recalcula sus columnas desde su
 * fuente y solo pisa ESAS columnas (los demás campos conservan su valor).
 */
async function rollupDia(dia: Date): Promise<void> {
  // Límites del día en UTC: [inicio, fin) como timestamptz, y la fecha
  // como string "YYYY-MM-DD" para la columna `date` de los rollups.
  const inicio = dia;
  const fin = new Date(dia.getTime() + MS_DIA);
  const fecha = dia.toISOString().slice(0, 10);

  // -------------------------------------------------------------------------
  // analytics_producto_diario
  // -------------------------------------------------------------------------

  // 1) Métricas de eventos por producto: vistas / clicks / adds al carrito.
  //    vendor_id se denormaliza desde products para filtrar sin JOIN después.
  await db.execute(sql`
    INSERT INTO analytics_producto_diario
      (fecha, product_id, vendor_id, vistas, clicks, adds_carrito)
    SELECT
      ${fecha}::date,
      e.product_id,
      p.vendor_id,
      (count(*) FILTER (WHERE e.event_type = 'vista_producto'))::int,
      (count(*) FILTER (WHERE e.event_type = 'click_producto'))::int,
      (count(*) FILTER (WHERE e.event_type = 'add_carrito'))::int
    FROM analytics_events e
    JOIN products p ON p.id = e.product_id
    WHERE e.product_id IS NOT NULL
      AND e.created_at >= ${inicio}
      AND e.created_at < ${fin}
    GROUP BY e.product_id, p.vendor_id
    ON CONFLICT (fecha, product_id) DO UPDATE SET
      vendor_id = EXCLUDED.vendor_id,
      vistas = EXCLUDED.vistas,
      clicks = EXCLUDED.clicks,
      adds_carrito = EXCLUDED.adds_carrito
  `);

  // 2) Órdenes creadas por producto: cuántas órdenes DISTINTAS creadas ese
  //    día contienen el producto (una orden con dos variantes del mismo
  //    producto cuenta UNA vez). Nota: NO sale de eventos porque el evento
  //    `orden_creada` no lleva product_id.
  await db.execute(sql`
    INSERT INTO analytics_producto_diario
      (fecha, product_id, vendor_id, ordenes_creadas)
    SELECT
      ${fecha}::date,
      pv.product_id,
      p.vendor_id,
      count(DISTINCT o.id)::int
    FROM orders o
    JOIN order_items oi ON oi.order_id = o.id
    JOIN product_variants pv ON pv.id = oi.variant_id
    JOIN products p ON p.id = pv.product_id
    WHERE o.created_at >= ${inicio}
      AND o.created_at < ${fin}
    GROUP BY pv.product_id, p.vendor_id
    ON CONFLICT (fecha, product_id) DO UPDATE SET
      vendor_id = EXCLUDED.vendor_id,
      ordenes_creadas = EXCLUDED.ordenes_creadas
  `);

  // 3) Unidades e ingreso VERIFICADOS por producto: partidas de órdenes cuyo
  //    pago se VERIFICÓ ese día (verificado_en, no created_at de la orden).
  //    El subquery con DISTINCT order_id evita contar doble si una orden
  //    tuviera más de un pago verificado (el esquema admite 1..N pagos).
  await db.execute(sql`
    INSERT INTO analytics_producto_diario
      (fecha, product_id, vendor_id, unidades_verificadas, ingreso_verificado)
    SELECT
      ${fecha}::date,
      pv.product_id,
      p.vendor_id,
      COALESCE(sum(oi.cantidad), 0)::int,
      COALESCE(sum(oi.cantidad * oi.precio_unit), 0)
    FROM (
      SELECT DISTINCT order_id
      FROM payments
      WHERE estado = 'verificado'
        AND verificado_en >= ${inicio}
        AND verificado_en < ${fin}
    ) pagos
    JOIN order_items oi ON oi.order_id = pagos.order_id
    JOIN product_variants pv ON pv.id = oi.variant_id
    JOIN products p ON p.id = pv.product_id
    GROUP BY pv.product_id, p.vendor_id
    ON CONFLICT (fecha, product_id) DO UPDATE SET
      vendor_id = EXCLUDED.vendor_id,
      unidades_verificadas = EXCLUDED.unidades_verificadas,
      ingreso_verificado = EXCLUDED.ingreso_verificado
  `);

  // -------------------------------------------------------------------------
  // analytics_vendor_diario
  // -------------------------------------------------------------------------

  // 4) Métricas de eventos por vendor: visitas a la tienda, vistas de
  //    producto y adds al carrito del día.
  await db.execute(sql`
    INSERT INTO analytics_vendor_diario
      (fecha, vendor_id, visitas_tienda, vistas_producto, adds_carrito)
    SELECT
      ${fecha}::date,
      e.vendor_id,
      (count(*) FILTER (WHERE e.event_type = 'vista_tienda'))::int,
      (count(*) FILTER (WHERE e.event_type = 'vista_producto'))::int,
      (count(*) FILTER (WHERE e.event_type = 'add_carrito'))::int
    FROM analytics_events e
    WHERE e.vendor_id IS NOT NULL
      AND e.created_at >= ${inicio}
      AND e.created_at < ${fin}
    GROUP BY e.vendor_id
    ON CONFLICT (fecha, vendor_id) DO UPDATE SET
      visitas_tienda = EXCLUDED.visitas_tienda,
      vistas_producto = EXCLUDED.vistas_producto,
      adds_carrito = EXCLUDED.adds_carrito
  `);

  // 5) Órdenes creadas por vendor ese día (desde la tabla orders, la fuente
  //    de verdad; no desde eventos `orden_creada`).
  await db.execute(sql`
    INSERT INTO analytics_vendor_diario
      (fecha, vendor_id, ordenes_creadas)
    SELECT
      ${fecha}::date,
      o.vendor_id,
      count(*)::int
    FROM orders o
    WHERE o.created_at >= ${inicio}
      AND o.created_at < ${fin}
    GROUP BY o.vendor_id
    ON CONFLICT (fecha, vendor_id) DO UPDATE SET
      ordenes_creadas = EXCLUDED.ordenes_creadas
  `);

  // 6) Pagos verificados por vendor ese día + ingreso verificado
  //    (SUM(orders.total) de esas órdenes). El DISTINCT del subquery
  //    garantiza una fila por orden aunque hubiera pagos duplicados.
  await db.execute(sql`
    INSERT INTO analytics_vendor_diario
      (fecha, vendor_id, ordenes_pago_verificado, ingreso_verificado)
    SELECT
      ${fecha}::date,
      o.vendor_id,
      count(*)::int,
      COALESCE(sum(o.total), 0)
    FROM (
      SELECT DISTINCT order_id
      FROM payments
      WHERE estado = 'verificado'
        AND verificado_en >= ${inicio}
        AND verificado_en < ${fin}
    ) pagos
    JOIN orders o ON o.id = pagos.order_id
    GROUP BY o.vendor_id
    ON CONFLICT (fecha, vendor_id) DO UPDATE SET
      ordenes_pago_verificado = EXCLUDED.ordenes_pago_verificado,
      ingreso_verificado = EXCLUDED.ingreso_verificado
  `);
}

/**
 * ejecutarRollup — consolida los rollups diarios del rango [desde, hasta]
 * (ambos inclusive, truncados a día UTC). Sin argumentos procesa AYER y HOY:
 * ayer porque el cron de las 3:00 debe cerrar el día anterior completo, y hoy
 * para que el dashboard tenga números frescos del día en curso.
 *
 * Devuelve cuántos días se procesaron. Idempotente: re-ejecutarlo con el
 * mismo rango deja los mismos números (ver DISEÑO arriba).
 */
export async function ejecutarRollup(
  desde?: Date,
  hasta?: Date,
): Promise<{ dias: number }> {
  const hoy = inicioDiaUtc(new Date());
  const inicioRango = inicioDiaUtc(desde ?? new Date(hoy.getTime() - MS_DIA));
  const finRango = inicioDiaUtc(hasta ?? hoy);

  let dias = 0;
  for (
    let dia = inicioRango;
    dia.getTime() <= finRango.getTime();
    dia = new Date(dia.getTime() + MS_DIA)
  ) {
    await rollupDia(dia);
    dias++;
  }
  return { dias };
}

/**
 * purgarEventosAntiguos — retención de eventos crudos: borra de
 * analytics_events todo lo anterior a `diasRetencion` días (180 por defecto,
 * política de PLAN.md). Los rollups diarios NO se tocan: son el histórico
 * agregado que sobrevive a la purga. Devuelve cuántas filas se borraron.
 */
export async function purgarEventosAntiguos(
  diasRetencion = 180,
): Promise<number> {
  const resultado = await db.execute(sql`
    DELETE FROM analytics_events
    WHERE created_at < now() - make_interval(days => ${diasRetencion}::int)
  `);
  return resultado.rowCount ?? 0;
}

// Fin de rollups.ts
