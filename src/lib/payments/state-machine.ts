// state-machine.ts — máquina de estados para pagos MANUALES y ciclo de vida de la orden (STUB).
// Define los estados válidos y las transiciones permitidas entre ellos.

/**
 * ORDER_STATES — estados del ciclo de vida de una orden.
 * Flujo típico: carrito -> pendiente_pago -> comprobante_enviado ->
 *   pago_verificado -> preparando -> listo_entrega -> entregado.
 */
export const ORDER_STATES = {
  CARRITO: "carrito",
  PENDIENTE_PAGO: "pendiente_pago",
  COMPROBANTE_ENVIADO: "comprobante_enviado",
  PAGO_VERIFICADO: "pago_verificado",
  RECHAZADO: "rechazado",
  PREPARANDO: "preparando",
  LISTO_ENTREGA: "listo_entrega",
  ENTREGADO: "entregado",
  EXPIRADO: "expirado",
  CANCELADO: "cancelado",
} as const;

/** Tipo unión de los estados de orden. */
export type OrderState = (typeof ORDER_STATES)[keyof typeof ORDER_STATES];

/**
 * PAYMENT_STATES — estados del pago manual asociado a una orden.
 */
export const PAYMENT_STATES = {
  PENDIENTE: "pendiente",
  COMPROBANTE_SUBIDO: "comprobante_subido",
  EN_REVISION: "en_revision",
  VERIFICADO: "verificado",
  RECHAZADO: "rechazado",
} as const;

/** Tipo unión de los estados de pago. */
export type PaymentState = (typeof PAYMENT_STATES)[keyof typeof PAYMENT_STATES];

/**
 * ORDER_TRANSITIONS — transiciones permitidas: estado -> estados destino válidos.
 * TODO: validar contra reglas de negocio (timeouts, permisos de vendor/admin).
 */
export const ORDER_TRANSITIONS: Record<OrderState, OrderState[]> = {
  [ORDER_STATES.CARRITO]: [ORDER_STATES.PENDIENTE_PAGO, ORDER_STATES.CANCELADO],
  [ORDER_STATES.PENDIENTE_PAGO]: [
    ORDER_STATES.COMPROBANTE_ENVIADO,
    ORDER_STATES.EXPIRADO,
    ORDER_STATES.CANCELADO,
  ],
  [ORDER_STATES.COMPROBANTE_ENVIADO]: [
    ORDER_STATES.PAGO_VERIFICADO,
    ORDER_STATES.RECHAZADO,
    ORDER_STATES.EXPIRADO,
  ],
  [ORDER_STATES.PAGO_VERIFICADO]: [ORDER_STATES.PREPARANDO, ORDER_STATES.CANCELADO],
  [ORDER_STATES.RECHAZADO]: [ORDER_STATES.PENDIENTE_PAGO, ORDER_STATES.CANCELADO],
  [ORDER_STATES.PREPARANDO]: [ORDER_STATES.LISTO_ENTREGA, ORDER_STATES.CANCELADO],
  [ORDER_STATES.LISTO_ENTREGA]: [ORDER_STATES.ENTREGADO, ORDER_STATES.CANCELADO],
  // Estados terminales: sin transiciones de salida.
  [ORDER_STATES.ENTREGADO]: [],
  [ORDER_STATES.EXPIRADO]: [],
  [ORDER_STATES.CANCELADO]: [],
};

/**
 * canTransition — indica si se permite pasar de `from` a `to`.
 * TODO: añadir validaciones de actor/rol y condiciones de negocio.
 */
export function canTransition(from: OrderState, to: OrderState): boolean {
  // TODO: registrar intentos de transición inválidos para auditoría.
  return ORDER_TRANSITIONS[from]?.includes(to) ?? false;
}

// Fin de state-machine.ts
