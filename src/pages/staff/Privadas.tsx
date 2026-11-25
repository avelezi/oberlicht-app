import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Badge, Button, ConfirmFooter, Field, Input, Modal, PageHeader, Select, StatCard, Table, Tabs, Textarea } from '@/design-system';
import { useAuth } from '@/lib/auth';
import { useAction, useAsync } from '@/lib/hooks';
import { supabase, must } from '@/lib/supabase';
import { downloadCsv, fullName, money, timeOnly, todayMx, weekdayLong } from '@/lib/format';
import { Area, ErrorBox, Loading } from '@/components/common';
import { MemberPicker, type PickedMember } from '@/components/MemberPicker';
import type { DeptCode } from '@/lib/types';

interface Session {
  id: string; member_id: string; family_id: string; instructor_id: string; department: DeptCode; starts_at: string; duration_min: number;
  price: number; commission_pct: number; status: 'programada' | 'realizada' | 'cancelada' | 'no_asistio'; notes: string | null;
  members: { first_name: string; last_name: string | null } | null; profiles: { full_name: string } | null;
}
interface Rate { profile_id: string; department: DeptCode; price: number | null; commission_pct: number }
interface Comision { instructor_id: string; instructor: string; sesiones: number; realizadas: number; no_asistio: number; ingresos: number; comision: number }
interface PD { profile_id: string; department: DeptCode; profiles: { full_name: string; active: boolean; role: string } | null }

