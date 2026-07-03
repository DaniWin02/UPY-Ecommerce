// Configuración de Playwright — Fase 8: harness E2E mínimo y robusto.
//
// Decisiones clave:
// - UN solo project móvil (Pixel 7 / chromium): la app es mobile-first y así
//   evitamos duplicar tiempo de CI con matrices de navegadores.
// - workers: 1 y fullyParallel: false — todos los tests comparten la MISMA
//   base de datos (seed), así que la paralelización provocaría flakiness.
// - webServer levanta el build de producción en el puerto 3100 con
//   E2E_TEST_MODE=true (habilita /api/test/login), IP_GATE_ENABLED=false
//   (sin filtro de red del campus) y SKIP_JOBS=true (sin pg-boss en E2E).
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",

  // Sin paralelismo: los specs comparten BD (seed) y sesiones.
  fullyParallel: false,
  workers: 1,

  // Un reintento absorbe fallos transitorios (arranque frío, GC del server).
  retries: 1,

  reporter: [["list"], ["html", { open: "never" }]],

  use: {
    baseURL: "http://localhost:3100",
    // Diagnóstico solo cuando algo falla: no encarece las corridas verdes.
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "mobile",
      use: { ...devices["Pixel 7"] },
    },
  ],

  webServer: {
    command: "npm run build && npm run start -- -p 3100",
    url: "http://localhost:3100",
    // build + arranque de Next puede tardar; 4 minutos de margen.
    timeout: 240_000,
    // En local reutiliza un server ya levantado; en CI siempre arranca limpio.
    reuseExistingServer: !process.env.CI,
    env: {
      E2E_TEST_MODE: "true",
      IP_GATE_ENABLED: "false",
      SKIP_JOBS: "true",
    },
  },
});
