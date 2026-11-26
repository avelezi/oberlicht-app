import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

export function Card({ className, padded = true, interactive, ...rest }: HTMLAttributes<HTMLDivElement> & { padded?: boolean; interactive?: boolean }) {
  return (
    <div
      className={cn(
        'rounded-lg border border-border bg-surface shadow-xs',
        padded && 'p-4 sm:p-6',
        interactive && 'ob-press transition-shadow hover:shadow-md cursor-pointer',
        className,
      )}
      {...rest}
    />
  );
}

export function CardHeader({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 className="text-lg font-bold">{title}</h3>
        {description && <p className="mt-0.5 text-sm text-fg-muted">{description}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}

/** Indicador clave (KPI). `trend` positivo/negativo se muestra con flecha y texto, no solo color. */
export function StatCard({ label, value, hint, trend, icon }: { label: string; value: ReactNode; hint?: ReactNode; trend?: { value: string; positive: boolean }; icon?: ReactNode }) {
  return (
    <Card className="flex min-w-0 flex-col gap-1 sm:gap-2">
      <div className="flex items-center justify-between gap-2 text-[13px] font-medium leading-tight text-fg-muted sm:text-sm">
        <span className="min-w-0">{label}</span>
        {icon && <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-primary-soft text-primary sm:h-9 sm:w-9">{icon}</span>}
      </div>
      <div className="truncate font-heading text-2xl font-bold ob-num text-fg sm:text-3xl">{value}</div>
      {(trend || hint) && (
        <div className="flex flex-wrap items-center gap-x-2 text-xs leading-snug sm:text-sm">
          {trend && (
            <span className={cn('font-semibold', trend.positive ? 'text-success-600' : 'text-danger-600')}>
              {trend.positive ? '▲' : '▼'} {trend.value}
            </span>
          )}
          {hint && <span className="text-fg-muted">{hint}</span>}
        </div>
      )}
    </Card>
  );
}
