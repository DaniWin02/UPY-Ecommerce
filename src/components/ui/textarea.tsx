import * as React from "react";
import { cn } from "@/lib/utils";

// Área de texto base (estilo shadcn/ui, sin dependencias extra)
export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    // Mismas clases base que Input, con altura mínima para varias líneas.
    return (
      <textarea
        ref={ref}
        className={cn(
          // text-base en móvil evita el auto-zoom de iOS; md:text-sm en desktop.
          "flex min-h-[80px] w-full rounded-lg border border-input bg-background px-3 py-2 text-base transition-colors placeholder:text-muted-foreground focus-visible:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className
        )}
        {...props}
      />
    );
  }
);
Textarea.displayName = "Textarea";
