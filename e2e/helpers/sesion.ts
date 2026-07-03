// Helper de sesión para E2E — usa el bypass POST /api/test/login.
//
// El endpoint (solo activo con E2E_TEST_MODE=true) crea/actualiza el usuario,
// inserta la fila en `sessions` y devuelve Set-Cookie con
// "authjs.session-token". Al hacer el POST a través de `request` del propio
// contexto de navegador, la cookie queda guardada en ese contexto y todas las
// navegaciones posteriores van autenticadas.
import { expect, type BrowserContext, type Page } from "@playwright/test";

/**
 * Emails de prueba EXCLUSIVOS de Playwright (sufijo ".e2e.pw") para no chocar
 * con los usuarios del seed ni con los tests de integración de Vitest.
 */
export const EMAILS = {
  comprador: "comprador.e2e.pw@alumno.upy.edu.mx",
  vendor: "vendor.e2e.pw@alumno.upy.edu.mx",
  superadmin: "superadmin.e2e.pw@alumno.upy.edu.mx",
} as const;

/** Datos que acepta el bypass de login (mismo contrato que el endpoint). */
export interface DatosLoginE2E {
  email: string;
  rolGlobal?: "comprador" | "vendor" | "superadmin";
  vendorSlug?: string;
}

/**
 * Inicia sesión vía el bypass E2E y deja la cookie en el contexto.
 *
 * Acepta tanto una `Page` como un `BrowserContext`: ambos exponen `.request`
 * apuntando al MISMO APIRequestContext del contexto, que comparte cookies
 * con el navegador (por eso la cookie "se pega" sin pasos extra).
 */
export async function loginE2E(
  target: Page | BrowserContext,
  datos: DatosLoginE2E
): Promise<void> {
  const respuesta = await target.request.post("/api/test/login", {
    data: datos,
  });
  expect(
    respuesta.ok(),
    `POST /api/test/login falló (${respuesta.status()}): ¿E2E_TEST_MODE=true y BD con seed?`
  ).toBe(true);
}
