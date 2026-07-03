// orders.ts — NÚCLEO DE DOMINIO de órdenes y pagos manuales (Fase 5).
//
// Todo cambio de estado de orden/pago pasa por aquí: server actions, rutas API
// y tests de integración programan contra esta API. Reglas duras:
//
//  - Las transiciones SIEMPRE se validan con canTransition / canPaymentTransition
//    (máquina de estados pura de src/lib/payments/state-machine.ts).
//  - Ciclo de reservas de stock:
//      RESERVAR  (crearOrden):     reservado += qty con guard atómico anti-oversell.
//      CONFIRMAR (pago verificado): stock -= qty, reservado -= qty + DELETE holds.
//      LIBERAR   (expirar/cancelar): reservado -= qty + DELETE holds.
//  - Una orden en `comprobante_enviado` NO expira: el barrido solo toca
//    `pendiente_pago` y `rechazado` (guard en el UPDATE de expirarOrden).
//  - Los permisos se verifican SIEMPRE contra BD (vendor_members / rol_global);
//    nunca se confía en el caller.
//  - Dinero en numeric-as-string; la aritmética se hace en CENTAVOS enteros
//    (mismo patrón que src/lib/cart.ts) para evitar errores de flotantes.
//  - Las notificaciones se emiten FUERA de la transacción y nunca lanzan
//    (contrato de notificar): un aviso fallido no revierte la transición.
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  inventory,
  orderItems,
  orders,
  payments,
  products,
  productVariants,
  stockHolds,
  users,
  vendorMembers,
  vendors,
} from "@/db/schema";
import {
  canPaymentTransition,
  canTransition,
} from "@/lib/payments/state-machine";
import { generarReferencia } from "@/lib/referencia";
import { notificar } from "@/lib/notifications";
import { registrarEvento } from "@/lib/analytics-server";

// ---------------------------------------------------------------------------
// Tipos públicos del módulo (contrato con actions / API / tests).
// ---------------------------------------------------------------------------

export type ResultadoOrden =
  | { ok: true; orderId: string }
  | { ok: false; error: string };

export type Resultado = { ok: boolean; error?: string };

// ---------------------------------------------------------------------------
// Helpers internos.
// ---------------------------------------------------------------------------

// Tipo del cliente transaccional de Drizzle (evita `any` en los helpers).
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Error de dominio: su mensaje es un código seguro para exponer al caller. */
class ErrorDominio extends Error {}

// Ventanas de expiración del ciclo de pago.
const MS_48_HORAS = 48 * 60 * 60 * 1000; // vida de la reserva al crear la orden
const MS_24_HORAS = 24 * 60 * 60 * 1000; // ventana de re-subida tras un rechazo

// Solo estos estados de orden son expirables (el barrido NUNCA toca
// comprobante_enviado: el comprador ya pagó y espera veredicto humano).
const ESTADOS_EXPIRABLES = ["pendiente_pago", "rechazado"] as const;

/** Convierte numeric-as-string ("123.45") a centavos enteros (12345). */
function aCentavos(precio: string): number {
  return Math.round(Number(precio) * 100);
}

/** Formatea centavos enteros de vuelta a string "123.45" (2 decimales fijos). */
function centavosAString(centavos: number): string {
  return (centavos / 100).toFixed(2);
}

/**
 * mensajeSeguro — mapea una excepción a un código de error sin detalles
 * internos. Los ErrorDominio llevan código en el mensaje; el resto se loguea
 * y se responde "ERROR_INTERNO" (no filtramos SQL/constraints al caller).
 */
function mensajeSeguro(error: unknown): string {
  if (error instanceof ErrorDominio) return error.message;
  console.error("[orders] error inesperado:", error);
  return "ERROR_INTERNO";
}

/**
 * esViolacionUnique — detecta un 23505 de Postgres recorriendo la cadena de
 * causas (Drizzle puede envolver el DatabaseError de node-postgres).
 * En el flujo de crearOrden el único UNIQUE alcanzable es referencia_pago.
 */
