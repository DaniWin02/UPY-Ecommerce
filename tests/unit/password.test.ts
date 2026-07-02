// Tests unitarios de "@/lib/password" (login propio con scrypt).
//
// El módulo es PURO (solo node:crypto), así que se prueba en aislamiento sin
// mocks. scrypt con N=16384 tarda ~decenas de ms por hash: los casos reutilizan
// hashes cuando pueden para mantener la suite rápida.
import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/password";

describe("hashPassword / verifyPassword — roundtrip", () => {
  it("verifica la password correcta contra su propio hash", async () => {
    const hash = await hashPassword("agora123");
    // Formato autocontenido: algoritmo + salt + hash separados por "$".
    expect(hash).toMatch(/^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
    await expect(verifyPassword("agora123", hash)).resolves.toBe(true);
  });

  it("rechaza una password incorrecta", async () => {
    const hash = await hashPassword("agora123");
    await expect(verifyPassword("otra-cosa", hash)).resolves.toBe(false);
  });

  it("dos hashes del mismo password difieren (salt aleatorio) pero ambos verifican", async () => {
    const hash1 = await hashPassword("misma-password");
    const hash2 = await hashPassword("misma-password");
    expect(hash1).not.toBe(hash2);
    await expect(verifyPassword("misma-password", hash1)).resolves.toBe(true);
    await expect(verifyPassword("misma-password", hash2)).resolves.toBe(true);
  });
});

describe("verifyPassword — stored inválido nunca lanza", () => {
  it("stored null → false", async () => {
    await expect(verifyPassword("cualquiera", null)).resolves.toBe(false);
  });

  it("stored undefined → false", async () => {
    await expect(verifyPassword("cualquiera", undefined)).resolves.toBe(false);
  });

  it("stored cadena vacía → false", async () => {
    await expect(verifyPassword("cualquiera", "")).resolves.toBe(false);
  });

  it('stored malformado ("basura$x") → false', async () => {
    await expect(verifyPassword("cualquiera", "basura$x")).resolves.toBe(false);
  });
});

describe("hashPassword — casos límite", () => {
  it("la password vacía se puede hashear y verificar", async () => {
    const hash = await hashPassword("");
    await expect(verifyPassword("", hash)).resolves.toBe(true);
    // Y una password no vacía NO verifica contra el hash de la vacía.
    await expect(verifyPassword("x", hash)).resolves.toBe(false);
  });
});

// Fin de password.test.ts
