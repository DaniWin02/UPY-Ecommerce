// Cliente Drizzle para Ágora Campus (PostgreSQL vía node-postgres).
// STUB: configuración mínima del Pool + instancia tipada de Drizzle.
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

// Pool de conexiones contra PostgreSQL. La cadena de conexión vive en .env.
// TODO: ajustar tamaño del pool / SSL según entorno (Neon, Supabase, VPS self-host).
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Instancia de Drizzle con el esquema completo (multivendedor por vendor_id).
// El `schema` habilita el query builder relacional y tipado de db.query.*.
export const db = drizzle(pool, { schema });

// Re-export del esquema por conveniencia (p. ej. import { db, schema } from "@/db").
export { schema };

// Fin del cliente Drizzle.
