import type { ReactNode } from 'react';
import { cn } from './cn';

export type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'accent';
const tones: Record<Tone, string> = {
  neutral: 'bg-neutral-100 text-neutral-700 border-neutral-200',
  brand: 'bg-brand-50 text-brand-700 border-brand-100',
  success: 'bg-success-50 text-success-700 border-success-100',
  warning: 'bg-warning-50 text-warning-700 border-warning-100',
  danger: 'bg-danger-50 text-danger-700 border-danger-100',
  info: 'bg-info-50 text-info-700 border-info-100',
  accent: 'bg-gold-50 text-gold-800 border-gold-100',
};

export function Badge({ tone = 'neutral', icon, children, size = 'md', className }: { tone?: Tone; icon?: ReactNode; children: ReactNode; size?: 'sm' | 'md'; className?: string }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 rounded-full border font-semibold whitespace-nowrap',
      size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm',
      tones[tone], className,
    )}>
      {icon}{children}
    </span>
  );
}

/**
 * Estados de negocio del club. Siempre muestra símbolo + palabra (nunca solo color),
 * para que se entienda en cualquier pantalla y por personas con daltonismo.
 */
export const STATUS = {
  activo:      { tone: 'success', label: 'Activo', sym: '●' },
  pagado:      { tone: 'success', label: 'Pagado', sym: '✓' },
  asistio:     { tone: 'success', label: 'Asistió', sym: '✓' },
  pendiente:   { tone: 'warning', label: 'Pendiente', sym: '◷' },
  por_vencer:  { tone: 'warning', label: 'Por vencer', sym: '◷' },
  adeudo:      { tone: 'danger',  label: 'Con adeudo', sym: '!' },
  vencido:     { tone: 'danger',  label: 'Vencido', sym: '!' },
  falta:       { tone: 'danger',  label: 'Faltó', sym: '✕' },
  congelado:   { tone: 'info',    label: 'Congelado', sym: '❄' },
  prueba:      { tone: 'accent',  label: 'Clase de prueba', sym: '★' },
  lista_espera:{ tone: 'brand',   label: 'Lista de espera', sym: '⋯' },
  cancelado:   { tone: 'neutral', label: 'Cancelado', sym: '–' },
  inactivo:    { tone: 'neutral', label: 'Inactivo', sym: '○' },
} as const satisfies Record<string, { tone: Tone; label: string; sym: string }>;
export type StatusKey = keyof typeof STATUS;

export function StatusBadge({ status, size, label }: { status: StatusKey; size?: 'sm' | 'md'; label?: string }) {
  const s = STATUS[status];
  return <Badge tone={s.tone} size={size} icon={<span aria-hidden>{s.sym}</span>}>{label ?? s.label}</Badge>;
}

/** Chip de área/disciplina con su color de identidad. */
export type AreaKey = 'natacion' | 'oberfit' | 'ballet' | 'gimnasia' | 'terapia' | 'nutricion' | 'cafeteria' | 'tienda';
export const AREA_LABEL: Record<AreaKey, string> = {
  natacion: 'Natación', oberfit: 'Oberfit', ballet: 'Ballet', gimnasia: 'Gimnasia rítmica',
  terapia: 'Terapia física', nutricion: 'Nutrición', cafeteria: 'Barra saludable', tienda: 'Tienda',
};
export function AreaChip({ area, className }: { area: AreaKey; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2 text-sm font-medium text-fg', className)}>
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: `var(--ob-area-${area})` }} aria-hidden />
      {AREA_LABEL[area]}
    </span>
  );
}
