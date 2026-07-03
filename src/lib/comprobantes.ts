// Almacenamiento de comprobantes de pago — DUAL según el entorno:
//  - Vercel (o cualquier host con BLOB_READ_WRITE_TOKEN): Vercel Blob. El
//    disco de un serverless es efímero; el blob persiste. La URL del blob es
//    pública pero IMPOSIBLE de adivinar (sufijo aleatorio) y JAMÁS se expone
//    al cliente: solo la lee el servidor en la ruta autenticada de descarga.
//  - Self-host / dev: disco local en uploads/comprobantes/ (gitignored).
// Los consumidores (rutas API y páginas) no cambian: este módulo decide.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { put } from "@vercel/blob";

/** ¿Hay backend de blobs disponible? (Vercel lo inyecta al conectar Blob). */
function usaBlob(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

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
    // Nombre determinado por el servidor (orderId + timestamp): sin rastro del
    // nombre original y sin colisiones entre reintentos del mismo pedido.
    const nombre = `${orderId}-${Date.now()}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    if (usaBlob()) {
      // Vercel Blob: addRandomSuffix hace la URL no adivinable; se guarda la
      // URL completa en payments.comprobante_url (solo la ve el servidor).
      const blob = await put(`comprobantes/${nombre}`, buffer, {
        access: "public",
        addRandomSuffix: true,
        contentType: file.type,
      });
      return { ok: true, ruta: blob.url };
    }

    await mkdir(DIR_COMPROBANTES, { recursive: true });
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
    // Comprobante en Vercel Blob: la BD guarda la URL https completa. Se
    // descarga SERVER-SIDE y se re-sirve por la ruta autenticada (la URL del
    // blob nunca llega al cliente).
    if (/^https:\/\//.test(rutaRelativa)) {
      const respuesta = await fetch(rutaRelativa);
      if (!respuesta.ok) return null;
      const ext = path.extname(new URL(rutaRelativa).pathname).slice(1).toLowerCase();
      const contentType = MIME_POR_EXT[ext];
      if (!contentType) return null;
      return { buffer: Buffer.from(await respuesta.arrayBuffer()), contentType };
    }

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
