// utils.ts — utilidades compartidas de la UI/lógica de Ágora.
// Combina clases de Tailwind resolviendo conflictos. Lo usan los componentes.

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * cn — combina clases condicionales (clsx) y resuelve colisiones de Tailwind (tailwind-merge).
 * Ejemplo: cn("px-2", condicion && "px-4") => "px-4"
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

// Fin de utils.ts
