// Tests unitarios de "@/lib/rate-limit" (limitador compartido, Fase 8).
//
// Solo se prueba la parte PURA (permitirIntento + __resetParaTests): claveConIp
// depende de next/headers y de un request real, así que queda fuera del unit.
// Todo corre con fake timers para controlar la ventana deslizante al milisegundo.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { permitirIntento, __resetParaTests } from "@/lib/rate-limit";

const VENTANA = 60_000; // 1 min: ventana estándar de estos tests

beforeEach(() => {
  vi.useFakeTimers();
  __resetParaTests();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("permitirIntento — ventana deslizante", () => {
  it("permite hasta max intentos dentro de la ventana", () => {
    for (let i = 0; i < 5; i++) {
      expect(permitirIntento("clave", 5, VENTANA)).toBe(true);
    }
  });

  it("bloquea el intento max+1 (y sigue bloqueando mientras no pase la ventana)", () => {
    for (let i = 0; i < 5; i++) permitirIntento("clave", 5, VENTANA);
    expect(permitirIntento("clave", 5, VENTANA)).toBe(false);
    // Los intentos bloqueados NO alargan el castigo, pero dentro de la
    // ventana el cupo sigue lleno: bloqueado también en el siguiente.
    expect(permitirIntento("clave", 5, VENTANA)).toBe(false);
  });

  it("la ventana desliza: al vencer los intentos viejos vuelve a permitir", () => {
    // 3 intentos en t=0 agotan el cupo (max 3).
    for (let i = 0; i < 3; i++) permitirIntento("clave", 3, VENTANA);
    expect(permitirIntento("clave", 3, VENTANA)).toBe(false);

    // A mitad de ventana siguen vivos los 3: aún bloqueado.
    vi.advanceTimersByTime(VENTANA / 2);
    expect(permitirIntento("clave", 3, VENTANA)).toBe(false);

    // Pasada la ventana completa desde t=0, los 3 originales vencen.
    vi.advanceTimersByTime(VENTANA / 2);
    expect(permitirIntento("clave", 3, VENTANA)).toBe(true);
  });

  it("las claves son independientes: bloquear una no afecta a las demás", () => {
    for (let i = 0; i < 2; i++) permitirIntento("usuario:a", 2, VENTANA);
    expect(permitirIntento("usuario:a", 2, VENTANA)).toBe(false);
    // Otra clave con el mismo límite conserva su cupo intacto.
    expect(permitirIntento("usuario:b", 2, VENTANA)).toBe(true);
  });

  it("__resetParaTests limpia el estado: la clave bloqueada vuelve a permitir", () => {
    permitirIntento("clave", 1, VENTANA);
    expect(permitirIntento("clave", 1, VENTANA)).toBe(false);

    __resetParaTests();
    expect(permitirIntento("clave", 1, VENTANA)).toBe(true);
  });

  it("la poda global elimina claves vencidas sin romper las activas", () => {
    // 10 001 claves de un solo uso en t=0 (superan el umbral de 10k del Map).
    const VENTANA_CORTA = 1_000;
    for (let i = 0; i <= 10_000; i++) {
      permitirIntento(`flood:${i}`, 1, VENTANA_CORTA);
    }

    // t=5s: todas las claves del flood ya vencieron. Los siguientes intentos
    // disparan la poda global (size > 10k) mientras registran la clave activa.
    vi.advanceTimersByTime(5_000);
    expect(permitirIntento("activa", 3, VENTANA_CORTA)).toBe(true);
    expect(permitirIntento("activa", 3, VENTANA_CORTA)).toBe(true);
    expect(permitirIntento("activa", 3, VENTANA_CORTA)).toBe(true);

    // La historia de "activa" sobrevivió a la poda: el 4º intento se bloquea
    // (si la poda la hubiera borrado, aquí habría cupo de nuevo).
    expect(permitirIntento("activa", 3, VENTANA_CORTA)).toBe(false);

    // Y una clave del flood, ya podada/vencida, vuelve a tener cupo.
    expect(permitirIntento("flood:0", 1, VENTANA_CORTA)).toBe(true);
  });
});

// Fin de rate-limit.test.ts
