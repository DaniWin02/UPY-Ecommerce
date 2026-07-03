// instrumentation.ts — hook de arranque de Next.js (estable en Next 15, sin flag).
//
// Next llama a register() UNA vez cuando arranca el servidor (dev y prod).
// OJO: durante `next build` NO corre — solo al servir, así que es el lugar
// correcto para arrancar procesos de fondo como los jobs de pg-boss.
export async function register() {
  // Solo en el runtime Node.js (no en edge/middleware), que es donde pueden
  // vivir conexiones persistentes a Postgres.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Import dinámico: evita cargar pg-boss/pg en runtimes que no lo soportan.
    const { startJobs } = await import("./server/jobs");
    // Los jobs no deben tumbar el server si fallan al arrancar: log y seguimos.
    await startJobs().catch((e) => console.error("[jobs] no arrancaron:", e));
  }
}

// Fin de instrumentation.ts
