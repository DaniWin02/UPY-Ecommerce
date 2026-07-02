// Helper de BD para tests de integración (Fase 1).
//
// Se conecta a la base de datos indicada por DATABASE_URL (en CI la provee el
// service container de Postgres). NO corre migraciones: el workflow de CI las
// aplica antes con `npm run db:migrate` (y puebla datos con `npm run db:seed`).
//
// Cada archivo de test importa su propia instancia (Vitest aísla módulos por
// archivo), así que cada suite debe cerrar su pool con `closeDb()` en afterAll.
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@/db/schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "Falta DATABASE_URL para los tests de integración: exporta DATABASE_URL o corre en CI " +
      "(ej. postgres://postgres:test@localhost:5432/agora_test)"
  );
}

// Pool de node-postgres compartido por la suite del archivo actual.
export const pool = new Pool({ connectionString });

// Cliente Drizzle con el esquema completo (permite consultas tipadas y db.query.*).
export const db = drizzle(pool, { schema });

// Re-export del esquema por comodidad de los tests.
export { schema };

// Cierra el pool; llamar en afterAll para que Vitest no quede colgado.
export async function closeDb(): Promise<void> {
  await pool.end();
}
