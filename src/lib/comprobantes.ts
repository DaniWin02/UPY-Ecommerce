// Almacenamiento de comprobantes de pago EN DISCO LOCAL (MVP).
// Los archivos viven en uploads/comprobantes/ (carpeta gitignored, fuera del bundle).
// Migrable a S3/R2: basta con reimplementar guardarComprobante/leerComprobante
// en este módulo sin tocar a sus consumidores (rutas API y páginas).
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

// Carpeta raíz de comprobantes (gitignored; migrable a R2 cambiando este módulo).
export const DIR_COMPROBANTES = path.join(process.cwd(), "uploads", "comprobantes");

// Límite de tamaño: 8 MB (fotos de tickets/estados de cuenta caben de sobra).
const MAX_BYTES = 8 * 1024 * 1024;

// MIME permitidos → extensión canónica. La extensión SIEMPRE se deriva del MIME,
// NUNCA del nombre del archivo (el nombre lo controla el cliente y no es confiable).
const EXT_POR_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

// Inverso: extensión → Content-Type para servir el archivo.
const MIME_POR_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  pdf: "application/pdf",
};

/**
 * Valida y persiste el comprobante en disco.
 * Devuelve la ruta RELATIVA ("uploads/comprobantes/<nombre>") que se guarda en
 * payments.comprobante_url — así el día que migremos a R2 solo cambia este módulo.
 */
export async function guardarComprobante(
  orderId: string,
  file: File
): Promise<{ ok: true; ruta: string } | { ok: false; error: string }> {
  if (file.size > MAX_BYTES) {
    return { ok: false, error: "El archivo supera el máximo de 8 MB." };
  }

  const ext = EXT_POR_MIME[file.type];
  if (!ext) {
    return {
      ok: false,
      error: "Formato no permitido. Sube JPG, PNG, WebP o PDF.",
    };
  }

  try {
    await mkdir(DIR_COMPROBANTES, { recursive: true });

    // Nombre determinado por el servidor (orderId + timestamp): sin rastro del
    // nombre original y sin colisiones entre reintentos del mismo pedido.
    const nombre = `${orderId}-${Date.now()}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(path.join(DIR_COMPROBANTES, nombre), buffer);

    return { ok: true, ruta: `uploads/comprobantes/${nombre}` };
  } catch {
    return { ok: false, error: "No se pudo guardar el comprobante. Intenta de nuevo." };
  }
}

/**
 * Lee un comprobante a partir de la ruta relativa guardada en BD.
 * SEGURIDAD (path traversal): la ruta se resuelve contra DIR_COMPROBANTES y se
 * verifica que el resultado siga DENTRO de esa carpeta; "../../etc/passwd" → null.
 */
export async function leerComprobante(
  rutaRelativa: string
): Promise<{ buffer: Buffer; contentType: string } | null> {
  try {
    // En BD guardamos "uploads/comprobantes/<nombre>"; nos quedamos con el tramo final.
    const nombre = rutaRelativa.replace(/^uploads[/\\]comprobantes[/\\]/, "");
    const rutaAbsoluta = path.resolve(DIR_COMPROBANTES, nombre);

    // El path resuelto DEBE empezar por la carpeta de comprobantes (+ separador).
    if (!rutaAbsoluta.startsWith(DIR_COMPROBANTES + path.sep)) return null;

    const ext = path.extname(rutaAbsoluta).slice(1).toLowerCase();
    const contentType = MIME_POR_EXT[ext];
    if (!contentType) return null;

    const buffer = await readFile(rutaAbsoluta);
    return { buffer, contentType };
  } catch {
    // Archivo inexistente o ilegible: para el consumidor es un 404.
    return null;
  }
}

// Fin del almacenamiento de comprobantes.