function esViolacionUnique(error: unknown): boolean {
  let actual: unknown = error;
  for (let salto = 0; salto < 5 && actual != null; salto++) {
    if (
      typeof actual === "object" &&
      "code" in actual &&
      (actual as { code?: unknown }).code === "23505"
    ) {
      return true;
    }
    actual = (actual as { cause?: unknown }).cause;
  }
  return false;
}

/**
 * puedeGestionarVendor — el actor es miembro (owner/staff) del vendor o
 * superadmin. SIEMPRE contra BD: nunca se confía en flags del caller.
 */
async function puedeGestionarVendor(
  vendorId: string,
  actorUserId: string,
): Promise<boolean> {
  const [miembro] = await db
    .select({ userId: vendorMembers.userId })
    .from(vendorMembers)
    .where(
      and(
        eq(vendorMembers.vendorId, vendorId),
        eq(vendorMembers.userId, actorUserId),
      ),
    )
    .limit(1);
  if (miembro) return true;

  const [usuario] = await db
    .select({ rolGlobal: users.rolGlobal })
    .from(users)
    .where(eq(users.id, actorUserId))
    .limit(1);
  return usuario?.rolGlobal === "superadmin";
}

/** Carga la orden por id (o null). */
async function cargarOrden(orderId: string) {
  const [orden] = await db
    .select()
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);
  return orden ?? null;
}

/**
 * cargarPagoVigente — el pago más reciente de la orden. crearOrden crea uno
 * solo y la re-subida lo reutiliza (rechazado → enviado), pero el esquema
 * admite 1..N: el vigente es siempre el último por created_at.
 */
async function cargarPagoVigente(orderId: string) {
  const [pago] = await db
    .select()
    .from(payments)
    .where(eq(payments.orderId, orderId))
    .orderBy(desc(payments.createdAt))
    .limit(1);
  return pago ?? null;
}

/**
 * confirmarReservas — COMMIT del stock al verificar el pago: por cada hold,
 * stock -= qty y reservado -= qty, y se borran los holds. El CHECK de BD
 * (0 <= reservado <= stock) actúa como red de seguridad si algo se desalinea.
 */
async function confirmarReservas(tx: Tx, orderId: string): Promise<void> {
  const holds = await tx
    .select()
    .from(stockHolds)
    .where(eq(stockHolds.orderId, orderId));
  for (const hold of holds) {
    await tx
      .update(inventory)
      .set({
        stock: sql`${inventory.stock} - ${hold.cantidad}`,
        reservado: sql`${inventory.reservado} - ${hold.cantidad}`,
      })
      .where(eq(inventory.variantId, hold.variantId));
  }
  await tx.delete(stockHolds).where(eq(stockHolds.orderId, orderId));
}

/**
 * liberarReservas — LIBERA el stock al expirar/cancelar: por cada hold,
 * reservado -= qty (el stock físico no se mueve) y se borran los holds.
 */
async function liberarReservas(tx: Tx, orderId: string): Promise<void> {
  const holds = await tx
    .select()
    .from(stockHolds)
    .where(eq(stockHolds.orderId, orderId));
  for (const hold of holds) {
    await tx
      .update(inventory)
      .set({ reservado: sql`${inventory.reservado} - ${hold.cantidad}` })
      .where(eq(inventory.variantId, hold.variantId));
  }
  await tx.delete(stockHolds).where(eq(stockHolds.orderId, orderId));
}

/**
 * transicionarOrden — UPDATE guardado por estado actual (.returning()):
 * si otra transacción movió la orden entre la lectura y el UPDATE, afecta
 * 0 filas y se revierte con ESTADO_INVALIDO (anti-carrera TOCTOU).
 */
