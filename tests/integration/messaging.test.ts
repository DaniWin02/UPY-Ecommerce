// Tests de integración: núcleo de mensajería contra Postgres real (Fase 7).
//
// Usa fixtures PROPIOS (emails/slugs con UUID aleatorio, patrón cart.test.ts)
// para no depender del seed: comprador, owner (miembro del vendor), extraño,
// vendor ACTIVO y un producto para el contexto.
//
// Los casos comparten estado en secuencia (Vitest corre el archivo en orden):
// el bloqueo del caso 8 va DESPUÉS de los envíos/lecturas de 4-7.
//
// Nota: la lib consulta a través del cliente de la app ("@/db"), que abre su
// PROPIO pool contra la misma DATABASE_URL; hay que cerrarlo también en
// afterAll (db.$client) o Vitest queda colgado.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray } from "drizzle-orm";
import {
  conversations,
  messageReports,
  messages,
  products,
  userBlocks,
  users,
  vendorMembers,
  vendors,
} from "@/db/schema";
import { db, closeDb } from "./helpers/db";
import { db as dbApp } from "@/db";
import {
  abrirConversacion,
  enviarMensaje,
  marcarLeida,
  obtenerConversacion,
  conteoNoLeidos,
  bloquearUsuario,
  reportarConversacion,
} from "@/lib/messaging";

// Fixtures base (creados una sola vez para toda la suite).
let compradorId: string;
let ownerId: string;
let extranoId: string;
let vendorId: string;
let productoId: string;
// Conversaciones creadas por los propios tests (en orden de ejecución).
let convGeneralId: string;
let convProductoId: string;

/** Lee la fila cruda de la conversación para verificar denormalizados. */
async function filaConversacion(id: string) {
  const [fila] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, id))
    .limit(1);
  return fila;
}

beforeAll(async () => {
  const sufijo = randomUUID();

  // Usuarios: comprador, owner de la tienda y un extraño sin relación.
  const insertados = await db
    .insert(users)
    .values([
      {
        email: `comprador-${sufijo}@test.agora`,
        name: "Comprador Msj",
        rolGlobal: "comprador",
      },
      {
        email: `owner-${sufijo}@test.agora`,
        name: "Owner Msj",
        rolGlobal: "vendor",
      },
      {
        email: `extrano-${sufijo}@test.agora`,
        name: "Extraño Msj",
        rolGlobal: "comprador",
      },
    ])
    .returning({ id: users.id, email: users.email });
  compradorId = insertados.find((u) => u.email.startsWith("comprador-"))!.id;
  ownerId = insertados.find((u) => u.email.startsWith("owner-"))!.id;
  extranoId = insertados.find((u) => u.email.startsWith("extrano-"))!.id;

  // Vendor ACTIVO con el owner como miembro (rol "owner").
  const [vendor] = await db
    .insert(vendors)
    .values({
      slug: `msg-test-${sufijo}`,
      nombre: "Tienda de prueba (messaging.test)",
      tipo: "club",
      estado: "activo",
    })
    .returning({ id: vendors.id });
  vendorId = vendor.id;
  await db.insert(vendorMembers).values({
    vendorId,
    userId: ownerId,
    rol: "owner",
  });

  // Producto activo para la conversación con contexto.
  const [producto] = await db
    .insert(products)
    .values({
      vendorId,
      nombre: "Sudadera de prueba (messaging.test)",
      estado: "activo",
    })
    .returning({ id: products.id });
  productoId = producto.id;
});

afterAll(async () => {
  // Orden por FKs: reports (reporter_id RESTRICT) → conversations (cascada a
  // messages) → blocks → vendor (cascada a members/products) → users
  // (cascada a notifications creadas por notificar).
  const userIds = [compradorId, ownerId, extranoId];
  await db
    .delete(messageReports)
    .where(inArray(messageReports.reporterId, userIds));
  await db.delete(conversations).where(eq(conversations.vendorId, vendorId));
  await db.delete(userBlocks).where(inArray(userBlocks.blockerId, userIds));
  await db.delete(vendors).where(eq(vendors.id, vendorId));
  await db.delete(users).where(inArray(users.id, userIds));
  // Cierra ambos pools: el del helper y el del cliente de la app.
  await closeDb();
  await dbApp.$client.end();
});

describe("abrirConversacion", () => {
  it("crea la conversación general y la REÚSA (mismo id) al reabrir", async () => {
    const primera = await abrirConversacion({ compradorId, vendorId });
    expect(primera.ok).toBe(true);
    if (!primera.ok) return;
    convGeneralId = primera.conversationId;

    const segunda = await abrirConversacion({ compradorId, vendorId });
    expect(segunda).toEqual({ ok: true, conversationId: convGeneralId });
  });

  it("con productId crea OTRA conversación distinta y también la reúsa", async () => {
    const primera = await abrirConversacion({
      compradorId,
      vendorId,
      productId: productoId,
    });
    expect(primera.ok).toBe(true);
    if (!primera.ok) return;
    convProductoId = primera.conversationId;
    expect(convProductoId).not.toBe(convGeneralId);

    const segunda = await abrirConversacion({
      compradorId,
      vendorId,
      productId: productoId,
    });
    expect(segunda).toEqual({ ok: true, conversationId: convProductoId });
  });

  it("un miembro del vendor NO puede abrir contra su propia tienda", async () => {
    const resultado = await abrirConversacion({
      compradorId: ownerId,
      vendorId,
    });
    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.error).toBe("PROPIA_TIENDA");
  });
});

