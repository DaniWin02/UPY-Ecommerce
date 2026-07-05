// Panel admin — GESTIÓN DE TIENDAS: cola de aprobación, edición (CLABE/SPEI),
// miembros del equipo y alta manual. Todo RSC + server actions con banners
// por redirect (?ok=/?error=), siguiendo MASTER.md (morado/dorado UPY, lucide).
import Link from "next/link";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  ExternalLink,
  Package,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Store,
  UserPlus,
} from "lucide-react";
import { asc, count, eq } from "drizzle-orm";
import { db } from "@/db";
import { vendors, vendorMembers } from "@/db/schema/vendors";
import { users } from "@/db/schema/users";
import { products } from "@/db/schema/products";
import { requireRole } from "@/lib/session";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { VendorBadge } from "@/components/VendorBadge";
import {
  accionActualizarVendor,
  accionAgregarMiembro,
  accionCambiarEstadoVendor,
  accionCrearVendor,
} from "./actions";

// ---------------------------------------------------------------------------
// Mensajes de los banners (códigos que ponen las server actions en la URL)
// ---------------------------------------------------------------------------

const MENSAJES_OK: Record<string, string> = {
  creada: "Tienda creada y activada — el owner ya puede entrar a su panel.",
  actualizada: "Datos de la tienda guardados correctamente.",
  estado: "Estado de la tienda actualizado.",
  miembro: "Miembro agregado al equipo de la tienda.",
};

const MENSAJES_ERROR: Record<string, string> = {
  Validacion:
    "Revisa los datos del formulario: hay campos inválidos o incompletos.",
  NoEncontrada: "La tienda no existe o fue eliminada.",
  OwnerNoExiste:
    "No existe un usuario con ese correo — pídele que se registre primero.",
  UsuarioNoExiste:
    "No existe un usuario con ese correo — pídele que se registre primero.",
  SlugNoDisponible:
    "No se pudo generar una URL única para esa tienda — cambia ligeramente el nombre.",
};

// ---------------------------------------------------------------------------
// Estado de la tienda → pill con punto de color (patrón MASTER.md)
// ---------------------------------------------------------------------------

type EstadoTienda = "pendiente" | "activo" | "suspendido";

const ESTADOS: Record<
  EstadoTienda,
  { etiqueta: string; variant: "warning" | "success" | "destructive" }
> = {
  pendiente: { etiqueta: "Pendiente", variant: "warning" },
  activo: { etiqueta: "Activa", variant: "success" },
  suspendido: { etiqueta: "Suspendida", variant: "destructive" },
};

