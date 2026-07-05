// Panel de universidad — GESTIÓN DE USUARIOS (superadmin).
// Búsqueda por correo/nombre, membresías de tienda, sesiones activas y
// acciones por usuario: cambio de rol (anti-lockout), cierre de sesiones
// y verificación manual de comunidad. Banners ok/error por redirect.
import {
  AlertTriangle,
  CheckCircle2,
  LogOut,
  Save,
  Search,
  SearchX,
  ShieldCheck,
} from "lucide-react";
import { and, count, desc, eq, gt, ilike, inArray, or } from "drizzle-orm";
import { db } from "@/db";
import { users, sessions } from "@/db/schema/users";
import { vendorMembers, vendors } from "@/db/schema/vendors";
import { requireRole } from "@/lib/session";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  accionCambiarRol,
  accionCerrarSesiones,
  accionVerificarComunidad,
} from "./actions";

const FECHA = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" });

// Etiquetas y estilo de badge por rol global (MASTER: sin emojis, pills suaves).
const ROLES: Record<
  "comprador" | "vendor" | "superadmin",
  { etiqueta: string; variant: "outline" | "secondary"; className?: string }
> = {
  comprador: { etiqueta: "Comunidad", variant: "outline" },
  vendor: { etiqueta: "Vendedor", variant: "secondary" },
  // "destructive outline": pill contorneada en rojo, sin fondo sólido.
  superadmin: {
    etiqueta: "Administración",
    variant: "outline",
    className: "border-destructive/40 text-destructive",
  },
};

// Mensajes de banner (los redirects de actions.ts traen la clave).
const MENSAJES_OK: Record<string, string> = {
  RolActualizado: "Rol actualizado correctamente.",
  SesionesCerradas: "Se cerraron todas las sesiones de la persona.",
  Verificado: "Verificación de comunidad aplicada.",
};
const MENSAJES_ERROR: Record<string, string> = {
  NoTeQuitesAdmin:
    "No puedes quitarte tu propio acceso de administración (o dejar la plataforma sin administradores).",
  Validacion: "Los datos enviados no son válidos.",
  UsuarioNoExiste: "Esa cuenta ya no existe.",
  YaVerificado: "Esa cuenta ya estaba verificada.",
};

// Inicial del avatar: primera letra del nombre o, en su defecto, del correo.
function inicial(name: string | null, email: string): string {
  return (name?.trim()[0] ?? email[0] ?? "?").toUpperCase();
}