async function transicionarOrden(
  tx: Tx,
  orderId: string,
  desde: (typeof orders.$inferSelect)["estado"],
  cambios: Partial<typeof orders.$inferInsert>,
): Promise<void> {
  const filas = await tx
    .update(orders)
    .set(cambios)
    .where(and(eq(orders.id, orderId), eq(orders.estado, desde)))
    .returning({ id: orders.id });
  if (filas.length === 0) throw new ErrorDominio("ESTADO_INVALIDO");
}

/** Igual que transicionarOrden pero para payments (guard por estado actual). */
async function transicionarPago(
  tx: Tx,
  paymentId: string,
  desde: (typeof payments.$inferSelect)["estado"],
  cambios: Partial<typeof payments.$inferInsert>,
): Promise<void> {
  const filas = await tx
    .update(payments)
    .set(cambios)
    .where(and(eq(payments.id, paymentId), eq(payments.estado, desde)))
    .returning({ id: payments.id });
  if (filas.length === 0) throw new ErrorDominio("ESTADO_INVALIDO");
}

// ---------------------------------------------------------------------------
// crearOrden — checkout de UN vendor: reservas + orden + partidas + pago.
// ---------------------------------------------------------------------------

export async function crearOrden(params: {
  compradorId: string;
  vendorId: string;
  /** Items ya saneados por el caller (uuid válido, qty 1..9). */
  items: Array<{ variantId: string; qty: number }>;
  metodoPago: "spei" | "efectivo";
  metodoEntrega: "aula" | "punto";
  /** null/omitido → usa aulaDefault del vendor. */
  aula?: string | null;
}): Promise<ResultadoOrden> {
  if (params.items.length === 0) return { ok: false, error: "SIN_ITEMS" };

  // Vendor: existe y aporta el aula por defecto para la entrega.
  const [vendor] = await db
    .select({ id: vendors.id, aulaDefault: vendors.aulaDefault })
    .from(vendors)
    .where(eq(vendors.id, params.vendorId))
    .limit(1);
  if (!vendor) return { ok: false, error: "VENDOR_NO_ENCONTRADO" };

  // TODAS las variantes deben pertenecer a productos ACTIVOS de ESTE vendor
  // (una variante ajena o de producto no activo invalida el checkout entero).
  const variantIds = params.items.map((item) => item.variantId);
  const variantes = await db
    .select({
      variantId: productVariants.id,
      precio: productVariants.precio,
      precioComunidad: productVariants.precioComunidad,
    })
    .from(productVariants)
    .innerJoin(
      products,
      and(
        eq(products.id, productVariants.productId),
        eq(products.vendorId, params.vendorId),
        eq(products.estado, "activo"),
      ),
    )
    .where(inArray(productVariants.id, variantIds));
  const porVariante = new Map(variantes.map((v) => [v.variantId, v]));

  // Partidas con precio CONGELADO al momento de la compra: comunidad manda.
  const lineas: Array<{ variantId: string; qty: number; precioUnit: string }> = [];
  for (const item of params.items) {
    const variante = porVariante.get(item.variantId);
    if (!variante) return { ok: false, error: "PRODUCTO_NO_DISPONIBLE" };
    lineas.push({
      variantId: item.variantId,
      qty: item.qty,
      precioUnit: variante.precioComunidad ?? variante.precio,
    });
  }

  // Total en CENTAVOS enteros (patrón de src/lib/cart.ts): sin flotantes.
  const totalCentavos = lineas.reduce(
    (suma, linea) => suma + aCentavos(linea.precioUnit) * linea.qty,
    0,
  );

  // Hasta 3 intentos: si la referenciaPago choca con el UNIQUE (23505), un
  // 23505 ABORTA la transacción en Postgres, así que se reintenta el ciclo
  // completo (reservas incluidas) con una referencia nueva.
  const MAX_INTENTOS = 3;
  for (let intento = 1; intento <= MAX_INTENTOS; intento++) {
    try {
      const orderId = await db.transaction(async (tx) => {
        // 1) RESERVAR stock, item por item, con guard atómico. El propio
        //    UPDATE toma row-lock sobre inventory y serializa checkouts
        //    concurrentes de la misma variante: el segundo espera y re-evalúa
        //    `stock - reservado >= qty` sobre el valor ya actualizado.
        for (const linea of lineas) {
          const reservadas = await tx
            .update(inventory)
            .set({ reservado: sql`${inventory.reservado} + ${linea.qty}` })
            .where(
              and(
                eq(inventory.variantId, linea.variantId),
                sql`${inventory.stock} - ${inventory.reservado} >= ${linea.qty}`,
              ),
            )
            .returning({ variantId: inventory.variantId });
          // 0 filas = sin inventario suficiente (o sin fila) → rollback total.
          if (reservadas.length === 0) throw new ErrorDominio("SIN_STOCK");
        }

        // 2) La orden nace en pendiente_pago con 48 h para pagar.
        const expiraEn = new Date(Date.now() + MS_48_HORAS);
        const referencia = generarReferencia();
        const [orden] = await tx
          .insert(orders)
          .values({
            compradorId: params.compradorId,
            vendorId: params.vendorId,
            estado: "pendiente_pago",
            total: centavosAString(totalCentavos),
            referenciaPago: referencia,
            metodoEntrega: params.metodoEntrega,
            // aula explícita del comprador, o la aulaDefault del vendor.
            aula: params.aula ?? vendor.aulaDefault ?? null,
            expiraEn,
          })
          .returning({ id: orders.id });

        // 3) Partidas con precio unitario congelado.
        await tx.insert(orderItems).values(
          lineas.map((linea) => ({
            orderId: orden.id,
            variantId: linea.variantId,
            cantidad: linea.qty,
            precioUnit: linea.precioUnit,
          })),
        );

        // 4) Holds informativos (mismo vencimiento que la orden). La verdad
        //    operativa del TTL es orders.expira_en: el barrido expira la ORDEN
        //    y de ahí libera los holds, así un comprobante_enviado congela
        //    implícitamente sus reservas hasta el veredicto.
        await tx.insert(stockHolds).values(
          lineas.map((linea) => ({
            orderId: orden.id,
            variantId: linea.variantId,
            cantidad: linea.qty,
            expiraEn,
          })),
        );

        // 5) Pago manual en pendiente con la MISMA referencia de conciliación.
        await tx.insert(payments).values({
          orderId: orden.id,
          metodo: params.metodoPago,
          referencia,
          estado: "pendiente",
          montoDeclarado: null,
        });

        return orden.id;
      });
      // Analítica fire-and-forget FUERA de la transacción: nunca lanza y un
      // fallo no revierte ni retrasa el checkout (contrato de registrarEvento).
      void registrarEvento({
        tipo: "orden_creada",
        userId: params.compradorId,
        vendorId: params.vendorId,
        orderId,
        metadata: {
          metodoPago: params.metodoPago,
          total: centavosAString(totalCentavos),
        },
      });
      return { ok: true, orderId };
    } catch (error) {
      // Choque de referencia única: reintenta con otra (máx 3 en total).
      if (esViolacionUnique(error) && intento < MAX_INTENTOS) continue;
      return { ok: false, error: mensajeSeguro(error) };
    }
  }
  // Inalcanzable (el último intento retorna dentro del loop); por tipado:
  return { ok: false, error: "ERROR_INTERNO" };
}

