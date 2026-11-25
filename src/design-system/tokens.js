/**
 * Oberlicht Design System — fuente única de tokens.
 * Edita aquí y corre `node scripts/build-tokens.mjs` para regenerar tokens.css y tokens.json.
 * Colores tomados del logo oficial (morado #921C81, amarillo #FEDB02, azul #019ADE).
 */
export const color = {
  // Morado Oberlicht (logo #921C81): color de marca principal.
  brand: { 50: '#FBF0F9', 100: '#F5DDF1', 200: '#EBBBE3', 300: '#DB8DCF', 400: '#C35BB3', 500: '#A93597', 600: '#921C81', 700: '#7A1770', 800: '#62135A', 900: '#4A1045', 950: '#2D0A2A' },
  // Amarillo Oberlicht (logo #FEDB02): acento "luz". Nunca como texto sobre blanco.
  gold: { 50: '#FFFBE0', 100: '#FFF4B3', 200: '#FFEC80', 300: '#FFE447', 400: '#FEDB02', 500: '#E6C400', 600: '#C2A300', 700: '#8F7600', 800: '#6B5800', 900: '#4A3D00' },
  // Azul Oberlicht (logo #019ADE): natación y acento secundario. Como texto usar 700.
  aqua: { 50: '#E6F5FC', 100: '#C2E7F8', 200: '#8DD3F1', 300: '#50BCE9', 400: '#1FA8E2', 500: '#019ADE', 600: '#0182BC', 700: '#036796', 800: '#075276', 900: '#0A3F5A' },
  neutral: { 0: '#FFFFFF', 25: '#FCFBFD', 50: '#F7F5F9', 100: '#EEEBF2', 200: '#DEDAE5', 300: '#C3BDCD', 400: '#9A93A7', 500: '#6C6579', 600: '#554E64', 700: '#3D374A', 800: '#282331', 900: '#17131E' },
  success: { 50: '#E8F6EC', 100: '#C9EBD3', 500: '#1F9D4C', 600: '#15803D', 700: '#116632' },
  warning: { 50: '#FEF3E2', 100: '#FCE1B6', 500: '#D97706', 600: '#B45309', 700: '#8F4108' },
  danger:  { 50: '#FDECEC', 100: '#F9CFCF', 500: '#DC2626', 600: '#B91C1C', 700: '#931717' },
  info:    { 50: '#E6F5FC', 100: '#C2E7F8', 500: '#019ADE', 600: '#036796', 700: '#075276' },
};

// Color por área/disciplina del club (calendario, chips, gráficas).
export const area = {
  natacion: '#0182BC',
  oberfit: '#D9480F',
  ballet: '#C2417A',
  gimnasia: '#7048C2',
  terapia: '#1F7A63',
  nutricion: '#4D8B1F',
  cafeteria: '#9A6B12',
  tienda: '#4C5A6C',
};

export const font = {
  heading: "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif",
  body: "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  mono: "'JetBrains Mono', ui-monospace, Menlo, monospace",
};

// Escala tipográfica: base 16px (nunca menos de 14 en la interfaz operativa).
export const text = {
  xs:  ['0.8125rem', '1.125rem'], // 13 — solo metadatos
  sm:  ['0.875rem', '1.25rem'],   // 14
  base:['1rem', '1.5rem'],        // 16 — cuerpo
  lg:  ['1.125rem', '1.75rem'],   // 18
  xl:  ['1.25rem', '1.75rem'],    // 20
  '2xl':['1.5rem', '2rem'],       // 24
  '3xl':['1.875rem', '2.25rem'],  // 30
  '4xl':['2.25rem', '2.5rem'],    // 36
};

export const space = { 0: '0', 1: '4px', 2: '8px', 3: '12px', 4: '16px', 5: '20px', 6: '24px', 8: '32px', 10: '40px', 12: '48px', 16: '64px' };
export const radius = { sm: '6px', md: '10px', lg: '14px', xl: '20px', full: '9999px' };
export const shadow = {
  xs: '0 1px 2px rgba(45,10,42,.06)',
  sm: '0 1px 3px rgba(45,10,42,.08), 0 1px 2px rgba(45,10,42,.04)',
  md: '0 4px 12px rgba(45,10,42,.08), 0 2px 4px rgba(45,10,42,.04)',
  lg: '0 12px 32px rgba(45,10,42,.12), 0 4px 8px rgba(45,10,42,.04)',
  focus: '0 0 0 3px rgba(169,53,151,.35)',
};
// Alturas de control: mínimo 44px (objetivo táctil), 52px para acciones primarias de mostrador.
export const control = { sm: '36px', md: '44px', lg: '52px', xl: '64px' };
export const motion = { fast: '120ms', base: '180ms', slow: '260ms', ease: 'cubic-bezier(.2,.8,.2,1)' };

// Roles semánticos (modo claro / oscuro).
export const semantic = {
  light: {
    bg: color.neutral[50], surface: color.neutral[0], 'surface-muted': color.neutral[25], 'surface-sunken': color.neutral[100],
    border: color.neutral[200], 'border-strong': '#8C849A',
    text: color.neutral[900], 'text-muted': color.neutral[600], 'text-subtle': color.neutral[500], 'text-inverse': color.neutral[0],
    primary: color.brand[600], 'primary-hover': color.brand[700], 'primary-soft': color.brand[50], 'on-primary': '#FFFFFF',
    accent: color.gold[400], 'accent-soft': color.gold[50], 'on-accent': color.brand[950],
    focus: color.brand[500],
    sidebar: color.brand[950], 'sidebar-text': '#E6D5E3', 'sidebar-active': color.brand[800], 'sidebar-active-text': '#FFFFFF',
  },
  dark: {
    bg: '#120D18', surface: '#1B1524', 'surface-muted': '#16111E', 'surface-sunken': '#0F0B14',
    border: '#2E2639', 'border-strong': '#6E6380',
    text: '#F1ECF5', 'text-muted': '#B8AEC2', 'text-subtle': '#958BA3', 'text-inverse': color.neutral[900],
    primary: color.brand[300], 'primary-hover': color.brand[200], 'primary-soft': '#2A1530', 'on-primary': color.brand[950],
    accent: color.gold[400], 'accent-soft': '#2A2410', 'on-accent': color.brand[950],
    focus: color.brand[300],
    sidebar: '#0C0810', 'sidebar-text': '#C9BCD0', 'sidebar-active': '#2A1530', 'sidebar-active-text': '#FFFFFF',
  },
};
