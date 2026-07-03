// Hilo de conversación: header sticky con acciones de moderación, chip de
// contexto (producto/pedido), burbujas de chat y composer fijo. RSC con
// polling corto (10 s) + marcado de leída desde el cliente.
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  MoreVertical,
  Package,
  ReceiptText,
} from "lucide-react";
import { requireUser } from "@/lib/session";
import { obtenerConversacion } from "@/lib/messaging";
import { accionReportar, accionBloquear } from "@/app/mensajes/actions";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { MensajeComposer } from "@/components/MensajeComposer";
import { MarcarLeida } from "@/components/MarcarLeida";
import { PollingRefresh } from "@/components/PollingRefresh";

// Un chatId que ni siquiera es UUID jamás será una conversación: 404 directo
// sin tocar la BD (evita errores de cast de Postgres).
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Hora corta de cada burbuja (formato local 24 h es-MX).
function horaMensaje(fecha: Date): string {
  return fecha.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
}

export default async function ConversacionPage({
  params,
  searchParams,
}: {
  // Next.js 15: params y searchParams son Promises en Server Components.
  params: Promise<{ chatId: string }>;
  searchParams: Promise<{ reportado?: string; error?: string }>;
}) {
  const { chatId } = await params;
  const { reportado, error } = await searchParams;
  if (!UUID_RE.test(chatId)) notFound();

  const user = await requireUser();

  // El dominio devuelve null si no existe O si el usuario no participa:
  // mismo 404 en ambos casos (no revelamos que la conversación existe).
  const convo = await obtenerConversacion(chatId, user.id);
  if (!convo) notFound();

  const inicial = (convo.titulo.trim().charAt(0) || "?").toUpperCase();

  return (
    <main className="mx-auto flex min-h-svh max-w-2xl flex-col">
      {/* Header sticky: volver, identidad del interlocutor y menú de moderación. */}
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
        <div className="flex items-center gap-2 p-3">
          <Link
            href="/mensajes"
            aria-label="Volver a mensajes"
            className="grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-md transition-colors duration-200 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:opacity-80"
          >
            <ArrowLeft className="h-5 w-5" aria-hidden />
          </Link>

          <span
            aria-hidden
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/10 font-heading font-semibold text-primary"
          >
            {inicial}
          </span>

          <div className="min-w-0 flex-1">
            {convo.rolUsuario === "comprador" ? (
              // El comprador habla con una tienda: el título enlaza a su escaparate.
              <Link
                href={`/tienda/${convo.vendorSlug}`}
                className="line-clamp-1 font-heading font-semibold tracking-tight hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {convo.titulo}
              </Link>
            ) : (
              <p className="line-clamp-1 font-heading font-semibold tracking-tight">
                {convo.titulo}
              </p>
            )}
          </div>

          {/* Menú simple sin JS: details/summary (reportar y bloquear). */}
          <details className="relative shrink-0">
            <summary
              aria-label="Opciones de la conversación"
              className="grid h-11 w-11 cursor-pointer list-none place-items-center rounded-md transition-colors duration-200 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:opacity-80 [&::-webkit-details-marker]:hidden"
            >
              <MoreVertical className="h-5 w-5" aria-hidden />
            </summary>
            <div className="absolute right-0 top-12 z-50 w-72 space-y-1 rounded-xl border bg-card p-2 shadow-md">
              <details>
                <summary className="cursor-pointer list-none rounded-md px-3 py-2.5 text-sm transition-colors duration-200 hover:bg-accent [&::-webkit-details-marker]:hidden">
                  Reportar conversación
                </summary>
                <form action={accionReportar} className="space-y-2 p-2">
                  <input type="hidden" name="conversationId" value={convo.id} />
                  <Textarea
                    name="motivo"
                    required
                    maxLength={500}
                    placeholder="Cuéntanos qué pasó…"
                  />
                  <Button type="submit" size="sm" className="w-full">
                    Enviar reporte
                  </Button>
                </form>
              </details>
              <form action={accionBloquear}>
                <input type="hidden" name="blockedId" value={convo.otroUsuarioId} />
                <button
                  type="submit"
                  className="w-full cursor-pointer rounded-md px-3 py-2.5 text-left text-sm text-destructive transition-colors duration-200 hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:opacity-80"
                >
                  Bloquear
                </button>
              </form>
            </div>
          </details>
        </div>
      </header>

      {/* Banners de resultado (vienen del redirect de las actions). */}
      {(reportado === "1" || error) && (
        <div className="space-y-2 px-4 pt-3">
          {reportado === "1" && (
            <div
              role="status"
              className="flex items-start gap-2 rounded-lg border border-success/30 bg-success/10 p-3 text-sm text-success"
            >
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <p className="font-medium">
                Reporte enviado; lo revisará la administración.
              </p>
            </div>
          )}
          {error && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <p className="font-medium">No se pudo completar la acción: {error}</p>
            </div>
          )}
        </div>
      )}

      {/* Chip de contexto: el producto o pedido del que nació la conversación. */}
      {convo.contexto && (
        <div className="px-4 pt-3">
          <Link
            href={
              convo.contexto.tipo === "producto"
                ? `/producto/${convo.contexto.id}`
                : `/pedidos/${convo.contexto.id}`
            }
            className="inline-flex max-w-full cursor-pointer items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-xs transition-colors duration-200 hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {convo.contexto.tipo === "producto" ? (
              <Package className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            ) : (
              <ReceiptText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            )}
            <span className="line-clamp-1 font-medium">{convo.contexto.etiqueta}</span>
          </Link>
        </div>
      )}

      {/* Hilo de mensajes (pb-32 deja aire para el composer fijo). */}
      <div className="flex flex-1 flex-col gap-2 p-4 pb-32">
        {convo.mensajes.map((mensaje) => (
          <div
            key={mensaje.id}
            className={
              mensaje.propio
                ? "max-w-[80%] self-end rounded-2xl rounded-br-sm bg-primary px-3.5 py-2 text-sm text-primary-foreground"
                : "max-w-[80%] self-start rounded-2xl rounded-bl-sm bg-muted px-3.5 py-2 text-sm"
            }
          >
            <p className="whitespace-pre-wrap break-words">{mensaje.cuerpo}</p>
            <p className="mt-0.5 text-right text-[10px] opacity-60">
              {horaMensaje(mensaje.createdAt)}
            </p>
          </div>
        ))}
      </div>

      {/* Marca leída al abrir y refresca contadores; polling corto del hilo. */}
      <MarcarLeida conversationId={convo.id} />
      <PollingRefresh activo intervaloMs={10000} />
      <MensajeComposer conversationId={convo.id} />
    </main>
  );
}
