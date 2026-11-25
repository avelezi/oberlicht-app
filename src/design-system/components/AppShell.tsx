import { useState, type ReactNode } from 'react';
import { cn } from './cn';
import type { NavGroup } from './roles';

export interface SidebarProps {
  groups: NavGroup[];
  activeId: string;
  /** Recibe el nombre del ícono (lucide) y devuelve el elemento. Así el DS no impone librería de íconos. */
  renderIcon?: (name: string) => ReactNode;
  onNavigate?: (href: string, id: string) => void;
  /** Logo de Oberlicht (img o svg). */
  logo?: ReactNode;
  footer?: ReactNode;
}

export function Sidebar({ groups, activeId, renderIcon, onNavigate, logo, footer }: SidebarProps) {
  return (
    <nav aria-label="Menú principal" className="flex h-full w-[264px] flex-col bg-sidebar text-sidebar-fg">
      <div className="flex h-20 shrink-0 items-center px-5">{logo ?? <Wordmark />}</div>
      <div className="flex-1 overflow-y-auto px-3 pb-4">
        {groups.map((g, gi) => (
          <div key={gi} className="mt-4 first:mt-1">
            {g.label && <p className="px-3 pb-1.5 text-xs font-semibold uppercase tracking-wider text-sidebar-fg/70">{g.label}</p>}
            <ul className="flex flex-col gap-0.5">
              {g.items.map((it) => {
                const active = it.id === activeId;
                return (
                  <li key={it.id}>
                    <a href={it.href} aria-current={active ? 'page' : undefined}
                      onClick={onNavigate ? (e) => { e.preventDefault(); onNavigate(it.href, it.id); } : undefined}
                      className={cn(
                        'relative flex min-h-control items-center gap-3 rounded-md px-3 text-base font-medium transition-colors',
                        active ? 'bg-sidebar-active text-sidebar-active-fg' : 'hover:bg-white/5 hover:text-white',
                      )}>
                      {active && <span className="absolute left-0 top-2 bottom-2 w-1 rounded-r bg-accent" aria-hidden />}
                      {renderIcon && <span className="h-5 w-5 shrink-0">{renderIcon(it.icon)}</span>}
                      {it.label}
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      {footer && <div className="border-t border-white/10 p-3">{footer}</div>}
    </nav>
  );
}

/** Respaldo tipográfico cuando no se pasa `logo`. En producción usa assets/oberlicht-logo-fondo-oscuro.png. */
export function Wordmark({ inverted = true }: { inverted?: boolean }) {
  return (
    <span className={cn('flex items-center gap-2 font-heading text-xl font-extrabold tracking-tight', inverted ? 'text-white' : 'text-brand-800')}>
      <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden>
        <rect x="2" y="2" width="28" height="28" rx="8" fill="currentColor" opacity=".12" />
        <path d="M16 6l2.6 6.4L25 15l-6.4 2.6L16 24l-2.6-6.4L7 15l6.4-2.6z" fill="var(--ob-gold-400)" />
      </svg>
      Oberlicht
    </span>
  );
}

export interface AppShellProps extends SidebarProps {
  children: ReactNode;
  /** Barra superior: buscador global, usuario, rol activo. */
  topbar?: ReactNode;
}

/** Marco de toda consola por rol: menú lateral fijo en escritorio, cajón en tablet/móvil. */
export function AppShell({ children, topbar, ...sidebar }: AppShellProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex min-h-screen bg-bg">
      <div className="hidden lg:block lg:sticky lg:top-0 lg:h-screen"><Sidebar {...sidebar} /></div>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-neutral-900/50" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 shadow-lg">
            <Sidebar {...sidebar} onNavigate={(h, id) => { setOpen(false); sidebar.onNavigate?.(h, id); }} />
          </div>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-surface/95 px-4 backdrop-blur sm:px-6">
          <button className="grid min-h-control min-w-control place-items-center rounded-md hover:bg-surface-sunken lg:hidden" onClick={() => setOpen(true)} aria-label="Abrir menú">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
          <div className="flex flex-1 items-center gap-3">{topbar}</div>
        </header>
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}

export function PageHeader({ title, description, actions, breadcrumb }: { title: string; description?: ReactNode; actions?: ReactNode; breadcrumb?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {breadcrumb && <div className="mb-1 text-sm text-fg-muted">{breadcrumb}</div>}
        <h1 className="text-2xl font-extrabold sm:text-3xl">{title}</h1>
        {description && <p className="mt-1 text-base text-fg-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-3">{actions}</div>}
    </div>
  );
}

export function Avatar({ name, src, size = 40 }: { name: string; src?: string; size?: number }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('');
  return src ? (
    <img src={src} alt={name} width={size} height={size} className="rounded-full object-cover" style={{ width: size, height: size }} />
  ) : (
    <span className="grid shrink-0 place-items-center rounded-full bg-brand-100 font-semibold text-brand-700" style={{ width: size, height: size, fontSize: size * 0.38 }} aria-label={name}>
      {initials}
    </span>
  );
}