const ST: Record<Session['status'], { label: string; tone: 'info' | 'success' | 'neutral' | 'warning' }> = {
  programada: { label: 'Programada', tone: 'info' }, realizada: { label: 'Realizada', tone: 'success' }, cancelada: { label: 'Cancelada', tone: 'neutral' }, no_asistio: { label: 'No asistió', tone: 'warning' },
};
const addDays = (d: string, n: number) => { const x = new Date(`${d}T12:00:00-06:00`); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
const monthStart = () => `${todayMx().slice(0, 7)}-01`;

/** Clases privadas: agenda por instructor, cobro automático a la familia y comisiones. */
export default function Privadas() {
  const { isManager, isFrontOffice, profile } = useAuth();
  const [tab, setTab] = useState('agenda');
  const canSeeComm = isManager || profile?.role === 'coordinador' || profile?.role === 'coach';
  return (
    <>
      <PageHeader title="Clases privadas" description="Al agendar se genera el cargo a la familia. Marca cada clase como realizada para calcular la comisión del instructor." />
      <Tabs className="mb-4" value={tab} onChange={setTab} items={[
        { id: 'agenda', label: 'Agenda' },
        ...(canSeeComm ? [{ id: 'comisiones', label: profile?.role === 'coach' ? 'Mis comisiones' : 'Comisiones' }] : []),
        ...(isManager ? [{ id: 'tarifas', label: 'Tarifas por instructor' }] : []),
      ]} />
      {tab === 'agenda' && <Agenda canSchedule={isFrontOffice || profile?.role === 'coordinador'} />}
      {tab === 'comisiones' && <Comisiones />}
      {tab === 'tarifas' && <Tarifas />}
    </>
  );
}

function useInstructors() {
  return useAsync(async () => (await must(supabase.from('profile_departments').select('profile_id, department, profiles!inner(full_name, active, role)').in('profiles.role', ['coach', 'coordinador']).eq('profiles.active', true))) as unknown as PD[], []);
}

function Agenda({ canSchedule }: { canSchedule: boolean }) {
  const { myAreas, allDepartments, isFrontOffice } = useAuth();
  const [from, setFrom] = useState(todayMx());
  const [days, setDays] = useState(7);
  const [newOpen, setNewOpen] = useState(false);
  const [mark, setMark] = useState<{ s: Session; status: Session['status']; notes: string } | null>(null);
  const { busy, run } = useAction();
  const { data, error, reload } = useAsync(async () => {
    const a = new Date(`${from}T00:00:00-06:00`).toISOString();
    const b = new Date(`${addDays(from, days)}T00:00:00-06:00`).toISOString();
    return (await must(supabase.from('private_sessions').select('*, members(first_name, last_name), profiles!private_sessions_instructor_id_fkey(full_name)').gte('starts_at', a).lt('starts_at', b).order('starts_at'))) as unknown as Session[];
  }, [from, days]);
  const pending = data?.filter((s) => s.status === 'programada' && new Date(s.starts_at).getTime() + s.duration_min * 60000 < Date.now()) ?? [];

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="text-sm font-semibold">Desde<Input className="mt-1" type="date" value={from} onChange={(e) => setFrom(e.target.value || todayMx())} /></label>
        <label className="text-sm font-semibold">Ver<Select className="mt-1" value={days} onChange={(e) => setDays(Number(e.target.value))}><option value={1}>1 día</option><option value={7}>7 días</option><option value={14}>14 días</option><option value={31}>31 días</option></Select></label>
        <Button variant="secondary" onClick={() => setFrom(addDays(todayMx(), -7))}>Semana pasada</Button>
        {canSchedule && <Button className="ml-auto" icon={<Plus className="h-5 w-5" />} onClick={() => setNewOpen(true)}>Agendar clase privada</Button>}
      </div>
      {pending.length > 0 && <p className="mb-3 rounded-md bg-warning-50 p-3 text-base text-warning-700">{pending.length} {pending.length === 1 ? 'clase ya pasó y sigue' : 'clases ya pasaron y siguen'} como programada. Márcalas para que cuenten en las comisiones.</p>}
      {error ? <ErrorBox error={error} onRetry={reload} /> : !data ? <Loading /> : (
        <Table rows={data} rowKey={(s) => s.id} empty="Sin clases privadas en estas fechas." columns={[
          { key: 'd', header: 'Cuándo', cell: (s) => <div><p className="font-semibold first-letter:uppercase">{weekdayLong(s.starts_at)}</p><p className="text-sm text-fg-muted">{timeOnly(s.starts_at)} · {s.duration_min} min</p></div> },
          { key: 'm', header: 'Alumno', cell: (s) => <div><p className="font-semibold">{s.members ? fullName(s.members) : '—'}</p><p className="text-sm"><Area code={s.department} /></p></div> },
          { key: 'i', header: 'Instructor', hideOnMobile: true, cell: (s) => s.profiles?.full_name ?? '—' },
          { key: 'p', header: 'Precio', align: 'right', hideOnMobile: true, cell: (s) => <span className="ob-num">{money(s.price)}</span> },
          { key: 's', header: 'Estado', cell: (s) => <Badge tone={ST[s.status].tone}>{ST[s.status].label}</Badge> },
          { key: 'a', header: '', align: 'right', cell: (s) => s.status === 'programada' ? <Button size="sm" variant="secondary" onClick={() => setMark({ s, status: 'realizada', notes: s.notes ?? '' })}>Marcar</Button> : null },
        ]} />
      )}
      {newOpen && <NuevaPrivada areas={allDepartments.filter((d) => d.is_area && (isFrontOffice || myAreas.includes(d.code)))} onClose={() => setNewOpen(false)} onDone={() => { setNewOpen(false); reload(); }} />}
      <Modal open={!!mark} onClose={() => setMark(null)} title="¿Cómo fue la clase?"
        footer={<ConfirmFooter onCancel={() => setMark(null)} confirmLabel="Guardar" loading={busy} danger={mark?.status === 'cancelada'} onConfirm={async () => {
          const ok = await run(() => must(supabase.rpc('marcar_privada', { p_session: mark!.s.id, p_status: mark!.status, p_notes: mark!.notes || null })), 'Clase actualizada');
          if (ok) { setMark(null); reload(); }
        }} />}>
        {mark && <div className="grid gap-4">
          <div className="grid grid-cols-3 gap-2">
            {(['realizada', 'no_asistio', 'cancelada'] as const).map((k) => <button key={k} type="button" onClick={() => setMark({ ...mark, status: k })}
              className={`min-h-[48px] rounded-md border px-2 text-base font-semibold ${mark.status === k ? 'border-primary bg-primary-soft text-primary' : 'border-border'}`}>{ST[k].label}</button>)}
          </div>
          {mark.status === 'cancelada' && <p className="text-sm text-fg-muted">Al cancelar se cancela también el cargo a la familia si no lo ha pagado.</p>}
          {mark.status === 'no_asistio' && <p className="text-sm text-fg-muted">El cargo a la familia se mantiene.</p>}
          <Field label="Notas">{(p) => <Textarea {...p} rows={2} value={mark.notes} onChange={(e) => setMark({ ...mark, notes: e.target.value })} />}</Field>
        </div>}
      </Modal>
    </>
  );
}