function EstadoBadge({ estado }: { estado: EstadoTienda }) {
  const { etiqueta, variant } = ESTADOS[estado];
  return (
    <Badge variant={variant}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
      {etiqueta}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Tipos de las filas que arma la página
// ---------------------------------------------------------------------------

type Tienda = {
  id: string;
  slug: string;
  nombre: string;
  tipo: "facultad" | "club" | "emprendimiento";
  clabe: string | null;
  estado: EstadoTienda;
  aulaDefault: string | null;
  productos: number;
};

type Miembro = {
  rol: "owner" | "staff";
  name: string | null;
  email: string;
};

// ---------------------------------------------------------------------------
// Bloques reutilizables (forms chicos de estado, edición y miembros)
// ---------------------------------------------------------------------------

/** Form de una sola acción de estado (aprobar/suspender/reactivar). */
function FormEstado({
  vendorId,
  nuevoEstado,
  children,
}: {
  vendorId: string;
  nuevoEstado: "activo" | "suspendido";
  children: React.ReactNode;
}) {
  return (
    <form action={accionCambiarEstadoVendor}>
      <input type="hidden" name="vendorId" value={vendorId} />
      <input type="hidden" name="nuevoEstado" value={nuevoEstado} />
      {children}
    </form>
  );
}

/** Campos compartidos de datos de tienda (edición y alta usan los mismos). */
function CamposTienda({
  idPrefix,
  tienda,
}: {
  idPrefix: string;
  tienda?: Pick<Tienda, "nombre" | "tipo" | "clabe" | "aulaDefault">;
}) {
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${idPrefix}-nombre`} className="text-sm font-medium">
          Nombre
        </label>
        <Input
          id={`${idPrefix}-nombre`}
          name="nombre"
          required
          minLength={3}
          maxLength={80}
          defaultValue={tienda?.nombre}
          placeholder="Club de Robótica UPY"
          className="h-11"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${idPrefix}-tipo`} className="text-sm font-medium">
          Tipo
        </label>
        <Select
          id={`${idPrefix}-tipo`}
          name="tipo"
          defaultValue={tienda?.tipo ?? "emprendimiento"}
          className="h-11"
        >
          <option value="facultad">Facultad</option>
          <option value="club">Club</option>
          <option value="emprendimiento">Emprendimiento</option>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${idPrefix}-clabe`} className="text-sm font-medium">
          CLABE (opcional)
        </label>
        <Input
          id={`${idPrefix}-clabe`}
          name="clabe"
          inputMode="numeric"
          pattern="[0-9]{18}"
          maxLength={18}
          defaultValue={tienda?.clabe ?? ""}
          placeholder="000000000000000000"
          className="h-11 font-mono"
        />
        <p className="text-xs text-muted-foreground">
          18 dígitos — aquí llegan los pagos SPEI de esta tienda.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${idPrefix}-aula`} className="text-sm font-medium">
          Aula de entrega por defecto (opcional)
        </label>
        <Input
          id={`${idPrefix}-aula`}
          name="aulaDefault"
          maxLength={80}
          defaultValue={tienda?.aulaDefault ?? ""}
          placeholder="Edificio A, aula 204"
          className="h-11"
        />
      </div>
    </>
  );
}

