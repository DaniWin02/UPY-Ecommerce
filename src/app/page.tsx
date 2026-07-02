// Home: el catálogo ES la portada del marketplace Ágora (RSC async, mobile-first).
import Link from "next/link";
import { Search } from "lucide-react";
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

  // Catálogo y tiendas en paralelo (todo en servidor).
  const [productos, tiendas] = await Promise.all([
    buscarProductos(filtros),
    listarVendorsActivos(),
  ]);

  return (
    <main className="pb-20">
      <div className="container space-y-4 pt-4">
        {/* Buscador: form GET nativo para funcionar sin JS */}
        <form action="/" method="GET" className="flex gap-2">
          <Input
            type="search"
            name="q"
            placeholder="Buscar en el campus…"
            defaultValue={filtros.q}
            className="h-11 flex-1"
          />
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
        <h1 className="text-lg font-semibold">
          {filtros.q ? `Resultados para "${filtros.q}"` : "Explora el campus"}
        </h1>

        {productos.length === 0 ? (
          // Empty state con salida rápida a limpiar filtros
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <span className="text-4xl" aria-hidden>
              🔍
            </span>
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
