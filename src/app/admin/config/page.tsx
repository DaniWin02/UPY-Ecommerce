// Panel admin — CONFIGURACIÓN INSTITUCIONAL (superadmin).
// RSC: carga la única institución del despliegue y los datos de entorno;
// las escrituras van por server actions con banner de resultado (redirect).
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  MapPin,
  Plus,
  Save,
  X,
} from "lucide-react";
import { db } from "@/db";
import { institutions } from "@/db/schema/users";
import { allowedEmailDomains } from "@/lib/auth-domains";
import { requireRole } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  accionActualizarInstitucion,
  accionAgregarPunto,
  accionEliminarPunto,
} from "./actions";

// Mensajes amigables para los códigos de error que devuelven las actions.
const MENSAJES_ERROR: Record<string, string> = {
  NombreInvalido: "El nombre debe tener entre 3 y 120 caracteres.",
  DominioInvalido:
    "Alguna línea no parece un dominio válido (ejemplo: alumno.upy.edu.mx).",
  MaximoDominios: "Máximo 10 dominios en la lista.",
  PuntoInvalido: "El punto de entrega debe tener entre 2 y 80 caracteres.",
  PuntoDuplicado: "Ese punto de entrega ya está en la lista.",
  MaximoPuntos: "Máximo 20 puntos de entrega.",
  SinInstitucion:
    "Primero guarda la institución (tarjeta de arriba) para poder registrar puntos.",
};

export default async function AdminConfigPage({
  searchParams,
}: {
  // Next.js 15: searchParams es una Promise en Server Components.
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  await requireRole("superadmin");
  const { ok, error } = await searchParams;

  // Única institución del despliegue (el seed crea una: UPY).
  const [institucion] = await db.select().from(institutions).limit(1);
  const config = (institucion?.config ?? {}) as { puntosEntrega?: string[] };
  const puntos = config.puntosEntrega ?? [];

  // Dominios que SÍ permiten login hoy (vienen de la env, no de la BD).
  const dominiosActivos = allowedEmailDomains();

  // Datos de despliegue (solo lectura, para diagnóstico rápido).
  const ipGate = process.env.IP_GATE_ENABLED === "true";
  const e2eActivo = process.env.E2E_TEST_MODE === "true";
  const usaBlob = Boolean(process.env.BLOB_READ_WRITE_TOKEN);

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-4">
      <h1 className="font-heading text-xl font-semibold tracking-tight md:text-2xl">
        Configuración institucional
      </h1>

      {/* Banners de resultado de la última acción (vienen del redirect). */}
      {ok && (
        <div
          role="status"
          className="flex items-start gap-2 rounded-lg border border-success/30 bg-success/10 p-3 text-sm text-success"
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p className="font-medium">Cambios guardados correctamente.</p>
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

      {/* ------------------------------------------------------------------ */}
      {/* Card 1: Institución (nombre + dominios documentales)                */}
      {/* ------------------------------------------------------------------ */}
      <Card>
        <CardHeader>
          <h2 className="font-heading text-base font-semibold tracking-tight">
            Institución
          </h2>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {/* AVISO CLAVE: la lista de la BD NO controla el login todavía.
              Variante "info" del patrón de banners de MASTER.md; no existe token
              --info en tailwind.config, así que se usa primary como tinte info. */}
          <div className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/10 p-3 text-sm text-primary">
            <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <p className="leading-relaxed">
              Los dominios que realmente permiten iniciar sesión se configuran
              en el despliegue (variable{" "}
              <code className="font-mono text-xs">ALLOWED_EMAIL_DOMAINS</code>).
              Actualmente activos:{" "}
              <span className="font-medium">{dominiosActivos.join(", ")}</span>.
              Esta lista de aquí es informativa/documental hasta V1.
            </p>
          </div>

          <form action={accionActualizarInstitucion} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="nombre" className="text-sm font-medium">
                Nombre de la institución
              </label>
              <Input
                id="nombre"
                name="nombre"
                required
                minLength={3}
                maxLength={120}
                defaultValue={institucion?.nombre ?? ""}
                placeholder="Universidad Politécnica de Yucatán"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="dominios" className="text-sm font-medium">
                Dominios de correo (uno por línea)
              </label>
              <Textarea
                id="dominios"
                name="dominios"
                rows={4}
                defaultValue={(institucion?.dominios ?? []).join("\n")}
                placeholder={"alumno.upy.edu.mx\nupy.edu.mx"}
              />
              <p className="text-xs text-muted-foreground">
                Máximo 10. Se normalizan a minúsculas y sin arroba inicial.
              </p>
            </div>

            <Button type="submit" className="w-fit gap-2">
              <Save className="h-4 w-4" aria-hidden />
              Guardar institución
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* Card 2: Puntos de entrega del campus                                */}
      {/* ------------------------------------------------------------------ */}
      <Card>
        <CardHeader>
          <h2 className="font-heading text-base font-semibold tracking-tight">
            Puntos de entrega del campus
          </h2>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {puntos.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aún no hay puntos de entrega registrados.
            </p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {puntos.map((punto) => (
                <li key={punto}>
                  {/* Chip con eliminación inline: un form chico por punto. */}
                  <form
                    action={accionEliminarPunto}
                    className="inline-flex items-center gap-1.5 rounded-full border bg-muted/50 py-1 pl-3 pr-1 text-sm"
                  >
                    <MapPin
                      className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                      aria-hidden
                    />
                    <span>{punto}</span>
                    <input type="hidden" name="punto" value={punto} />
                    <button
                      type="submit"
                      aria-label={`Eliminar punto ${punto}`}
                      className="grid h-6 w-6 cursor-pointer place-items-center rounded-full text-muted-foreground transition-colors duration-200 hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:opacity-80"
                    >
                      <X className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}

          <form action={accionAgregarPunto} className="flex gap-2">
            <Input
              name="punto"
              required
              minLength={2}
              maxLength={80}
              placeholder="Edificio A, planta baja"
              aria-label="Nuevo punto de entrega"
            />
            <Button type="submit" variant="outline" className="shrink-0 gap-2">
              <Plus className="h-4 w-4" aria-hidden />
              Agregar
            </Button>
          </form>

          <p className="text-xs text-muted-foreground">
            Referencia operativa para las tiendas; el checkout los ofrecerá en V1.
          </p>
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* Card 3: Datos del despliegue (solo lectura)                         */}
      {/* ------------------------------------------------------------------ */}
      <Card>
        <CardHeader>
          <h2 className="font-heading text-base font-semibold tracking-tight">
            Datos del despliegue
          </h2>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">Gate por IP</span>
            <span className="font-medium">{ipGate ? "Activo" : "Desactivado"}</span>
          </div>

          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">Modo de pruebas E2E</span>
            {e2eActivo ? (
              <span className="inline-flex items-center gap-1.5 font-medium text-destructive">
                <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
                Activo — NUNCA en producción
              </span>
            ) : (
              <span className="font-medium">Desactivado</span>
            )}
          </div>

          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">Almacén de comprobantes</span>
            <span className="font-medium">{usaBlob ? "Vercel Blob" : "Disco local"}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
// Fin: configuración institucional del superadmin.
