import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Button, Card, ConfirmFooter, Field, Input, Modal, PageHeader, Select, Tabs } from '@/design-system';
import { useAuth } from '@/lib/auth';
import { useAction } from '@/lib/hooks';
import { supabase, must } from '@/lib/supabase';
import { useCatalog, staffName, type Catalog } from '@/lib/catalog';
import { WEEKDAYS, daysLabel, hhmm, money0, rangeLabel } from '@/lib/format';
import type { DeptCode, Level } from '@/lib/types';
import { CapacityBar, ErrorBox, Loading } from '@/components/common';

/** Niveles por área y sus grupos con cupo, horario e instructor. */
export default function Niveles() {
  const nav = useNavigate();
  const { myAreas, allDepartments, isManager, profile, hasDept } = useAuth();
  const { data: cat, error, loading, reload } = useCatalog();
  const areas = allDepartments.filter((d) => d.is_area && myAreas.includes(d.code) && cat?.levels.some((l) => l.department === d.code));
  const [area, setArea] = useState<string>('');
  const [newGroup, setNewGroup] = useState<Level | null>(null);
  if (loading && !cat) return <Loading />;
  if (error || !cat) return <ErrorBox error={error ?? 'Sin datos'} onRetry={reload} />;
  const current = (area || areas[0]?.code) as DeptCode | undefined;
  const canEdit = (d: DeptCode) => isManager || (profile?.role === 'coordinador' && hasDept(d));
  const levels = cat.levels.filter((l) => l.department === current && l.active);

  return (
    <>
      <PageHeader title="Niveles y grupos" description="Cada nivel tiene un rango de edad. Al inscribir, solo se ofrecen los grupos que corresponden a la edad del alumno." />
      <Tabs className="mb-6" value={current ?? ''} onChange={setArea}
        items={areas.map((a) => ({ id: a.code, label: a.name, count: cat.groups.filter((g) => g.department === a.code && g.active).length }))} />
      {levels.length === 0 && <p className="text-base text-fg-muted">Esta área aún no tiene niveles. Dirección puede crearlos en Configuración.</p>}
      <div className="space-y-6">
        {levels.map((l) => {
          const gs = cat.groups.filter((g) => g.level_id === l.id && g.active);
          return (
            <Card key={l.id}>
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-bold">{l.name}</h2>
                  <p className="text-base text-fg-muted">{rangeLabel(Number(l.min_age), Number(l.max_age))}{l.description ? ` · ${l.description}` : ''}</p>
                </div>
                {current && canEdit(current) && <Button variant="secondary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setNewGroup(l)}>Nuevo grupo</Button>}
              </div>
              {gs.length === 0 ? <p className="text-base text-fg-muted">Sin grupos abiertos.</p> : (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {gs.map((g) => (
                    <button key={g.group_id} onClick={() => nav(`/grupos/${g.group_id}`)}
                      className="rounded-lg border border-border bg-surface p-4 text-left transition hover:border-primary hover:shadow-sm">
                      <p className="text-lg font-semibold">{daysLabel(g.weekdays)}</p>
                      <p className="text-base text-fg-muted">{hhmm(g.start_time)}–{hhmm(g.end_time)} · {g.location ?? 'Sin ubicación'}</p>
                      <p className="mb-2 text-sm text-fg-muted">{g.name} · {staffName(cat, g.coach_id)}</p>
                      <CapacityBar used={Number(g.enrolled)} total={g.capacity} />
                      <p className="mt-1 text-sm">
                        {g.free_spots > 0 ? <span className="font-semibold text-success-700">{g.free_spots} lugares libres</span> : <span className="font-semibold text-danger-700">Lleno</span>}
                        {Number(g.waitlist) > 0 && <span className="text-info-700"> · {g.waitlist} en espera</span>}
                        {g.plan_id && <span className="text-fg-muted"> · {money0(cat.plans.find((p) => p.id === g.plan_id)?.price_monthly)}/mes</span>}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </Card>
          );
        })}
      </div>
      <GroupModal level={newGroup} onClose={() => setNewGroup(null)} cat={cat} onDone={reload} />
    </>
  );
}

export function GroupModal({ level, onClose, cat, onDone, groupId }: { level: Level | null; onClose: () => void; cat: Catalog; onDone: () => void; groupId?: string }) {
  const existing = groupId ? cat.groups.find((g) => g.group_id === groupId) : undefined;
  const [name, setName] = useState('');
  const [days, setDays] = useState<number[]>([]);
  const [start, setStart] = useState('16:00');
  const [end, setEnd] = useState('17:00');
  const [cap, setCap] = useState('8');
  const [loc, setLoc] = useState('');
  const [coach, setCoach] = useState('');
  const [plan, setPlan] = useState('');
  const [inited, setInited] = useState<string | null>(null);
  const { busy, run } = useAction();
  const key = level ? level.id + (groupId ?? '') : null;
  if (key && inited !== key) {
    setInited(key);
    setName(existing?.name ?? ''); setDays(existing?.weekdays ?? [2, 4]);
    setStart(existing ? hhmm(existing.start_time) : '16:00'); setEnd(existing ? hhmm(existing.end_time) : '17:00');
    setCap(String(existing?.capacity ?? 8)); setLoc(existing?.location ?? ''); setCoach(existing?.coach_id ?? '');
    setPlan(existing?.plan_id ?? cat.plans.find((p) => p.department === level!.department && p.kind === 'curso')?.id ?? '');
  }
  if (!level && inited) setInited(null);
  const coaches = cat.staff.filter((s) => s.active && ['coach', 'coordinador'].includes(s.role));
  const cycle = cat.cycles.find((c) => c.department === level?.department && c.is_current);

  async function save() {
    const r = await run(async () => {
      if (!days.length) throw new Error('Elige al menos un día.');
      if (end <= start) throw new Error('La hora de salida debe ser después de la de entrada.');
      const payload = {
        level_id: level!.id, cycle_id: existing?.cycle_id ?? cycle?.id ?? null, plan_id: plan || null,
        name: name.trim() || `${level!.name} ${days.map((d) => WEEKDAYS[d]).join('-')} ${start}`,
        weekdays: [...days].sort(), start_time: start, end_time: end, capacity: Number(cap) || 1,
        location: loc || null, coach_id: coach || null,
      };
      if (groupId) return must(supabase.from('groups').update(payload).eq('id', groupId).select());
      return must(supabase.from('groups').insert(payload).select());
    }, groupId ? 'Grupo actualizado' : 'Grupo creado');
    if (r) { onDone(); onClose(); }
  }

  return (
    <Modal open={!!level} onClose={onClose} size="lg" title={groupId ? 'Editar grupo' : `Nuevo grupo de ${level?.name ?? ''}`}
      footer={<ConfirmFooter onCancel={onClose} onConfirm={save} loading={busy} confirmLabel={groupId ? 'Guardar' : 'Crear grupo'} />}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <p className="mb-2 text-base font-medium">Días de clase</p>
          <div className="flex flex-wrap gap-2">
            {[1, 2, 3, 4, 5, 6, 7].map((d) => (
              <button key={d} type="button" onClick={() => setDays((xs) => xs.includes(d) ? xs.filter((x) => x !== d) : [...xs, d])}
                className={`h-control min-w-[64px] rounded-md border px-3 text-base font-semibold ${days.includes(d) ? 'border-primary bg-primary text-primary-fg' : 'border-border-strong bg-surface'}`}
                aria-pressed={days.includes(d)}>{WEEKDAYS[d]}</button>
            ))}
          </div>
        </div>
        <Field label="Entrada">{(p) => <Input {...p} type="time" value={start} onChange={(e) => setStart(e.target.value)} />}</Field>
        <Field label="Salida">{(p) => <Input {...p} type="time" value={end} onChange={(e) => setEnd(e.target.value)} />}</Field>
        <Field label="Cupo máximo" hint="Al llenarse, los siguientes van a lista de espera.">{(p) => <Input {...p} type="number" min={1} value={cap} onChange={(e) => setCap(e.target.value)} />}</Field>
        <Field label="Lugar">{(p) => <Input {...p} value={loc} onChange={(e) => setLoc(e.target.value)} placeholder="Alberca chica, Salón 2…" />}</Field>
        <Field label="Instructor">{(p) => <Select {...p} value={coach} onChange={(e) => setCoach(e.target.value)}>
          <option value="">Sin asignar</option>{coaches.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}</Select>}</Field>
        <Field label="Plan (precio)">{(p) => <Select {...p} value={plan} onChange={(e) => setPlan(e.target.value)}>
          <option value="">Sin plan</option>
          {cat.plans.filter((pl) => pl.department === level?.department).map((pl) => <option key={pl.id} value={pl.id}>{pl.name} · {money0(pl.price_monthly)}</option>)}</Select>}</Field>
        <Field label="Nombre (opcional)" className="sm:col-span-2">{(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} placeholder="Se genera solo si lo dejas vacío" />}</Field>
      </div>
    </Modal>
  );
}
