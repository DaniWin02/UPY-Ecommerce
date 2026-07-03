// index.ts — orquestación de jobs en segundo plano con pg-boss para Ágora.
//
// DISEÑO (sweep-only): en lugar de agendar UN job por orden al crearla (más
// piezas móviles: cancelaciones al pagar, reintentos, jobs huérfanos…), un
// único cron cada 5 minutos "barre" todas las órdenes vencidas con
// barrerOrdenesExpiradas(). Es más simple, idempotente y suficiente: la
// expiración no necesita precisión de segundos (el guard de expirarOrden
// re-verifica expira_en < now en BD antes de liberar reservas).
import PgBoss from "pg-boss";
import { barrerOrdenesExpiradas } from "@/lib/orders";

/** Nombre canónico de la cola/cron de expiración de órdenes. */
const COLA_EXPIRAR_ORDENES = "expirar-ordenes";

// Singleton GLOBAL: en dev, el hot-reload de Next re-evalúa este módulo y una
// variable de módulo normal se perdería, arrancando un pg-boss (y sus workers)
// duplicado en cada recarga. Colgamos la instancia de globalThis, que SÍ
// sobrevive al hot-reload dentro del mismo proceso.
const globalConBoss = globalThis as typeof globalThis & {
  __agoraBoss?: PgBoss;
};

let boss: PgBoss | null = null;

/**
 * startJobs — arranca pg-boss (esquema "pgboss" en la misma BD) y registra
 * el cron de expiración de órdenes. Idempotente: si ya hay una instancia
 * viva (singleton global), no arranca otra.
 */
export async function startJobs(): Promise<void> {
  // Sin BD no hay cola; SKIP_JOBS=true permite apagar los jobs (tests, CI,
  // entornos donde otro proceso ya corre el worker).
  if (!process.env.DATABASE_URL || process.env.SKIP_JOBS === "true") {
    console.log("[jobs] omitidos (falta DATABASE_URL o SKIP_JOBS=true)");
    return;
  }

  // Reutiliza la instancia superviviente del hot-reload (ver comentario arriba).
  if (globalConBoss.__agoraBoss) {
    boss = globalConBoss.__agoraBoss;
    return;
  }

  boss = new PgBoss({
    connectionString: process.env.DATABASE_URL,
    schema: "pgboss", // tablas propias de pg-boss, separadas del esquema de la app
  });
  boss.on("error", console.error);

  await boss.start();

  // pg-boss 10 exige crear la cola antes de schedule/work. Toleramos que ya
  // exista (o que la versión no exponga createQueue) con try/catch.
  try {
    await boss.createQueue?.(COLA_EXPIRAR_ORDENES);
  } catch {
    // La cola ya existe: no pasa nada, seguimos.
  }

  // Cron: cada 5 minutos barre las órdenes vencidas (schedule es un upsert:
  // re-arrancar el server no duplica el cron).
  await boss.schedule(COLA_EXPIRAR_ORDENES, "*/5 * * * *");

  // Worker del barrido: libera reservas de órdenes pendiente_pago/rechazado
  // cuyo expira_en ya pasó (la lógica vive en el dominio, no aquí).
  await boss.work(COLA_EXPIRAR_ORDENES, async () => {
    const n = await barrerOrdenesExpiradas();
    if (n > 0) console.log(`[jobs] ${n} órdenes expiradas`);
  });

  globalConBoss.__agoraBoss = boss;
  console.log("[jobs] pg-boss arrancado (cron de expiración cada 5 min)");
}

/**
 * stopJobs — detiene pg-boss (workers y cron) y limpia el singleton.
 * Útil en tests y en apagados controlados.
 */
export async function stopJobs(): Promise<void> {
  await boss?.stop();
  boss = null;
  globalConBoss.__agoraBoss = undefined;
}

// Fin de index.ts
