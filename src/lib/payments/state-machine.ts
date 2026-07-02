// state-machine.ts — máquina de estados para pagos MANUALES (SPEI/efectivo)
// y ciclo de vida de la orden.
//
// IMPORTANTE: este módulo es PURO (sin dependencias). NO importa nada de
// src/db a propósito: los valores deben coincidir 1:1 con los pgEnum de la
// base de datos y existe un test de contrato aparte que valida esa igualdad.
//
// Nota: se ELIMINÓ el estado "carrito" — el carrito vive en una cookie del
// cliente; la orden nace directamente en "pendiente_pago" al hacer checkout.

/**
 * ORDER_STATES — estados del ciclo de vida de una orden.
 * Flujo típico (SPEI): pendiente_pago -> comprobante_enviado ->
 *   pago_verificado -> preparando -> listo_entrega -> entregado.
 * Flujo efectivo: pendiente_pago -> pago_verificado (el vendedor marca el
 *   pago como recibido al entregar en mano).
 */
export const ORDER_STATES = [
  "pendiente_pago",
  "comprobante_enviado",
  "pago_verificado",
  "rechazado",
  "preparando",
  "listo_entrega",
  "entregado",
  "expirado",
  "cancelado",
] as const;

/** Tipo unión de los estados de orden. */
export type OrderState = (typeof ORDER_STATES)[number];

/**
 * PAYMENT_STATES — estados del pago manual asociado a una orden.
 */
export const PAYMENT_STATES = [
  "pendiente",
  "enviado",
  "verificado",
  "rechazado",
] as const;

/** Tipo unión de los estados de pago. */
export type PaymentState = (typeof PAYMENT_STATES)[number];

/**
 * ORDER_TRANSITIONS — transiciones permitidas: estado -> estados destino válidos.
 */
export const ORDER_TRANSITIONS: Record<OrderState, readonly OrderState[]> = {
  // pago_verificado directo (sin comprobante) = pago en EFECTIVO al entregar:
  // el vendedor confirma el cobro en mano y no hay comprobante que revisar.
  pendiente_pago: ["comprobante_enviado", "pago_verificado", "expirado", "cancelado"],
  comprobante_enviado: ["pago_verificado", "rechazado", "cancelado"],
  // Desde "rechazado" el comprador puede RE-SUBIR un comprobante corregido
  // (vuelve a "comprobante_enviado"); si no lo hace a tiempo, expira.
  rechazado: ["comprobante_enviado", "expirado", "cancelado"],
  pago_verificado: ["preparando", "cancelado"],
  preparando: ["listo_entrega", "cancelado"],
  // Una vez listo para entrega ya no se cancela: el vendedor ya invirtió en
  // preparar el pedido; solo queda entregarlo.
  listo_entrega: ["entregado"],
  // Estados terminales: sin transiciones de salida.
  entregado: [],
  expirado: [],
  cancelado: [],
};

/**
 * canTransition — indica si se permite pasar de `from` a `to`.
 */
export function canTransition(from: OrderState, to: OrderState): boolean {
  return ORDER_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * PAYMENT_TRANSITIONS — transiciones permitidas del pago manual.
 */
export const PAYMENT_TRANSITIONS: Record<PaymentState, readonly PaymentState[]> = {
  // "verificado" directo (sin pasar por "enviado") = pago en EFECTIVO:
  // no existe comprobante, el vendedor lo marca verificado al cobrar.
  pendiente: ["enviado", "verificado"],
  enviado: ["verificado", "rechazado"],
  // Tras un rechazo el comprador puede RE-SUBIR el comprobante.
  rechazado: ["enviado"],
  // Estado terminal: un pago verificado no se revierte desde la máquina.
  verificado: [],
};

/**
 * canPaymentTransition — indica si se permite pasar de `from` a `to` en el pago.
 */
export function canPaymentTransition(from: PaymentState, to: PaymentState): boolean {
  return PAYMENT_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * TERMINAL_ORDER_STATES — estados terminales de la orden.
 * Derivado automáticamente: todo estado sin transiciones de salida.
 */
export const TERMINAL_ORDER_STATES: readonly OrderState[] = ORDER_STATES.filter(
  (estado) => ORDER_TRANSITIONS[estado].length === 0,
);

// Fin de state-machine.ts
