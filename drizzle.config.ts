import { defineConfig } from "drizzle-kit";

// Configuración de Drizzle Kit para Ágora Campus.
// Genera y aplica migraciones contra PostgreSQL (multivendedor por vendor_id).
export default defineConfig({
  // El esquema vive dividido por dominio dentro de src/db/schema.
  schema: "./src/db/schema",
  // Las migraciones SQL generadas se guardan aquí.
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    // TODO: definir DATABASE_URL en .env (ver .env.example).
    url: process.env.DATABASE_URL!,
  },
  // TODO: activar verbose/strict si se desea más control en las migraciones.
});
