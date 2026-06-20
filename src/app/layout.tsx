import "./globals.css";

// RootLayout: contenedor raíz de la aplicación Ágora (marketplace universitario).
// TODO: envolver con providers (auth con Google @uni, tema claro/oscuro) y
// TODO: agregar header/nav global (logo, buscador, carrito, menú de cuenta).
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
