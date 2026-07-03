// messaging.ts — NÚCLEO DE DOMINIO de mensajería comprador↔tienda (Fase 7).
//
// Server actions, rutas API y tests programan contra esta API. Reglas duras:
//
//  - La conversación SIEMPRE es 1 comprador vs el vendor como ENTIDAD:
//    cualquier miembro del staff puede responder, no hay hilo por persona.
//  - Los permisos se verifican SIEMPRE contra BD (comprador de la convo /
//    vendor_members / rol_global); nunca se confía en el caller.
//  - Bloqueos: se evalúan entre el comprador y el OWNER del vendor, en
//    AMBAS direcciones, tanto al abrir conversación como al enviar mensaje.
//  - enviarMensaje es TRANSACCIONAL: insert del mensaje + denormalizados de
//    la conversación (preview, fecha, contador del lado receptor) juntos.
//  - Las notificaciones se emiten FUERA de la transacción y nunca lanzan
//    (contrato de notificar): un aviso fallido no revierte el envío.
import { and, asc, desc, eq, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  conversations,
  messageReports,
  messages,
  orders,
  products,
  userBlocks,
  users,
  vendorMembers,
  vendors,
} from "@/db/schema";
import { notificar } from "@/lib/notifications";

// ---------------------------------------------------------------------------
// Tipos públicos del módulo (contrato con actions / API / tests).
// ---------------------------------------------------------------------------

export type ResultadoMsj = { ok: boolean; error?: string };

export type ConversacionResumen = {
  id: string;
  titulo: string;
  preview: string | null;
  fecha: Date | null;
  noLeidos: number;
  contexto: string | null;
};

export type ConversacionDetalle = {
  id: string;
  rolUsuario: "comprador" | "vendor";
  titulo: string;
  vendorSlug: string;
  contexto: { tipo: "producto" | "orden"; id: string; etiqueta: string } | null;
  otroUsuarioId: string;
  mensajes: Array<{
    id: string;
    cuerpo: string;
    autorRol: "comprador" | "vendor";
    propio: boolean;
    createdAt: Date;
  }>;
};

// ---------------------------------------------------------------------------
// Helpers internos.
// ---------------------------------------------------------------------------

// Límites de validación de textos (cuerpo del mensaje y motivo del reporte).
const CUERPO_MAX = 2000;
const PREVIEW_MAX = 120;
const MOTIVO_MIN = 3;
const MOTIVO_MAX = 500;
const MENSAJES_LIMITE = 200;

/**
 * mensajeSeguro — mapea una excepción a un código sin detalles internos
 * (mismo patrón que src/lib/orders.ts): se loguea y se responde genérico.
 */
function mensajeSeguro(error: unknown): string {
  console.error("[messaging] error inesperado:", error);
  return "ERROR_INTERNO";
}

/**
 * esViolacionUnique — detecta un 23505 de Postgres recorriendo la cadena de
 * causas (Drizzle puede envolver el DatabaseError de node-postgres).
 * Aquí el único UNIQUE alcanzable es el parcial de conversación "general".
 */
function esViolacionUnique(error: unknown): boolean {
  let actual: unknown = error;
  for (let salto = 0; salto < 5 && actual != null; salto++) {
    if (
      typeof actual === "object" &&
      "code" in actual &&
      (actual as { code?: unknown }).code === "23505"
    ) {
      return true;
    }
    actual = (actual as { cause?: unknown }).cause;
  }
  return false;
}

/** esMiembroDelVendor — el usuario pertenece al staff (owner/staff) del vendor. */
async function esMiembroDelVendor(
  vendorId: string,
  userId: string,
): Promise<boolean> {
  const [miembro] = await db
    .select({ userId: vendorMembers.userId })
    .from(vendorMembers)
    .where(
      and(eq(vendorMembers.vendorId, vendorId), eq(vendorMembers.userId, userId)),
    )
    .limit(1);
  return miembro !== undefined;
}

/**
 * ownerDelVendor — userId del OWNER del vendor (el más antiguo si hubiera
 * varios). Es la "cara humana" del vendor para bloqueos, notificaciones,
 * otroUsuarioId y reportes. null = dato inconsistente (vendor sin owner).
 */
async function ownerDelVendor(vendorId: string): Promise<string | null> {
  const [owner] = await db
    .select({ userId: vendorMembers.userId })
    .from(vendorMembers)
    .where(
      and(eq(vendorMembers.vendorId, vendorId), eq(vendorMembers.rol, "owner")),
    )
    .orderBy(asc(vendorMembers.createdAt))
    .limit(1);
  return owner?.userId ?? null;
}

