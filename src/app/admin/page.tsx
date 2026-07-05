// Panel de universidad — DASHBOARD (página índice /admin).
// OJO SEGURIDAD: el guard va TAMBIÉN aquí (no solo en el layout) — en App
// Router layout y página renderizan EN PARALELO y con streaming el payload
// RSC de la página puede viajar aunque el layout redirija.
// Gráficas con divs (sin librerías, reglas del skill dataviz): una sola serie
// en bg-primary, texto SIEMPRE en tokens, etiqueta numérica solo en el máximo.
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Flag,
  Network,
  ReceiptText,
  Settings,
  ShoppingCart,
  Store,
  Users,
} from "lucide-react";
import { statsPlataforma, type StatsPlataforma } from "@/lib/admin-stats";
import { requireRole } from "@/lib/session";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

// Formatos consistentes con el resto del repo (es-MX).
const MXN = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
});
const NUM = new Intl.NumberFormat("es-MX");
const FECHA_LARGA = new Intl.DateTimeFormat("es-MX", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

// Etiquetas españolas + punto de color por estado (mismo mapa de badges que
// las páginas de pedidos: pendiente=warning, revisión=secondary,
// verificado/preparando/listo/entregado=success, terminal malo=destructive).
const ESTADO_PEDIDO: Record<string, { etiqueta: string; punto: string }> = {
  pendiente_pago: { etiqueta: "Pendiente de pago", punto: "bg-warning" },
  comprobante_enviado: { etiqueta: "En revisión", punto: "bg-muted-foreground" },
  pago_verificado: { etiqueta: "Pago verificado", punto: "bg-success" },
  preparando: { etiqueta: "Preparando", punto: "bg-success" },
  listo_entrega: { etiqueta: "Listo para entrega", punto: "bg-success" },
  entregado: { etiqueta: "Entregado", punto: "bg-success" },
  rechazado: { etiqueta: "Comprobante rechazado", punto: "bg-destructive" },
  expirado: { etiqueta: "Expirado", punto: "bg-destructive" },
  cancelado: { etiqueta: "Cancelado", punto: "bg-destructive" },
};

// ---------------------------------------------------------------------------
// Stat tile: número héroe font-heading tabular-nums + icono en círculo suave.
// ---------------------------------------------------------------------------
function StatTile({
  icono: Icono,
  etiqueta,
  valor,
  sub,
}: {
  icono: typeof Store;
  etiqueta: string;
  valor: string;
  sub?: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10">
          <Icono className="h-5 w-5 text-primary" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="truncate font-heading text-2xl font-semibold tabular-nums tracking-tight">
            {valor}
          </p>
          <p className="text-xs text-muted-foreground">
            {etiqueta}
            {sub ? <span className="text-success"> · {sub}</span> : null}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Barras diarias de órdenes: finas, rounded-t ancladas a la base; solo el
// máximo lleva número; el resto expone su valor vía title + aria-label.
// ---------------------------------------------------------------------------
function GraficaOrdenesDiarias({
  serie,
}: {
  serie: StatsPlataforma["serieOrdenes7d"];
}) {
  const maximo = Math.max(...serie.map((p) => p.n));
  // Si hay empate en el máximo, solo el primero lleva número (evita ruido).
  const indiceMaximo = serie.findIndex((p) => p.n === maximo);

  return (
    <div>
      {/* pt-6 reserva espacio para el número del máximo sin desbordar. */}
      <div className="flex h-32 items-end gap-1.5 border-b border-border pt-6">
        {serie.map((punto, i) => {
          const pct = maximo > 0 ? Math.round((punto.n / maximo) * 100) : 0;
          const esMaximo = maximo > 0 && i === indiceMaximo;
          const descripcion = `${punto.n} ${punto.n === 1 ? "pedido" : "pedidos"} — ${punto.fecha}`;
          return (
            <div
              key={punto.fecha}
              role="img"
              aria-label={descripcion}
              title={descripcion}
              className="relative flex h-full flex-1 items-end"
            >
              {esMaximo && (
                <span
                  className="absolute inset-x-0 text-center text-xs font-medium tabular-nums text-foreground"
                  style={{ bottom: `calc(${pct}% + 4px)` }}
                >
                  {NUM.format(punto.n)}
                </span>
              )}
              {punto.n === 0 ? (
                // Barra de valor 0: trazo visible pero recesivo.
                <div className="mx-auto h-0.5 w-full max-w-9 bg-muted-foreground/20" />
              ) : (
                <div
                  className="mx-auto w-full max-w-9 rounded-t-[4px] bg-primary"
                  style={{ height: `${pct}%` }}
                />
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex gap-1.5">
        {serie.map((punto) => (
          <span
            key={punto.fecha}
            className="flex-1 text-center text-[10px] text-muted-foreground"
            aria-hidden
          >
            {punto.fecha}
          </span>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Página.
// ---------------------------------------------------------------------------
export default async function AdminDashboardPage() {
  await requireRole("superadmin"); // guard propio de la página (ver cabecera)
  const stats = await statsPlataforma();

  const maxPorEstado = Math.max(...stats.ordenesPorEstado.map((f) => f.n), 0);

  const accesos = [
    { href: "/admin/vendors", label: "Tiendas", icon: Store },
    { href: "/admin/usuarios", label: "Usuarios", icon: Users },
    { href: "/admin/reportes", label: "Reportes", icon: Flag },
    { href: "/admin/reglas-ip", label: "Reglas IP", icon: Network },
    { href: "/admin/config", label: "Config", icon: Settings },
  ] as const;

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h1 className="font-heading text-xl font-semibold tracking-tight md:text-2xl">
          Resumen de la plataforma
        </h1>
        <p className="text-sm text-muted-foreground">
          {FECHA_LARGA.format(new Date())}
        </p>
      </div>

      {/* Alertas accionables (solo si hay algo pendiente) */}
      {(stats.tiendasPendientes > 0 ||
        stats.reportesPendientes > 0 ||
        stats.comprobantesEnRevision > 0) && (
        <div className="grid gap-3 md:grid-cols-3">
          {stats.tiendasPendientes > 0 && (
            <Link
              href="/admin/vendors"
              className="flex cursor-pointer items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning transition-colors duration-200 hover:border-warning/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Store className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span className="min-w-0">
                <span className="font-medium tabular-nums">
                  {NUM.format(stats.tiendasPendientes)}{" "}
                  {stats.tiendasPendientes === 1
                    ? "tienda espera aprobación"
                    : "tiendas esperan aprobación"}
                </span>
                <ArrowRight className="ml-1 inline h-3.5 w-3.5" aria-hidden />
              </span>
            </Link>
          )}
          {stats.reportesPendientes > 0 && (
            <Link
              href="/admin/reportes"
              className="flex cursor-pointer items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive transition-colors duration-200 hover:border-destructive/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Flag className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span className="min-w-0">
                <span className="font-medium tabular-nums">
                  {NUM.format(stats.reportesPendientes)}{" "}
                  {stats.reportesPendientes === 1
                    ? "reporte por revisar"
                    : "reportes por revisar"}
                </span>
                <ArrowRight className="ml-1 inline h-3.5 w-3.5" aria-hidden />
              </span>
            </Link>
          )}
          {stats.comprobantesEnRevision > 0 && (
            <div className="flex items-start gap-2 rounded-lg border p-3 text-sm">
              <ReceiptText
                className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                aria-hidden
              />
              <span className="min-w-0">
                <span className="font-medium tabular-nums">
                  {NUM.format(stats.comprobantesEnRevision)}{" "}
                  {stats.comprobantesEnRevision === 1
                    ? "comprobante en revisión"
                    : "comprobantes en revisión"}
                </span>{" "}
                <span className="text-muted-foreground">
                  · los verifica cada tienda
                </span>
              </span>
            </div>
          )}
        </div>
      )}

      {/* Stat tiles 2×2 (4 en md) */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile
          icono={Users}
          etiqueta="Usuarios"
          valor={NUM.format(stats.usuarios)}
          sub={`+${NUM.format(stats.usuariosNuevos30d)} en 30 d`}
        />
        <StatTile
          icono={Store}
          etiqueta="Tiendas activas"
          valor={NUM.format(stats.tiendasActivas)}
        />
        <StatTile
          icono={ShoppingCart}
          etiqueta="Pedidos 30 d"
          valor={NUM.format(stats.ordenes30d)}
        />
        <StatTile
          icono={BadgeCheck}
          etiqueta="GMV verificado 30 d"
          valor={MXN.format(Number(stats.gmvVerificado30d))}
        />
      </div>

      {/* Serie diaria de pedidos */}
      <Card>
        <CardHeader className="pb-3">
          <h2 className="font-heading text-sm font-semibold tracking-tight">
            Pedidos por día (7 d)
          </h2>
        </CardHeader>
        <CardContent>
          <GraficaOrdenesDiarias serie={stats.serieOrdenes7d} />
        </CardContent>
      </Card>

      {/* Pedidos por estado */}
      <Card>
        <CardHeader className="pb-3">
          <h2 className="font-heading text-sm font-semibold tracking-tight">
            Pedidos por estado
          </h2>
        </CardHeader>
        <CardContent>
          {stats.ordenesPorEstado.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Todavía no hay pedidos en la plataforma.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {stats.ordenesPorEstado.map((fila) => {
                const info = ESTADO_PEDIDO[fila.estado] ?? {
                  etiqueta: fila.estado,
                  punto: "bg-muted-foreground",
                };
                const ancho =
                  maxPorEstado > 0
                    ? Math.round((fila.n / maxPorEstado) * 100)
                    : 0;
                return (
                  <li key={fila.estado} className="flex flex-col gap-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="flex items-center gap-1.5 text-sm font-medium">
                        <span
                          aria-hidden
                          className={`h-1.5 w-1.5 rounded-full ${info.punto}`}
                        />
                        {info.etiqueta}
                      </span>
                      <span className="shrink-0 text-sm tabular-nums">
                        {NUM.format(fila.n)}
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-muted">
                      <div
                        className="h-2 rounded-full bg-primary"
                        style={{ width: `${ancho}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Accesos rápidos */}
      <div>
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Accesos rápidos
        </h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {accesos.map((acceso) => {
            const Icono = acceso.icon;
            return (
              <Link
                key={acceso.href}
                href={acceso.href}
                className="flex cursor-pointer items-center gap-2.5 rounded-xl border bg-card p-3 text-sm font-medium shadow-sm transition-all duration-200 hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/10">
                  <Icono className="h-4 w-4 text-primary" aria-hidden />
                </span>
                {acceso.label}
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
// Fin: dashboard de la plataforma (SuperAdmin).
