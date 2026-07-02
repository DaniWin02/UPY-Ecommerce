// Tests unitarios de "@/lib/cart-codec" (carrito en cookie firmada, Fase 4).
//
// El módulo es PURO (solo node:crypto): se prueba en aislamiento, sin Next ni
// BD. Cubre el saneado (normalizarItems) y el ciclo firmar/verificar HMAC.
import { describe, it, expect } from "vitest";
import { createHmac, randomUUID } from "node:crypto";
import {
  normalizarItems,
  firmarCarrito,
  verificarCarrito,
  type CartItem,
} from "@/lib/cart-codec";

const SECRETO = "secreto-de-prueba";

// Helper: firma un payload arbitrario tal como lo hace el códec, para poder
// fabricar cookies "bien firmadas" con contenido corrupto.
function firmarPayload(payload: string, secret: string): string {
  return `${payload}.${createHmac("sha256", secret).update(payload).digest("hex")}`;
}

describe("normalizarItems — saneado de entrada desconocida", () => {
  it("deduplica por variantId sumando qty", () => {
    const id = randomUUID();
    const resultado = normalizarItems([
      { variantId: id, qty: 2 },
      { variantId: id, qty: 3 },
    ]);
    expect(resultado).toEqual([{ variantId: id, qty: 5 }]);
  });

  it("la suma de duplicados se topa en 9", () => {
    const id = randomUUID();
    const resultado = normalizarItems([
      { variantId: id, qty: 5 },
      { variantId: id, qty: 7 },
    ]);
    expect(resultado).toEqual([{ variantId: id, qty: 9 }]);
  });

  it("descarta qty 0, negativa y decimal", () => {
    const resultado = normalizarItems([
      { variantId: randomUUID(), qty: 0 },
      { variantId: randomUUID(), qty: -3 },
      { variantId: randomUUID(), qty: 2.5 },
    ]);
    expect(resultado).toEqual([]);
  });

  it("descarta qty mayor a 9 (no la recorta)", () => {
    expect(normalizarItems([{ variantId: randomUUID(), qty: 15 }])).toEqual([]);
  });

  it("descarta variantId que no sea uuid", () => {
    const valido = randomUUID();
    const resultado = normalizarItems([
      { variantId: "no-soy-uuid", qty: 2 },
      { variantId: 123, qty: 2 },
      { variantId: valido, qty: 2 },
    ]);
    expect(resultado).toEqual([{ variantId: valido, qty: 2 }]);
  });

  it("entrada que no es array → []", () => {
    expect(normalizarItems(undefined)).toEqual([]);
    expect(normalizarItems(null)).toEqual([]);
    expect(normalizarItems("hola")).toEqual([]);
    expect(normalizarItems({ variantId: randomUUID(), qty: 1 })).toEqual([]);
  });

  it("recorta a un máximo de 30 variantes distintas", () => {
    const entrada = Array.from({ length: 40 }, () => ({
      variantId: randomUUID(),
      qty: 1,
    }));
    expect(normalizarItems(entrada)).toHaveLength(30);
  });
});

describe("firmarCarrito / verificarCarrito — roundtrip y firma", () => {
  const items: CartItem[] = [
    { variantId: randomUUID(), qty: 2 },
    { variantId: randomUUID(), qty: 9 },
  ];

  it("roundtrip: lo firmado se verifica y devuelve los mismos items", () => {
    const cookie = firmarCarrito(items, SECRETO);
    expect(verificarCarrito(cookie, SECRETO)).toEqual(items);
  });

  it("undefined → []", () => {
    expect(verificarCarrito(undefined, SECRETO)).toEqual([]);
  });

  it("valor sin punto (sin firma) → []", () => {
    expect(verificarCarrito("sinpunto", SECRETO)).toEqual([]);
    expect(verificarCarrito("", SECRETO)).toEqual([]);
  });

  it("firma manipulada → []", () => {
    const cookie = firmarCarrito(items, SECRETO);
    const [payload, firma] = cookie.split(".");
    // Cambia el primer carácter hex de la firma manteniendo el largo.
    const firmaMala = (firma[0] === "0" ? "1" : "0") + firma.slice(1);
    expect(verificarCarrito(`${payload}.${firmaMala}`, SECRETO)).toEqual([]);
  });

  it("payload alterado con la firma original → []", () => {
    const cookie = firmarCarrito(items, SECRETO);
    const [, firma] = cookie.split(".");
    const otroPayload = Buffer.from(
      JSON.stringify([{ variantId: randomUUID(), qty: 9 }])
    ).toString("base64url");
    expect(verificarCarrito(`${otroPayload}.${firma}`, SECRETO)).toEqual([]);
  });

  it("JSON corrupto pero bien firmado → [] (no lanza)", () => {
    // Payload que NO es JSON válido, firmado con el secreto correcto: la
    // firma pasa pero JSON.parse falla y el códec debe devolver [].
    const payload = Buffer.from("{esto no es json").toString("base64url");
    const cookie = firmarPayload(payload, SECRETO);
    expect(verificarCarrito(cookie, SECRETO)).toEqual([]);
  });

  it("cookie firmada con OTRO secreto → []", () => {
    const cookie = firmarCarrito(items, "otro-secreto");
    expect(verificarCarrito(cookie, SECRETO)).toEqual([]);
  });

  it("la firma es estable: mismo input produce el mismo output", () => {
    expect(firmarCarrito(items, SECRETO)).toBe(firmarCarrito(items, SECRETO));
  });

  it("el resultado verificado pasa por normalizarItems (dedupe post-firma)", () => {
    // Una cookie vieja podría traer duplicados válidos: al verificar se sanea.
    const id = randomUUID();
    const payload = Buffer.from(
      JSON.stringify([
        { variantId: id, qty: 4 },
        { variantId: id, qty: 4 },
      ])
    ).toString("base64url");
    const cookie = firmarPayload(payload, SECRETO);
    expect(verificarCarrito(cookie, SECRETO)).toEqual([
      { variantId: id, qty: 8 },
    ]);
  });
});