/** existeBloqueo — hay un user_block entre a y b en CUALQUIER dirección. */
async function existeBloqueo(a: string, b: string): Promise<boolean> {
  const [bloqueo] = await db
    .select({ blockerId: userBlocks.blockerId })
    .from(userBlocks)
    .where(
      or(
        and(eq(userBlocks.blockerId, a), eq(userBlocks.blockedId, b)),
        and(eq(userBlocks.blockerId, b), eq(userBlocks.blockedId, a)),
      ),
    )
    .limit(1);
  return bloqueo !== undefined;
}

/**
 * bloqueoEntreCompradorYVendor — regla única de bloqueo del chat: se evalúa
 * entre el comprador y el OWNER del vendor (en ambas direcciones). Si el
 * vendor no tiene owner, no hay a quién bloquear → no bloqueado.
 */
async function bloqueoEntreCompradorYVendor(
  compradorId: string,
  vendorId: string,
): Promise<boolean> {
  const ownerId = await ownerDelVendor(vendorId);
  if (!ownerId) return false;
  return existeBloqueo(compradorId, ownerId);
}

/** Carga la conversación por id (o null). */
async function cargarConversacion(conversationId: string) {
  const [convo] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);
  return convo ?? null;
}

/**
 * rolEnConversacion — rol del usuario DENTRO de la conversación, resuelto
 * contra BD: comprador dueño → "comprador"; miembro del vendor → "vendor";
 * cualquier otro → null (sin acceso).
 */
async function rolEnConversacion(
  convo: typeof conversations.$inferSelect,
  userId: string,
): Promise<"comprador" | "vendor" | null> {
  if (convo.compradorId === userId) return "comprador";
  if (await esMiembroDelVendor(convo.vendorId, userId)) return "vendor";
  return null;
}

/**
 * buscarConversacionExistente — busca por la clave lógica completa usando
 * IS NOT DISTINCT FROM para que NULL = NULL cuente como igualdad (la unique
 * parcial de BD solo cubre la "general"; los contextos se deduplican aquí).
 */
async function buscarConversacionExistente(
  compradorId: string,
  vendorId: string,
  productId: string | null,
  orderId: string | null,
): Promise<string | null> {
  const [existente] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(
      and(
        eq(conversations.compradorId, compradorId),
        eq(conversations.vendorId, vendorId),
        sql`${conversations.productId} IS NOT DISTINCT FROM ${productId}::uuid`,
        sql`${conversations.orderId} IS NOT DISTINCT FROM ${orderId}::uuid`,
      ),
    )
    .limit(1);
  return existente?.id ?? null;
}

/** Etiqueta corta de contexto para el inbox ("Sobre: X" / "Pedido Y"). */
function etiquetaContexto(
  productoNombre: string | null,
  ordenReferencia: string | null,
): string | null {
  if (productoNombre) return `Sobre: ${productoNombre}`;
  if (ordenReferencia) return `Pedido ${ordenReferencia}`;
  return null;
}

// ---------------------------------------------------------------------------
// abrirConversacion — crea o reúsa la conversación del par comprador-vendor.
// ---------------------------------------------------------------------------

export async function abrirConversacion(p: {
  compradorId: string;
  vendorId: string;
  productId?: string | null;
  orderId?: string | null;
}): Promise<{ ok: true; conversationId: string } | { ok: false; error: string }> {
  const productId = p.productId ?? null;
  const orderId = p.orderId ?? null;

  try {
    // El vendor debe existir y estar ACTIVO (no se chatea con tiendas
    // pendientes ni suspendidas).
    const [vendor] = await db
      .select({ id: vendors.id, estado: vendors.estado })
      .from(vendors)
      .where(eq(vendors.id, p.vendorId))
      .limit(1);
    if (!vendor) return { ok: false, error: "VENDOR_NO_ENCONTRADO" };
    if (vendor.estado !== "activo") return { ok: false, error: "VENDOR_INACTIVO" };

    // Un miembro del vendor no puede abrir chat contra su propia tienda.
    if (await esMiembroDelVendor(p.vendorId, p.compradorId)) {
      return { ok: false, error: "PROPIA_TIENDA" };
    }

    // Bloqueo en cualquier dirección entre comprador y owner del vendor.
    if (await bloqueoEntreCompradorYVendor(p.compradorId, p.vendorId)) {
      return { ok: false, error: "BLOQUEADO" };
    }

    // Reúsa la conversación existente del mismo contexto exacto.
    const existente = await buscarConversacionExistente(
      p.compradorId,
      p.vendorId,
      productId,
      orderId,
    );
    if (existente) return { ok: true, conversationId: existente };

    try {
      const [nueva] = await db
        .insert(conversations)
        .values({
          compradorId: p.compradorId,
          vendorId: p.vendorId,
          productId,
          orderId,
        })
        .returning({ id: conversations.id });
      return { ok: true, conversationId: nueva.id };
    } catch (error) {
      // Carrera contra la unique parcial de la conversación "general":
      // otro request la insertó entre la búsqueda y el INSERT → re-busca.
      if (esViolacionUnique(error)) {
        const ganadora = await buscarConversacionExistente(
          p.compradorId,
          p.vendorId,
          productId,
          orderId,
        );
        if (ganadora) return { ok: true, conversationId: ganadora };
      }
      throw error;
    }
  } catch (error) {
    return { ok: false, error: mensajeSeguro(error) };
  }
}

