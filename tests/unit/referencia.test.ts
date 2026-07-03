// Tests unitarios de "@/lib/referencia" (referencia de pago SPEI, Fase 5).
//
// El módulo es PURO: se prueba en aislamiento inyectando `aleatorio` para
// obtener referencias deterministas. Cubre formato, checksum y la decisión
// de validación ESTRICTA (no normaliza: minúsculas se rechazan).
import { describe, it, expect } from "vitest";
import {
  ALFABETO_CROCKFORD,
  esReferenciaValida,
  generarReferencia,
} from "@/lib/referencia";

// Mismo formato que documenta el módulo: cuerpo Crockford base32 sin I/L/O/U.
const FORMATO = /^AG-[0-9A-HJKMNP-TV-Z]{6}-\d{2}$/;

// Réplica independiente del checksum (suma de codepoints % 97, 2 dígitos):
// si la implementación cambia el algoritmo, este test lo delata.
function checksumEsperado(cuerpo: string): string {
  let suma = 0;
  for (const ch of cuerpo) suma += ch.codePointAt(0) ?? 0;
  return String(suma % 97).padStart(2, "0");
}

// Fuente determinista: recorre una secuencia fija de valores [0,1).
function aleatorioDeSecuencia(valores: number[]): () => number {
  let i = 0;
  return () => valores[i++ % valores.length];
}

describe("generarReferencia — formato y checksum", () => {
  it("produce el formato AG-XXXXXX-DD con alfabeto Crockford", () => {
    const ref = generarReferencia();
    expect(ref).toMatch(FORMATO);
    expect(ref).toHaveLength(12); // "AG-" (3) + 6 + "-" (1) + 2
  });

  it("el checksum es suma de codepoints del cuerpo % 97, con pad de cero", () => {
    // Determinista: 6 valores fijos → cuerpo conocido y reproducible.
    const ref = generarReferencia(
      aleatorioDeSecuencia([0, 0.5, 0.99, 0.03125, 0.25, 0.75]),
    );
    const cuerpo = ref.slice(3, 9);
    const digitos = ref.slice(-2);
    expect(digitos).toBe(checksumEsperado(cuerpo));
  });

  it("jamás emite los chars ambiguos I, L, O, U (barrido de los 32 índices)", () => {
    // Con aleatorio constante idx/32 el cuerpo son 6 copias de alphabet[idx]:
    // recorre TODOS los símbolos posibles del alfabeto.
    for (let idx = 0; idx < 32; idx++) {
      const ref = generarReferencia(() => idx / 32);
      const cuerpo = ref.slice(3, 9);
      expect(cuerpo).toBe(ALFABETO_CROCKFORD[idx].repeat(6));
      expect(cuerpo).not.toMatch(/[ILOU]/);
      // Toda referencia generada debe pasar su propia validación.
      expect(esReferenciaValida(ref)).toBe(true);
    }
  });

  it("dos llamadas con aleatorio real producen referencias distintas", () => {
    // 6 chars base32 = 32^6 ≈ 1.07e9 combinaciones: una colisión inmediata
    // delataría una fuente de aleatoriedad rota.
    expect(generarReferencia()).not.toBe(generarReferencia());
  });
});

describe("esReferenciaValida — validación estricta", () => {
  it("acepta una referencia recién generada", () => {
    expect(esReferenciaValida(generarReferencia())).toBe(true);
  });

  it("rechaza un checksum alterado", () => {
    const ref = generarReferencia(() => 0.5); // determinista
    const digitos = Number(ref.slice(-2));
    const alterada = `${ref.slice(0, -2)}${String((digitos + 1) % 100).padStart(2, "0")}`;
    expect(esReferenciaValida(alterada)).toBe(false);
  });

  it("rechaza un cuerpo alterado aunque el formato siga siendo válido", () => {
    const ref = generarReferencia(() => 0); // cuerpo "000000"
    // Cambia un char del cuerpo por otro del alfabeto sin tocar el checksum.
    const corrupta = `AG-1${ref.slice(4)}`;
    expect(corrupta).toMatch(FORMATO); // formato OK...
    expect(esReferenciaValida(corrupta)).toBe(false); // ...checksum NO
  });

  it("rechaza prefijo incorrecto", () => {
    const ref = generarReferencia();
    expect(esReferenciaValida(ref.replace(/^AG/, "AX"))).toBe(false);
    expect(esReferenciaValida(ref.replace(/^AG-/, "AG"))).toBe(false);
  });

  it("rechaza longitudes incorrectas (cuerpo de 5 o 7 chars)", () => {
    expect(esReferenciaValida("AG-2345A-97")).toBe(false);
    expect(esReferenciaValida("AG-2345ABC-97")).toBe(false);
    expect(esReferenciaValida("")).toBe(false);
  });

  it("rechaza minúsculas: la validación NO normaliza (decisión documentada)", () => {
    const ref = generarReferencia(aleatorioDeSecuencia([0.9, 0.8, 0.7, 0.6, 0.5, 0.4]));
    expect(esReferenciaValida(ref.toLowerCase())).toBe(false);
    // Quien quiera tolerancia debe normalizar ANTES de validar:
    expect(esReferenciaValida(ref.toLowerCase().toUpperCase())).toBe(true);
  });

  it("rechaza referencias con chars ambiguos I/L/O/U aunque el checksum cuadre", () => {
    // Cuerpo con "I" (no pertenece al alfabeto) y checksum correcto adrede.
    const cuerpo = "IIIIII";
    const conAmbiguos = `AG-${cuerpo}-${checksumEsperado(cuerpo)}`;
    expect(esReferenciaValida(conAmbiguos)).toBe(false);
  });
});

// Fin de referencia.test.ts
