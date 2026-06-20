import type { Config } from "tailwindcss";

// Configuración de TailwindCSS para Ágora Campus.
// Los tokens de color/radio/tipografía los gestiona shadcn/ui (new-york)
// mediante variables CSS definidas en el archivo de estilos global.
const config: Config = {
  darkMode: ["class"], // Modo oscuro por clase (shadcn): español primero + dark.
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      // TODO: Extender colores/espaciado/fuentes de la marca Ágora.
      // TODO: shadcn agrega aquí keyframes y animaciones (accordion, etc.).
      colors: {
        // TODO: mapear a las variables CSS de shadcn (background, primary, ...).
      },
    },
  },
  plugins: [
    // TODO: agregar tailwindcss-animate (requerido por shadcn/ui).
  ],
};

export default config;
