import { useSyncExternalStore } from 'react';

// Instalación como app (PWA). Chrome/Edge (Windows, Mac, Android) disparan beforeinstallprompt;
// Safari (iPhone, iPad, Mac) se instala desde Compartir → «Agregar a inicio» / «Agregar al Dock».
type BIP = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };
let deferred: BIP | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

export function initInstall() {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e as BIP; emit(); });
  window.addEventListener('appinstalled', () => { deferred = null; emit(); });
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}); });
  }
}

export const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;

export type Platform = 'ios' | 'android' | 'mac' | 'windows' | 'otro';
export function platform(): Platform {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  if (/Macintosh|Mac OS X/.test(ua)) return 'mac';
  if (/Windows/.test(ua)) return 'windows';
  return 'otro';
}

export function useInstall() {
  const canPrompt = useSyncExternalStore((cb) => { subs.add(cb); return () => subs.delete(cb); }, () => !!deferred, () => false);
  return {
    canPrompt,
    installed: typeof window !== 'undefined' && isStandalone(),
    async prompt() {
      if (!deferred) return false;
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      deferred = null; emit();
      return outcome === 'accepted';
    },
  };
}
