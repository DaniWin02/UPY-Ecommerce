"use client";

import { ThemeProvider } from "next-themes";

// Providers globales de la aplicación (client component).
// Por ahora solo el tema claro/oscuro; aquí se sumarán auth, query client, etc.
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </ThemeProvider>
  );
}
