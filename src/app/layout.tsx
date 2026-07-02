import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

// Fuente principal de la app, expuesta como variable CSS para Tailwind (font-sans).
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "Ágora Campus",
  description:
    "Marketplace universitario: compra y vende dentro de tu campus con pagos SPEI verificados.",
};

// viewportFit: "cover" es necesario para las utilidades de safe-area en iOS.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// RootLayout: contenedor raíz de la aplicación Ágora (marketplace universitario).
// TODO: agregar header/nav global (logo, buscador, carrito, menú de cuenta).
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" suppressHydrationWarning className={inter.variable}>
      <body className="min-h-dvh bg-background font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
