"use client";
// Componentes de tracking (Fase 6): puentes mínimos entre RSC y la analítica
// cliente. Los <Track*> se montan desde páginas server y disparan track()
// en useEffect (una vez por id); todos renderizan null salvo el link.
import Link from "next/link";
import { useEffect, type ReactNode } from "react";
import { track } from "@/lib/analytics";

/** Marca una vista de producto al montar (dedupe por página en lib/analytics). */
export function TrackVistaProducto({
  productId,
  vendorId,
}: {
  productId: string;
  vendorId?: string;
}) {
  useEffect(() => {
    track({ tipo: "vista_producto", productId, vendorId });
  }, [productId, vendorId]);
  return null;
}

/** Marca una vista del escaparate de una tienda al montar. */
export function TrackVistaTienda({ vendorId }: { vendorId: string }) {
  useEffect(() => {
    track({ tipo: "vista_tienda", vendorId });
  }, [vendorId]);
  return null;
}

/** Marca una búsqueda ejecutada; guarda el nº de resultados en metadata. */
export function TrackBusqueda({
  query,
  resultados,
}: {
  query: string;
  resultados: number;
}) {
  useEffect(() => {
    track({ tipo: "busqueda", query, metadata: { resultados } });
  }, [query, resultados]);
  return null;
}

/**
 * Link de producto instrumentado: registra el click_producto (con posición en
 * el listado y origen) y deja seguir la navegación — el evento queda en la
 * cola del módulo (navegación SPA) o sale vía sendBeacon, que sobrevive
 * a la descarga de la página.
 */
export function TrackedProductLink({
  href,
  productId,
  vendorId,
  posicion,
  origen,
  className,
  children,
}: {
  href: string;
  productId: string;
  vendorId?: string;
  posicion?: number;
  origen?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={className}
      onClick={() => {
        // Sin preventDefault: el tracking nunca bloquea ni retrasa la navegación.
        track({
          tipo: "click_producto",
          productId,
          vendorId,
          metadata: { posicion, origen },
        });
      }}
    >
      {children}
    </Link>
  );
}

// Fin de los componentes de tracking.
