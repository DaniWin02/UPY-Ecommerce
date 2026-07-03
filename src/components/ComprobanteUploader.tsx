"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface ComprobanteUploaderProps {
  /** Pedido al que pertenece el comprobante. */
  orderId: string;
}

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB (mismo límite que el servidor)

type EstadoEnvio = "idle" | "enviando" | "exito" | "error";

export function ComprobanteUploader({ orderId }: ComprobanteUploaderProps) {
  // DOS inputs separados: en Android, un único input con `capture` fuerza la
  // cámara y BLOQUEA elegir de galería; separarlos da ambas rutas siempre.
  const inputCamaraRef = React.useRef<HTMLInputElement>(null);
  const inputGaleriaRef = React.useRef<HTMLInputElement>(null);

  const [archivo, setArchivo] = React.useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [monto, setMonto] = React.useState("");
  const [estado, setEstado] = React.useState<EstadoEnvio>("idle");
  const [mensaje, setMensaje] = React.useState<string | null>(null);

  // Liberar el object URL del preview al reemplazarlo o desmontar.
  React.useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function manejarSeleccion(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Permite volver a elegir el mismo archivo tras un error.
    e.target.value = "";
    if (!file) return;

    if (file.size > MAX_BYTES) {
      setArchivo(null);
      setPreviewUrl(null);
      setEstado("error");
      setMensaje("El archivo supera el máximo de 8 MB. Elige uno más ligero.");
      return;
    }

    setEstado("idle");
    setMensaje(null);
    setArchivo(file);
    setPreviewUrl(file.type.startsWith("image/") ? URL.createObjectURL(file) : null);
  }

  async function enviar() {
    if (!archivo || estado === "enviando") return;
    setEstado("enviando");
    setMensaje(null);

    try {
      const formData = new FormData();
      formData.append("file", archivo);
      if (monto.trim() !== "") formData.append("montoDeclarado", monto.trim());

      const res = await fetch(`/api/orders/${orderId}/comprobante`, {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        setEstado("exito");
        setMensaje("¡Comprobante enviado! La tienda lo revisará pronto.");
        // Recarga para que el timeline (RSC) refleje "comprobante_enviado".
        setTimeout(() => window.location.reload(), 1000);
        return;
      }

      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      setEstado("error");
      setMensaje(data?.error ?? "No se pudo enviar el comprobante. Intenta de nuevo.");
    } catch {
      setEstado("error");
      setMensaje("Error de red al enviar el comprobante. Revisa tu conexión.");
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-dashed p-4">
      <p className="text-sm font-medium">Sube tu comprobante de pago</p>

      {/* Inputs ocultos: cámara (con capture) y galería/PDF (sin capture). */}
      <input
        ref={inputCamaraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={manejarSeleccion}
      />
      <input
        ref={inputGaleriaRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        className="hidden"
        onChange={manejarSeleccion}
      />

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => inputCamaraRef.current?.click()}
          disabled={estado === "enviando"}
        >
          📷 Tomar foto
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => inputGaleriaRef.current?.click()}
          disabled={estado === "enviando"}
        >
          🖼️ Galería o PDF
        </Button>
      </div>

      {archivo && (
        <div className="space-y-3">
          {/* Preview: imagen inline o nombre del PDF. */}
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- preview local (blob:), next/image no aplica
            <img
              src={previewUrl}
              alt="Vista previa del comprobante"
              className="max-h-64 w-auto rounded-md border object-contain"
            />
          ) : (
            <p className="rounded-md border bg-muted px-3 py-2 text-sm">
              📄 {archivo.name}
            </p>
          )}

          <div className="space-y-1">
            <label htmlFor="monto-declarado" className="text-sm font-medium">
              Monto transferido (opcional)
            </label>
            <Input
              id="monto-declarado"
              inputMode="decimal"
              placeholder="Ej. 350.00"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              disabled={estado === "enviando"}
            />
          </div>

          <Button
            type="button"
            onClick={enviar}
            disabled={estado === "enviando" || estado === "exito"}
          >
            {estado === "enviando" ? "Enviando…" : "Enviar comprobante"}
          </Button>
        </div>
      )}

      {mensaje && (
        <p
          className={
            estado === "exito"
              ? "text-sm font-medium text-success"
              : "text-sm font-medium text-destructive"
          }
        >
          {mensaje}
        </p>
      )}

      <p className="text-xs text-muted-foreground">JPG, PNG, WebP o PDF · máx 8 MB</p>
    </div>
  );
}
