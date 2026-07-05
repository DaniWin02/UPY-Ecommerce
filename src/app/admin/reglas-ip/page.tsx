// Panel de universidad — REGLAS DE ACCESO POR IP (superadmin).
// Diagnóstico del gate por env + CRUD de reglas CIDR de BD (scope admin/global)
// que ipPermitidaParaAdmin combina con la red del campus para el candado admin.
import { headers } from "next/headers";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Network,
  Plus,
  Trash2,
} from "lucide-react";
import { extraerIpCliente, ipEnCampus } from "@/lib/ip-rules";
import { listarReglas } from "@/lib/ip-rules-db";
import { requireRole } from "@/lib/session";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { accionCrearRegla, accionEliminarRegla, accionToggleRegla } from "./actions";

const FECHA = new Intl.DateTimeFormat("es-MX", {
  dateStyle: "medium",
  timeStyle: "short",
});

// Mensajes legibles para los banners de error del redirect.
const ERRORES: Record<string, string> = {
  Validacion: "Los datos del formulario no son válidos.",
  CidrInvalido: "El CIDR no es válido (usa IPv4, p. ej. 10.0.0.0/16).",
  NoEncontrada: "La regla ya no existe (quizá otro admin la eliminó).",
};

export default async function AdminReglasIpPage({
  searchParams,
}: {
  // Next.js 15: searchParams es una Promise en Server Components.
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  await requireRole("superadmin");
  const { ok, error } = await searchParams;

  // Diagnóstico: misma extracción de IP que usa el layout admin (XFF +
  // TRUSTED_PROXIES), para que lo que se muestra aquí coincida con lo que
  // evalúa el candado ADMIN_SOLO_IP_CAMPUS.
  const cabeceras = await headers();
  const ipDetectada =
    extraerIpCliente(
      cabeceras.get("x-forwarded-for"),
      Number(process.env.TRUSTED_PROXIES ?? "0")
    ) ?? "0.0.0.0";

  const gateGlobalActivo = process.env.IP_GATE_ENABLED === "true";
  const campusCidrs = (process.env.CAMPUS_CIDRS ?? "")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
  const enCampus = ipEnCampus(ipDetectada);

  const reglas = await listarReglas();

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-heading text-lg font-semibold tracking-tight">
        Reglas de acceso por IP
      </h1>

      {/* Banners de resultado de la última acción (vienen del redirect). */}
      {ok && (
        <div
          role="status"
          className="flex items-start gap-2 rounded-lg border border-success/30 bg-success/10 p-3 text-sm text-success"
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p className="font-medium">Acción realizada correctamente.</p>
        </div>
      )}
      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p className="font-medium">{ERRORES[error] ?? `No se pudo completar la acción: ${error}`}</p>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Diagnóstico: qué ve el servidor AHORA y cómo está el gate por env.  */}
      {/* ------------------------------------------------------------------ */}
      <Card>
        <CardHeader>
          <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Diagnóstico
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div className="space-y-0.5">
              <dt className="text-muted-foreground">Tu IP detectada</dt>
              <dd className="font-mono font-medium">{ipDetectada}</dd>
            </div>
            <div className="space-y-0.5">
              <dt className="text-muted-foreground">Gate global (IP_GATE_ENABLED)</dt>
              <dd>
                <Badge variant={gateGlobalActivo ? "success" : "outline"}>
                  {gateGlobalActivo ? "Encendido" : "Apagado"}
                </Badge>
              </dd>
            </div>
            <div className="space-y-0.5">
              <dt className="text-muted-foreground">CIDRs del campus (CAMPUS_CIDRS)</dt>
              <dd className="font-mono">
                {campusCidrs.length > 0 ? campusCidrs.join(", ") : "sin configurar"}
              </dd>
            </div>
            <div className="space-y-0.5">
              <dt className="text-muted-foreground">¿Tu IP cae en el campus?</dt>
              <dd className="flex items-center gap-1.5 font-medium">
                {enCampus ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-success" aria-hidden />
                    <span className="text-success">Sí, dentro de la red del campus</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="h-4 w-4 text-warning" aria-hidden />
                    <span className="text-warning">No, fuera de la red del campus</span>
                  </>
                )}
              </dd>
            </div>
          </dl>

          {/* Nota de alcance: qué controla env y qué controlan estas reglas. */}
          <div className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/10 p-3 text-sm text-primary">
            <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <p className="leading-relaxed">
              El gate global de toda la tienda se controla por variables de
              entorno del despliegue (IP_GATE_ENABLED / CAMPUS_CIDRS). Las
              reglas de esta tabla aplican al acceso del panel de
              administración (candado ADMIN_SOLO_IP_CAMPUS).
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* Alta de regla: CIDR + scope + acción + prioridad.                   */}
      {/* ------------------------------------------------------------------ */}
      <Card>
        <CardHeader>
          <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Nueva regla
          </p>
        </CardHeader>
        <CardContent>
          <form
            action={accionCrearRegla}
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
          >
            <div className="space-y-1 lg:col-span-2">
              <label htmlFor="cidr" className="text-sm font-medium">
                Rango CIDR
              </label>
              <Input
                id="cidr"
                name="cidr"
                required
                placeholder="10.0.0.0/16"
                className="font-mono"
                autoComplete="off"
                inputMode="numeric"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="scope" className="text-sm font-medium">
                Ámbito
              </label>
              <Select id="scope" name="scope" defaultValue="admin" required>
                <option value="admin">Admin (recomendado)</option>
                <option value="global">Global</option>
              </Select>
            </div>
            <div className="space-y-1">
              <label htmlFor="accion" className="text-sm font-medium">
                Acción
              </label>
              <Select id="accion" name="accion" defaultValue="allow" required>
                <option value="allow">Permitir (allow)</option>
                <option value="deny">Denegar (deny)</option>
              </Select>
            </div>
            <div className="space-y-1">
              <label htmlFor="prioridad" className="text-sm font-medium">
                Prioridad (0-100)
              </label>
              <Input
                id="prioridad"
                name="prioridad"
                type="number"
                min={0}
                max={100}
                step={1}
                defaultValue={0}
                required
              />
            </div>
            <div className="flex items-end sm:col-span-2 lg:col-span-5">
              <Button type="submit" className="gap-2">
                <Plus className="h-4 w-4" aria-hidden />
                Agregar
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* Lista de reglas persistidas (orden: scope, prioridad DESC).         */}
      {/* ------------------------------------------------------------------ */}
      {reglas.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-muted">
              <Network className="h-6 w-6 text-muted-foreground" aria-hidden />
            </span>
            <div className="space-y-1">
              <p className="font-medium">Sin reglas</p>
              <p className="text-sm leading-relaxed text-muted-foreground">
                El acceso admin se rige solo por ADMIN_SOLO_IP_CAMPUS y la red
                del campus.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <ul className="flex flex-col divide-y rounded-xl border bg-card shadow-sm">
          {reglas.map((regla) => (
            <li
              key={regla.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3"
            >
              <p className="min-w-32 font-mono text-sm font-medium">{regla.cidr}</p>

              <Badge variant="secondary">{regla.scope}</Badge>

              {regla.accion === "allow" ? (
                <Badge variant="success">allow</Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="border-destructive/30 bg-destructive/10 text-destructive"
                >
                  deny
                </Badge>
              )}

              <p className="text-xs text-muted-foreground">
                Prioridad {regla.prioridad}
              </p>

              <p className="hidden text-xs text-muted-foreground sm:block">
                {FECHA.format(regla.createdAt)}
              </p>

              <div className="ml-auto flex items-center gap-2">
                {/* Toggle de estado: botón que renderiza el Badge Activa/Inactiva. */}
                <form action={accionToggleRegla}>
                  <input type="hidden" name="reglaId" value={regla.id} />
                  <button
                    type="submit"
                    className="cursor-pointer rounded-full transition-opacity duration-200 hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:opacity-80"
                    aria-label={
                      regla.activo
                        ? `Desactivar la regla ${regla.cidr}`
                        : `Activar la regla ${regla.cidr}`
                    }
                  >
                    <Badge variant={regla.activo ? "success" : "outline"}>
                      {regla.activo ? "Activa" : "Inactiva"}
                    </Badge>
                  </button>
                </form>

                <form action={accionEliminarRegla}>
                  <input type="hidden" name="reglaId" value={regla.id} />
                  <Button
                    type="submit"
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-destructive"
                    aria-label={`Eliminar la regla ${regla.cidr}`}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </Button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
// Fin: administración de reglas de acceso por IP.
