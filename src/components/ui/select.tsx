import * as React from "react";
import { cn } from "@/lib/utils";

// Select nativo estilizado (shadcn simple, sin Radix).
// Se usa con <option> hijos normales; funciona en Server Components.
export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <select
        ref={ref}
        className={cn(
          // text-base en móvil evita el auto-zoom de iOS; md:text-sm en desktop.
          "flex h-11 w-full appearance-none rounded-lg border border-input bg-background px-3 py-2 text-base transition-colors placeholder:text-muted-foreground focus-visible:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className
        )}
        {...props}
      >
        {children}
      </select>
    );
  }
);
Select.displayName = "Select";
