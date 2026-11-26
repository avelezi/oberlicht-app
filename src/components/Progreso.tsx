import { useState } from 'react';
import { Award, CalendarDays, Flame, Lock, Medal as MedalIcon, Pencil, Shield, Sparkles, Trophy, Users } from 'lucide-react';
import { Badge, Button, cn } from '@/design-system';
import { dateShort, todayMx } from '@/lib/format';
import { CATEGORIA_CORTA, KUDOS, RETO_TIPO, retoEstado, type FilaConstancia, type FilaReto, type Kudo, type Medalla, type RetoClub, type Semana } from '@/lib/progreso';

/** Barra de avance delgada con extremo redondeado. */
export function Avance({ value, max, tone = 'primary', label }: { value: number; max: number; tone?: 'primary' | 'success' | 'accent'; label?: string }) {
  const pct = Math.max(0, Math.min(100, max > 0 ? (100 * value) / max : 0));
  const color = tone === 'success' ? 'bg-success-600' : tone === 'accent' ? 'bg-gold-500' : 'bg-primary';
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface-sunken" role="progressbar" aria-valuenow={value} aria-valuemax={max} aria-label={label}>
      <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
    </div>
  );
}

const SEMANA_ESTILO: Record<Semana['estado'], { cls: string; label: string }> = {
  cumplida: { cls: 'bg-primary text-primary-fg', label: 'Meta cumplida' },
  en_curso: { cls: 'border-2 border-dashed border-primary text-primary bg-surface', label: 'Semana en curso' },
  protegida: { cls: 'bg-info-100 text-info-700 dark:bg-info-700/30 dark:text-info-100', label: 'Protegida (falta justificada, reposición o congelada)' },
  sin_meta: { cls: 'bg-surface-sunken text-fg-subtle', label: 'Sin llegar a la meta' },
};

/** Las últimas 16 semanas: cada cuadro es una semana, con los días que entrenó. */
export function TiraSemanas({ semanas, meta }: { semanas: Semana[]; meta: number }) {
  const [sel, setSel] = useState<number | null>(null);
  const s = sel != null ? semanas[sel] : null;
  return (
    <div>
      <div className="grid grid-cols-8 gap-1.5 sm:grid-cols-[repeat(16,minmax(0,1fr))]">
        {semanas.map((w, i) => (
          <button key={w.semana} type="button" onClick={() => setSel(sel === i ? null : i)} onMouseEnter={() => setSel(i)}
            className={cn('flex aspect-square items-center justify-center rounded-md text-sm font-bold ob-num', SEMANA_ESTILO[w.estado].cls, sel === i && 'ring-2 ring-offset-1')}
            aria-label={`Semana del ${dateShort(w.semana)}: ${w.dias} días. ${SEMANA_ESTILO[w.estado].label}`}>
            {w.estado === 'protegida' ? <Shield className="h-4 w-4" aria-hidden /> : w.dias}
          </button>
        ))}
      </div>
      <p className="mt-2 min-h-[1.5rem] text-sm text-fg-muted">
        {s ? <>Semana del <b>{dateShort(s.semana)}</b>: {s.dias} de {meta} días · {SEMANA_ESTILO[s.estado].label}</> : 'Toca una semana para ver el detalle.'}
      </p>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-fg-muted">
        {(['cumplida', 'en_curso', 'protegida', 'sin_meta'] as const).map((k) => (
          <span key={k} className="flex items-center gap-1.5"><span className={cn('inline-block h-3.5 w-3.5 rounded', SEMANA_ESTILO[k].cls)} />{SEMANA_ESTILO[k].label.split(' (')[0]}</span>
        ))}
      </div>
    </div>
  );
}

const MEDAL_ICON = { visitas: CalendarDays, racha: Flame, antiguedad: Award, habilidades: Sparkles, nivel: Trophy } as const;