describe("enviarMensaje — contadores y denormalizados", () => {
  it("mensaje del comprador incrementa noLeidosVendor y setea preview/fecha", async () => {
    const resultado = await enviarMensaje(
      convGeneralId,
      compradorId,
      "Hola, ¿tienen tallas chicas?",
    );
    expect(resultado.ok).toBe(true);

    const fila = await filaConversacion(convGeneralId);
    expect(fila.noLeidosVendor).toBe(1);
    expect(fila.noLeidosComprador).toBe(0);
    expect(fila.ultimoMensajePreview).toBe("Hola, ¿tienen tallas chicas?");
    expect(fila.ultimoMensajeEn).not.toBeNull();
  });

  it("la respuesta del owner incrementa noLeidosComprador", async () => {
    const resultado = await enviarMensaje(
      convGeneralId,
      ownerId,
      "¡Sí! Nos quedan en talla CH.",
    );
    expect(resultado.ok).toBe(true);

    const fila = await filaConversacion(convGeneralId);
    expect(fila.noLeidosComprador).toBe(1);
    expect(fila.noLeidosVendor).toBe(1); // el comprador aún no marca leído
    expect(fila.ultimoMensajePreview).toBe("¡Sí! Nos quedan en talla CH.");
  });
});

describe("permisos de extraños", () => {
  it("un extraño no puede enviar (NO_AUTORIZADO) ni leer la conversación (null)", async () => {
    const envio = await enviarMensaje(convGeneralId, extranoId, "Hola intruso");
    expect(envio).toEqual({ ok: false, error: "NO_AUTORIZADO" });

    const detalle = await obtenerConversacion(convGeneralId, extranoId);
    expect(detalle).toBeNull();
  });
});

describe("enviarMensaje — validación de cuerpo", () => {
  it("cuerpo vacío (solo espacios) y de 2001 chars → CUERPO_INVALIDO", async () => {
    const vacio = await enviarMensaje(convGeneralId, compradorId, "   ");
    expect(vacio).toEqual({ ok: false, error: "CUERPO_INVALIDO" });

    const gigante = await enviarMensaje(
      convGeneralId,
      compradorId,
      "a".repeat(2001),
    );
    expect(gigante).toEqual({ ok: false, error: "CUERPO_INVALIDO" });
  });
});

describe("marcarLeida y conteoNoLeidos", () => {
  it("marcarLeida del owner resetea noLeidosVendor y marca leido_en del comprador", async () => {
    await marcarLeida(convGeneralId, ownerId);

    const fila = await filaConversacion(convGeneralId);
    expect(fila.noLeidosVendor).toBe(0);
    expect(fila.noLeidosComprador).toBe(1); // el lado del comprador no se toca

    // Todos los mensajes del comprador quedan con leido_en; los del vendor no.
    const filasMensajes = await db
      .select({ autorRol: messages.autorRol, leidoEn: messages.leidoEn })
      .from(messages)
      .where(eq(messages.conversationId, convGeneralId))
      .orderBy(asc(messages.createdAt));
    const delComprador = filasMensajes.filter((m) => m.autorRol === "comprador");
    const delVendor = filasMensajes.filter((m) => m.autorRol === "vendor");
    expect(delComprador.length).toBeGreaterThan(0);
    expect(delComprador.every((m) => m.leidoEn !== null)).toBe(true);
    expect(delVendor.every((m) => m.leidoEn === null)).toBe(true);
  });

  it("conteoNoLeidos refleja ambos lados: comprador 1, owner 0 tras marcar", async () => {
    // El comprador tiene 1 sin leer (la respuesta del owner en la general).
    expect(await conteoNoLeidos(compradorId)).toBe(1);
    // El owner ya marcó leída su bandeja del vendor.
    expect(await conteoNoLeidos(ownerId)).toBe(0);
  });
});

describe("bloqueos", () => {
  it("tras bloquear el comprador al owner: enviar y abrir nueva → BLOQUEADO", async () => {
    const bloqueo = await bloquearUsuario(compradorId, ownerId);
    expect(bloqueo).toEqual({ ok: true });

    const envio = await enviarMensaje(
      convGeneralId,
      compradorId,
      "¿Sigue disponible?",
    );
    expect(envio).toEqual({ ok: false, error: "BLOQUEADO" });

    // También corta el lado del vendor (bloqueo en cualquier dirección).
    const respuesta = await enviarMensaje(convGeneralId, ownerId, "Hola");
    expect(respuesta).toEqual({ ok: false, error: "BLOQUEADO" });

    const nueva = await abrirConversacion({ compradorId, vendorId });
    expect(nueva).toEqual({ ok: false, error: "BLOQUEADO" });
  });

  it("bloquearse a uno mismo falla", async () => {
    const resultado = await bloquearUsuario(compradorId, compradorId);
    expect(resultado.ok).toBe(false);
  });
});

describe("reportarConversacion", () => {
  it("el comprador crea un reporte pendiente con reportedUserId = owner", async () => {
    const resultado = await reportarConversacion(
      compradorId,
      convGeneralId,
      "Lenguaje ofensivo en el chat",
    );
    expect(resultado).toEqual({ ok: true });

    const [reporte] = await db
      .select()
      .from(messageReports)
      .where(
        and(
          eq(messageReports.reporterId, compradorId),
          eq(messageReports.conversationId, convGeneralId),
        ),
      )
      .limit(1);
    expect(reporte).toBeDefined();
    expect(reporte.estado).toBe("pendiente");
    expect(reporte.reportedUserId).toBe(ownerId);
  });

  it("un extraño (no participante) no puede reportar", async () => {
    const resultado = await reportarConversacion(
      extranoId,
      convGeneralId,
      "Reporte de alguien ajeno",
    );
    expect(resultado).toEqual({ ok: false, error: "NO_AUTORIZADO" });
  });
});
