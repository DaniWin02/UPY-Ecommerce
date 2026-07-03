// E2E: navegación esencial del marketplace — home → ficha de producto →
// carrito. Selectores por rol/texto visibles (nada de clases ni data-attrs
// frágiles); el único selector estructural es a[href^="/producto/"], que es
// el contrato de enlace del catálogo.
import { test, expect } from "@playwright/test";
import { loginE2E, EMAILS } from "./helpers/sesion";

test.describe("Navegación del marketplace", () => {
  test("la home muestra el catálogo con al menos 4 productos", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Explora el campus" })
    ).toBeVisible();
    // La home es RSC: con el heading visible, el grid ya está en el DOM.
    const productos = page.locator('a[href^="/producto/"]');
    expect(await productos.count()).toBeGreaterThanOrEqual(4);
  });

  test("la ficha de producto carga desde la home", async ({ page }) => {
    await page.goto("/");
    await page.locator('a[href^="/producto/"]').first().click();
    await expect(page).toHaveURL(/\/producto\//);
    // El CTA existe siempre: "Agregar al carrito" (con stock) o "Agotado".
    await expect(
      page.getByRole("button", { name: /Agregar al carrito|Agotado/ }).first()
    ).toBeVisible();
  });

  test("con sesión: agregar al carrito y ver el resumen", async ({ page }) => {
    await loginE2E(page, { email: EMAILS.comprador });

    // Toma los href de los dos primeros productos de la home.
    await page.goto("/");
    const enlaces = page.locator('a[href^="/producto/"]');
    await expect(enlaces.first()).toBeVisible();
    const total = await enlaces.count();
    const candidatos: string[] = [];
    for (let i = 0; i < Math.min(total, 2); i++) {
      const href = await enlaces.nth(i).getAttribute("href");
      if (href) candidatos.push(href);
    }

    // Prueba el primero; si está agotado (botón deshabilitado), el segundo.
    let agregado = false;
    for (const href of candidatos) {
      await page.goto(href);
      const cta = page
        .getByRole("button", { name: /Agregar al carrito|Agotado/ })
        .first();
      await expect(cta).toBeVisible();
      if (!(await cta.isEnabled())) continue; // sin stock → siguiente
      await cta.click();
      // El botón confirma con el texto "Agregado" al terminar la action.
      await expect(
        page.getByRole("button", { name: "Agregado", exact: true })
      ).toBeVisible();
      agregado = true;
      break;
    }
    expect(
      agregado,
      "Ninguno de los dos primeros productos de la home tenía stock"
    ).toBe(true);

    // El carrito refleja el artículo y ofrece el pago por tienda.
    await page.goto("/carrito");
    await expect(
      page.getByRole("heading", { name: /Carrito \(\d+\)/ })
    ).toBeVisible();
    // "Pagar a esta tienda" se renderiza como <Link> con estilo de botón.
    await expect(
      page.getByRole("link", { name: "Pagar a esta tienda" }).first()
    ).toBeVisible();
  });
});
