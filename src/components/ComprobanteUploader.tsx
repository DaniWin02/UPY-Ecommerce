"use client";

import * as React from "react";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  FileText,
  Image as ImageIcon,
  Loader2,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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

  // Quita el archivo elegido para volver a seleccionar otro.
  function deshacerSeleccion() {
    if (estado === "enviando") return;
    setArchivo(null);
    setPreviewUrl(null);
    setEstado("idle");
    setMensaje(null);
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
        setMensaje("Comprobante enviado. La tienda lo revisará pronto.");
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
    <div className="space-y-3 rounded-xl border bg-card p-4 shadow-sm">
      <p className="font-heading text-sm font-medium tracking-tight">
        Sube tu comprobante de pago
      </p>

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

      {/* Dos rutas de captura como cards táctiles. */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => inputCamaraRef.current?.click()}
          disabled={estado === "enviando"}
          className="flex h-20 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed text-muted-foreground transition-colors hover:border-primary/50 hover:bg-muted/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
        >
          <Camera className="h-5 w-5" aria-hidden />
          <span className="text-xs font-medium">Tomar foto</span>
        </button>
        <button
          type="button"
          onClick={() => inputGaleriaRef.current?.click()}
          disabled={estado === "enviando"}
          className="flex h-20 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed text-muted-foreground transition-colors hover:border-primary/50 hover:bg-muted/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
        >
          <ImageIcon className="h-5 w-5" aria-hidden />
          <span className="text-xs font-medium">Galería o PDF</span>
        </button>
      </div>

      {archivo && (
        <div className="space-y-3">
          {/* Preview del archivo elegido: thumbnail (imagen) o icono (PDF). */}
          <Card>
            <CardContent className="flex items-center gap-3 p-3">
              {previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- preview local (blob:), next/image no aplica
                <img
                  src={previewUrl}
                  alt="Vista previa del comprobante"
                  className="h-16 w-16 shrink-0 rounded-lg border bg-muted object-cover"
                />
              ) : (
                <span className="grid h-16 w-16 shrink-0 place-items-center rounded-lg bg-muted">
                  <FileText className="h-8 w-8 text-muted-foreground" aria-hidden />
                </span>
              )}
              <p className="min-w-0 flex-1 truncate text-sm font-medium">
                {archivo.name}
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={deshacerSeleccion}
                disabled={estado === "enviando"}
                aria-label="Quitar archivo seleccionado"
                className="shrink-0 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" aria-hidden />
              </Button>
            </CardContent>
          </Card>

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
            className="w-full gap-2"
          >
            {estado === "enviando" ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Enviando…
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" aria-hidden />
                Enviar comprobante
              </>
            )}
          </Button>
        </div>
      )}

      {mensaje && (
        <div
          role={estado === "exito" ? "status" : "alert"}
          className={
            estado === "exito"
              ? "flex items-start gap-2 rounded-lg border border-success/30 bg-success/10 p-3 text-sm text-success"
              : "flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
          }
        >
          {estado === "exito" ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          ) : (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          )}
          <p className="font-medium">{mensaje}</p>
        </div>
      )}

      <p className="text-xs text-muted-foreground">JPG, PNG, WebP o PDF · máx 8 MB</p>
    </div>
  );
}
