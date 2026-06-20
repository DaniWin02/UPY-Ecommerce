// TODO: Handlers de Auth.js v5 (NextAuth). Re-exporta GET/POST configurados en "@/lib/auth"
// (login con Google restringido a dominio @uni, sesión, callbacks, adaptador Drizzle).
import { handlers } from "@/lib/auth";

export const { GET, POST } = handlers;
