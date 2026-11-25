import { useNavigate } from 'react-router-dom';
import logoClaro from '@/design-system/assets/oberlicht-logo-fondo-claro.png';
import logoOscuro from '@/design-system/assets/oberlicht-logo-fondo-oscuro.png';
import { Download, Monitor, Moon, Sun } from 'lucide-react';
import { useTheme, type ThemePref } from '@/lib/theme';
import { useInstall } from '@/lib/install';

const LABEL: Record<ThemePref, string> = { auto: 'Automático (según tu dispositivo)', light: 'Día', dark: 'Noche' };

/** Botón de tema: Automático → Día → Noche. */
export function ThemeToggle({ className = '' }: { className?: string }) {
  const { pref, cycle } = useTheme();
  const Icon = pref === 'auto' ? Monitor : pref === 'light' ? Sun : Moon;
  return (
    <button type="button" onClick={cycle} title={`Tema: ${LABEL[pref]}. Toca para cambiar.`} aria-label={`Tema: ${LABEL[pref]}. Cambiar tema`}
      className={`grid min-h-control min-w-control place-items-center rounded-md text-fg hover:bg-surface-sunken ${className}`}>
      <Icon className="h-5 w-5" aria-hidden />
    </button>
  );
}

/** Selector de tema con las tres opciones visibles (para Mi cuenta / instalar). */
export function ThemePicker() {
  const { pref, setPref } = useTheme();
  const opts: { id: ThemePref; label: string; icon: typeof Sun }[] = [
    { id: 'auto', label: 'Automático', icon: Monitor }, { id: 'light', label: 'Día', icon: Sun }, { id: 'dark', label: 'Noche', icon: Moon },
  ];
  return (
    <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Tema de la app">
      {opts.map((o) => (
        <button key={o.id} role="radio" aria-checked={pref === o.id} onClick={() => setPref(o.id)}
          className={`flex min-h-[72px] flex-col items-center justify-center gap-1 rounded-lg border-2 text-base font-semibold ${pref === o.id ? 'border-primary bg-primary-soft text-primary' : 'border-border bg-surface text-fg hover:bg-surface-sunken'}`}>
          <o.icon className="h-5 w-5" aria-hidden /> {o.label}
        </button>
      ))}
    </div>
  );
}

/** «Instalar app»: abre el instalador del navegador si existe; si no, lleva a las instrucciones. */
export function InstallButton({ compact }: { compact?: boolean }) {
  const nav = useNavigate();
  const { canPrompt, installed, prompt } = useInstall();
  if (installed) return null;
  const onClick = async () => { if (canPrompt) { const ok = await prompt(); if (ok) return; } nav('/instalar'); };
  return (
    <button type="button" onClick={onClick}
      className={`inline-flex min-h-control items-center gap-2 rounded-md px-3 text-base font-semibold text-primary hover:bg-primary-soft ${compact ? '' : 'border border-border-strong'}`}>
      <Download className="h-5 w-5" aria-hidden /> <span className={compact ? 'hidden md:inline' : ''}>Instalar app</span>
    </button>
  );
}

/** Logo que cambia según el tema (claro sobre fondo oscuro de noche). */
export function ThemedLogo({ className = 'h-14 w-auto' }: { className?: string }) {
  const { theme } = useTheme();
  return <img src={theme === 'dark' ? logoOscuro : logoClaro} alt="Oberlicht" className={className} />;
}
