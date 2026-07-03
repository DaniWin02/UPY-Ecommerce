// E2E: puerta de autenticación — rutas protegidas redirigen a /auth/login
// y con sesión (vía bypass) el perfil carga con los datos del usuario.
import { test, expect } from "@playwright/test";
import { loginE2E, EMAILS } from "./helpers/sesion";

test.describe("Puerta de autenticación", () => {
  test("anónimo en /perfil es redirigido a /auth/login", async ({ page }) => {
    await page.goto("/perfil");
    // toHaveURL reintenta hasta que la redirección (server-side) se asiente.
    await expect(page).toHaveURL(/\/auth\/login/);
    expect(page.url()).toContain("/auth/login");
  });

  test("anónimo en /vendor/pedidos es redirigido a /auth/login", async ({
    page,
  }) => {
    await page.goto("/vendor/pedidos");
    await expect(page).toHaveURL(/\/auth\/login/);
    expect(page.url()).toContain("/auth/login");
  });

  test("con sesión de comprador, /perfil muestra su email", async ({
    page,
  }) => {
    await loginE2E(page, { email: EMAILS.comprador });
    await page.goto("/perfil");
    // Si la cookie no valiera, requireUser nos habría mandado a login.
    await expect(page).toHaveURL(/\/perfil/);
    await expect(page.getByText(EMAILS.comprador)).toBeVisible();
  });
});
