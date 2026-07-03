// Composer del hilo de mensajes: form RSC fijo al fondo que delega en la
// server action accionEnviarMensaje. En móvil se levanta por encima del
// tabbar (4rem) + safe area; en desktop se pega al borde inferior.
import { SendHorizonal } from "lucide-react";
import { accionEnviarMensaje } from "@/app/mensajes/actions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function MensajeComposer({ conversationId }: { conversationId: string }) {
  return (
    <form
      action={accionEnviarMensaje}
      className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 border-t bg-background/95 p-3 backdrop-blur md:bottom-0 md:pb-safe"
    >
      <div className="mx-auto flex max-w-2xl gap-2">
        <input type="hidden" name="conversationId" value={conversationId} />
        <Input
          name="cuerpo"
          required
          maxLength={2000}
          placeholder="Escribe un mensaje…"
          autoComplete="off"
          className="flex-1"
        />
        <Button
          type="submit"
          size="icon"
          aria-label="Enviar"
          className="h-11 w-11 shrink-0"
        >
          <SendHorizonal className="h-4 w-4" aria-hidden />
        </Button>
      </div>
    </form>
  );
}
