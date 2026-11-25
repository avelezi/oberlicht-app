import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader, Segmented } from '@/design-system';
import { useAuth } from '@/lib/auth';
import { useCatalog, staffName } from '@/lib/catalog';
import { WEEKDAYS_LONG, hhmm, isoDowMx } from '@/lib/format';
import { ErrorBox, Loading } from '@/components/common';

/** Horario semanal de todos los grupos, por día. */
export default function Clases() {
  const nav = useNavigate();
  const { myAreas, allDepartments, profile } = useAuth();
  const { data: cat, error, reload } = useCatalog();
  const [area, setArea] = useState('todas');
  const [mine, setMine] = useState(profile?.role === 'coach' ? 'mias' : 'todas');
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!cat) return <Loading />;
  const areas = allDepartments.filter((d) => d.is_area && myAreas.includes(d.code) && cat.groups.some((g) => g.department === d.code));
  const groups = cat.groups.filter((g) => g.active && myAreas.includes(g.department) && (area === 'todas' || g.department === area) && (mine === 'todas' || g.coach_id === profile?.id));
  const today = isoDowMx();

  return (
    <>
      <PageHeader title="Horario de clases" description="Toca una clase para ver su lista de alumnos." />
      <div className="mb-6 flex flex-wrap gap-3">
        <Segmented value={area} onChange={setArea} options={[{ id: 'todas', label: 'Todas' }, ...areas.map((a) => ({ id: a.code, label: a.name }))]} />
        {(profile?.role === 'coach' || profile?.role === 'coordinador') && (
          <Segmented value={mine} onChange={setMine} options={[{ id: 'mias', label: 'Mis clases' }, { id: 'todas', label: 'Todo el equipo' }]} />
        )}
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[1, 2, 3, 4, 5, 6, 7].map((d) => {
          const day = groups.filter((g) => g.weekdays.includes(d)).sort((a, b) => a.start_time.localeCompare(b.start_time));
          if (!day.length && d > 5) return null;
          return (
            <section key={d} className={`rounded-lg border p-3 ${d === today ? 'border-primary bg-primary-soft/40' : 'border-border bg-surface'}`}>
              <h2 className="mb-3 text-lg font-bold">{WEEKDAYS_LONG[d]}{d === today && <span className="ml-2 text-sm font-semibold text-primary">Hoy</span>}</h2>
              {day.length === 0 ? <p className="text-sm text-fg-muted">Sin clases</p> : (
                <ul className="space-y-2">
                  {day.map((g) => (
                    <li key={g.group_id}>
                      <button onClick={() => nav(`/grupos/${g.group_id}`)}
                        className="w-full rounded-md border border-border bg-surface p-3 text-left hover:border-primary"
                        style={{ borderLeft: `4px solid var(--ob-area-${g.department}, var(--ob-primary))` }}>
                        <p className="text-base font-semibold ob-num">{hhmm(g.start_time)}–{hhmm(g.end_time)}</p>
                        <p className="text-base">{g.level_name}</p>
                        <p className="text-sm text-fg-muted">{staffName(cat, g.coach_id)} · {g.location ?? ''}</p>
                        <p className={`text-sm font-semibold ${g.free_spots > 0 ? 'text-success-700' : 'text-danger-700'}`}>{g.enrolled}/{g.capacity} {g.free_spots > 0 ? '' : '· lleno'}</p>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}
