import { describe, it, expect } from "vitest";
// Importar el schema de Drizzle NO abre conexión a la base de datos:
// los pgEnum son solo definiciones estáticas.
import { orderEstadoEnum, pagoEstadoEnum } from "@/db/schema";
import { ORDER_STATES, PAYMENT_STATES } from "@/lib/payments/state-machine";

// TEST DE CONTRATO anti-drift: los valores de los enums de Postgres
// deben coincidir EXACTAMENTE (valores y orden) con las constantes de
// la máquina de estados. Si alguien agrega/renombra un estado en un
// solo lado, este test rompe el CI antes de llegar a producción.
describe("contrato state machine <-> schema de BD", () => {
  it("orderEstadoEnum.enumValues coincide con ORDER_STATES", () => {
    expect(orderEstadoEnum.enumValues).toEqual([...ORDER_STATES]);
  });

  it("pagoEstadoEnum.enumValues coincide con PAYMENT_STATES", () => {
    expect(pagoEstadoEnum.enumValues).toEqual([...PAYMENT_STATES]);
  });
});
