# Sistema de diseño — Ágora Campus (Fuente de verdad)

> Síntesis final (motor ui-ux-pro-max + identidad propia). Toda pantalla nueva o retocada DEBE seguir esto.

## Identidad

- **Marca:** MORADO institucional UPY `#4B2385` (`--primary: 265 58% 33%`) + DORADO UPY `#D9A33C` como acento/warning (oscurecido a `38 75% 31%` cuando es texto). Extraída del logotipo oficial (public/icons/upy-logo.png). Neutros con tinte violeta.
- **Personalidad:** confiable, académica-moderna, transaccional. Flat y limpio; nada recargado.
- **Idioma:** español, tono cercano pero profesional (sin signos de exclamación dobles, sin jerga).

## Tipografía

- **Títulos (h1-h3, precios grandes, logo):** Poppins (`font-heading`), pesos 500-700, `tracking-tight`.
- **Cuerpo:** Inter (`font-sans`), 16px mínimo en móvil, `leading-relaxed` en párrafos.
- Jerarquía: h1 `text-xl md:text-2xl font-heading font-semibold tracking-tight`; secciones `text-sm font-medium text-muted-foreground uppercase tracking-wide` para eyebrows.

## Iconografía — REGLA DURA

- **PROHIBIDO cualquier emoji en la UI.** Solo iconos **lucide-react**, tamaño consistente (`h-4 w-4` en texto/botones, `h-5 w-5` en nav, `h-6 w-6+` en empty states dentro de círculo suave).
- Mapa canónico:
  | Antes | Ahora (lucide) |
  |---|---|
  | 🏛️ logo | `GraduationCap` dentro de cuadrado redondeado `bg-primary text-primary-foreground` |
  | 🛍️ placeholder producto | `ShoppingBag` en `text-muted-foreground/40` centrado sobre `bg-muted` |
  | 🛒 carrito vacío | `ShoppingCart` |
  | 📍 entrega/aula | `MapPin` |
  | 🏦 SPEI | `Landmark` |
  | 💵 efectivo | `Banknote` |
  | 📷 cámara | `Camera` · 🖼️ galería | `Image` · 📄 PDF | `FileText` |
  | ⏳ expiración | `Clock` · ⚠️ alerta | `AlertTriangle` · ✓ éxito | `Check`/`CheckCircle2` |
  | 🎉 cola vacía | `CheckCircle2` · 🔍 sin resultados | `SearchX` · 🏪 tienda | `Store` |
  | ↗ abrir | `ExternalLink` · flechas | `ChevronRight`/`ArrowRight` |

## Superficies y elevación

- Cards: `rounded-xl border bg-card shadow-sm`; interactivas añaden `transition-all duration-200 hover:shadow-md hover:border-primary/40 cursor-pointer`.
- Imágenes de producto: contenedor `overflow-hidden rounded-t-xl` con `group-hover:scale-105 transition-transform duration-300` en la img (zoom sin layout shift).
- Barras fijas (header/tabbar/CTA): `bg-background/95 backdrop-blur border` — sin sombras duras.
- Escala z-index: header/tabbar 40, barras CTA 30, sheet/overlay 50.

## Interacción — REGLAS DURAS

- Todo clickeable: `cursor-pointer` + feedback hover (`transition-colors duration-200`) + `focus-visible:ring-2 ring-ring` + área táctil ≥44px.
- Botones async: estado deshabilitado + spinner `Loader2 animate-spin`.
- Hover NUNCA con scale que desplace layout (scale solo dentro de overflow-hidden).
- `active:opacity-80` en botones para respuesta táctil.

## Estados y feedback

- Badges de estado de pedido: pill con **punto de color** (`<span class="h-1.5 w-1.5 rounded-full bg-current">`) + etiqueta; paleta: pendiente=warning, revisión=secondary, verificado/preparando/listo=success outline, entregado=success sólido, rechazado/expirado/cancelado=destructive.
- Banners: `rounded-lg border p-3 text-sm flex gap-2 items-start` con icono lucide (`AlertTriangle`/`CheckCircle2`/`Info`) — variantes success/warning/destructive/info con `bg-{x}/10 border-{x}/30 text-{x}`.
- Empty states: círculo `h-14 w-14 rounded-full bg-muted grid place-items-center` con icono `h-6 w-6 text-muted-foreground` + título `font-medium` + descripción muted + CTA.

## Contraste (modo claro — checklist del skill)

- Texto cuerpo ≥ slate-900 equivalente; muted ≥ slate-600 equivalente (revisar `--muted-foreground` ≥ 45% de contraste).
- Bordes visibles: nunca `border-white/10` en claro.

## Movimiento

- Micro-interacciones 150-300ms; `animate-in fade-in slide-in-from-bottom-2` en sheets; respetar `prefers-reduced-motion` (no animaciones infinitas decorativas).

## Anti-patrones (prohibidos)

- Emojis como iconos · hover con layout shift · texto gris claro sobre blanco · botones sin estado de carga · contenedores con anchos mezclados (usar `max-w-6xl` global, `max-w-lg` en flujos de formulario) · sombras duras/negras.