// ---------------------------------------------------------------------------
// enviarMensaje — insert transaccional + denormalizados + aviso al receptor.
// ---------------------------------------------------------------------------

export async function enviarMensaje(
  conversationId: string,
  autorId: string,
  cuerpo: string,
): Promise<ResultadoMsj> {
  // Validación de contenido ANTES de tocar BD.
  const texto = cuerpo.trim();
  if (texto.length < 1 || texto.length > CUERPO_MAX) {
    return { ok: false, error: "CUERPO_INVALIDO" };
  }

  try {
    const convo = await cargarConversacion(conversationId);
    if (!convo) return { ok: false, error: "NO_ENCONTRADA" };

    // Permiso: comprador de la convo o miembro del vendor. Nadie más.
    const autorRol = await rolEnConversacion(convo, autorId);
    if (!autorRol) return { ok: false, error: "NO_AUTORIZADO" };

    // Bloqueo entre comprador y owner del vendor corta el chat en ambos lados.
    if (await bloqueoEntreCompradorYVendor(convo.compradorId, convo.vendorId)) {
      return { ok: false, error: "BLOQUEADO" };
    }

    // TRANSACCIÓN: mensaje + denormalizados del inbox (preview/fecha) +
    // contador de no leídos del lado RECEPTOR.
    const ahora = new Date();
    await db.transaction(async (tx) => {
      await tx.insert(messages).values({
        conversationId,
        autorId,
        autorRol,
        cuerpo: texto,
      });
      await tx
        .update(conversations)
        .set({
          ultimoMensajeEn: ahora,
          ultimoMensajePreview: texto.slice(0, PREVIEW_MAX),
          ...(autorRol === "comprador"
            ? { noLeidosVendor: sql`${conversations.noLeidosVendor} + 1` }
            : { noLeidosComprador: sql`${conversations.noLeidosComprador} + 1` }),
        })
        .where(eq(conversations.id, conversationId));
    });

    // Aviso FUERA de la transacción (notificar jamás lanza): al comprador si
    // respondió el vendor, o al owner del vendor si escribió el comprador.
    const receptorId =
      autorRol === "comprador"
        ? await ownerDelVendor(convo.vendorId)
        : convo.compradorId;
    if (receptorId) {
      await notificar(receptorId, "mensaje_nuevo", {
        conversationId,
        preview: texto.slice(0, PREVIEW_MAX),
      });
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: mensajeSeguro(error) };
  }
}

// ---------------------------------------------------------------------------
// marcarLeida — resetea el contador de MI lado y marca leídos los del otro.
// ---------------------------------------------------------------------------

export async function marcarLeida(
  conversationId: string,
  userId: string,
): Promise<void> {
  const convo = await cargarConversacion(conversationId);
  if (!convo) return;

  const rol = await rolEnConversacion(convo, userId);
  // Sin permiso → no-op silencioso (marcar leído no amerita error al caller).
  if (!rol) return;

  // Se marcan como leídos los mensajes del OTRO rol que sigan sin leer.
  const rolContrario = rol === "comprador" ? "vendor" : "comprador";
  await db.transaction(async (tx) => {
    await tx
      .update(conversations)
      .set(rol === "comprador" ? { noLeidosComprador: 0 } : { noLeidosVendor: 0 })
      .where(eq(conversations.id, conversationId));
    await tx
      .update(messages)
      .set({ leidoEn: new Date() })
      .where(
        and(
          eq(messages.conversationId, conversationId),
          eq(messages.autorRol, rolContrario),
          isNull(messages.leidoEn),
        ),
      );
  });
}

