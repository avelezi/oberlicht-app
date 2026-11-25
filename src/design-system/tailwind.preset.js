/**
 * Preset de Tailwind v3 para Oberlicht.
 * Uso en tailwind.config.js:  presets: [require('./src/design-system/tailwind.preset.js')]
 * (o `import preset from './src/design-system/tailwind.preset.js'` en ESM)
 */
import { color, area, text, radius, shadow, control, font } from './tokens.js';

const v = (name) => `var(--ob-${name})`;

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        // Escalas fijas (admiten opacidad: bg-brand-600/20)
        brand: color.brand, gold: color.gold, aqua: color.aqua, neutral: color.neutral,
        success: color.success, warning: color.warning, danger: color.danger, info: color.info,
        area,
        // Roles semánticos (cambian con el tema)
        bg: v('bg'),
        surface: { DEFAULT: v('surface'), muted: v('surface-muted'), sunken: v('surface-sunken') },
        border: { DEFAULT: v('border'), strong: v('border-strong') },
        fg: { DEFAULT: v('text'), muted: v('text-muted'), subtle: v('text-subtle'), inverse: v('text-inverse') },
        primary: { DEFAULT: v('primary'), hover: v('primary-hover'), soft: v('primary-soft'), fg: v('on-primary') },
        accent: { DEFAULT: v('accent'), soft: v('accent-soft'), fg: v('on-accent') },
        sidebar: { DEFAULT: v('sidebar'), fg: v('sidebar-text'), active: v('sidebar-active'), 'active-fg': v('sidebar-active-text') },
      },
      fontFamily: {
        sans: font.body.split(',').map((s) => s.trim().replace(/'/g, '')),
        heading: font.heading.split(',').map((s) => s.trim().replace(/'/g, '')),
        mono: font.mono.split(',').map((s) => s.trim().replace(/'/g, '')),
      },
      fontSize: Object.fromEntries(Object.entries(text).map(([k, [fs, lh]]) => [k, [fs, { lineHeight: lh }]])),
      borderRadius: radius,
      boxShadow: shadow,
      height: { 'control-sm': control.sm, control: control.md, 'control-lg': control.lg, 'control-xl': control.xl },
      minHeight: { 'control-sm': control.sm, control: control.md, 'control-lg': control.lg, 'control-xl': control.xl },
      minWidth: { control: control.md },
      ringColor: { DEFAULT: v('focus') },
      transitionTimingFunction: { ob: 'cubic-bezier(.2,.8,.2,1)' },
    },
  },
};
