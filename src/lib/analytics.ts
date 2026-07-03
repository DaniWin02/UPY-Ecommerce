// Núcleo de analítica del lado CLIENTE (Fase 6, Ágora Campus).
//
// Módulo cliente-only POR USO (no lleva "use client": no exporta componentes;
// quien lo importe desde un client component lo ejecuta en el browser). Todas
// las browser APIs van tras guards `typeof window` para que un import
// accidental en SSR sea un no-op y jamás rompa el render.
//
// Diseño: cola en memoria a nivel de módulo → flush por lotes a /api/events.
// La analítica es "best effort": cualquier error se traga en silencio.
//
// PRIVACIDAD: aquí solo viajan rutas internas, ids y metadata declarada;
// la IP y el user-agent completo NUNCA se envían ni se persisten.

/** Eventos que el cliente puede emitir (los de negocio se emiten server-side). */
export type EventoCliente = {
  tipo: "busqueda" | "vista_tienda" | "vista_producto" | "click_producto";
  vendorId?: string;
  productId?: string;
  query?: string;
  metadata?: Record<string, unknown>;
};

// Evento enriquecido tal como viaja en el payload hacia /api/events.
type EventoEncolado = EventoCliente & {
  ruta: string;
  referrerInterno: string | null;
  ts: number;
};

const ENDPOINT = "/api/events";
const MAX_COLA = 20; // tope del lote: al llegar aquí se hace flush inmediato
const INTERVALO_FLUSH_MS = 15_000; // flush perezoso si la cola no se llena

// ---- Estado de módulo (vive lo que dure la página / sesión SPA) ----
const cola: EventoEncolado[] = [];
// Dedupe de "vistas": el mismo evento de vista no se repite en la misma
// sesión de página (los click_producto NO se dedupen: cada click cuenta).
const vistasEmitidas = new Set<string>();
// Ruta interna actual y previa: referrerInterno = ruta interna anterior,
// jamás el document.referrer (podría ser un dominio externo).
let rutaActual: string | null = null;
let rutaPrevia: string | null = null;
let timerFlush: ReturnType<typeof setTimeout> | null = null;

// Guard GLOBAL (no de módulo): con hot-reload en dev (o vi.resetModules en
// tests) el módulo puede instanciarse varias veces sobre el mismo document.
// Los listeners se registran UNA sola vez y delegan en globalThis.__agoraFlush,
// que cada instancia nueva sobreescribe — así siempre dispara la cola vigente
// y nunca se acumulan flushes duplicados.
type GlobalConFlush = typeof globalThis & {
  __agoraAnalyticsBound?: boolean;
  __agoraFlush?: () => void;
};

/** Listeners de descarga de página: última oportunidad de enviar la cola. */
function registrarListeners(): void {
  const g = globalThis as GlobalConFlush;
  g.__agoraFlush = flush; // la instancia más reciente del módulo gana
  if (g.__agoraAnalyticsBound) return;
  g.__agoraAnalyticsBound = true;
  // visibilitychange→hidden cubre cambio de pestaña y también móvil (donde
  // pagehide/unload no siempre disparan); pagehide cubre la navegación dura.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") g.__agoraFlush?.();
  });
  window.addEventListener("pagehide", () => g.__agoraFlush?.());
}

/** Programa un flush perezoso a 15s si no hay ya uno pendiente. */
function programarFlush(): void {
  if (timerFlush !== null) return;
  timerFlush = setTimeout(() => {
    timerFlush = null;
    flush();
  }, INTERVALO_FLUSH_MS);
}

/** Envía la cola actual a /api/events. Silencioso ante cualquier error. */
function flush(): void {
  if (typeof window === "undefined") return;
  if (timerFlush !== null) {
    clearTimeout(timerFlush);
    timerFlush = null;
  }
  if (cola.length === 0) return;

  // Vaciamos la cola ANTES de enviar (splice): si flush se dispara dos veces
  // seguidas (p. ej. visibilitychange + pagehide) no se duplican eventos.
  const lote = cola.splice(0, cola.length);

  try {
    const cuerpo = JSON.stringify(lote);
    let enviado = false;
    // sendBeacon: sobrevive a la navegación/descarga de la página.
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      enviado = navigator.sendBeacon(
        ENDPOINT,
        new Blob([cuerpo], { type: "application/json" })
      );
    }
    if (!enviado) {
      // Fallback: fetch con keepalive (también sobrevive la descarga).
      void fetch(ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: cuerpo,
        keepalive: true,
      }).catch(() => {
        /* la analítica jamás rompe la app */
      });
    }
  } catch {
    /* silencioso: perder un lote de analítica es aceptable; romper la UI no */
  }
}

/**
 * Encola un evento de analítica. No-op en SSR y ante cualquier error.
 * Flush automático al llegar a 20 eventos, a los 15s, o al ocultarse la página.
 */
export function track(evento: EventoCliente): void {
  if (typeof window === "undefined") return; // SSR-safe: no-op fuera del browser

  try {
    registrarListeners();

    const ruta = window.location.pathname;
    // Al cambiar de ruta (navegación SPA), la ruta anterior pasa a ser el
    // referrer interno de los eventos de la nueva página.
    if (rutaActual !== ruta) {
      rutaPrevia = rutaActual;
      rutaActual = ruta;
    }

    // Dedupe de vistas (busqueda / vista_tienda / vista_producto) por página;
    // los clicks se cuentan todos.
    if (evento.tipo !== "click_producto") {
      const clave = `${evento.tipo}:${evento.productId ?? evento.vendorId ?? evento.query}:${ruta}`;
      if (vistasEmitidas.has(clave)) return;
      vistasEmitidas.add(clave);
    }

    cola.push({ ...evento, ruta, referrerInterno: rutaPrevia, ts: Date.now() });

    if (cola.length >= MAX_COLA) {
      flush();
      return;
    }
    programarFlush();
  } catch {
    /* silencioso */
  }
}

/** Fuerza un flush inmediato. Expuesto SOLO para unit tests. */
export function __flushParaTests(): void {
  flush();
}

// Fin del núcleo de analítica cliente.
