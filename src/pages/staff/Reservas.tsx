import { useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, UserPlus, XCircle } from 'lucide-react';
import { Button, Card, ConfirmFooter, EmptyState, Field, Input, Modal, PageHeader, Segmented, Select, StatusBadge } from '@/design-system';
import { useAuth } from '@/lib/auth';
import { useAction, useAsync } from '@/lib/hooks';
import { supabase, must } from '@/lib/supabase';
import { useCatalog, staffName } from '@/lib/catalog';
import { dateLong, fullName, money0, timeOnly, todayMx } from '@/lib/format';
import type { Booking, DeptCode, Member, Slot } from '@/lib/types';
import { Area, ErrorBox, Loading } from '@/components/common';
import { MemberPicker } from '@/components/MemberPicker';

type B = Booking & { members: Pick<Member, 'id' | 'first_name' | 'last_name' | 'family_id'> };
type S = Slot & { bookings: B[] };

const addDays = (d: string, n: number) => { const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
/** Ciudad de México está en UTC−6 todo el año (sin horario de verano desde 2022). */
const mxIso = (date: string, time: string) => `${date}T${time}:00-06:00`;

/** Reservas del personal: clases con cupo, sesiones privadas y espacios, día por día. */
export default function Reservas() {
  const { myAreas, allDepartments, profile, isManager, hasDept } = useAuth();
  const { data: cat } = useCatalog();
  const [date, setDate] = useState(todayMx());
  const [area, setArea] = useState('todas');
  const [creating, setCreating] = useState(false);
  const [bookFor, setBookFor] = useState<S | null>(null);
  const { busy, run } = useAction();

  const { data, error, loading, reload } = useAsync(async () => {
    const rows = (await must(supabase.from('slots').select('*, bookings(*, members(id, first_name, last_name, family_id))')
      .gte('starts_at', mxIso(date, '00:00')).lt('starts_at', mxIso(addDays(date, 1), '00:00')).order('starts_at'))) as S[];
    return rows.filter((s) => myAreas.includes(s.department));
  }, [date, myAreas.join(',')]);

  const areas = allDepartments.filter((d) => d.is_area && myAreas.includes(d.code));
  const slots = (data ?? []).filter((s) => area === 'todas' || s.department === area);
  const canManage = (d: DeptCode) => isManager || profile?.role === 'recepcion' || (profile?.role === 'coordinador' && hasDept(d));

  async function mark(b: B, status: Booking['status']) {
    const r = await run(() => must(supabase.from('bookings').update({ status }).eq('id', b.id).select()));
    if (r) reload();
  }
  async function cancelBooking(b: B) {
    const r = await run(() => must(supabase.rpc('cancelar_reserva', { p_booking: b.id })), 'Reserva cancelada');
    if (r) reload();
  }
  async function cancelSlot(s: S) {
    const r = await run(async () => {
      for (const b of s.bookings.filter((x) => x.status === 'reservada')) await must(supabase.rpc('cancelar_reserva', { p_booking: b.id }));
      return must(supabase.from('slots').update({ cancelled: true }).eq('id', s.id).select());
    }, 'Horario cancelado y reservas liberadas');
    if (r) reload();
  }

  return (
    <>
      <PageHeader title="Reservas" description="Clases de Oberfit, sesiones de terapia o nutrición y clases privadas."
        actions={(isManager || profile?.role === 'recepcion' || profile?.role === 'coordinador' || profile?.role === 'coach') &&
          <Button icon={<Plus className="h-5 w-5" />} onClick={() => setCreating(true)}>Abrir horario</Button>} />
      <Card className="mb-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-2">
            <Button variant="secondary" aria-label="Día anterior" onClick={() => setDate(addDays(date, -1))} icon={<ChevronLeft className="h-5 w-5" />} />
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Fecha" className="w-44" />
            <Button variant="secondary" aria-label="Día siguiente" onClick={() => setDate(addDays(date, 1))} icon={<ChevronRight className="h-5 w-5" />} />
            {date !== todayMx() && <Button variant="ghost" onClick={() => setDate(todayMx())}>Hoy</Button>}
          </div>
          <Segmented value={area} onChange={setArea} options={[{ id: 'todas', label: 'Todas' }, ...areas.map((a) => ({ id: a.code, label: a.name }))]} />
        </div>
        <p className="mt-2 text-base font-semibold capitalize">{dateLong(date)}</p>
      </Card>

      {error ? <ErrorBox error={error} onRetry={reload} /> : loading && !data ? <Loading /> : slots.length === 0 ? (
        <EmptyState title="No hay horarios abiertos este día" description="Abre un horario para que las familias puedan reservar desde su portal." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {slots.map((s) => {
            const active = s.bookings.filter((b) => b.status !== 'cancelada');
            const full = active.length >= s.capacity;
            return (
              <Card key={s.id} className={s.cancelled ? 'opacity-60' : undefined}>
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-bold ob-num">{timeOnly(s.starts_at)}–{timeOnly(s.ends_at)} · {s.title}</p>
                    <p className="text-base text-fg-muted">{staffName(cat, s.coach_id)} · {s.location ?? 'Sin lugar'}{Number(s.price) > 0 ? ` · ${money0(s.price)}` : ''}</p>
                    <div className="mt-1 flex items-center gap-2"><Area code={s.department} />
                      {s.cancelled ? <StatusBadge status="cancelado" /> : <span className={`text-sm font-semibold ${full ? 'text-danger-700' : 'text-success-700'}`}>{active.length}/{s.capacity} {full ? '· lleno' : 'lugares ocupados'}</span>}
                    </div>
                  </div>
                </div>
                {active.length > 0 && (
                  <ul className="mb-3 divide-y divide-border rounded-md border border-border">
                    {active.map((b) => (
                      <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                        <span className="text-base font-medium">{fullName(b.members)}{b.used_session && <span className="ml-2 text-sm text-fg-muted">(de su paquete)</span>}</span>
                        <div className="flex gap-1">
                          {b.status === 'reservada' ? (<>
                            <Button size="sm" variant="ghost" onClick={() => mark(b, 'asistio')}>✓ Vino</Button>
                            <Button size="sm" variant="ghost" onClick={() => mark(b, 'no_asistio')}>✕ Faltó</Button>
                            <Button size="sm" variant="ghost" onClick={() => cancelBooking(b)} aria-label="Cancelar reserva"><XCircle className="h-4 w-4" /></Button>
                          </>) : <StatusBadge status={b.status === 'asistio' ? 'asistio' : 'falta'} size="sm" />}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                {!s.cancelled && (
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" icon={<UserPlus className="h-4 w-4" />} disabled={full} onClick={() => setBookFor(s)}>Reservar para un socio</Button>
                    {canManage(s.department) && <Button size="sm" variant="ghost" loading={busy} onClick={() => cancelSlot(s)}>Cancelar horario</Button>}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {cat && <SlotModal open={creating} onClose={() => setCreating(false)} date={date} areas={areas.map((a) => ({ code: a.code, name: a.name }))}
        coaches={cat.staff.filter((x) => x.active && ['coach', 'coordinador'].includes(x.role))} defaultCoach={profile?.role === 'coach' ? profile.id : ''} onDone={reload} />}
      <Modal open={!!bookFor} onClose={() => setBookFor(null)} title={`Reservar: ${bookFor?.title ?? ''}`}>
        <p className="mb-3 text-base text-fg-muted">Si tiene paquete del área se descuenta una sesión; si no y la sesión tiene costo, se genera el cargo.</p>
        <MemberPicker autoFocus onPick={async (m) => {
          const r = await run(() => must(supabase.rpc('reservar', { p_slot: bookFor!.id, p_member: m.id })), `Reservado para ${m.first_name}`);
          if (r) { setBookFor(null); reload(); }
        }} />
      </Modal>
    </>
  );
}

function SlotModal({ open, onClose, date, areas, coaches, defaultCoach, onDone }: {
  open: boolean; onClose: () => void; date: string; areas: { code: DeptCode; name: string }[];
  coaches: { id: string; full_name: string }[]; defaultCoach: string; onDone: () => void;
}) {
  const [f, setF] = useState({ department: '' as string, title: '', kind: 'clase', day: date, start: '07:00', end: '08:00', capacity: '12', price: '0', location: '', coach: defaultCoach, repeat: '1' });
  const [last, setLast] = useState(false);
  const { busy, run } = useAction();
  if (open && !last) { setLast(true); setF((x) => ({ ...x, day: date, department: x.department || areas.find((a) => a.code === 'oberfit')?.code || areas[0]?.code || '' })); }
  if (!open && last) setLast(false);
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));

  async function save() {
    const r = await run(async () => {
      if (!f.title.trim()) throw new Error('Escribe el nombre de la clase o sesión.');
      if (f.end <= f.start) throw new Error('La hora de fin debe ser después del inicio.');
      const weeks = Math.max(1, Math.min(12, Number(f.repeat) || 1));
      const rows = Array.from({ length: weeks }, (_, i) => {
        const d = addDays(f.day, i * 7);
        return {
          department: f.department, title: f.title.trim(), kind: f.kind, coach_id: f.coach || null,
          starts_at: mxIso(d, f.start), ends_at: mxIso(d, f.end), capacity: Number(f.capacity) || 1, price: Number(f.price) || 0, location: f.location || null,
        };
      });
      return must(supabase.from('slots').insert(rows).select());
    }, 'Horario abierto');
    if (r) { onDone(); onClose(); }
  }

  return (
    <Modal open={open} onClose={onClose} size="lg" title="Abrir horario para reservar"
      footer={<ConfirmFooter onCancel={onClose} onConfirm={save} loading={busy} confirmLabel="Abrir horario" />}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Área">{(p) => <Select {...p} value={f.department} onChange={(e) => set('department', e.target.value)}>{areas.map((a) => <option key={a.code} value={a.code}>{a.name}</option>)}</Select>}</Field>
        <Field label="Tipo">{(p) => <Select {...p} value={f.kind} onChange={(e) => { set('kind', e.target.value); if (e.target.value === 'privada') set('capacity', '1'); }}>
          <option value="clase">Clase grupal</option><option value="privada">Sesión privada (1 persona)</option><option value="espacio">Espacio (carril, cancha)</option></Select>}</Field>
        <Field label="Nombre" className="sm:col-span-2">{(p) => <Input {...p} value={f.title} onChange={(e) => set('title', e.target.value)} placeholder="Ej. Spinning, Terapia física, Consulta de nutrición" />}</Field>
        <Field label="Fecha">{(p) => <Input {...p} type="date" value={f.day} onChange={(e) => set('day', e.target.value)} />}</Field>
        <Field label="Repetir cada semana" hint="Número de semanas (1 = solo este día)">{(p) => <Input {...p} type="number" min={1} max={12} value={f.repeat} onChange={(e) => set('repeat', e.target.value)} />}</Field>
        <Field label="Inicio">{(p) => <Input {...p} type="time" value={f.start} onChange={(e) => set('start', e.target.value)} />}</Field>
        <Field label="Fin">{(p) => <Input {...p} type="time" value={f.end} onChange={(e) => set('end', e.target.value)} />}</Field>
        <Field label="Lugares">{(p) => <Input {...p} type="number" min={1} value={f.capacity} onChange={(e) => set('capacity', e.target.value)} />}</Field>
        <Field label="Costo por sesión" hint="0 si está incluida en la membresía">{(p) => <Input {...p} type="number" min={0} value={f.price} onChange={(e) => set('price', e.target.value)} />}</Field>
        <Field label="Instructor">{(p) => <Select {...p} value={f.coach} onChange={(e) => set('coach', e.target.value)}><option value="">Sin asignar</option>{coaches.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}</Select>}</Field>
        <Field label="Lugar">{(p) => <Input {...p} value={f.location} onChange={(e) => set('location', e.target.value)} placeholder="Salón de spinning" />}</Field>
      </div>
    </Modal>
  );
}
