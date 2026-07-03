import * as React from "react";
import { cn } from "@/lib/utils";

// Campo de texto base (estilo shadcn/ui)
export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = "text", ...props }, ref) => {
    // TODO: estados de error y descripción accesible (aria-invalid / aria-describedby)
    return (
      <input
        type={type}
        ref={ref}
        className={cn(
          // text-base en móvil evita el auto-zoom de iOS; md:text-sm en desktop.
          "flex h-11 w-full rounded-lg border border-input bg-background px-3 py-2 text-base transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className
        )}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";
