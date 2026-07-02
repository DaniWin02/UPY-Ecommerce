import { defineConfig } from "vitest/config";
import { fileURLToPath, URL } from "node:url";

// Configuración de Vitest para Fase 0 (solo tests unitarios en Node).
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
    include: ["tests/**/*.test.{ts,tsx}"],
    globals: false,
  },
});