export default async function AdminUsuariosPage({
  searchParams,
}: {
  // Next.js 15: searchParams es una Promise en Server Components.
  searchParams: Promise<{ q?: string; ok?: string; error?: string }>;
}) {
  const admin = await requireRole("superadmin");
  const { q, ok, error } = await searchParams;
  const busqueda = q?.trim().slice(0, 100) ?? "";

  // Con búsqueda: ILIKE parametrizado sobre email y name (wildcards escapados),
  // límite 30. Sin búsqueda: los 20 registros más recientes.
  const patron = `%${busqueda.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
  const filas = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      rolGlobal: users.rolGlobal,
      verificadoEn: users.verificadoEn,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(
      busqueda
        ? or(ilike(users.email, patron), ilike(users.name, patron))
        : undefined
    )
    .orderBy(desc(users.createdAt))
    .limit(busqueda ? 30 : 20);

  const ids = filas.map((u) => u.id);

  // Membresías de tienda ("tienda (rol)") y sesiones activas, en lote.
  const [membresias, conteosSesiones] =
    ids.length === 0
      ? [[], []]
      : await Promise.all([
          db
            .select({
              userId: vendorMembers.userId,
              rol: vendorMembers.rol,
              tienda: vendors.nombre,
            })
            .from(vendorMembers)
            .innerJoin(vendors, eq(vendorMembers.vendorId, vendors.id))
            .where(inArray(vendorMembers.userId, ids)),
          db
            .select({ userId: sessions.userId, total: count() })
            .from(sessions)
            .where(
              and(inArray(sessions.userId, ids), gt(sessions.expires, new Date()))
            )
            .groupBy(sessions.userId),
        ]);

  const membresiasPorUsuario = new Map<string, string[]>();
  for (const m of membresias) {
    const lista = membresiasPorUsuario.get(m.userId) ?? [];
    lista.push(`${m.tienda} (${m.rol === "owner" ? "dueño" : "staff"})`);
    membresiasPorUsuario.set(m.userId, lista);
  }
  const sesionesPorUsuario = new Map(
    conteosSesiones.map((c) => [c.userId, c.total])
  );

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-heading text-lg font-semibold tracking-tight">
        Usuarios
      </h1>

      {/* Buscador: form GET nativo (funciona sin JS), patrón del catálogo. */}
      <form action="/admin/usuarios" method="GET" className="flex gap-2">
        <div className="relative flex-1">
          <Search
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            name="q"
            placeholder="Buscar por correo o nombre…"
            defaultValue={busqueda}
            className="h-11 w-full pl-9"
          />
        </div>
        <Button type="submit" size="icon" className="h-11 w-11" aria-label="Buscar">
          <Search className="h-5 w-5" aria-hidden />
        </Button>
      </form>

      {/* Banners de resultado de la última acción (vienen del redirect). */}
      {ok && (
        <div
          role="status"
          className="flex items-start gap-2 rounded-lg border border-success/30 bg-success/10 p-3 text-sm text-success"
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p className="font-medium">
            {MENSAJES_OK[ok] ?? "Acción realizada correctamente."}
          </p>
        </div>
      )}
      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p className="font-medium">
            {MENSAJES_ERROR[error] ?? `No se pudo completar la acción: ${error}`}
          </p>
        </div>
      )}

      {filas.length === 0 ? (
        // Empty state (MASTER): círculo suave + SearchX + salida clara.
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-muted" aria-hidden>
              <SearchX className="h-6 w-6 text-muted-foreground" />
            </span>
            <div className="space-y-1">
              <p className="font-medium">Sin resultados</p>
              <p className="text-sm text-muted-foreground">
                {busqueda
                  ? `Nadie coincide con "${busqueda}". Prueba con otro correo o nombre.`
                  : "Todavía no hay personas registradas en la comunidad."}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            {busqueda
              ? `${filas.length} resultado${filas.length === 1 ? "" : "s"} para "${busqueda}"`
              : `Últimas ${filas.length} cuentas registradas`}
          </p>

          <ul className="flex flex-col gap-3">
            {filas.map((u) => {
              const rol = ROLES[u.rolGlobal];
              const tiendas = membresiasPorUsuario.get(u.id) ?? [];
              const sesiones = sesionesPorUsuario.get(u.id) ?? 0;
              return (
                <li key={u.id}>
                  <Card>
                    <CardContent className="flex flex-col gap-3 pt-4">
                      {/* Identidad: avatar de inicial + nombre/correo + badges. */}
                      <div className="flex items-start gap-3">
                        <span
                          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 font-heading font-semibold text-primary"
                          aria-hidden
                        >
                          {inicial(u.name, u.email)}
                        </span>
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium">{u.name ?? "—"}</p>
                            <Badge variant={rol.variant} className={rol.className}>
                              {rol.etiqueta}
                            </Badge>
                            {u.verificadoEn ? (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
                                <CheckCircle2 className="h-4 w-4" aria-hidden />
                                Verificado
                              </span>
                            ) : (
                              <form action={accionVerificarComunidad}>
                                <input type="hidden" name="userId" value={u.id} />
                                {busqueda && (
                                  <input type="hidden" name="q" value={busqueda} />
                                )}
                                <Button type="submit" variant="outline" size="sm">
                                  Verificar
                                </Button>
                              </form>
                            )}
                          </div>
                          <p className="break-all font-mono text-sm text-muted-foreground">
                            {u.email}
                          </p>
                          {tiendas.length > 0 && (
                            <p className="text-xs text-muted-foreground">
                              {tiendas.join(" · ")}
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground">
                            {sesiones}{" "}
                            {sesiones === 1 ? "sesión activa" : "sesiones activas"} ·
                            desde {FECHA.format(u.createdAt)}
                          </p>
                        </div>
                      </div>

                      {/* Acciones sensibles colapsadas: no estorban al escanear la lista. */}
                      <details className="border-t pt-3">
                        <summary className="cursor-pointer text-sm font-medium text-muted-foreground transition-colors duration-200 hover:text-foreground">
                          Gestionar
                        </summary>
                        <div className="mt-3 flex flex-col gap-3">
                          {/* Cambio de rol global (anti-lockout en el servidor). */}
                          <form
                            action={accionCambiarRol}
                            className="flex items-end gap-2"
                          >
                            <input type="hidden" name="userId" value={u.id} />
                            {busqueda && (
                              <input type="hidden" name="q" value={busqueda} />
                            )}
                            <label className="flex-1 space-y-1.5">
                              <span className="text-xs font-medium text-muted-foreground">
                                Rol en la plataforma
                              </span>
                              <Select name="rol" defaultValue={u.rolGlobal}>
                                <option value="comprador">Comunidad</option>
                                <option value="vendor">Vendedor</option>
                                <option value="superadmin">Administración</option>
                              </Select>
                            </label>
                            <Button type="submit" className="h-11 gap-2">
                              <Save className="h-4 w-4" aria-hidden />
                              Guardar
                            </Button>
                          </form>

                          {/* Expulsión inmediata: borra sus sesiones de base de datos. */}
                          <form
                            action={accionCerrarSesiones}
                            className="flex flex-col gap-1.5"
                          >
                            <input type="hidden" name="userId" value={u.id} />
                            {busqueda && (
                              <input type="hidden" name="q" value={busqueda} />
                            )}
                            <Button
                              type="submit"
                              variant="destructive"
                              className="w-fit gap-2"
                            >
                              <LogOut className="h-4 w-4" aria-hidden />
                              Cerrar todas sus sesiones
                            </Button>
                            <p className="text-xs text-muted-foreground">
                              La persona tendrá que iniciar sesión de nuevo.
                            </p>
                          </form>
                        </div>
                      </details>
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {/* Nota operativa: cómo y cuándo aplican los cambios de rol. */}
      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        Los cambios de rol aplican en el próximo inicio de sesión o de inmediato
        si cierras sus sesiones. Sesión actual: {admin.email}.
      </p>
    </div>
  );
}
// Fin: gestión de usuarios del superadmin.
