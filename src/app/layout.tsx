import type { Metadata, Viewport } from "next";
import { Inter, Poppins } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { AppShell } from "@/components/layout/AppShell";

// Fuente principal de la app, expuesta como variable CSS para Tailwind (font-sans).
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

// Fuente de títulos (h1-h3, precios grandes, logo) según MASTER — Tailwind: font-heading.
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-heading",
});

// PWA mínima instalable: manifest + iconos, SIN service worker a propósito.
// El modo offline no aporta en un marketplace en vivo y una caché mal invalidada
// durante un drop (stock/estados de pedido obsoletos) es un footgun.
export const metadata: Metadata = {
  title: "Ágora Campus",
  description:
    "Marketplace universitario: compra y vende dentro de tu campus con pagos SPEI verificados.",
  manifest: "/manifest.webmanifest",
  // Comunidad cerrada: fuera de buscadores.
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "Ágora", statusBarStyle: "default" },
  icons: { icon: "/icons/icon.svg" },
};

// viewportFit: "cover" es necesario para las utilidades de safe-area en iOS.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // Color de la barra del navegador/SO: guinda de marca en claro, fondo oscuro en dark.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#8f1433" },
    { media: "(prefers-color-scheme: dark)", color: "#171213" },
  ],
};

// RootLayout: contenedor raíz de la aplicación Ágora (marketplace universitario).
// El shell de navegación (header + tab bar móvil) vive en AppShell.
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" suppressHydrationWarning className={`${inter.variable} ${poppins.variable}`}>
      <body className="min-h-dvh bg-background font-sans">
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
