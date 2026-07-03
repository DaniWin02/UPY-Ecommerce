"use client";

// Selector de variante (talla/color) con precio, stock y barra CTA fija.
// Importa SOLO el tipo desde el módulo de servidor (se borra al compilar).
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, Check, Loader2, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { agregarAlCarrito } from "@/app/(store)/carrito/actions";
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
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // Resultado del último intento de agregar (se autolimpia a los 2.5 s).
  const [feedback, setFeedback] = useState<null | {
    ok: boolean;
    mensaje: string;
  }>(null);

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

  // Agrega 1 unidad de la variante seleccionada y refresca datos del servidor
  // (badge del carrito) si salió bien; el feedback se limpia solo.
  function handleAgregar() {
    startTransition(async () => {
      const r = await agregarAlCarrito(seleccionada.id, 1);
      setFeedback(r);
      if (r.ok) router.refresh();
      setTimeout(() => setFeedback(null), 2500);
    });
  }

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
                "h-10 cursor-pointer rounded-lg border px-3 text-sm transition-colors duration-200",
                activa
                  ? "border-primary bg-primary/5 font-medium text-primary ring-1 ring-primary/30"
                  : "border-input hover:bg-muted",
                v.disponible === 0 ? "line-through opacity-40" : "",
              ].join(" ")}
            >
              {etiquetaVariante(v)}
            </button>
          );
        })}
      </div>

      {/* Precio y disponibilidad de la variante seleccionada. */}
      <div className="space-y-1">
        <p className="font-heading text-2xl font-bold tracking-tight">
          {formatearMXN(seleccionada.precio)}
        </p>
        {seleccionada.precioComunidad && (
          <p className="inline-flex items-center gap-1 text-sm font-medium text-success">
            <BadgeCheck className="h-3.5 w-3.5" aria-hidden />
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
          <p className="font-heading text-lg font-bold tracking-tight">
            {formatearMXN(seleccionada.precio)}
          </p>
          <Button
            type="button"
            size="lg"
            disabled={agotada || isPending}
            onClick={handleAgregar}
            className={[
              "flex-1 gap-2",
              feedback?.ok
                ? "bg-success text-success-foreground hover:bg-success/90"
                : "",
            ].join(" ")}
          >
            {agotada ? (
              "Agotado"
            ) : isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Agregando…
              </>
            ) : feedback?.ok ? (
              <>
                <Check className="h-4 w-4" aria-hidden />
                Agregado
              </>
            ) : (
              <>
                <ShoppingCart className="h-4 w-4" aria-hidden />
                Agregar al carrito
              </>
            )}
          </Button>
        </div>
        {/* Mensaje de error del servidor (stock insuficiente, sesión, etc.). */}
        {feedback && !feedback.ok && (
          <p
            role="alert"
            className="mx-auto mt-1 max-w-lg text-xs text-destructive"
          >
            {feedback.mensaje}
          </p>
        )}
      </div>
    </div>
  );
}
