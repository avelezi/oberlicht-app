import { writeFileSync } from 'node:fs';
import * as t from '../src/design-system/tokens.js';
const L = [];
L.push('/* Oberlicht Design System — GENERADO por scripts/build-tokens.mjs. No editar a mano; edita tokens.js. */');
L.push("@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@600;700;800&display=swap');");
L.push(':root {');
for (const [k, scale] of Object.entries(t.color)) for (const [s, v] of Object.entries(scale)) L.push(`  --ob-${k}-${s}: ${v};`);
for (const [k, v] of Object.entries(t.area)) L.push(`  --ob-area-${k}: ${v};`);
for (const [k, v] of Object.entries(t.font)) L.push(`  --ob-font-${k}: ${v};`);
for (const [k, [fs, lh]] of Object.entries(t.text)) { L.push(`  --ob-text-${k}: ${fs};`); L.push(`  --ob-leading-${k}: ${lh};`); }
for (const [k, v] of Object.entries(t.space)) L.push(`  --ob-space-${k}: ${v};`);
for (const [k, v] of Object.entries(t.radius)) L.push(`  --ob-radius-${k}: ${v};`);
for (const [k, v] of Object.entries(t.shadow)) L.push(`  --ob-shadow-${k}: ${v};`);
for (const [k, v] of Object.entries(t.control)) L.push(`  --ob-control-${k}: ${v};`);
for (const [k, v] of Object.entries(t.motion)) L.push(`  --ob-motion-${k}: ${v};`);
for (const [k, v] of Object.entries(t.semantic.light)) L.push(`  --ob-${k}: ${v};`);
L.push('  color-scheme: light;');
L.push('}');
L.push('[data-theme="dark"] {');
for (const [k, v] of Object.entries(t.semantic.dark)) L.push(`  --ob-${k}: ${v};`);
L.push('  color-scheme: dark;');
L.push('}');
L.push(`
html { font-size: 100%; }
body { background: var(--ob-bg); color: var(--ob-text); font-family: var(--ob-font-body); font-size: var(--ob-text-base); line-height: var(--ob-leading-base); -webkit-font-smoothing: antialiased; }
h1, h2, h3, h4 { font-family: var(--ob-font-heading); color: var(--ob-text); letter-spacing: -0.01em; }
:focus-visible { outline: 3px solid var(--ob-focus); outline-offset: 2px; }
.ob-num { font-variant-numeric: tabular-nums; }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { transition-duration: 0ms !important; animation-duration: 0ms !important; } }
`);
writeFileSync(new URL('../src/design-system/tokens.css', import.meta.url), L.join('\n'));
writeFileSync(new URL('../src/design-system/tokens.json', import.meta.url), JSON.stringify(t, null, 2));
console.log('tokens.css y tokens.json generados');
