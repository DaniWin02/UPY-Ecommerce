// @vitest-environment jsdom
// Tests unitarios de "@/lib/analytics" (núcleo de analítica cliente, Fase 6).
//
// El módulo guarda estado a nivel de módulo (cola, dedupe, listeners), así
// que CADA test importa una instancia fresca vía vi.resetModules() + import
// dinámico. Los listeners de instancias viejas quedan colgados del document
// de jsdom, pero son inofensivos: sus colas están vacías y flush() retorna
// antes de tocar sendBeacon.
//
// Nota sobre SSR: el caso "typeof window === undefined → track es no-op" no
// se testea aquí porque en jsdom window SIEMPRE existe; simularlo borrando
// globals de jsdom no es limpio (rompería el propio entorno del test).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type ModuloAnalytics = typeof import("@/lib/analytics");

let beacon: ReturnType<typeof vi.fn>;
let fetchMock: ReturnType<typeof vi.fn>;

/** Instancia fresca del módulo (estado de cola/dedupe limpio). */
async function cargarModulo(): Promise<ModuloAnalytics> {
  vi.resetModules();
  return import("@/lib/analytics");
}

/** Decodifica el JSON del Blob enviado en la llamada n de sendBeacon.
 *  Vía FileReader: el Blob de jsdom no implementa .text(). */
async function payloadDeBeacon(llamada = 0): Promise<Array<Record<string, unknown>>> {
  const blob = beacon.mock.calls[llamada][1] as Blob;
  const texto = await new Promise<string>((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => resolve(String(lector.result));
    lector.onerror = () => reject(lector.error);
    lector.readAsText(blob);
  });
  return JSON.parse(texto) as Array<Record<string, unknown>>;
}

beforeEach(() => {
  beacon = vi.fn(() => true);
  // El módulo ignora la respuesta: basta una promesa resuelta (evitamos
  // depender de que `Response` exista como global bajo jsdom).
  fetchMock = vi.fn(() => Promise.resolve({ ok: true }));
  // El módulo solo usa navigator.sendBeacon: basta un stub mínimo.
  vi.stubGlobal("navigator", { sendBeacon: beacon });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("track — encolado y flush", () => {
  it("encola sin enviar de inmediato (el envío es por lotes)", async () => {
    const { track } = await cargarModulo();
    track({ tipo: "vista_producto", productId: "p1" });
    expect(beacon).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("__flushParaTests envía un array JSON con ruta y referrerInterno null en la primera página", async () => {
    const { track, __flushParaTests } = await cargarModulo();
    track({ tipo: "vista_producto", productId: "p1", vendorId: "v1" });
    __flushParaTests();

    expect(beacon).toHaveBeenCalledTimes(1);
    expect(beacon.mock.calls[0][0]).toBe("/api/events");

    const payload = await payloadDeBeacon();
    expect(Array.isArray(payload)).toBe(true);
    expect(payload).toHaveLength(1);
    expect(payload[0]).toMatchObject({
      tipo: "vista_producto",
      productId: "p1",
      vendorId: "v1",
      ruta: window.location.pathname, // "/" en jsdom
      referrerInterno: null, // no hay ruta interna previa aún
    });
    expect(typeof payload[0].ts).toBe("number");
  });

  it("hace flush automático al llegar a 20 eventos y vacía la cola (sin duplicar)", async () => {
    const { track, __flushParaTests } = await cargarModulo();
    // click_producto no se dedupea: 20 clicks llenan la cola.
    for (let i = 0; i < 20; i++) track({ tipo: "click_producto", productId: "p1" });

    expect(beacon).toHaveBeenCalledTimes(1);
    expect(await payloadDeBeacon()).toHaveLength(20);

    // La cola se vació ANTES de enviar: un flush posterior no reenvía nada.
    __flushParaTests();
    expect(beacon).toHaveBeenCalledTimes(1);
  });

  it("flush con la cola vacía no llama a sendBeacon", async () => {
    const { __flushParaTests } = await cargarModulo();
    __flushParaTests();
    expect(beacon).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("hace flush perezoso a los 15s si la cola no se llena", async () => {
    vi.useFakeTimers();
    const { track } = await cargarModulo();
    track({ tipo: "vista_tienda", vendorId: "v1" });

    vi.advanceTimersByTime(14_999);
    expect(beacon).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(beacon).toHaveBeenCalledTimes(1);
  });

  it("hace flush cuando la página pasa a hidden (visibilitychange)", async () => {
    const { track } = await cargarModulo();
    track({ tipo: "vista_producto", productId: "p-hidden" });

    Object.defineProperty(document, "visibilityState", {
      value: "hidden",
      configurable: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));

    expect(beacon).toHaveBeenCalledTimes(1);
    // Restaurar para no contaminar otros archivos de test del mismo worker.
    Object.defineProperty(document, "visibilityState", {
      value: "visible",
      configurable: true,
    });
  });
});

describe("track — dedupe de vistas", () => {
  it("dedupea vista_producto repetida en la misma página (solo 1 en el payload)", async () => {
    const { track, __flushParaTests } = await cargarModulo();
    track({ tipo: "vista_producto", productId: "p1" });
    track({ tipo: "vista_producto", productId: "p1" }); // remontaje / re-render
    track({ tipo: "vista_producto", productId: "p2" }); // otro producto sí pasa
    __flushParaTests();

    const payload = await payloadDeBeacon();
    expect(payload).toHaveLength(2);
    expect(payload.map((e) => e.productId)).toEqual(["p1", "p2"]);
  });

  it("NO dedupea click_producto: dos clicks al mismo producto son dos eventos", async () => {
    const { track, __flushParaTests } = await cargarModulo();
    track({ tipo: "click_producto", productId: "p1" });
    track({ tipo: "click_producto", productId: "p1" });
    __flushParaTests();

    const payload = await payloadDeBeacon();
    expect(payload).toHaveLength(2);
    expect(payload.every((e) => e.tipo === "click_producto")).toBe(true);
  });
});

describe("flush — transporte", () => {
  it("cae a fetch keepalive cuando sendBeacon devuelve false", async () => {
    beacon.mockReturnValue(false); // beacon rechaza el payload
    const { track, __flushParaTests } = await cargarModulo();
    track({ tipo: "busqueda", query: "cafe", metadata: { resultados: 3 } });
    __flushParaTests();

    expect(beacon).toHaveBeenCalledTimes(1); // se intentó primero
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/events");
    expect(init.method).toBe("POST");
    expect(init.keepalive).toBe(true);
    const payload = JSON.parse(init.body as string);
    expect(payload[0]).toMatchObject({ tipo: "busqueda", query: "cafe" });
  });

  it("usa fetch directamente si navigator no tiene sendBeacon", async () => {
    vi.stubGlobal("navigator", {}); // browsers viejos / entornos raros
    const { track, __flushParaTests } = await cargarModulo();
    track({ tipo: "vista_tienda", vendorId: "v1" });
    __flushParaTests();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

// Fin de analytics.test.ts
