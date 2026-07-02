// Dominio: mensajería (chat comprador↔vendor, bloqueos y reportes).
// STUB válido de Drizzle: columnas clave, enums y FKs; índices/campos pendientes en TODO.
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  timestamp,
  primaryKey,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users";
import { vendors } from "./vendors";
import { products } from "./products";
import { orders } from "./orders";

// Rol del remitente de un mensaje dentro de la conversación.
export const remitenteRolEnum = pgEnum("remitente_rol", ["comprador", "vendor"]);

// Estado de revisión de un reporte de mensaje/usuario.
export const reporteEstadoEnum = pgEnum("reporte_estado", [
  "pendiente",
  "revisado",
  "descartado",
]);

// Conversaciones: SIEMPRE 1 comprador vs el vendor como entidad
// (cualquier miembro del staff del vendor puede responder, no hay hilo por persona).
export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    compradorId: uuid("comprador_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendors.id, { onDelete: "cascade" }),
    // Contexto opcional: producto/pedido que originó la conversación.
    productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
    // Denormalizado para ordenar el inbox por actividad reciente sin JOIN a messages.
    ultimoMensajeEn: timestamp("ultimo_mensaje_en", { withTimezone: true }),
    ultimoMensajePreview: text("ultimo_mensaje_preview"),
    // Contadores denormalizados: el badge de no leídos se calcula con un SUM en una sola
    // query sobre esta tabla, sin necesidad de contar mensajes (evita N+1).
    noLeidosComprador: integer("no_leidos_comprador").notNull().default(0),
    noLeidosVendor: integer("no_leidos_vendor").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    // TODO: updated_at si se necesita distinguir de ultimo_mensaje_en.
  },
  (table) => ({
    compradorIdUltimoMensajeIdx: index("conversations_comprador_id_ultimo_mensaje_en_idx").on(
      table.compradorId,
      table.ultimoMensajeEn
    ),
    vendorIdUltimoMensajeIdx: index("conversations_vendor_id_ultimo_mensaje_en_idx").on(
      table.vendorId,
      table.ultimoMensajeEn
    ),
    // Evita duplicar la conversación "general" (sin producto/pedido) del par comprador-vendor.
    // Índice único parcial: solo aplica cuando product_id y order_id son ambos NULL.
    compradorVendorGeneralUq: uniqueIndex("conversations_comprador_vendor_general_uq")
      .on(table.compradorId, table.vendorId)
      .where(sql`product_id IS NULL AND order_id IS NULL`),
  })
);

// Mensajes de una conversación (chat de 2 lados: comprador y vendor).
export const messages = pgTable(
  "messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    autorId: uuid("autor_id")
      .notNull()
      .references(() => users.id),
    // Rol del autor al momento de enviar (evita resolver vendor_members solo para renderizar).
    autorRol: remitenteRolEnum("autor_rol").notNull(),
    cuerpo: text("cuerpo").notNull(),
    // Marca de lectura por mensaje (válido porque el chat es de 2 lados, no grupal).
    leidoEn: timestamp("leido_en", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    conversationIdCreatedAtIdx: index("messages_conversation_id_created_at_idx").on(
      table.conversationId,
      table.createdAt
    ),
  })
);

// Bloqueos entre usuarios (p. ej. comprador bloquea a un vendor abusivo o viceversa).
export const userBlocks = pgTable(
  "user_blocks",
  {
    blockerId: uuid("blocker_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    blockedId: uuid("blocked_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.blockerId, table.blockedId] }),
  })
);

// Reportes de mensajes/usuarios: mismo patrón estado+revisadoPor que payments.
export const messageReports = pgTable(
  "message_reports",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    reporterId: uuid("reporter_id")
      .notNull()
      .references(() => users.id),
    reportedUserId: uuid("reported_user_id").references(() => users.id),
    conversationId: uuid("conversation_id").references(() => conversations.id, {
      onDelete: "set null",
    }),
    messageId: uuid("message_id").references(() => messages.id, { onDelete: "set null" }),
    motivo: text("motivo").notNull(),
    estado: reporteEstadoEnum("estado").notNull().default("pendiente"),
    // Quién (staff/superadmin) revisó el reporte.
    revisadoPor: uuid("revisado_por").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    estadoIdx: index("message_reports_estado_idx").on(table.estado),
  })
);

// Fin del dominio de mensajería.
