import type { ReactNode } from 'react';
import { cn } from './cn';

export interface TabItem { id: string; label: string; count?: number; icon?: ReactNode }

/** Pestañas grandes y legibles. Úsalas para 2–6 vistas del mismo objeto (p. ej. ficha de socio). */
export function Tabs({ items, value, onChange, className }: { items: TabItem[]; value: string; onChange: (id: string) => void; className?: string }) {
  return (
    <div role="tablist" className={cn('ob-noscroll -mx-4 flex gap-1 overflow-x-auto border-b border-border px-4 sm:mx-0 sm:px-0', className)}>
      {items.map((t) => {
        const active = t.id === value;
        return (
          <button key={t.id} role="tab" aria-selected={active} onClick={() => onChange(t.id)}
            className={cn(
              '-mb-px inline-flex min-h-control shrink-0 items-center gap-2 whitespace-nowrap border-b-[3px] px-3 text-[15px] font-semibold transition-colors sm:px-4 sm:text-base',
              active ? 'border-primary text-primary' : 'border-transparent text-fg-muted hover:text-fg',
            )}>
            {t.icon}{t.label}
            {t.count !== undefined && (
              <span className={cn('rounded-full px-2 py-0.5 text-xs ob-num', active ? 'bg-primary text-primary-fg' : 'bg-surface-sunken text-fg-muted')}>{t.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Selector segmentado para filtros rápidos (Hoy / Semana / Mes). */
export function Segmented({ options, value, onChange }: { options: { id: string; label: string }[]; value: string; onChange: (id: string) => void }) {
  return (
    <div className="ob-noscroll inline-flex max-w-full overflow-x-auto rounded-md border border-border-strong bg-surface-sunken p-1" role="radiogroup">
      {options.map((o) => (
        <button key={o.id} role="radio" aria-checked={o.id === value} onClick={() => onChange(o.id)}
          className={cn('min-h-[36px] shrink-0 whitespace-nowrap rounded-[7px] px-4 text-sm font-semibold transition-colors',
            o.id === value ? 'bg-surface text-fg shadow-sm' : 'text-fg-muted hover:text-fg')}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
