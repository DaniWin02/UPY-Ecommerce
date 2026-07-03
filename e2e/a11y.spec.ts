// E2E: accesibilidad automatizada con axe-core (WCAG 2.0/2.1 A y AA).
//
// Política: el test FALLA solo con violaciones de impacto "critical" o
// "serious"; las "moderate"/"minor" no rompen CI (se corrigen aparte).
// El mensaje de fallo incluye un resumen legible: regla + nodos afectados.
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/** Impactos que rompen el build. */
const IMPACTOS_BLOQUEANTES = new Set(["critical", "serious"]);

/** Corre axe sobre la página actual y devuelve el resumen de lo bloqueante. */
async function analizarA11y(page: Page): Promise<string> {
  const resultados = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();

  const graves = resultados.violations.filter(
    (v) => v.impact && IMPACTOS_BLOQUEANTES.has(v.impact)
  );

  // Resumen legible para el reporte: id de la regla + selectores afectados.
  return graves
    .map((v) => {
      const nodos = v.nodes
        .map((n) => `    - ${n.target.join(" ")}`)
        .join("\n");
      return `[${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} nodo(s))\n${nodos}`;
    })
    .join("\n\n");
}

// Rutas públicas fijas a auditar.
const RUTAS = ["/", "/auth/login", "/auth/registro", "/drops", "/carrito"];

test.describe("Accesibilidad (axe, WCAG A/AA)", () => {
  for (const ruta of RUTAS) {
    test(`sin violaciones critical/serious en ${ruta}`, async ({ page }) => {
      await page.goto(ruta);
      const resumen = await analizarA11y(page);
      expect(resumen, `Violaciones de a11y en ${ruta}:\n${resumen}`).toBe("");
    });
  }

  test("sin violaciones critical/serious en la ficha de producto", async ({
    page,
  }) => {
    // La URL de producto depende del seed: tomamos la primera de la home.
    await page.goto("/");
    const primerProducto = page.locator('a[href^="/producto/"]').first();
    await expect(primerProducto).toBeVisible();
    const href = await primerProducto.getAttribute("href");
    expect(href, "La home no tiene enlaces a /producto/").toBeTruthy();

    await page.goto(href!);
    const resumen = await analizarA11y(page);
    expect(resumen, `Violaciones de a11y en ${href}:\n${resumen}`).toBe("");
  });
});
