"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";

export interface ComprobanteUploaderProps {
  /** Se invoca al seleccionar un archivo válido */
  onArchivo?: (archivo: File) => void;
  /** Tipos aceptados (imagen y PDF por defecto) */
  accept?: string;
}

// TODO: subir el comprobante al backend/storage, validar tamaño/tipo y mostrar progreso.
export function ComprobanteUploader({
  onArchivo,
  accept = "image/*,application/pdf",
}: ComprobanteUploaderProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);

  function manejarCambio(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    // TODO: validar tamaño máximo y previsualizar imagen/PDF
    if (archivo) onArchivo?.(archivo);
  }

  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-6 text-center">
      <p className="text-sm text-muted-foreground">
        Sube tu comprobante de pago (imagen o PDF)
      </p>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        // `capture` permite abrir la cámara en móvil; la galería sigue disponible
        capture="environment"
        className="hidden"
        onChange={manejarCambio}
      />
      <Button type="button" onClick={() => inputRef.current?.click()}>
        Seleccionar archivo
      </Button>
      {/* TODO: vista previa del comprobante y botón para reemplazar */}
    </div>
  );
}
