"use client";

// Selector de variante (talla/color) con precio, stock y barra CTA fija.
// Importa SOLO el tipo desde el módulo de servidor (se borra al compilar).
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { VarianteConStock } from "@/lib/producto";

export interface VariantSelectorProps {
  variantes: VarianteConStock[];
}

// Formato de moneda MXN (los precios llegan como numeric-string de Postgres).
const formatoMXN = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
});

function formatearMXN(valor: string): string {
  return formatoMXN.format(Number(valor));
}

// Etiqueta del chip: "M · Negro"; si la variante no tiene atributos, el SKU.
function etiquetaVariante(v: VarianteConStock): string {
  const partes = [v.atributos?.talla, v.atributos?.color].filter(Boolean);
  return partes.length > 0 ? partes.join(" · ") : v.sku || "Única";
}

export function VariantSelector({ variantes }: VariantSelectorProps) {
  // Default: primera variante con stock; si todas están agotadas, la primera.
  const [seleccionadaId, setSeleccionadaId] = useState<string | null>(
    () =>
      (variantes.find((v) => v.disponible > 0) ?? variantes[0])?.id ?? null
  );

  const seleccionada =
    variantes.find((v) => v.id === seleccionadaId) ?? variantes[0] ?? null;

  if (!seleccionada) {
    return (
      <p className="text-sm text-muted-foreground">
        Este producto aún no tiene variantes disponibles.
      </p>
    );
  }

  const agotada = seleccionada.disponible === 0;

  return (
    <div className="space-y-4">
      {/* Chips de variantes (agotadas siguen siendo seleccionables para verlas). */}
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Variantes">
        {variantes.map((v) => {
          const activa = v.id === seleccionada.id;
          return (
            <button
              key={v.id}
              type="button"
              role="radio"
              aria-checked={activa}
              onClick={() => setSeleccionadaId(v.id)}
              className={[
                "min-h-11 rounded-full border px-4 py-2 text-sm transition-colors",
                activa
                  ? "border-primary bg-primary/10 font-medium"
                  : "border-input hover:bg-accent",
                v.disponible === 0 ? "line-through opacity-50" : "",
              ].join(" ")}
            >
              {etiquetaVariante(v)}
            </button>
          );
        })}
      </div>

      {/* Precio y disponibilidad de la variante seleccionada. */}
      <div className="space-y-1">
        <p className="text-2xl font-bold">{formatearMXN(seleccionada.precio)}</p>
        {seleccionada.precioComunidad && (
          <p className="text-sm font-medium text-success">
            Precio comunidad: {formatearMXN(seleccionada.precioComunidad)}
          </p>
        )}
        {agotada ? (
          <p className="text-sm font-medium text-destructive">Agotado</p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Disponibles: {seleccionada.disponible}
          </p>
        )}
      </div>

      {/* Barra CTA fija: en móvil va SOBRE la tabbar sumándole el safe-area
          inferior (4rem = altura de la tabbar + env(safe-area-inset-bottom),
          que la tabbar ya absorbe con su propio padding); en escritorio al ras
          del viewport, donde el padding seguro sí vive en esta barra (md:pb-safe). */}
      <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 border-t bg-background/95 p-3 backdrop-blur md:bottom-0 md:pb-safe">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <p className="text-lg font-bold">{formatearMXN(seleccionada.precio)}</p>
          {/* TODO Fase 4: conectar con el carrito (por ahora el click no hace nada). */}
          <Button type="button" size="lg" disabled={agotada} className="flex-1">
            {agotada ? "Agotado" : "Agregar al carrito"}
          </Button>
        </div>
      </div>
    </div>
  );
}