/** Card completa de una tienda: datos, estado, miembros, edición y equipo. */
function TarjetaTienda({
  tienda,
  miembros,
  pendiente = false,
}: {
  tienda: Tienda;
  miembros: Miembro[];
  pendiente?: boolean;
}) {
  const sinClabeActiva = tienda.estado === "activo" && !tienda.clabe;

  return (
    <Card className={pendiente ? "border-warning/50" : undefined}>
      <CardContent className="flex flex-col gap-3 pt-4">
        {/* Identidad: nombre + tipo + estado + productos + enlace público. */}
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-heading text-base font-semibold tracking-tight">
            {tienda.nombre}
          </h3>
          <VendorBadge tipo={tienda.tipo} />
          <EstadoBadge estado={tienda.estado} />
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Package className="h-4 w-4" aria-hidden />
            {tienda.productos}{" "}
            {tienda.productos === 1 ? "producto" : "productos"}
          </span>
          <Link
            href={`/tienda/${tienda.slug}`}
            className="inline-flex cursor-pointer items-center gap-1.5 font-medium text-primary transition-colors duration-200 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Ver tienda
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>

        {/* Equipo de la tienda (owner primero por el orden de la consulta). */}
        {miembros.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Sin miembros: nadie puede administrar esta tienda todavía.
          </p>
        ) : (
          <ul className="flex flex-col gap-0.5 text-xs text-muted-foreground">
            {miembros.map((miembro) => (
              <li key={miembro.email}>
                {miembro.rol === "owner" ? "Owner" : "Staff"}:{" "}
                {miembro.name ?? "Sin nombre"} ({miembro.email})
              </li>
            ))}
          </ul>
        )}

        {/* Aviso duro: tienda visible que no puede cobrar por SPEI. */}
        {sinClabeActiva && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <p className="font-medium">
              Sin CLABE: sus compradores no podrán pagar por SPEI.
            </p>
          </div>
        )}

        {/* Acciones de estado según situación actual. */}
        <div className="flex flex-wrap gap-2 border-t pt-3">
          {pendiente ? (
            <>
              <FormEstado vendorId={tienda.id} nuevoEstado="activo">
                <Button
                  type="submit"
                  size="sm"
                  className="gap-2 bg-success text-success-foreground hover:bg-success/90"
                >
                  <CheckCircle2 className="h-4 w-4" aria-hidden />
                  Aprobar
                </Button>
              </FormEstado>
              <FormEstado vendorId={tienda.id} nuevoEstado="suspendido">
                <Button type="submit" size="sm" variant="outline" className="gap-2">
                  <Ban className="h-4 w-4" aria-hidden />
                  Suspender
                </Button>
              </FormEstado>
            </>
          ) : tienda.estado === "activo" ? (
            <FormEstado vendorId={tienda.id} nuevoEstado="suspendido">
              <Button type="submit" size="sm" variant="outline" className="gap-2">
                <Ban className="h-4 w-4" aria-hidden />
                Suspender
              </Button>
            </FormEstado>
          ) : (
            <FormEstado vendorId={tienda.id} nuevoEstado="activo">
              <Button
                type="submit"
                size="sm"
                className="gap-2 bg-success text-success-foreground hover:bg-success/90"
              >
                <RotateCcw className="h-4 w-4" aria-hidden />
                Reactivar
              </Button>
            </FormEstado>
          )}
        </div>

        {/* Edición de datos (colapsada para no saturar la lista). */}
        <details className="rounded-lg border">
          <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm font-medium transition-colors duration-200 hover:text-primary">
            <Pencil className="h-4 w-4" aria-hidden />
            Editar
          </summary>
          <form
            action={accionActualizarVendor}
            className="flex flex-col gap-4 border-t p-3"
          >
            <input type="hidden" name="vendorId" value={tienda.id} />
            <CamposTienda idPrefix={`editar-${tienda.id}`} tienda={tienda} />
            <Button type="submit" className="gap-2 self-start">
              <Save className="h-4 w-4" aria-hidden />
              Guardar
            </Button>
          </form>
        </details>

        {/* Alta de miembro por correo (usuario ya registrado). */}
        <details className="rounded-lg border">
          <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm font-medium transition-colors duration-200 hover:text-primary">
            <UserPlus className="h-4 w-4" aria-hidden />
            Agregar miembro
          </summary>
          <form
            action={accionAgregarMiembro}
            className="flex flex-col gap-4 border-t p-3"
          >
            <input type="hidden" name="vendorId" value={tienda.id} />
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor={`miembro-${tienda.id}-email`}
                className="text-sm font-medium"
              >
                Correo del usuario
              </label>
              <Input
                id={`miembro-${tienda.id}-email`}
                name="email"
                type="email"
                required
                placeholder="alumno@upy.edu.mx"
                className="h-11"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor={`miembro-${tienda.id}-rol`}
                className="text-sm font-medium"
              >
                Rol en la tienda
              </label>
              <Select
                id={`miembro-${tienda.id}-rol`}
                name="rol"
                defaultValue="staff"
                className="h-11"
              >
                <option value="staff">Staff</option>
                <option value="owner">Owner</option>
              </Select>
            </div>
            <Button type="submit" className="gap-2 self-start">
              <UserPlus className="h-4 w-4" aria-hidden />
              Agregar
            </Button>
          </form>
        </details>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------

