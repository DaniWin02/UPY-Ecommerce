import { defineConfig } from "vitest/config";
import { fileURLToPath, URL } from "node:url";

// Configuración de Vitest — Fase 1.
//
// Se divide en dos proyectos:
//   - "unit":        tests/unit — sin BD, corren en paralelo como siempre.
//   - "integration": tests/integration — comparten UNA base de datos real
//                    (Postgres del CI), por lo que se desactiva el paralelismo
//                    entre archivos (`fileParallelism: false`) para evitar
//                    condiciones de carrera entre suites.
//
// Los scripts npm existentes siguen funcionando sin cambios:
//   `vitest run tests/unit` / `vitest run tests/integration` filtran por ruta
//   y solo ejecutan el proyecto cuyo `include` casa con esos archivos.
//
// Para activar tests de componentes React más adelante:
//   1. importar el plugin:  import react from "@vitejs/plugin-react";
//   2. añadir `plugins: [react()]` al objeto de configuración
//   3. usar `environment: "jsdom"` (globalmente o por archivo con
//      el comentario mágico  // @vitest-environment jsdom  al inicio del test)
export default defineConfig({
  resolve: {
    alias: {
      // Replica el alias "@/*" -> "./src/*" de tsconfig.json
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    globals: false,
    projects: [
      {
        // Hereda resolve.alias y test.environment de la raíz.
        extends: true,
        test: {
          name: "unit",
          include: ["tests/unit/**/*.test.{ts,tsx}"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.{ts,tsx}"],
          // Los tests de integración comparten BD: TODOS los archivos corren
          // secuencialmente en un único fork. Ojo: `fileParallelism` a nivel
          // de proyecto NO lo respeta Vitest (lo comprobamos: los archivos
          // corrieron en paralelo y los counts del seed vieron fixtures de
          // otra suite). El knob fiable es singleFork.
          pool: "forks",
          poolOptions: {
            forks: { singleFork: true },
          },
        },
      },
    ],
  },
});
