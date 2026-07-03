// Panel de universidad — COLA DE REPORTES de conducta (moderación mínima).
// Mismo patrón que la cola de comprobantes del vendor: lista FIFO de
// pendientes, dos veredictos por tarjeta y banners de resultado por redirect.
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Flag,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { asc, desc, eq, ne } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { messageReports } from "@/db/schema/messaging";
import { users } from "@/db/schema/users";
import { requireRole } from "@/lib/session";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { accionResolverReporte } from "./actions";

const FECHA = new Intl.DateTimeFormat("es-MX", {
  dateStyle: "medium",
  timeStyle: "short",
});

// Doble join a users: quien reporta y quien es reportado son filas distintas.
const reporter = alias(users, "reporter");
const reported = alias(users, "reported");

// Nombre visible de un usuario: name, si no email, si no "—" (reported es nullable).
function nombreVisible(name: string | null, email: string | null): string {
  return name ?? email ?? "—";
}

export default async function AdminReportesPage({
  searchParams,
}: {
  // Next.js 15: searchParams es una Promise en Server Components.
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  await requireRole("superadmin");
  const { ok, error } = await searchParams;

  // Cola FIFO: los reportes más viejos primero (los más urgentes de atender).
  const pendientes = await db
    .select({
      id: messageReports.id,
      motivo: messageReports.motivo,
      conversationId: messageReports.conversationId,
      createdAt: messageReports.createdAt,
      reporterName: reporter.name,
      reporterEmail: reporter.email,
      reportedName: reported.name,
      reportedEmail: reported.email,
    })
    .from(messageReports)
    .innerJoin(reporter, eq(messageReports.reporterId, reporter.id))
    .leftJoin(reported, eq(messageReports.reportedUserId, reported.id))
    .where(eq(messageReports.estado, "pendiente"))
    .orderBy(asc(messageReports.createdAt));

  // Histórico corto: últimos 10 resueltos (revisado o descartado).
  const resueltos = await db
    .select({
      id: messageReports.id,
      motivo: messageReports.motivo,
      estado: messageReports.estado,
      createdAt: messageReports.createdAt,
    })
    .from(messageReports)
    .where(ne(messageReports.estado, "pendiente"))
    .orderBy(desc(messageReports.createdAt))
    .limit(10);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-heading text-lg font-semibold tracking-tight">
        Reportes de conducta ({pendientes.length})
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
          <p className="font-medium">No se pudo completar la acción: {error}</p>
        </div>
      )}

      {pendientes.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-muted">
              <ShieldCheck className="h-6 w-6 text-muted-foreground" aria-hidden />
            </span>
            <div className="space-y-1">
              <p className="font-medium">Sin reportes pendientes</p>
              <p className="text-sm text-muted-foreground">
                La comunidad está tranquila: no hay conductas por revisar.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {pendientes.map((reporte) => (
            <li key={reporte.id}>
              <Card>
                <CardContent className="flex flex-col gap-3 pt-4">
                  {/* Fila superior: marca de reporte + fecha de creación. */}
                  <div className="flex items-center justify-between gap-2">
                    <Flag className="h-4 w-4 shrink-0 text-warning" aria-hidden />
                    <p className="text-xs text-muted-foreground">
                      {FECHA.format(reporte.createdAt)}
                    </p>
                  </div>

                  {/* Partes involucradas (el reportado puede ya no existir). */}
                  <div className="space-y-0.5 text-sm">
                    <p>
                      <span className="text-muted-foreground">Reportó:</span>{" "}
                      <span className="font-medium">
                        {nombreVisible(reporte.reporterName, reporte.reporterEmail)}
                      </span>
                    </p>
                    <p>
                      <span className="text-muted-foreground">Reportado:</span>{" "}
                      <span className="font-medium">
                        {nombreVisible(reporte.reportedName, reporte.reportedEmail)}
                      </span>
                    </p>
                  </div>

                  <blockquote className="border-l-2 pl-3 text-sm italic text-muted-foreground">
                    {reporte.motivo}
                  </blockquote>

                  {/* Contexto: el superadmin tiene lectura de moderación del hilo. */}
                  {reporte.conversationId && (
                    <Link
                      href={`/mensajes/${reporte.conversationId}`}
                      className="inline-flex w-fit cursor-pointer items-center gap-1.5 text-sm font-medium text-primary transition-colors duration-200 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      Ver conversación
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                    </Link>
                  )}

                  {/* Veredicto: revisado o descartado (dos forms lado a lado). */}
                  <div className="flex gap-2 border-t pt-3">
                    <form action={accionResolverReporte} className="flex flex-1">
                      <input type="hidden" name="reportId" value={reporte.id} />
                      <input type="hidden" name="resolucion" value="revisado" />
                      <Button type="submit" className="flex-1 gap-2">
                        <CheckCircle2 className="h-4 w-4" aria-hidden />
                        Marcar revisado
                      </Button>
                    </form>
                    <form action={accionResolverReporte} className="flex flex-1">
                      <input type="hidden" name="reportId" value={reporte.id} />
                      <input type="hidden" name="resolucion" value="descartado" />
                      <Button type="submit" variant="outline" className="flex-1 gap-2">
                        <XCircle className="h-4 w-4" aria-hidden />
                        Descartar
                      </Button>
                    </form>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {/* Histórico colapsado: consulta rápida sin ensuciar la cola activa. */}
      {resueltos.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground transition-colors duration-200 hover:text-foreground">
            Resueltos recientes ({resueltos.length})
          </summary>
          <ul className="mt-2 flex flex-col divide-y rounded-lg border bg-card">
            {resueltos.map((reporte) => (
              <li key={reporte.id} className="flex items-center gap-3 px-3 py-2">
                <p className="shrink-0 text-xs text-muted-foreground">
                  {FECHA.format(reporte.createdAt)}
                </p>
                <Badge
                  variant={reporte.estado === "revisado" ? "success" : "outline"}
                  className="shrink-0"
                >
                  {reporte.estado === "revisado" ? "Revisado" : "Descartado"}
                </Badge>
                <p className="line-clamp-1 min-w-0 text-muted-foreground">
                  {reporte.motivo}
                </p>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
// Fin: cola de reportes de conducta del superadmin.