function NuevaPrivada({ areas, onClose, onDone }: { areas: { code: DeptCode; name: string }[]; onClose: () => void; onDone: () => void }) {
  const [member, setMember] = useState<PickedMember | null>(null);
  const [dept, setDept] = useState<DeptCode | ''>(areas[0]?.code ?? '');
  const [instr, setInstr] = useState('');
  const [date, setDate] = useState(todayMx());
  const [time, setTime] = useState('16:00');
  const [dur, setDur] = useState('');
  const [price, setPrice] = useState('');
  const [notes, setNotes] = useState('');
  const { busy, run } = useAction();
  const { data: pds } = useInstructors();
  const { data: rates } = useAsync(async () => (await must(supabase.from('instructor_rates').select('*'))) as Rate[], []);
  const instructors = (pds ?? []).filter((p) => p.department === dept);
  const rate = rates?.find((r) => r.profile_id === instr && r.department === dept);
  return (
    <Modal open onClose={onClose} size="lg" title="Agendar clase privada"
      footer={<ConfirmFooter onCancel={onClose} confirmLabel="Agendar y generar cargo" loading={busy} onConfirm={async () => {
        if (!member || !dept || !instr) return;
        const ok = await run(() => must(supabase.rpc('agendar_privada', {
          p_member: member.id, p_instructor: instr, p_department: dept, p_starts: new Date(`${date}T${time}:00-06:00`).toISOString(),
          p_duration: dur ? Number(dur) : null, p_price: price !== '' ? Number(price) : null, p_notes: notes || null,
        })), 'Clase agendada. El cargo quedó en la cuenta de la familia.');
        if (ok) onDone();
      }} />}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <p className="mb-1 text-sm font-semibold">Alumno</p>
          {member ? <div className="flex items-center justify-between rounded-md border border-border px-3 py-2"><span className="font-semibold">{fullName(member)} <span className="font-normal text-fg-muted">{member.families?.name}</span></span><Button size="sm" variant="ghost" onClick={() => setMember(null)}>Cambiar</Button></div> : <MemberPicker onPick={setMember} autoFocus />}
        </div>
        <Field label="Área">{(p) => <Select {...p} value={dept} onChange={(e) => { setDept(e.target.value as DeptCode); setInstr(''); }}>{areas.map((a) => <option key={a.code} value={a.code}>{a.name}</option>)}</Select>}</Field>
        <Field label="Instructor">{(p) => <Select {...p} value={instr} onChange={(e) => setInstr(e.target.value)}><option value="">Elige…</option>{instructors.map((i) => <option key={i.profile_id} value={i.profile_id}>{i.profiles?.full_name}</option>)}</Select>}</Field>
        <Field label="Día">{(p) => <Input {...p} type="date" min={todayMx()} value={date} onChange={(e) => setDate(e.target.value)} />}</Field>
        <Field label="Hora">{(p) => <Input {...p} type="time" step={900} value={time} onChange={(e) => setTime(e.target.value)} />}</Field>
        <Field label="Duración (min)" hint="Vacío = la de Configuración">{(p) => <Input {...p} type="number" min={15} max={240} step={15} value={dur} onChange={(e) => setDur(e.target.value)} />}</Field>
        <Field label="Precio (MXN)" hint={rate?.price != null ? `Tarifa del instructor: ${money(rate.price)}` : 'Vacío = precio general'}>{(p) => <Input {...p} type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} />}</Field>
        <Field label="Notas" className="sm:col-span-2">{(p) => <Textarea {...p} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Objetivo de la clase, nivel…" />}</Field>
      </div>
    </Modal>
  );
}