/** Medallas: las logradas a color, las que faltan en gris con su avance. */
export function Medallas({ medallas }: { medallas: Medalla[] }) {
  const [all, setAll] = useState(false);
  // Resumen: las 2 logradas más recientes y las 2 que están más cerca; «Ver todas» abre las demás.
  const logradas = medallas.filter((m) => m.logrado).sort((a, b) => (b.fecha ?? '').localeCompare(a.fecha ?? ''));
  const faltan = medallas.filter((m) => !m.logrado).sort((a, b) => b.progreso / b.meta - a.progreso / a.meta);
  const sorted = [...logradas, ...faltan];
  const list = all ? sorted : [...logradas.slice(0, 2), ...faltan.slice(0, 4 - Math.min(2, logradas.length))].slice(0, 4);
  return (
    <>
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {list.map((m) => {
        const I = MEDAL_ICON[m.tipo] ?? MedalIcon;
        return (
          <li key={m.k} className={cn('rounded-lg border p-3 text-center', m.logrado ? 'border-gold-400 bg-gold-50 dark:bg-gold-900/20' : 'border-border bg-surface')}>
            <div className={cn('mx-auto flex h-12 w-12 items-center justify-center rounded-full', m.logrado ? 'bg-gold-400 text-neutral-900' : 'bg-surface-sunken text-fg-subtle')}>
              {m.logrado ? <I className="h-6 w-6" aria-hidden /> : <Lock className="h-5 w-5" aria-hidden />}
            </div>
            <p className="mt-2 text-sm font-bold leading-tight">{m.titulo}</p>
            <p className="mt-0.5 text-xs text-fg-muted">{m.desc}</p>
            {m.logrado
              ? <p className="mt-1 text-xs font-semibold text-gold-800 dark:text-gold-300">{m.fecha ? `Lograda ${dateShort(m.fecha)}` : 'Lograda'}</p>
              : <div className="mt-2"><Avance value={m.progreso} max={m.meta} label={m.titulo} /><p className="mt-1 text-xs text-fg-muted ob-num">{m.progreso} de {m.meta}</p></div>}
          </li>
        );
      })}
    </ul>
    {sorted.length > 4 && <Button className="mt-3" variant="ghost" size="sm" onClick={() => setAll((v) => !v)}>{all ? 'Ver menos' : `Ver las ${sorted.length} medallas`}</Button>}
    </>
  );
}

