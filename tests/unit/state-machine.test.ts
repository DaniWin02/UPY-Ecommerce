import { describe, it, expect } from "vitest";
import {
  ORDER_STATES,
  PAYMENT_STATES,
  ORDER_TRANSITIONS,
  PAYMENT_TRANSITIONS,
  TERMINAL_ORDER_STATES,
  canTransition,
  canPaymentTransition,
} from "@/lib/payments/state-machine";

// Derivamos los tipos localmente de las constantes exportadas para no
// depender de que el módulo exporte los alias de tipo.
type OrderState = (typeof ORDER_STATES)[number];
type PaymentState = (typeof PAYMENT_STATES)[number];

describe("máquina de estados de pedidos (ORDER)", () => {
  describe("transiciones declaradas", () => {
    // (a) Toda transición declarada en ORDER_TRANSITIONS debe ser válida.
    const declaradas = (
      Object.entries(ORDER_TRANSITIONS) as [OrderState, readonly OrderState[]][]
    ).flatMap(([from, tos]) => tos.map((to) => [from, to] as const));

    it.each(declaradas)("permite %s -> %s", (from, to) => {
      expect(canTransition(from, to)).toBe(true);
    });
  });

  describe("transiciones inválidas clave", () => {
    // (b) Muestreo de transiciones que NUNCA deben permitirse.
    it("rechaza pendiente_pago -> entregado (no se puede entregar sin verificar pago)", () => {
      expect(canTransition("pendiente_pago", "entregado")).toBe(false);
    });

    it("rechaza comprobante_enviado -> expirado (un pedido con comprobante no expira)", () => {
      expect(canTransition("comprobante_enviado", "expirado")).toBe(false);
    });

    it("rechaza entregado -> cualquier estado (terminal)", () => {
      for (const to of ORDER_STATES) {
        expect(canTransition("entregado", to)).toBe(false);
      }
    });

    it("rechaza expirado -> cualquier estado (terminal)", () => {
      for (const to of ORDER_STATES) {
        expect(canTransition("expirado", to)).toBe(false);
      }
    });
  });

  describe("estados terminales", () => {
    // (c) Los terminales son EXACTAMENTE los que no tienen transiciones salientes.
    it("los estados sin transiciones salientes son exactamente {entregado, expirado, cancelado}", () => {
      const sinSalida = ORDER_STATES.filter(
        (s) => ORDER_TRANSITIONS[s].length === 0
      );
      expect(new Set(sinSalida)).toEqual(
        new Set(["entregado", "expirado", "cancelado"])
      );
    });

    it("TERMINAL_ORDER_STATES refleja exactamente esos estados", () => {
      expect(new Set(TERMINAL_ORDER_STATES)).toEqual(
        new Set(["entregado", "expirado", "cancelado"])
      );
    });
  });

  describe("flujos de negocio", () => {
    // (d) Flujo feliz SPEI: cada eslabón de la cadena es válido.
    it("flujo feliz SPEI completo encadenado", () => {
      const cadena: readonly OrderState[] = [
        "pendiente_pago",
        "comprobante_enviado",
        "pago_verificado",
        "preparando",
        "listo_entrega",
        "entregado",
      ];
      for (let i = 0; i < cadena.length - 1; i++) {
        expect(canTransition(cadena[i], cadena[i + 1])).toBe(true);
      }
    });

    // (e) Flujo de pago en efectivo: el vendor verifica directo, sin comprobante.
    it("flujo efectivo: pendiente_pago -> pago_verificado directo", () => {
      expect(canTransition("pendiente_pago", "pago_verificado")).toBe(true);
    });

    // (f) Re-subida de comprobante tras rechazo.
    it("re-subida: comprobante_enviado -> rechazado -> comprobante_enviado", () => {
      expect(canTransition("comprobante_enviado", "rechazado")).toBe(true);
      expect(canTransition("rechazado", "comprobante_enviado")).toBe(true);
    });
  });
});

describe("máquina de estados de pagos (PAYMENT)", () => {
  // (g) Toda transición declarada en PAYMENT_TRANSITIONS es válida.
  describe("transiciones declaradas", () => {
    const declaradas = (
      Object.entries(PAYMENT_TRANSITIONS) as [
        PaymentState,
        readonly PaymentState[],
      ][]
    ).flatMap(([from, tos]) => tos.map((to) => [from, to] as const));

    it.each(declaradas)("permite %s -> %s", (from, to) => {
      expect(canPaymentTransition(from, to)).toBe(true);
    });
  });

  it("flujo efectivo: pendiente -> verificado directo", () => {
    expect(canPaymentTransition("pendiente", "verificado")).toBe(true);
  });

  it("re-subida: rechazado -> enviado", () => {
    expect(canPaymentTransition("rechazado", "enviado")).toBe(true);
  });

  it("verificado es terminal: no permite ninguna transición saliente", () => {
    for (const to of PAYMENT_STATES) {
      expect(canPaymentTransition("verificado", to)).toBe(false);
    }
  });

  it("rechaza pendiente -> rechazado (no se puede rechazar sin comprobante enviado)", () => {
    expect(canPaymentTransition("pendiente", "rechazado")).toBe(false);
  });
});
