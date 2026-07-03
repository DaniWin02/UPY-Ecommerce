// Home: el catálogo ES la portada del marketplace Ágora (RSC async, mobile-first).
import Link from "next/link";
import { Search, SearchX } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ProductCard } from "@/components/ProductCard";
import { SearchFilters } from "@/components/SearchFilters";
import {
  buscarProductos,
  listarVendorsActivos,
  type FiltrosCatalogo,
} from "@/lib/catalog";

// Tipos válidos para validar el searchParam `tipo` contra la unión.
const TIPOS_VALIDOS = ["fisico", "preventa", "drop"] as const;

// Convierte un searchParam a número válido (o undefined si no aplica).
function aNumero(valor: string | undefined): number | undefined {
  if (!valor) return undefined;
  const n = Number(valor);
  return Number.isFinite(n) ? n : undefined;
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  // Next 15: searchParams es una Promise y hay que esperarla.
  const sp = await searchParams;

  const filtros: FiltrosCatalogo = {
    q: sp.q?.trim() || undefined,
    tienda: sp.tienda || undefined,
    tipo: TIPOS_VALIDOS.includes(sp.tipo as (typeof TIPOS_VALIDOS)[number])
      ? (sp.tipo as FiltrosCatalogo["tipo"])
      : undefined,
    min: aNumero(sp.min),
    max: aNumero(sp.max),
  };

  // Sin filtro alguno se muestra el hero de bienvenida (portada limpia).
  const sinFiltros =
    !filtros.q &&
    !filtros.tienda &&
    !filtros.tipo &&
    filtros.min === undefined &&
    filtros.max === undefined;

  // Catálogo y tiendas en paralelo (todo en servidor).
  const [productos, tiendas] = await Promise.all([
    buscarProductos(filtros),
    listarVendorsActivos(),
  ]);

  return (
    <main className="pb-20">
      <div className="container space-y-4 pt-4">
        {/* Hero compacto de bienvenida: solo en la portada sin filtros */}
        {sinFiltros && (
          <section className="rounded-xl bg-gradient-to-br from-primary to-primary/80 p-5 text-primary-foreground">
            <h2 className="font-heading text-lg font-semibold tracking-tight">
              El marketplace de tu campus
            </h2>
            <p className="mt-1 text-sm opacity-90">
              Compra a facultades, clubes y emprendimientos de tu comunidad.
            </p>
          </section>
        )}

        {/* Buscador: form GET nativo para funcionar sin JS */}
        <form action="/" method="GET" className="flex gap-2">
          <div className="relative flex-1">
            <Search
              className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              type="search"
              name="q"
              placeholder="Buscar en el campus…"
              defaultValue={filtros.q}
              className="h-11 w-full pl-9"
            />
          </div>
          {/* Preserva el resto de filtros al buscar */}
          {filtros.tienda && <input type="hidden" name="tienda" value={filtros.tienda} />}
          {filtros.tipo && <input type="hidden" name="tipo" value={filtros.tipo} />}
          {filtros.min !== undefined && <input type="hidden" name="min" value={filtros.min} />}
          {filtros.max !== undefined && <input type="hidden" name="max" value={filtros.max} />}
          <Button type="submit" size="icon" className="h-11 w-11" aria-label="Buscar">
            <Search className="h-5 w-5" aria-hidden />
          </Button>
        </form>

        {/* Chips de tipo + sheet de filtros (tienda y precio) */}
        <SearchFilters vendors={tiendas} filtrosActuales={filtros} />

        {/* Título de sección según haya búsqueda o no */}
        <h1 className="font-heading text-lg font-semibold tracking-tight">
          {filtros.q ? `Resultados para "${filtros.q}"` : "Explora el campus"}
        </h1>

        {productos.length === 0 ? (
          // Empty state con salida rápida a limpiar filtros
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-muted" aria-hidden>
              <SearchX className="h-6 w-6 text-muted-foreground" />
            </span>
            <p className="font-medium">Sin resultados</p>
            <p className="text-sm text-muted-foreground">
              No encontramos productos con esos filtros
            </p>
            <Link href="/" className="text-sm font-medium text-primary underline underline-offset-4">
              Limpiar filtros
            </Link>
          </div>
        ) : (
          // Grid responsiva del catálogo: 2 columnas en móvil, hasta 4 en desktop
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
            {productos.map((p) => (
              <Link key={p.id} href={`/producto/${p.id}`}>
                <ProductCard
                  id={p.id}
                  nombre={p.nombre}
                  vendedor={p.vendorNombre}
                  vendorSlug={p.vendorSlug}
                  precio={p.precioDesde}
                  precioComunidad={p.precioComunidadDesde}
                  stockDisponible={p.stockDisponible}
                  tipo={p.tipo}
                  imagenUrl={p.imagenUrl}
                />
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
