import { useCallback, useEffect, useSyncExternalStore } from 'react';

// Tema día/noche: «auto» sigue al sistema (y cambia solo al anochecer si el celular lo hace);
// «light» y «dark» lo fijan a mano. Se guarda en este dispositivo.
export type ThemePref = 'auto' | 'light' | 'dark';
const KEY = 'ob-theme';
const media = () => window.matchMedia('(prefers-color-scheme: dark)');
const listeners = new Set<() => void>();

export function getPref(): ThemePref {
  try { const v = localStorage.getItem(KEY); return v === 'light' || v === 'dark' ? v : 'auto'; } catch { return 'auto'; }
}
export function resolved(pref: ThemePref = getPref()): 'light' | 'dark' {
  return pref === 'auto' ? (media().matches ? 'dark' : 'light') : pref;
}
export function applyTheme() {
  const t = resolved();
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'dark' ? '#120D18' : '#2D0A2A');
}
export function setPref(p: ThemePref) {
  try { if (p === 'auto') localStorage.removeItem(KEY); else localStorage.setItem(KEY, p); } catch { /* sin almacenamiento */ }
  applyTheme();
  listeners.forEach((l) => l());
}

export function initTheme() {
  applyTheme();
  media().addEventListener('change', () => { applyTheme(); listeners.forEach((l) => l()); });
}

export function useTheme() {
  const pref = useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb); }, getPref, () => 'auto' as ThemePref);
  useEffect(() => applyTheme(), [pref]);
  const cycle = useCallback(() => setPref(pref === 'auto' ? 'light' : pref === 'light' ? 'dark' : 'auto'), [pref]);
  return { pref, theme: resolved(pref), setPref, cycle };
}
