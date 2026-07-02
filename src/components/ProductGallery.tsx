"use client";

// Galería de la ficha de producto: carrusel horizontal con scroll-snap NATIVO
// (sin librerías). Los dots se sincronizan con onScroll usando scrollLeft/clientWidth.
import { useRef, useState } from "react";

export interface ProductGalleryProps {
  imagenes: string[];
  nombre: string;
}

export function ProductGallery({ imagenes, nombre }: ProductGalleryProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [activa, setActiva] = useState(0);

  // Sin imágenes: panel único con placeholder.
  if (imagenes.length === 0) {
    return (
      <div
        className="flex aspect-square w-full items-center justify-center bg-muted"
        role="img"
        aria-label={`${nombre} (sin imagen)`}
      >
        <span className="text-6xl" aria-hidden="true">
          🛍️
        </span>
      </div>
    );
  }

  // Índice activo derivado de la posición de scroll (snap por "página").
  function handleScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    if (el.clientWidth === 0) return;
    const indice = Math.round(el.scrollLeft / el.clientWidth);
    setActiva(Math.min(Math.max(indice, 0), imagenes.length - 1));
  }

  // Los dots también navegan: scroll suave a la imagen elegida.
  function irA(indice: number) {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTo({ left: indice * el.clientWidth, behavior: "smooth" });
  }

  return (
    <div>
      <div
        ref={scrollerRef}
        onScroll={handleScroll}
        className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        aria-label={`Imágenes de ${nombre}`}
      >
        {imagenes.map((src, i) => (
          <div key={`${src}-${i}`} className="w-full flex-none snap-center">
            <img
              src={src}
              alt={`${nombre} — imagen ${i + 1} de ${imagenes.length}`}
              className="aspect-square w-full object-cover"
              loading={i === 0 ? "eager" : "lazy"}
              decoding="async"
              draggable={false}
            />
          </div>
        ))}
      </div>

      {imagenes.length > 1 && (
        <div className="flex justify-center gap-2 py-2" role="tablist">
          {imagenes.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => irA(i)}
              aria-label={`Ver imagen ${i + 1}`}
              aria-current={i === activa}
              className={`h-2.5 w-2.5 rounded-full transition-colors ${
                i === activa ? "bg-primary" : "bg-muted-foreground/30"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
