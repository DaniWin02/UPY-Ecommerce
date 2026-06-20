// index.ts — orquestación de jobs en segundo plano con pg-boss para Ágora (STUB).
// Jobs: expirar órdenes sin pago, agendar drops y enviar notificaciones.

// TODO: descomentar cuando exista la dependencia y la conexión.
// import PgBoss from "pg-boss";

/** Nombres canónicos de las colas/jobs. */
export const JOBS = {
  EXPIRAR_ORDENES_SIN_PAGO: "expirar-ordenes-sin-pago",
  AGENDAR_DROPS: "agendar-drops",
  ENVIAR_NOTIFICACIONES: "enviar-notificaciones",
} as const;

/** Tipo unión de los nombres de jobs. */
export type JobName = (typeof JOBS)[keyof typeof JOBS];

// TODO: mantener una instancia única de pg-boss.
// let boss: PgBoss | null = null;

/**
 * startJobs — inicializa pg-boss y registra los workers de cada job.
 * TODO: crear conexión (DATABASE_URL), arrancar boss y suscribir handlers.
 */
export async function startJobs(): Promise<void> {
  // TODO: boss = new PgBoss(process.env.DATABASE_URL!);
  // TODO: await boss.start();

  // TODO: registrar worker para expirar órdenes en estado pendiente_pago vencidas.
  // await boss.work(JOBS.EXPIRAR_ORDENES_SIN_PAGO, async (job) => { /* TODO */ });

  // TODO: registrar worker para publicar/agendar drops programados.
  // await boss.work(JOBS.AGENDAR_DROPS, async (job) => { /* TODO */ });

  // TODO: registrar worker para despachar notificaciones (correo/WhatsApp).
  // await boss.work(JOBS.ENVIAR_NOTIFICACIONES, async (job) => { /* TODO */ });

  // TODO: programar cron de expiración (p. ej. boss.schedule(...)).
}

// Fin de index.ts
