# Design system de Oberlicht · v0.1

Sistema visual y de componentes de la plataforma de gestión de Oberlicht (natación, Oberfit, ballet, gimnasia rítmica, terapia, nutrición, barra saludable y tienda).
Stack: React 18 + TypeScript + Tailwind CSS 3. Sin dependencias extra (los íconos se inyectan; recomendamos `lucide-react`).

> **Colores del logo oficial**: morado `#921C81` (`brand-600`), amarillo `#FEDB02` (`gold-400`) y azul `#019ADE` (`aqua-500`). Para cambiar cualquier color se edita `tokens.js` y se corre `node scripts/build-tokens.mjs`.

## Logo

En `assets/`:
- `oberlicht-logo-fondo-oscuro.png`: original, letras blancas. Úsalo sobre el menú lateral (`sidebar`) y fondos oscuros.
- `oberlicht-logo-fondo-claro.png`: misma pieza con letras en `brand-950` (#2D0A2A). Para login, recibos, PDFs y fondos claros.
- `oberlicht-simbolo.png`: solo el símbolo (figura + anillo). Favicon, avatar de la app, menú colapsado.

Pásalo así: `<AppShell logo={<img src={logoOscuro} alt="Oberlicht" className="h-9 w-auto" />} …>`. Área libre mínima alrededor: la altura de la "o". No recolorear, rotar ni poner sobre fotos sin un fondo sólido. Son PNG de 527 px de ancho; si el club tiene el logo en vector (SVG/AI/PDF), conviene reemplazarlos.

## Instalación en la app

```
src/design-system/
  tokens.js            ← fuente única de tokens (editar aquí)
  tokens.css           ← generado: variables --ob-*, tema claro/oscuro, fuentes
  tokens.json          ← generado: para documentación o Figma
  tailwind.preset.js   ← preset de Tailwind v3
  components/          ← componentes React
  index.ts
```

1. `src/index.css`: `@import './design-system/tokens.css';` antes de `@tailwind base;`
2. `tailwind.config.js`: `presets: [preset]` (importando `./src/design-system/tailwind.preset.js`) y `content` que incluya `./src/**/*.{ts,tsx}`.
3. Tema oscuro: `data-theme="dark"` en `<html>`.
4. Usar: `import { Button, Table, StatusBadge } from '@/design-system'`.

## Principios (requisito: que lo opere cualquier persona sin conocimientos técnicos)

1. **Una tarea principal por pantalla**, con su botón primario grande arriba a la derecha (o abajo y a lo ancho en móvil). Solo un botón `primary` por vista.
2. **Objetivos táctiles grandes**: controles de 44 px mínimo; 52 px (`size="lg"`) en mostrador y en acciones de cobro o entrada; 64 px (`xl`) para kiosco/registro de entrada.
3. **Texto de 16 px** como base; nunca menos de 14 px en la operación. Números con `ob-num` (tabulares) para que las cantidades se alineen.
4. **Estados con símbolo y palabra**, nunca solo color (`StatusBadge`). Contraste AA en todo texto.
5. **Español claro y de mostrador**: verbos concretos ("Cobrar $850", "Inscribir socio", "Pasar lista"), sin jerga técnica ("registro", "entidad", "sincronizar").
6. **Etiqueta visible siempre** (`Field`); el placeholder solo da ejemplos. Errores dicen qué pasó y cómo arreglarlo.
7. **Confirmar lo irreversible** con `Modal` + `ConfirmFooter danger`, nombrando la acción en el botón ("Sí, cancelar membresía"), nunca "Aceptar".
8. **Estados vacíos con instrucción** y la acción para salir de ellos (`EmptyState`).
9. **Ventanas por rol**: cada rol abre en su tarea más frecuente (`HOME_BY_ROLE`) y solo ve sus módulos (`NAV_BY_ROLE`). Los permisos reales se aplican en Supabase (RLS).

## Tokens

| Grupo | Valores |
|---|---|
| Marca | `brand` morado Oberlicht (600 `#921C81` primario), `gold` amarillo (400 `#FEDB02` acento), `aqua` azul (500 `#019ADE`; como texto usar 700 `#036796`) |
| Estados | `success` `#15803D`, `warning` `#B45309`, `danger` `#B91C1C`, `info` `#036796` (azul de marca) (con fondos 50) |
| Áreas | natación `#0182BC`, Oberfit `#D9480F`, ballet `#C2417A`, gimnasia `#7048C2`, terapia `#1F7A63`, nutrición `#4D8B1F`, barra `#9A6B12`, tienda `#4C5A6C` |
| Semánticos | `bg`, `surface`, `border`, `fg`, `fg-muted`, `primary`, `accent`, `sidebar` (cambian en modo oscuro) |
| Tipografía | Títulos *Plus Jakarta Sans* 600–800; cuerpo *Inter* 400–700. Escala 13/14/16/18/20/24/30/36 |
| Espaciado | base 4 px: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64 |
| Radios | 6, 10 (controles), 14 (tarjetas), 20 (modales), completo (badges) |
| Sombras | xs, sm, md, lg teñidas de morado; `focus` anillo de 3 px |
| Controles | 36 / 44 / 52 / 64 px (`h-control-sm`, `h-control`, `h-control-lg`, `h-control-xl`) |

Reglas de color: el amarillo nunca va como texto sobre blanco (no llega a AA); úsalo como relleno con texto `brand-950` (`variant="accent"`) o como detalle (indicador activo del menú). El azul `aqua-500` no llega a AA como texto sobre blanco: para texto usa `aqua-700`. Rojo solo para dinero adeudado, errores y acciones destructivas.

## Componentes

| Componente | Uso |
|---|---|
| `Button` | `variant`: primary, secondary, ghost, danger, success, accent · `size`: sm, md, lg, xl · `icon`, `loading`, `block` |
| `Field` + `Input`, `Select`, `Textarea`, `Checkbox`, `Switch` | Formularios con etiqueta, ayuda, error y "(opcional)" automático |
| `Card`, `CardHeader`, `StatCard` | Contenedores y KPIs (tendencia con flecha + texto) |
| `Badge`, `StatusBadge`, `AreaChip` | Estados del club: activo, pagado, asistió, pendiente, por vencer, adeudo, vencido, faltó, congelado, prueba, lista de espera, cancelado, inactivo |
| `Table` | Tabla por columnas, filas de 56 px clicables con teclado, columnas ocultables en móvil, estado vacío |
| `Tabs`, `Segmented` | Vistas de un mismo objeto y filtros rápidos |
| `Alert`, `Toast`, `EmptyState` | Mensajes |
| `Modal`, `ConfirmFooter` | Diálogos nativos (`<dialog>`) accesibles |
| `AppShell`, `Sidebar`, `PageHeader`, `Avatar`, `Wordmark` | Marco de cada consola |
| `roles.ts` | `ROLE_LABEL`, `NAV_BY_ROLE`, `HOME_BY_ROLE` para 11 roles/departamentos |

## Patrones de consola por rol

- **Dirección (consola central)**: fila de 4 `StatCard` (ingresos del mes, socios activos, ocupación de clases, adeudos) → alertas → gráficas por área (colores `area`) → accesos a reportes.
- **Recepción**: abre en *Registrar entrada*: buscador enorme (`size xl`) con foco automático, resultado en tarjeta grande con foto, `StatusBadge` y un solo botón ("Dar acceso" o "Cobrar $X"). Ficha de socio en `Tabs`: Datos · Familia · Clases · Pagos · Historial.
- **Coach / instructor**: abre en *Pasar lista* de su clase actual. Lista de alumnos con botones grandes Asistió / Faltó (un toque, sin guardar aparte). Optimizado para tablet o celular.
- **Coordinación (natación / danza)**: tablero de niveles y grupos con cupo (`12/15`), lista de espera y evaluaciones para subir de nivel.
- **Administración y finanzas**: `Table` densa (`dense`) de cobros con filtros `Segmented` (Hoy/Semana/Mes), totales con `ob-num`, acciones por lote y facturación CFDI.
- **Barra / tienda**: punto de venta con mosaico de productos grandes (64 px), ticket a la derecha, botón `success xl` "Cobrar".
- **Socio / familia (portal)**: móvil primero; tarjetas de sus clases, próximo pago y botón de reservar.

## Demo

`npm install && npm run dev` en la carpeta del paquete muestra la consola de Recepción con todos los componentes y un selector para ver el menú de cada rol.
