// Bandeja de mensajes: conversaciones del usuario como comprador y, si tiene
// membresías, las de cada tienda suya. RSC puro con polling suave (60 s).
// La página sirve a AMBOS roles: NO usa requireVendorMember (redirigiría).
import Link from "next/link";
import { AlertTriangle, MessageSquare } from "lucide-react";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { vendorMembers, vendors } from "@/db/schema/vendors";
import { requireUser } from "@/lib/session";
import {
  listarConversacionesComprador,
  listarConversacionesVendor,
} from "@/lib/messaging";
import { Card, CardContent } from "@/components/ui/card";
import { PollingRefresh } from "@/components/PollingRefresh";

// Una fila de la bandeja, tal como la devuelve el dominio.
type Conversacion = Awaited<ReturnType<typeof listarConversacionesComprador>>[number];

// Hora relativa CORTA para la bandeja ("ahora", "5 min", "3 h", "2 d", fecha).
function horaCorta(fecha: Date | null): string {
  if (!fecha) return "";
  const min = Math.floor((Date.now() - fecha.getTime()) / 60_000);
  if (min < 1) return "ahora";
  if (min < 60) return `${min} min`;
  const horas = Math.floor(min / 60);
  if (horas < 24) return `${horas} h`;
  const dias = Math.floor(horas / 24);
  if (dias < 7) return `${dias} d`;
  return fecha.toLocaleDateString("es-MX", { day: "numeric", month: "short" });
}

// Fila clickeable de conversación (avatar inicial + título + preview + no leídos).
function FilaConversacion({ convo }: { convo: Conversacion }) {
  const inicial = (convo.titulo.trim().charAt(0) || "?").toUpperCase();
  return (
    <li>
      <Link
        href={`/mensajes/${convo.id}`}
        className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Card className="cursor-pointer transition-all duration-200 hover:border-primary/40 hover:shadow-md">
          <CardContent className="flex items-center gap-3 pt-4 md:pt-4">
            <span
              aria-hidden
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 font-heading font-semibold text-primary"
            >
              {inicial}
            </span>
            <div className="min-w-0 flex-1 space-y-0.5">
              <p className="line-clamp-1 font-medium">{convo.titulo}</p>
              {convo.contexto && (
                <p className="line-clamp-1 text-xs text-muted-foreground">
                  {convo.contexto}
                </p>
              )}
              <p className="line-clamp-1 text-sm text-muted-foreground">
                {convo.preview}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <span className="text-xs text-muted-foreground">
                {horaCorta(convo.fecha)}
              </span>
              {convo.noLeidos > 0 && (
                <span
                  aria-label={`${convo.noLeidos} mensajes sin leer`}
                  className="grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1.5 text-xs font-medium text-primary-foreground"
                >
                  {convo.noLeidos}
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      </Link>
    </li>
  );
}

export default async function MensajesPage({
  searchParams,
}: {
  // Next.js 15: searchParams es una Promise en Server Components.
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const user = await requireUser();

  // Conversaciones como comprador (todo usuario las tiene).
  const comoComprador = await listarConversacionesComprador(user.id);

  // "Mis tiendas": membresías del usuario, SIN redirigir si no tiene ninguna.
  const membresias = await db
    .select({ vendorId: vendorMembers.vendorId, nombre: vendors.nombre })
    .from(vendorMembers)
    .innerJoin(vendors, eq(vendorMembers.vendorId, vendors.id))
    .where(eq(vendorMembers.userId, user.id))
    .orderBy(vendorMembers.vendorId);

  // Bandeja de cada tienda suya (una sección por vendor).
  const porTienda = await Promise.all(
    membresias.map(async (m) => ({
      ...m,
      conversaciones: await listarConversacionesVendor(m.vendorId),
    }))
  );

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-4">
      <h1 className="font-heading text-xl font-semibold tracking-tight md:text-2xl">
        Mensajes
      </h1>

      {/* Banner de error del último intento (viene del redirect de las actions). */}
      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p className="font-medium">
            {error === "Bloqueado"
              ? "No puedes contactar a esta tienda."
              : `No se pudo completar la acción: ${error}`}
          </p>
        </div>
      )}

      {/* Sección comprador */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Conversaciones
        </h2>

        {comoComprador.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-10 text-center md:py-10">
              <span className="grid h-14 w-14 place-items-center rounded-full bg-muted">
                <MessageSquare className="h-6 w-6 text-muted-foreground" aria-hidden />
              </span>
              <div className="space-y-1">
                <p className="font-medium">Aún no tienes conversaciones</p>
                <p className="text-sm text-muted-foreground">
                  Pregunta a una tienda desde cualquier producto.
                </p>
              </div>
              {/* Link con estilo de botón (patrón del repo para CTAs de empty state). */}
              <Link
                href="/"
                className="inline-flex h-10 cursor-pointer items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:opacity-80"
              >
                Explorar el campus
              </Link>
            </CardContent>
          </Card>
        ) : (
          <ul className="space-y-3">
            {comoComprador.map((convo) => (
              <FilaConversacion key={convo.id} convo={convo} />
            ))}
          </ul>
        )}
      </section>

      {/* Secciones por tienda (solo si el usuario es miembro y hay conversaciones). */}
      {porTienda
        .filter((tienda) => tienda.conversaciones.length > 0)
        .map((tienda) => (
          <section key={tienda.vendorId} className="space-y-3">
            <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
              De mi tienda: {tienda.nombre}
            </h2>
            <ul className="space-y-3">
              {tienda.conversaciones.map((convo) => (
                <FilaConversacion key={convo.id} convo={convo} />
              ))}
            </ul>
          </section>
        ))}

      {/* La bandeja se refresca sola cada minuto (contadores y previews). */}
      <PollingRefresh activo intervaloMs={60000} />
    </main>
  );
}