// ---------------------------------------------------------------------------
// Inbox: listados por lado (comprador / vendor).
// ---------------------------------------------------------------------------

export async function listarConversacionesComprador(
  userId: string,
): Promise<ConversacionResumen[]> {
  const filas = await db
    .select({
      id: conversations.id,
      titulo: vendors.nombre,
      preview: conversations.ultimoMensajePreview,
      fecha: conversations.ultimoMensajeEn,
      noLeidos: conversations.noLeidosComprador,
      productoNombre: products.nombre,
      ordenReferencia: orders.referenciaPago,
    })
    .from(conversations)
    .innerJoin(vendors, eq(vendors.id, conversations.vendorId))
    .leftJoin(products, eq(products.id, conversations.productId))
    .leftJoin(orders, eq(orders.id, conversations.orderId))
    .where(eq(conversations.compradorId, userId))
    .orderBy(sql`${conversations.ultimoMensajeEn} DESC NULLS LAST`);

  return filas.map((fila) => ({
    id: fila.id,
    titulo: fila.titulo,
    preview: fila.preview,
    fecha: fila.fecha,
    noLeidos: fila.noLeidos,
    contexto: etiquetaContexto(fila.productoNombre, fila.ordenReferencia),
  }));
}

export async function listarConversacionesVendor(
  vendorId: string,
): Promise<ConversacionResumen[]> {
  const filas = await db
    .select({
      id: conversations.id,
      compradorNombre: users.name,
      compradorEmail: users.email,
      preview: conversations.ultimoMensajePreview,
      fecha: conversations.ultimoMensajeEn,
      noLeidos: conversations.noLeidosVendor,
      productoNombre: products.nombre,
      ordenReferencia: orders.referenciaPago,
    })
    .from(conversations)
    .innerJoin(users, eq(users.id, conversations.compradorId))
    .leftJoin(products, eq(products.id, conversations.productId))
    .leftJoin(orders, eq(orders.id, conversations.orderId))
    .where(eq(conversations.vendorId, vendorId))
    .orderBy(sql`${conversations.ultimoMensajeEn} DESC NULLS LAST`);

  return filas.map((fila) => ({
    id: fila.id,
    // El vendor ve al comprador por nombre; email como respaldo.
    titulo: fila.compradorNombre ?? fila.compradorEmail,
    preview: fila.preview,
    fecha: fila.fecha,
    noLeidos: fila.noLeidos,
    contexto: etiquetaContexto(fila.productoNombre, fila.ordenReferencia),
  }));
}

// ---------------------------------------------------------------------------
// obtenerConversacion — detalle con mensajes para la vista de chat.
// ---------------------------------------------------------------------------

