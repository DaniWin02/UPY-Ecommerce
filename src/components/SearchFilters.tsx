"use client";

// SearchFilters — chips de tipo + bottom sheet de filtros (tienda y rango de precio).
// Mobile-first: targets táctiles >= 44px y fila de chips scrolleable sin scrollbar.
import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetTitle,
  SheetClose,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { FiltrosCatalogo } from "@/lib/catalog";

// Chips de tipo de producto (undefined = sin filtro).
const TIPOS: Array<{ etiqueta: string; valor: FiltrosCatalogo["tipo"] | undefined }> = [
  { etiqueta: "Todos", valor: undefined },
  { etiqueta: "Físico", valor: "fisico" },
  { etiqueta: "Preventa", valor: "preventa" },
  { etiqueta: "Drop", valor: "drop" },
];

interface SearchFiltersProps {
  vendors: Array<{ slug: string; nombre: string }>;
  filtrosActuales: FiltrosCatalogo;
}

export function SearchFilters({ vendors, filtrosActuales }: SearchFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Estado local del sheet (se controla para cerrarlo al aplicar).
  const [abierto, setAbierto] = React.useState(false);
  const [tienda, setTienda] = React.useState(filtrosActuales.tienda ?? "");
  const [min, setMin] = React.useState(filtrosActuales.min?.toString() ?? "");
  const [max, setMax] = React.useState(filtrosActuales.max?.toString() ?? "");

  // Nº de filtros activos del sheet (tienda + rango de precio) para el badge.
  const filtrosActivos = [filtrosActuales.tienda, filtrosActuales.min, filtrosActuales.max].filter(
    (v) => v !== undefined && v !== ""
  ).length;

  // Construye el href de un chip de tipo preservando el resto de params.
  function hrefConTipo(valor: string | undefined): string {
    const params = new URLSearchParams(searchParams.toString());
    if (valor) params.set("tipo", valor);
    else params.delete("tipo");
    const qs = params.toString();
    return qs ? `/?${qs}` : "/";
  }

  // Aplica tienda/min/max sobre los params actuales y navega.
  function aplicarFiltros() {
    const params = new URLSearchParams(searchParams.toString());
    if (tienda) params.set("tienda", tienda);
    else params.delete("tienda");
    if (min) params.set("min", min);
    else params.delete("min");
    if (max) params.set("max", max);
    else params.delete("max");
    const qs = params.toString();
    router.push(qs ? `/?${qs}` : "/");
    setAbierto(false);
  }

  // Limpia los filtros del sheet (conserva búsqueda y tipo).
  function limpiarFiltros() {
    setTienda("");
    setMin("");
    setMax("");
    const params = new URLSearchParams(searchParams.toString());
    params.delete("tienda");
    params.delete("min");
    params.delete("max");
    const qs = params.toString();
    router.push(qs ? `/?${qs}` : "/");
    setAbierto(false);
  }

  return (
    <div className="flex items-center gap-2">
      {/* Fila de chips scrolleable en horizontal con scrollbar oculta */}
      <div className="flex flex-1 gap-2 overflow-x-auto py-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {TIPOS.map((t) => {
          const activo = filtrosActuales.tipo === t.valor;
          return (
            <Link
              key={t.etiqueta}
              href={hrefConTipo(t.valor)}
              className={cn(
                "inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-sm font-medium transition-colors",
                activo
                  ? "border-transparent bg-primary text-primary-foreground"
                  : "border-border bg-card text-foreground hover:bg-muted"
              )}
            >
              {t.etiqueta}
            </Link>
          );
        })}
      </div>

      {/* Botón que abre el sheet de filtros, con contador de filtros activos */}
      <Sheet open={abierto} onOpenChange={setAbierto}>
        <SheetTrigger asChild>
          <Button variant="outline" className="relative min-h-11 shrink-0">
            <SlidersHorizontal className="h-4 w-4" aria-hidden />
            Filtros
            {filtrosActivos > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                {filtrosActivos}
              </span>
            )}
          </Button>
        </SheetTrigger>

        <SheetContent aria-describedby={undefined}>
          <SheetTitle>Filtrar productos</SheetTitle>

          <div className="mt-4 space-y-4">
            {/* Select nativo de tienda, estilizado con los tokens del tema */}
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Tienda</span>
              <select
                value={tienda}
                onChange={(e) => setTienda(e.target.value)}
                className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">Todas las tiendas</option>
                {vendors.map((v) => (
                  <option key={v.slug} value={v.slug}>
                    {v.nombre}
                  </option>
                ))}
              </select>
            </label>

            {/* Rango de precio (sobre el precio comunidad más bajo) */}
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1.5">
                <span className="text-sm font-medium">Precio mín.</span>
                <Input
                  inputMode="numeric"
                  placeholder="$ 0"
                  value={min}
                  onChange={(e) => setMin(e.target.value)}
                  className="h-11"
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-sm font-medium">Precio máx.</span>
                <Input
                  inputMode="numeric"
                  placeholder="$ 999"
                  value={max}
                  onChange={(e) => setMax(e.target.value)}
                  className="h-11"
                />
              </label>
            </div>

            {/* Acciones: aplicar navega con los params; limpiar los elimina */}
            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="min-h-11 flex-1" onClick={limpiarFiltros}>
                Limpiar
              </Button>
              <Button className="min-h-11 flex-1" onClick={aplicarFiltros}>
                Aplicar
              </Button>
            </div>
          </div>

          {/* Cierre accesible (además del cierre por overlay/escape de Radix) */}
          <SheetClose className="sr-only">Cerrar filtros</SheetClose>
        </SheetContent>
      </Sheet>
    </div>
  );
}