/** Tarjeta de un reto con su avance; botón de unirse o salir si se pasa onToggle. */
export function RetoCard({ r, onToggle, busy, onTabla, onEdit, staff }: { r: RetoClub; onToggle?: (unirse: boolean) => void; busy?: boolean; onTabla?: () => void; onEdit?: () => void; staff?: boolean }) {
  const hoy = todayMx();
  const estado = retoEstado(r, hoy);
  const unidad = RETO_TIPO[r.tipo].unidad;
  const mine = r.avance ?? 0;
  return (
    <div className="h-full rounded-lg border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-lg font-semibold leading-tight">{r.titulo}</p>
          <p className="mt-0.5 text-sm text-fg-muted">{dateShort(r.inicia)} al {dateShort(r.termina)} · {RETO_TIPO[r.tipo].label}</p>
        </div>
        {estado === 'activo' ? <Badge tone="success" size="sm">En curso</Badge> : estado === 'proximo' ? <Badge tone="info" size="sm">Próximo</Badge> : <Badge size="sm">Terminó</Badge>}
      </div>
      {r.descripcion && <p className="mt-2 text-base">{r.descripcion}</p>}
      {r.colectivo ? (
        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between text-sm"><span className="flex items-center gap-1.5 font-semibold"><Users className="h-4 w-4" /> Meta del club</span><span className="ob-num">{r.avance_club ?? 0} de {r.meta} {unidad(r.meta)}</span></div>
          <Avance value={r.avance_club ?? 0} max={r.meta} tone="accent" label="Avance del club" />
          {r.inscrito && <p className="mt-1 text-sm text-fg-muted">Tu aporte: <b className="ob-num">{mine}</b> {unidad(mine)}</p>}
        </div>
      ) : (r.inscrito || staff) && (
        <div className="mt-3">
          {r.inscrito && <>
            <div className="mb-1 flex items-center justify-between text-sm"><span className="font-semibold">{mine >= r.meta ? '¡Reto cumplido!' : 'Tu avance'}</span><span className="ob-num">{Math.min(mine, r.meta)} de {r.meta} {unidad(r.meta)}</span></div>
            <Avance value={mine} max={r.meta} tone={mine >= r.meta ? 'success' : 'primary'} label="Tu avance" />
          </>}
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-fg-muted">
          <span className="ob-num">{r.participantes}</span> {r.participantes === 1 ? 'participa' : 'participan'}
          {!r.colectivo && <> · <span className="ob-num">{r.completados}</span> {r.completados === 1 ? 'lo cumplió' : 'lo cumplieron'}</>}
          {r.premio && <> · Premio: {r.premio}</>}
        </p>
        <div className="flex gap-2">
          {onEdit && <Button size="sm" variant="ghost" icon={<Pencil className="h-4 w-4" />} onClick={onEdit}>Editar</Button>}
          {onTabla && !r.colectivo && <Button size="sm" variant="ghost" icon={<Trophy className="h-4 w-4" />} onClick={onTabla}>Tabla</Button>}
          {onToggle && estado !== 'terminado' && (r.inscrito
            ? <Button size="sm" variant="ghost" loading={busy} onClick={() => onToggle(false)}>Salir</Button>
            : <Button size="sm" loading={busy} onClick={() => onToggle(true)}>Unirme</Button>)}
        </div>
      </div>
    </div>
  );
}

function Pos({ n }: { n: number }) {
  const cls = n === 1 ? 'bg-gold-400 text-neutral-900' : n === 2 ? 'bg-neutral-300 text-neutral-900' : n === 3 ? 'bg-[#D7A57A] text-neutral-900' : 'bg-surface-sunken text-fg-muted';
  return <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ob-num', cls)}>{n}</span>;
}

/** Botón de aplauso: abre los cuatro aplausos predefinidos. */
function Aplaudir({ onSend, sent }: { onSend: (k: Kudo) => void; sent?: Kudo }) {
  const [open, setOpen] = useState(false);
  if (sent) return <span className="text-xl" title="Ya aplaudiste hoy">{KUDOS.find((k) => k.k === sent)?.emoji}</span>;
  return open ? (
    <div className="flex gap-1" role="group" aria-label="Elige un aplauso">
      {KUDOS.map((k) => <button key={k.k} type="button" className="flex h-9 w-9 items-center justify-center rounded-full text-xl hover:bg-primary-soft" aria-label={k.label} onClick={() => { onSend(k.k); setOpen(false); }}>{k.emoji}</button>)}
    </div>
  ) : <Button size="sm" variant="ghost" onClick={() => setOpen(true)} aria-label="Aplaudir">👏</Button>;
}

/** Tabla de posiciones (constancia o un reto). Muestra solo nombre e inicial; resalta a tu familia. */
export function Tabla({ rows, tipo, meta, onKudo, sent }: {
  rows: (FilaReto | FilaConstancia)[]; tipo: 'constancia' | 'reto'; meta?: number;
  onKudo?: (to: string, k: Kudo) => void; sent?: Record<string, Kudo>;
}) {
  const [all, setAll] = useState(false);
  if (!rows.length) return <p className="py-6 text-center text-base text-fg-muted">Aún no hay nadie en esta tabla.</p>;
  // Los 10 primeros y siempre los de tu familia; el resto al tocar «Ver toda la tabla».
  const shown = all ? rows : rows.filter((r, i) => i < 10 || r.mia);
  return (
    <>
    <ol className="divide-y divide-border">
      {shown.map((r) => {
        const valor = 'dias' in r ? r.dias : r.avance;
        return (
          <li key={r.member_id} className={cn('flex items-center gap-3 px-2 py-2.5', r.mia && 'rounded-md bg-primary-soft')}>
            <Pos n={r.pos} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{r.nombre}{r.mia && <span className="ml-1.5 text-sm font-normal text-primary">(tu familia)</span>}</p>
              <p className="text-sm text-fg-muted">
                {CATEGORIA_CORTA[r.categoria]}
                {'racha' in r && r.racha > 0 && <> · <Flame className="inline h-3.5 w-3.5 text-gold-600" aria-hidden /> {r.racha} sem.</>}
                {'completado' in r && r.completado && <> · <b className="text-success-700 dark:text-success-500">Cumplido</b></>}
              </p>
            </div>
            <span className="text-lg font-bold ob-num">{valor}{tipo === 'reto' && meta ? <span className="text-sm font-normal text-fg-muted">/{meta}</span> : <span className="text-sm font-normal text-fg-muted"> días</span>}</span>
            {onKudo && !r.mia && <Aplaudir onSend={(k) => onKudo(r.member_id, k)} sent={sent?.[r.member_id]} />}
          </li>
        );
      })}
    </ol>
    {shown.length < rows.length || all ? <Button className="mt-2" variant="ghost" size="sm" onClick={() => setAll((v) => !v)}>{all ? 'Ver solo los primeros' : `Ver toda la tabla (${rows.length})`}</Button> : null}
    </>
  );
}