function Comisiones() {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(todayMx());
  const { data, error, reload } = useAsync(async () => (await must(supabase.rpc('comisiones_privadas', { p_from: from, p_to: to }))) as Comision[], [from, to]);
  return (
    <>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="text-sm font-semibold">Desde<Input className="mt-1" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="text-sm font-semibold">Hasta<Input className="mt-1" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        {data && data.length > 0 && <Button variant="secondary" className="ml-auto" onClick={() => downloadCsv(`comisiones-${from}-a-${to}`, data.map((c) => ({ Instructor: c.instructor, Clases: c.sesiones, Realizadas: c.realizadas, 'No asistio': c.no_asistio, Ingresos: c.ingresos, Comision: c.comision })))}>Descargar para nómina</Button>}
      </div>
      {error ? <ErrorBox error={error} onRetry={reload} /> : !data ? <Loading /> : <>
        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3">
          <StatCard label="Ingresos por privadas" value={money(data.reduce((a, c) => a + Number(c.ingresos), 0))} />
          <StatCard label="Comisiones a pagar" value={money(data.reduce((a, c) => a + Number(c.comision), 0))} />
          <StatCard label="Clases realizadas" value={String(data.reduce((a, c) => a + c.realizadas, 0))} />
        </div>
        <Table rows={data} rowKey={(c) => c.instructor_id} empty="Sin clases en este periodo." columns={[
          { key: 'i', header: 'Instructor', cell: (c) => <span className="font-semibold">{c.instructor}</span> },
          { key: 's', header: 'Clases', align: 'right', cell: (c) => <span className="ob-num">{c.realizadas} realizadas{c.no_asistio ? ` · ${c.no_asistio} no asistió` : ''}</span> },
          { key: 'g', header: 'Ingresos', align: 'right', hideOnMobile: true, cell: (c) => <span className="ob-num">{money(c.ingresos)}</span> },
          { key: 'c', header: 'Comisión', align: 'right', cell: (c) => <span className="font-semibold ob-num">{money(c.comision)}</span> },
        ]} />
        <p className="mt-3 text-sm text-fg-muted">Solo cuentan las clases marcadas como realizadas (y “no asistió”, si así está en Configuración).</p>
      </>}
    </>
  );
}

function Tarifas() {
  const { data: pds } = useInstructors();
  const { data: rates, reload } = useAsync(async () => (await must(supabase.from('instructor_rates').select('*'))) as Rate[], []);
  const [edit, setEdit] = useState<{ pd: PD; price: string; pct: string } | null>(null);
  const { busy, run } = useAction();
  if (!pds || !rates) return <Loading />;
  const r = (pd: PD) => rates.find((x) => x.profile_id === pd.profile_id && x.department === pd.department);
  return (
    <>
      <Table rows={pds} rowKey={(p) => `${p.profile_id}-${p.department}`} onRowClick={(pd) => setEdit({ pd, price: r(pd)?.price != null ? String(r(pd)!.price) : '', pct: r(pd) ? String(r(pd)!.commission_pct) : '' })} empty="Asigna coaches a sus áreas en Personal y permisos." columns={[
        { key: 'n', header: 'Instructor', cell: (p) => <span className="font-semibold">{p.profiles?.full_name}</span> },
        { key: 'a', header: 'Área', cell: (p) => <Area code={p.department} /> },
        { key: 'p', header: 'Precio por clase', align: 'right', cell: (p) => r(p)?.price != null ? <span className="ob-num">{money(r(p)!.price)}</span> : <span className="text-fg-muted">General</span> },
        { key: 'c', header: 'Comisión', align: 'right', cell: (p) => r(p) ? <span className="ob-num">{Number(r(p)!.commission_pct)}%</span> : <span className="text-fg-muted">General</span> },
      ]} />
      <Modal open={!!edit} onClose={() => setEdit(null)} title={`Tarifa: ${edit?.pd.profiles?.full_name ?? ''}`}
        footer={<ConfirmFooter onCancel={() => setEdit(null)} confirmLabel="Guardar" loading={busy} onConfirm={async () => {
          const e = edit!;
          const ok = await run(async () => {
            const pct = e.pct === '' ? 40 : Number(e.pct);
            if (pct < 0 || pct > 100) throw new Error('La comisión va de 0 a 100%.');
            return must(supabase.from('instructor_rates').upsert({ profile_id: e.pd.profile_id, department: e.pd.department, price: e.price === '' ? null : Number(e.price), commission_pct: pct }).select());
          }, 'Tarifa guardada');
          if (ok) { setEdit(null); reload(); }
        }} />}>
        {edit && <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Precio por clase (MXN)" hint="Vacío = precio general">{(p) => <Input {...p} type="number" min={0} value={edit.price} onChange={(e) => setEdit({ ...edit, price: e.target.value })} />}</Field>
          <Field label="Comisión del instructor (%)">{(p) => <Input {...p} type="number" min={0} max={100} value={edit.pct} onChange={(e) => setEdit({ ...edit, pct: e.target.value })} />}</Field>
        </div>}
      </Modal>
    </>
  );
}
