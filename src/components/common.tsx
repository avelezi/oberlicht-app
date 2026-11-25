import type { ReactNode } from 'react';
import { Alert, AreaChip, Button, Card, StatusBadge, Spinner, type AreaKey, type StatusKey } from '@/design-system';
import type { Charge, DeptCode, Enrollment, Invoice } from '@/lib/types';

export function Loading({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-base text-fg-muted" role="status">
      <Spinner className="h-6 w-6 text-primary" /> {label}
    </div>
  );
}

export function ErrorBox({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <Alert tone="danger" title="Algo salió mal" action={onRetry && <Button variant="secondary" onClick={onRetry}>Intentar de nuevo</Button>}>
      {error}
    </Alert>
  );
}

const AREAS: DeptCode[] = ['natacion', 'oberfit', 'ballet', 'gimnasia', 'terapia', 'nutricion', 'cafeteria', 'tienda'];
export function Area({ code }: { code: DeptCode | null | undefined }) {
  if (!code || !AREAS.includes(code)) return <span className="text-sm text-fg-muted">General</span>;
  return <AreaChip area={code as AreaKey} />;
}

export function enrollmentStatus(e: Pick<Enrollment, 'status'>): StatusKey {
  return ({ activa: 'activo', lista_espera: 'lista_espera', congelada: 'congelado', baja: 'cancelado' } as const)[e.status];
}
export function EnrollmentBadge({ e }: { e: Pick<Enrollment, 'status'> }) {
  return <StatusBadge status={enrollmentStatus(e)} label={e.status === 'baja' ? 'Baja' : undefined} />;
}

export function chargeStatus(c: Pick<Charge, 'status'>): StatusKey {
  return ({ pendiente: 'pendiente', pagado: 'pagado', vencido: 'vencido', cancelado: 'cancelado' } as const)[c.status];
}
export function ChargeBadge({ c }: { c: Pick<Charge, 'status'> }) { return <StatusBadge status={chargeStatus(c)} />; }

export function InvoiceBadge({ i }: { i: Pick<Invoice, 'status'> }) {
  const map = { pendiente: ['pendiente', 'Por timbrar'], timbrada: ['pagado', 'Timbrada'], cancelada: ['cancelado', 'Cancelada'], error: ['vencido', 'Error'] } as const;
  const [s, l] = map[i.status];
  return <StatusBadge status={s} label={l} />;
}

/** Ficha de dato en expediente: etiqueta arriba, valor grande. */
export function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-sm font-medium text-fg-muted">{label}</dt>
      <dd className="mt-0.5 text-base text-fg">{children || <span className="text-fg-subtle">—</span>}</dd>
    </div>
  );
}

/** Aviso destacado de salud (alergias, condiciones). Siempre visible en rojo suave con símbolo. */
export function HealthFlag({ allergies, medical }: { allergies?: string | null; medical?: string | null }) {
  if (!allergies && !medical) return null;
  return (
    <div className="flex items-start gap-2 rounded-md border border-danger-100 bg-danger-50 px-3 py-2 text-sm text-danger-700">
      <span aria-hidden className="font-bold">✚</span>
      <span>
        {allergies && <><strong>Alergias:</strong> {allergies}. </>}
        {medical && <><strong>Salud:</strong> {medical}</>}
      </span>
    </div>
  );
}

export function Section({ title, description, actions, children }: { title: string; description?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-fg-muted">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      {children}
    </Card>
  );
}

export function Pill({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'good' | 'warn' | 'bad' }) {
  const t = { neutral: 'bg-surface-sunken text-fg-muted', good: 'bg-success-50 text-success-700', warn: 'bg-warning-50 text-warning-700', bad: 'bg-danger-50 text-danger-700' }[tone];
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-sm font-semibold ob-num ${t}`}>{children}</span>;
}

/** Barra de cupo: 8/10 con color según disponibilidad. */
export function CapacityBar({ used, total }: { used: number; total: number }) {
  const pct = total ? Math.min(100, Math.round((used / total) * 100)) : 0;
  const color = pct >= 100 ? 'bg-danger-600' : pct >= 80 ? 'bg-warning-600' : 'bg-success-600';
  return (
    <div className="flex items-center gap-2">
      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-sunken" aria-hidden>
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-sm font-semibold ob-num">{used}/{total}</span>
    </div>
  );
}
