// next-auth.d.ts — module augmentation de los tipos de Auth.js v5.
//
// ¿Por qué existe este archivo? El callback `session` de src/lib/auth.ts
// añade `id` y `rolGlobal` a session.user (los copia de la fila de users que
// entrega el adaptador con strategy "database"). Sin esta augmentation,
// TypeScript solo conoce el DefaultSession (name/email/image) y cada consumo
// de session.user.id / session.user.rolGlobal necesitaría casts.
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      /** id (uuid) de la fila de users — lo inyecta el callback session. */
      id: string;
      /** Rol global de la plataforma — lo inyecta el callback session. */
      rolGlobal: "comprador" | "vendor" | "superadmin";
      /**
       * Con strategy "database" el user de la sesión sale de la fila de users,
       * cuyo email es NOT NULL — por eso aquí es string y no string|null.
       * (src/lib/session.ts consume session.user.email como string.)
       */
      email: string;
    } & DefaultSession["user"];
  }
}