export async function obtenerConversacion(
  conversationId: string,
  userId: string,
): Promise<ConversacionDetalle | null> {
  const [fila] = await db
    .select({
      convo: conversations,
      vendorNombre: vendors.nombre,
      vendorSlug: vendors.slug,
      compradorNombre: users.name,
      compradorEmail: users.email,
      productoNombre: products.nombre,
      ordenReferencia: orders.referenciaPago,
    })
    .from(conversations)
    .innerJoin(vendors, eq(vendors.id, conversations.vendorId))
    .innerJoin(users, eq(users.id, conversations.compradorId))
    .leftJoin(products, eq(products.id, conversations.productId))
    .leftJoin(orders, eq(orders.id, conversations.orderId))
    .where(eq(conversations.id, conversationId))
    .limit(1);
  if (!fila) return null;
  const { convo } = fila;

  // Permiso: comprador dueño / miembro del vendor / superadmin (moderación).
  let rolUsuario = await rolEnConversacion(convo, userId);
  if (!rolUsuario) {
    const [usuario] = await db
      .select({ rolGlobal: users.rolGlobal })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (usuario?.rolGlobal !== "superadmin") return null;
    // El superadmin LEE desde la perspectiva del vendor (ve al comprador).
    rolUsuario = "vendor";
  }

  const mensajes = (
    await db
      .select({
        id: messages.id,
        cuerpo: messages.cuerpo,
        autorRol: messages.autorRol,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      // Los ÚLTIMOS N (desc + reverse): con asc+limit una conversación larga
      // se quedaría congelada mostrando los 200 más viejos para siempre.
      .orderBy(desc(messages.createdAt))
      .limit(MENSAJES_LIMITE)
  ).reverse();

  // Contexto tipado: producto manda si ambos existieran.
  let contexto: ConversacionDetalle["contexto"] = null;
  if (convo.productId) {
    contexto = {
      tipo: "producto",
      id: convo.productId,
      etiqueta: fila.productoNombre ?? "Producto",
    };
  } else if (convo.orderId) {
    contexto = {
      tipo: "orden",
      id: convo.orderId,
      etiqueta: fila.ordenReferencia ?? "Pedido",
    };
  }

  // El "otro" usuario: el comprador si veo como vendor; el owner del vendor
  // si veo como comprador ("" solo si el vendor no tuviera owner: dato roto).
  const otroUsuarioId =
    rolUsuario === "vendor"
      ? convo.compradorId
      : ((await ownerDelVendor(convo.vendorId)) ?? "");

  return {
    id: convo.id,
    rolUsuario,
    titulo:
      rolUsuario === "comprador"
        ? fila.vendorNombre
        : (fila.compradorNombre ?? fila.compradorEmail),
    vendorSlug: fila.vendorSlug,
    contexto,
    otroUsuarioId,
    mensajes: mensajes.map((mensaje) => ({
      id: mensaje.id,
      cuerpo: mensaje.cuerpo,
      autorRol: mensaje.autorRol,
      propio: mensaje.autorRol === rolUsuario,
      createdAt: mensaje.createdAt,
    })),
  };
}

// ---------------------------------------------------------------------------
// conteoNoLeidos — badge global del usuario (dos SUM sobre denormalizados).
// ---------------------------------------------------------------------------

export async function conteoNoLeidos(userId: string): Promise<number> {
  // Lado comprador: mis conversaciones como comprador.
  const [comoComprador] = await db
    .select({
      total: sql<number>`COALESCE(SUM(${conversations.noLeidosComprador}), 0)::int`,
    })
    .from(conversations)
    .where(eq(conversations.compradorId, userId));

  // Lado vendor: conversaciones de los vendors donde soy miembro.
  const [comoVendor] = await db
    .select({
      total: sql<number>`COALESCE(SUM(${conversations.noLeidosVendor}), 0)::int`,
    })
    .from(conversations)
    .innerJoin(
      vendorMembers,
      and(
        eq(vendorMembers.vendorId, conversations.vendorId),
        eq(vendorMembers.userId, userId),
      ),
    );

  return (comoComprador?.total ?? 0) + (comoVendor?.total ?? 0);
}

// ---------------------------------------------------------------------------
// bloquearUsuario — bloqueo unidireccional (idempotente por PK compuesta).
// ---------------------------------------------------------------------------

export async function bloquearUsuario(
  blockerId: string,
  blockedId: string,
): Promise<ResultadoMsj> {
  if (blockerId === blockedId) return { ok: false, error: "AUTO_BLOQUEO" };
  try {
    // Idempotente: si el bloqueo ya existe, la PK compuesta lo absorbe.
    await db
      .insert(userBlocks)
      .values({ blockerId, blockedId })
      .onConflictDoNothing();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: mensajeSeguro(error) };
  }
}

// ---------------------------------------------------------------------------
// reportarConversacion — reporte a moderación (queda "pendiente" para revisión).
// ---------------------------------------------------------------------------

export async function reportarConversacion(
  reporterId: string,
  conversationId: string,
  motivo: string,
): Promise<ResultadoMsj> {
  const motivoLimpio = motivo.trim();
  if (motivoLimpio.length < MOTIVO_MIN || motivoLimpio.length > MOTIVO_MAX) {
    return { ok: false, error: "MOTIVO_INVALIDO" };
  }

  try {
    const convo = await cargarConversacion(conversationId);
    if (!convo) return { ok: false, error: "NO_ENCONTRADA" };

    // Solo un participante real puede reportar la conversación.
    const rol = await rolEnConversacion(convo, reporterId);
    if (!rol) return { ok: false, error: "NO_AUTORIZADO" };

    // El reportado es EL OTRO participante: el owner del vendor si reporta
    // el comprador, o el comprador si reporta alguien del vendor.
    const reportedUserId =
      rol === "comprador"
        ? await ownerDelVendor(convo.vendorId)
        : convo.compradorId;

    await db.insert(messageReports).values({
      reporterId,
      reportedUserId,
      conversationId,
      motivo: motivoLimpio,
      estado: "pendiente",
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: mensajeSeguro(error) };
  }
}

// Fin del núcleo de dominio de mensajería.
