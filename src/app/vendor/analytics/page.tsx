// Panel vendedor — DASHBOARD DE ANALYTICS (Fase 6).
// RSC pura: histórico desde rollups + HOY en vivo (ver src/lib/analytics-queries.ts).
// Gráficas con divs (sin librerías): una sola serie en bg-primary, texto en
// text-foreground/muted, etiquetado selectivo (solo el máximo lleva número).
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  BadgeCheck,
  BarChart3,
  Eye,
  ShieldCheck,
  ShoppingCart,
  Store,
} from "lucide-react";
import { requireVendorMember } from "@/lib/session";
import { resumenVendor, type ResumenVendor } from "@/lib/analytics-queries";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

// Formato monetario MXN consistente (mismo patrón que el resto del panel).
const MXN = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
});

const NUM = new Intl.NumberFormat("es-MX");

// ---------------------------------------------------------------------------
// Stat tile: número héroe + etiqueta + icono lucide en círculo suave.
// ---------------------------------------------------------------------------
function StatTile({
  icono: Icono,
  etiqueta,
  valor,
}: {
  icono: typeof Store;
  etiqueta: string;
  valor: string;
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
          <p className="text-xs text-muted-foreground">{etiqueta}</p>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Barras diarias: finas, rounded-t 4px ancladas a la base; solo el máximo
// lleva número encima; el resto expone su valor vía title + aria-label.
// ---------------------------------------------------------------------------
function GraficaVistasDiarias({
  serie,
}: {
  serie: ResumenVendor["serieDiaria"];
}) {
  const maximo = Math.max(...serie.map((p) => p.vistas));
  // Si hay empate en el máximo, solo el primero lleva número (evita ruido).
  const indiceMaximo = serie.findIndex((p) => p.vistas === maximo);

  return (
    <div>
      {/* pt-6 reserva espacio para el número del máximo sin desbordar. */}
      <div className="flex h-32 items-end gap-1.5 border-b border-border pt-6">
        {serie.map((punto, i) => {
          const pct = maximo > 0 ? Math.round((punto.vistas / maximo) * 100) : 0;
          const esMaximo = maximo > 0 && i === indiceMaximo;
          const descripcion = `${punto.vistas} ${punto.vistas === 1 ? "vista" : "vistas"} — ${punto.fecha}`;
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
                  {NUM.format(punto.vistas)}
                </span>
              )}
              {punto.vistas === 0 ? (
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
// Embudo: filas etiqueta + valor + barra horizontal, con % de paso entre etapas.
// ---------------------------------------------------------------------------
function EmbudoConversion({ funnel }: { funnel: ResumenVendor["funnel"] }) {
  const etapas = [
    { etiqueta: "Vistas", valor: funnel.vistas },
    { etiqueta: "Al carrito", valor: funnel.carrito },
    { etiqueta: "Pedidos", valor: funnel.ordenes },
    { etiqueta: "Pagos verificados", valor: funnel.verificados },
  ];
  const maximo = Math.max(...etapas.map((e) => e.valor));

  return (
    <div className="flex flex-col gap-2">
      {etapas.map((etapa, i) => {
        const previa = i > 0 ? etapas[i - 1] : null;
        const pctPaso =
          previa && previa.valor > 0
            ? Math.round((etapa.valor / previa.valor) * 100)
            : null;
        const ancho = maximo > 0 ? Math.round((etapa.valor / maximo) * 100) : 0;
        return (
          <div key={etapa.etiqueta} className="flex flex-col gap-1">
            {previa && (
              <p className="text-xs text-muted-foreground">
                {pctPaso === null ? "—" : `${pctPaso}% de conversión`}
              </p>
            )}
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-medium">{etapa.etiqueta}</span>
              <span className="text-sm font-medium tabular-nums">
                {NUM.format(etapa.valor)}
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-muted">
              <div
                className="h-2 rounded-full bg-primary"
                style={{ width: `${ancho}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Página.
// ---------------------------------------------------------------------------
export default async function VendorAnalyticsPage() {
  // DECISIÓN MVP (patrón del repo): se opera sobre la PRIMERA membresía;
  // superadmin sin tienda propia no tiene métricas que ver aquí.
  const { memberships } = await requireVendorMember();
  const vendor = memberships[0];
  if (!vendor) redirect("/");

  const resumen = await resumenVendor(vendor.vendorId);

  // Empty state global: sin un solo dato en los 7 días.
  const sinDatos =
    resumen.visitasTienda7d === 0 &&
    resumen.vistasProducto7d === 0 &&
    resumen.addsCarrito7d === 0 &&
    resumen.ordenesCreadas7d === 0 &&
    resumen.pagosVerificados7d === 0;

  const maxVistasTop = Math.max(...resumen.topProductos.map((p) => p.vistas), 0);

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h1 className="font-heading text-xl font-semibold tracking-tight md:text-2xl">
          Analytics
        </h1>
        <p className="text-sm text-muted-foreground">
          Últimos 7 días · {vendor.nombre}
        </p>
      </div>

      {sinDatos ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-muted">
              <BarChart3 className="h-6 w-6 text-muted-foreground" aria-hidden />
            </span>
            <div className="space-y-1">
              <p className="font-medium">Aún no hay datos suficientes</p>
              <p className="text-sm text-muted-foreground">
                Comparte tu tienda para empezar a medir.
              </p>
            </div>
            <Button asChild variant="outline">
              <Link href={`/tienda/${vendor.slug}`}>Ver mi tienda</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Stat tiles 2×2 */}
          <div className="grid grid-cols-2 gap-3">
            <StatTile
              icono={Store}
              etiqueta="Visitas a la tienda"
              valor={NUM.format(resumen.visitasTienda7d)}
            />
            <StatTile
              icono={Eye}
              etiqueta="Vistas de producto"
              valor={NUM.format(resumen.vistasProducto7d)}
            />
            <StatTile
              icono={ShoppingCart}
              etiqueta="Pedidos"
              valor={NUM.format(resumen.ordenesCreadas7d)}
            />
            <StatTile
              icono={BadgeCheck}
              etiqueta="Ingreso verificado"
              valor={MXN.format(Number(resumen.ingresoVerificado7d))}
            />
          </div>

          {/* Serie diaria de vistas de producto */}
          <Card>
            <CardHeader className="pb-3">
              <h2 className="font-heading text-sm font-semibold tracking-tight">
                Vistas de producto por día
              </h2>
            </CardHeader>
            <CardContent>
              <GraficaVistasDiarias serie={resumen.serieDiaria} />
            </CardContent>
          </Card>

          {/* Embudo de conversión */}
          <Card>
            <CardHeader className="pb-3">
              <h2 className="font-heading text-sm font-semibold tracking-tight">
                Embudo de conversión
              </h2>
            </CardHeader>
            <CardContent>
              <EmbudoConversion funnel={resumen.funnel} />
            </CardContent>
          </Card>

          {/* Top productos por vistas */}
          <Card>
            <CardHeader className="pb-3">
              <h2 className="font-heading text-sm font-semibold tracking-tight">
                Top productos
              </h2>
            </CardHeader>
            <CardContent>
              {resumen.topProductos.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Ningún producto registra vistas todavía.
                </p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {resumen.topProductos.map((producto) => {
                    const ancho =
                      maxVistasTop > 0
                        ? Math.round((producto.vistas / maxVistasTop) * 100)
                        : 0;
                    return (
                      <li key={producto.productId} className="flex flex-col gap-1">
                        <div className="flex items-baseline justify-between gap-3">
                          <Link
                            href={`/producto/${producto.productId}`}
                            className="line-clamp-1 min-w-0 cursor-pointer text-sm font-medium transition-colors duration-200 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            {producto.nombre}
                          </Link>
                          <span className="shrink-0 text-sm tabular-nums">
                            {NUM.format(producto.vistas)}{" "}
                            {producto.vistas === 1 ? "vista" : "vistas"}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="h-2 flex-1 rounded-full bg-muted">
                            <div
                              className="h-2 rounded-full bg-primary"
                              style={{ width: `${ancho}%` }}
                            />
                          </div>
                          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                            {MXN.format(Number(producto.ingresoVerificado))}
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Nota de privacidad (contrato con los compradores) */}
      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        Métricas agregadas y anónimas. Nunca verás datos individuales de un
        comprador.
      </p>
    </section>
  );
}
// Fin: dashboard de analytics del vendedor.