// ---------------------------------------------------------------------------
// registrarComprobante — el comprador sube su comprobante SPEI (o lo re-sube).
// ---------------------------------------------------------------------------

export async function registrarComprobante(
  orderId: string,
  compradorId: string,
  comprobanteUrl: string,
  montoDeclarado?: string,
): Promise<Resultado> {
  const orden = await cargarOrden(orderId);
  // Orden inexistente y orden ajena responden IGUAL: no filtramos existencia.
  if (!orden || orden.compradorId !== compradorId) {
    return { ok: false, error: "NO_ENCONTRADA" };
  }

  // Máquina de estados: solo pendiente_pago y rechazado (re-subida) admiten
  // pasar a comprobante_enviado.
  if (!canTransition(orden.estado, "comprobante_enviado")) {
    return { ok: false, error: "ESTADO_INVALIDO" };
  }
  const pago = await cargarPagoVigente(orderId);
  // Pago desde pendiente (primer envío) o rechazado (re-subida) → enviado.
  if (!pago || !canPaymentTransition(pago.estado, "enviado")) {
    return { ok: false, error: "ESTADO_INVALIDO" };
  }

  try {
    await db.transaction(async (tx) => {
      await transicionarOrden(tx, orderId, orden.estado, {
        estado: "comprobante_enviado",
      });
      await transicionarPago(tx, pago.id, pago.estado, {
        estado: "enviado",
        comprobanteUrl,
        montoDeclarado: montoDeclarado ?? null,
      });
    });
  } catch (error) {
    return { ok: false, error: mensajeSeguro(error) };
  }

  // Aviso al/los OWNER del vendor: hay un comprobante en su cola de revisión.
  const owners = await db
    .select({ userId: vendorMembers.userId })
    .from(vendorMembers)
    .where(
      and(
        eq(vendorMembers.vendorId, orden.vendorId),
        eq(vendorMembers.rol, "owner"),
      ),
    );
  for (const owner of owners) {
    await notificar(owner.userId, "comprobante_recibido", {
      orderId,
      paymentId: pago.id,
      referencia: orden.referenciaPago,
      montoDeclarado: montoDeclarado ?? null,
    });
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// verificarPago — un humano del vendor valida el comprobante SPEI.
// ---------------------------------------------------------------------------

export async function verificarPago(
  paymentId: string,
  actorUserId: string,
): Promise<Resultado> {
  const [fila] = await db
    .select({ pago: payments, orden: orders })
    .from(payments)
    .innerJoin(orders, eq(orders.id, payments.orderId))
    .where(eq(payments.id, paymentId))
    .limit(1);
  if (!fila) return { ok: false, error: "NO_ENCONTRADO" };
  const { pago, orden } = fila;

  // Permiso SIEMPRE contra BD: miembro del vendor de la orden o superadmin.
  if (!(await puedeGestionarVendor(orden.vendorId, actorUserId))) {
    return { ok: false, error: "NO_AUTORIZADO" };
  }

  // Este flujo verifica COMPROBANTES: exige pago en "enviado" (la vía
  // pendiente → verificado es exclusiva de confirmarEfectivo), y además
  // consulta la máquina de estados para ambas transiciones.
  if (pago.estado !== "enviado" || !canPaymentTransition(pago.estado, "verificado")) {
    return { ok: false, error: "ESTADO_INVALIDO" };
  }
  if (!canTransition(orden.estado, "pago_verificado")) {
    return { ok: false, error: "ESTADO_INVALIDO" };
  }

  try {
    // Pago + orden + COMMIT de stock: TODO en una sola transacción.
    await db.transaction(async (tx) => {
      await transicionarPago(tx, pago.id, pago.estado, {
        estado: "verificado",
        verificadoPor: actorUserId,
        verificadoEn: new Date(),
      });
      await transicionarOrden(tx, orden.id, orden.estado, {
        estado: "pago_verificado",
      });
      await confirmarReservas(tx, orden.id);
    });
  } catch (error) {
    return { ok: false, error: mensajeSeguro(error) };
  }

  await notificar(orden.compradorId, "pago_verificado", {
    orderId: orden.id,
    paymentId: pago.id,
  });
  // Analítica fire-and-forget (fuera de la transacción; jamás lanza).
  void registrarEvento({
    tipo: "pago_verificado",
    userId: orden.compradorId,
    vendorId: orden.vendorId,
    orderId: orden.id,
    metadata: { montoVerificado: orden.total },
  });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// rechazarPago — el comprobante no cuadra; se abre ventana de re-subida (24 h).
// ---------------------------------------------------------------------------

export async function rechazarPago(
  paymentId: string,
  actorUserId: string,
  motivo?: string,
): Promise<Resultado> {
  const [fila] = await db
    .select({ pago: payments, orden: orders })
    .from(payments)
    .innerJoin(orders, eq(orders.id, payments.orderId))
    .where(eq(payments.id, paymentId))
    .limit(1);
  if (!fila) return { ok: false, error: "NO_ENCONTRADO" };
  const { pago, orden } = fila;

  if (!(await puedeGestionarVendor(orden.vendorId, actorUserId))) {
    return { ok: false, error: "NO_AUTORIZADO" };
  }
  // Solo un comprobante enviado puede rechazarse.
  if (!canPaymentTransition(pago.estado, "rechazado")) {
    return { ok: false, error: "ESTADO_INVALIDO" };
  }
  if (!canTransition(orden.estado, "rechazado")) {
    return { ok: false, error: "ESTADO_INVALIDO" };
  }

  try {
    await db.transaction(async (tx) => {
      await transicionarPago(tx, pago.id, pago.estado, { estado: "rechazado" });
      // Ventana de re-subida: 24 h desde el rechazo; si el comprador no
      // corrige a tiempo, el barrido expira la orden y libera las reservas.
      await transicionarOrden(tx, orden.id, orden.estado, {
        estado: "rechazado",
        expiraEn: new Date(Date.now() + MS_24_HORAS),
      });
    });
  } catch (error) {
    return { ok: false, error: mensajeSeguro(error) };
  }

  await notificar(orden.compradorId, "pago_rechazado", {
    orderId: orden.id,
    paymentId: pago.id,
    motivo: motivo ?? null,
  });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// confirmarEfectivo — el vendor cobra en mano: pendiente → verificado directo.
// ---------------------------------------------------------------------------

export async function confirmarEfectivo(
  orderId: string,
  actorUserId: string,
): Promise<Resultado> {
  const orden = await cargarOrden(orderId);
  if (!orden) return { ok: false, error: "NO_ENCONTRADA" };

  if (!(await puedeGestionarVendor(orden.vendorId, actorUserId))) {
    return { ok: false, error: "NO_AUTORIZADO" };
  }

  const pago = await cargarPagoVigente(orderId);
  if (!pago) return { ok: false, error: "NO_ENCONTRADO" };
  // Este atajo es EXCLUSIVO del pago en efectivo (sin comprobante que revisar).
  if (pago.metodo !== "efectivo") return { ok: false, error: "METODO_INVALIDO" };

  // pendiente_pago → pago_verificado (orden) y pendiente → verificado (pago):
  // ambas vías directas existen en la máquina justo para el efectivo.
  if (!canTransition(orden.estado, "pago_verificado")) {
    return { ok: false, error: "ESTADO_INVALIDO" };
  }
  if (!canPaymentTransition(pago.estado, "verificado")) {
    return { ok: false, error: "ESTADO_INVALIDO" };
  }

  try {
    await db.transaction(async (tx) => {
      await transicionarOrden(tx, orden.id, orden.estado, {
        estado: "pago_verificado",
      });
      await transicionarPago(tx, pago.id, pago.estado, {
        estado: "verificado",
        verificadoPor: actorUserId,
        verificadoEn: new Date(),
      });
      await confirmarReservas(tx, orden.id);
    });
  } catch (error) {
    return { ok: false, error: mensajeSeguro(error) };
  }

  await notificar(orden.compradorId, "pago_verificado", {
    orderId: orden.id,
    paymentId: pago.id,
  });
  // Analítica fire-and-forget (fuera de la transacción; jamás lanza).
  void registrarEvento({
    tipo: "pago_verificado",
    userId: orden.compradorId,
    vendorId: orden.vendorId,
    orderId: orden.id,
    metadata: { montoVerificado: orden.total, metodoPago: "efectivo" },
  });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// avanzarEstado — flujo de fulfillment: preparando → listo_entrega → entregado.
// ---------------------------------------------------------------------------

export async function avanzarEstado(
  orderId: string,
  actorUserId: string,
  nuevo: "preparando" | "listo_entrega" | "entregado",
): Promise<Resultado> {
  const orden = await cargarOrden(orderId);
  if (!orden) return { ok: false, error: "NO_ENCONTRADA" };

  if (!(await puedeGestionarVendor(orden.vendorId, actorUserId))) {
    return { ok: false, error: "NO_AUTORIZADO" };
  }
  if (!canTransition(orden.estado, nuevo)) {
    return { ok: false, error: "ESTADO_INVALIDO" };
  }

  // Regla de negocio dura: NO se entrega sin pago verificado (defensa extra
  // por si la orden llegó aquí por un camino raro de datos).
  if (nuevo === "entregado") {
    const pago = await cargarPagoVigente(orderId);
    if (!pago || pago.estado !== "verificado") {
      return { ok: false, error: "PAGO_NO_VERIFICADO" };
    }
  }

  try {
    await db.transaction(async (tx) => {
      await transicionarOrden(tx, orden.id, orden.estado, { estado: nuevo });
    });
  } catch (error) {
    return { ok: false, error: mensajeSeguro(error) };
  }

  // El comprador se entera cuando su pedido está listo y cuando se entrega.
  if (nuevo === "listo_entrega") {
    await notificar(orden.compradorId, "orden_lista", { orderId: orden.id });
  } else if (nuevo === "entregado") {
    await notificar(orden.compradorId, "orden_entregada", { orderId: orden.id });
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// expirarOrden — job/barrido: libera reservas de órdenes vencidas SIN actor.
// ---------------------------------------------------------------------------

export async function expirarOrden(orderId: string): Promise<Resultado> {
  let compradorId: string | null = null;
  try {
    compradorId = await db.transaction(async (tx) => {
      // Guard TODO-en-uno: solo expira pendiente_pago/rechazado ya vencidas.
      // Una orden en comprobante_enviado NUNCA pasa este filtro (no expira),
      // y el propio UPDATE es la protección contra dobles ejecuciones
      // concurrentes del job (la segunda afecta 0 filas y no hace nada).
      const filas = await tx
        .update(orders)
        .set({ estado: "expirado" })
        .where(
          and(
            eq(orders.id, orderId),
            inArray(orders.estado, [...ESTADOS_EXPIRABLES]),
            sql`${orders.expiraEn} < now()`,
          ),
        )
        .returning({ compradorId: orders.compradorId });
      if (filas.length === 0) return null; // sin efectos: no era expirable
      // LIBERAR reservas: devuelve el stock apartado sin tocar el físico.
      await liberarReservas(tx, orderId);
      return filas[0].compradorId;
    });
  } catch (error) {
    return { ok: false, error: mensajeSeguro(error) };
  }

  if (compradorId === null) return { ok: false, error: "NO_EXPIRABLE" };

  await notificar(compradorId, "orden_expirada", { orderId });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// barrerOrdenesExpiradas — pasada del job: expira en lote (máx 100 por pasada).
// ---------------------------------------------------------------------------

export async function barrerOrdenesExpiradas(): Promise<number> {
  // Candidatas: SOLO pendiente_pago/rechazado vencidas (comprobante_enviado
  // queda protegida). El LIMIT acota cada pasada del job.
  const candidatas = await db
    .select({ id: orders.id })
    .from(orders)
    .where(
      and(
        inArray(orders.estado, [...ESTADOS_EXPIRABLES]),
        sql`${orders.expiraEn} < now()`,
      ),
    )
    .limit(100);

  let expiradas = 0;
  // En secuencia: cada expiración es su propia transacción con guard, así una
  // orden problemática no tumba el barrido completo.
  for (const candidata of candidatas) {
    const resultado = await expirarOrden(candidata.id);
    if (resultado.ok) expiradas++;
  }
  return expiradas;
}

// Fin del núcleo de dominio de órdenes y pagos.