export default async function AdminVendorsPage({
  searchParams,
}: {
  // Next.js 15: searchParams es una Promise en Server Components.
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  await requireRole("superadmin");
  const { ok, error } = await searchParams;

  // Todas las tiendas con conteo de productos (LEFT JOIN: sin productos = 0).
  const tiendas: Tienda[] = await db
    .select({
      id: vendors.id,
      slug: vendors.slug,
      nombre: vendors.nombre,
      tipo: vendors.tipo,
      clabe: vendors.clabe,
      estado: vendors.estado,
      aulaDefault: vendors.aulaDefault,
      productos: count(products.id),
    })
    .from(vendors)
    .leftJoin(products, eq(products.vendorId, vendors.id))
    .groupBy(vendors.id)
    .orderBy(asc(vendors.nombre));

  // Miembros de TODAS las tiendas en una consulta; se agrupan en memoria.
  const filasMiembros = await db
    .select({
      vendorId: vendorMembers.vendorId,
      rol: vendorMembers.rol,
      name: users.name,
      email: users.email,
    })
    .from(vendorMembers)
    .innerJoin(users, eq(vendorMembers.userId, users.id))
    // Owners primero y, dentro del mismo rol, por antigüedad de alta.
    .orderBy(asc(vendorMembers.rol), asc(vendorMembers.createdAt));

  const miembrosPorTienda = new Map<string, Miembro[]>();
  for (const fila of filasMiembros) {
    const lista = miembrosPorTienda.get(fila.vendorId) ?? [];
    lista.push({ rol: fila.rol, name: fila.name, email: fila.email });
    miembrosPorTienda.set(fila.vendorId, lista);
  }

  // Pendientes primero (cola de aprobación); el resto ya viene por nombre.
  const pendientes = tiendas.filter((t) => t.estado === "pendiente");
  const resto = tiendas.filter((t) => t.estado !== "pendiente");
  const activas = tiendas.filter((t) => t.estado === "activo").length;
  const suspendidas = tiendas.filter((t) => t.estado === "suspendido").length;

  return (
    <div className="flex flex-col gap-4">
      {/* Encabezado + contadores por estado. */}
      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-lg font-semibold tracking-tight">
          Tiendas
        </h1>
        <div className="flex flex-wrap gap-2">
          <Badge variant="success">
            <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
            {activas} {activas === 1 ? "activa" : "activas"}
          </Badge>
          <Badge variant="warning">
            <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
            {pendientes.length}{" "}
            {pendientes.length === 1 ? "pendiente" : "pendientes"}
          </Badge>
          <Badge variant="destructive">
            <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
            {suspendidas} {suspendidas === 1 ? "suspendida" : "suspendidas"}
          </Badge>
        </div>
      </div>

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
            {MENSAJES_ERROR[error] ?? "No se pudo completar la acción."}
          </p>
        </div>
      )}

      {/* Cola de aprobación: SIEMPRE arriba mientras haya pendientes. */}
      {pendientes.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Pendientes de aprobación ({pendientes.length})
          </h2>
          {pendientes.map((tienda) => (
            <TarjetaTienda
              key={tienda.id}
              tienda={tienda}
              miembros={miembrosPorTienda.get(tienda.id) ?? []}
              pendiente
            />
          ))}
        </section>
      )}

      {/* Lista general (activas y suspendidas). */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Todas las tiendas ({resto.length})
        </h2>
        {resto.length === 0 && pendientes.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
              <span className="grid h-14 w-14 place-items-center rounded-full bg-muted">
                <Store className="h-6 w-6 text-muted-foreground" aria-hidden />
              </span>
              <div className="space-y-1">
                <p className="font-medium">Aún no hay tiendas</p>
                <p className="text-sm text-muted-foreground">
                  Crea la primera con el formulario de abajo.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          resto.map((tienda) => (
            <TarjetaTienda
              key={tienda.id}
              tienda={tienda}
              miembros={miembrosPorTienda.get(tienda.id) ?? []}
            />
          ))
        )}
      </section>

      {/* Alta manual de tienda (colapsada al final). */}
      <Card>
        <CardContent className="pt-4">
          <details>
            <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium transition-colors duration-200 hover:text-primary">
              <Plus className="h-4 w-4" aria-hidden />
              Nueva tienda
            </summary>
            <form
              action={accionCrearVendor}
              className="mt-4 flex flex-col gap-4 border-t pt-4"
            >
              <CamposTienda idPrefix="nueva" />
              <div className="flex flex-col gap-1.5">
                <label htmlFor="nueva-owner" className="text-sm font-medium">
                  Correo del owner
                </label>
                <Input
                  id="nueva-owner"
                  name="ownerEmail"
                  type="email"
                  required
                  placeholder="responsable@upy.edu.mx"
                  className="h-11"
                />
                <p className="text-xs text-muted-foreground">
                  Debe ser un usuario ya registrado en la plataforma.
                </p>
              </div>
              <Button type="submit" className="gap-2 self-start">
                <Plus className="h-4 w-4" aria-hidden />
                Crear tienda
              </Button>
            </form>
          </details>
        </CardContent>
      </Card>
    </div>
  );
}
// Fin: gestión de tiendas del superadmin.
