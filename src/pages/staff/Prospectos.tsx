import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarPlus, Check, Copy, MessageCircle, NotebookPen, Phone, Plus, UserPlus, X } from 'lucide-react';
import { Badge, Button, Card, ConfirmFooter, EmptyState, Field, Input, Modal, PageHeader, Select, StatCard, Tabs, Textarea } from '@/design-system';
import { useAuth, deptName } from '@/lib/auth';
import { useAction, useAsync, useToast } from '@/lib/hooks';
import { supabase, must } from '@/lib/supabase';
import { useCatalog, type Catalog } from '@/lib/catalog';
import { ageLabel, ageYears, dateShort, dateTime, daysLabel, hhmm, todayMx } from '@/lib/format';
import { Area, ErrorBox, Loading } from '@/components/common';
import { waPhone } from './Recordatorios';
import { LEAD_SOURCES, LEAD_STATUS, nextClassDates, type Lead, type LeadActivity, type LeadStatus } from '@/lib/escuela';
import type { DeptCode } from '@/lib/types';

const OPEN: LeadStatus[] = ['nuevo', 'contactado', 'prueba_agendada', 'prueba_hecha'];

function templateFor(l: Lead) {
  if (l.status === 'prueba_agendada') return 'prospecto_prueba';
  if (l.status === 'prueba_hecha') return 'prospecto_post_prueba';
  return l.attempts > 0 ? 'prospecto_recontacto' : 'prospecto_nuevo';
}

function followLabel(d: string | null) {
  if (!d) return null;
  const days = Math.round((new Date(d + 'T12:00:00').getTime() - new Date(todayMx() + 'T12:00:00').getTime()) / 864e5);
  if (days < 0) return { t: `Seguimiento atrasado ${-days} ${days === -1 ? 'día' : 'días'}`, bad: true };
  if (days === 0) return { t: 'Seguimiento hoy', bad: true };
  if (days === 1) return { t: 'Seguimiento mañana', bad: false };
  return { t: `Seguimiento el ${dateShort(d)}`, bad: false };
}

/** Prospectos y clases de prueba: quién preguntó, a quién hay que escribir hoy y cuántos se inscriben. */
export default function Prospectos() {
  const nav = useNavigate();
  const toast = useToast();
  const { isFrontOffice, allDepartments } = useAuth();
  const { data: cat } = useCatalog();
  const [tab, setTab] = useState('hoy');
  const [form, setForm] = useState<Lead | null | undefined>(undefined);
  const [trial, setTrial] = useState<Lead | null>(null);
  const [detail, setDetail] = useState<Lead | null>(null);
  const [lost, setLost] = useState<Lead | null>(null);
  const { busy, run } = useAction();

  const { data, error, reload } = useAsync(async () => {
    const [leads, tpl] = await Promise.all([
      must(supabase.from('leads').select('*').order('created_at', { ascending: false }).limit(500)),
      must(supabase.from('message_templates').select('key, body').like('key', 'prospecto_%')),
    ]);
    return { leads: leads as Lead[], tpl: tpl as { key: string; body: string }[] };
  }, []);

  const today = todayMx();
  const lists = useMemo(() => {
    const L = data?.leads ?? [];
    return {
      hoy: L.filter((l) => OPEN.includes(l.status) && l.next_follow_up && l.next_follow_up <= today)
        .sort((a, b) => (a.next_follow_up ?? '').localeCompare(b.next_follow_up ?? '')),
      pruebas: L.filter((l) => l.status === 'prueba_agendada').sort((a, b) => (a.trial_date ?? '').localeCompare(b.trial_date ?? '')),
      abiertos: L.filter((l) => OPEN.includes(l.status)),
      cerrados: L.filter((l) => !OPEN.includes(l.status)),
    };
  }, [data, today]);

  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data || !cat) return <Loading />;

  const since = new Date(Date.now() - 90 * 864e5).toISOString();
  const recent = data.leads.filter((l) => l.created_at >= since);
  const won = recent.filter((l) => l.status === 'inscrito').length;
  const closed = recent.filter((l) => l.status === 'inscrito' || l.status === 'perdido').length;
  const month = today.slice(0, 7);

  function whatsapp(l: Lead) {
    const phone = waPhone(l.phone);
    if (!phone) { toast('Este prospecto no tiene un celular válido', 'warning'); return; }
    const g = cat!.groups.find((x) => x.group_id === l.trial_group_id);
    const body = (data!.tpl.find((t) => t.key === templateFor(l))?.body ?? 'Hola {nombre}')
      .replace(/\{(\w+)\}/g, (_, k: string) => ({
        nombre: l.name.split(' ')[0], club: 'Oberlicht',
        detalle: l.department ? `${deptName(allDepartments, l.department).toLowerCase()}${l.child_name ? ` para ${l.child_name.split(' ')[0]}` : ''}` : 'nuestras clases',
        fecha: l.trial_date ? dateShort(l.trial_date) : '', hora: g ? hhmm(g.start_time) : '',
      } as Record<string, string>)[k] ?? '');
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(body)}`, '_blank');
    run(() => must(supabase.rpc('seguimiento_prospecto', { p_lead: l.id, p_kind: 'whatsapp', p_body: body }))).then(reload);
  }

  async function act(fn: () => Promise<unknown>, msg: string) {
    const r = await run(fn, msg);
    if (r !== undefined) reload();
    return r;
  }

  const rows = lists[tab as keyof typeof lists];
  const empty = {
    hoy: 'No hay a quién escribir hoy. ¡Al día!',
    pruebas: 'No hay clases de prueba agendadas.',
    abiertos: 'No hay prospectos abiertos.',
    cerrados: 'Aún no hay prospectos inscritos o perdidos.',
  }[tab] ?? '';

  return (
    <>
      <PageHeader title="Prospectos y pruebas" description="Registra a quien pregunta, agenda su clase de prueba y la app te dice a quién escribir cada día."
        actions={<>
          <Button variant="secondary" icon={<Copy className="h-5 w-5" />} onClick={() => { navigator.clipboard?.writeText(`${location.origin}/prueba`); toast('Liga copiada. Compártela en redes o WhatsApp.', 'success'); }}>Liga del formulario</Button>
          <Button icon={<Plus className="h-5 w-5" />} onClick={() => setForm(null)}>Nuevo prospecto</Button>
        </>} />
      <div className="ob-stats mb-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Para hoy" value={lists.hoy.length} hint="Mensajes o llamadas pendientes" />
        <StatCard label="Pruebas agendadas" value={lists.pruebas.length} hint="Próximas clases de prueba" />
        <StatCard label="Nuevos este mes" value={data.leads.filter((l) => l.created_at.slice(0, 7) === month).length} hint={`${data.leads.filter((l) => l.created_at.slice(0, 7) === month && l.source === 'web').length} por el formulario`} />
        <StatCard label="Se inscriben" value={closed ? `${Math.round((100 * won) / closed)}%` : '—'} hint={`${won} de ${closed} cerrados (90 días)`} />
      </div>
      <Tabs className="mb-4" value={tab} onChange={setTab} items={[
        { id: 'hoy', label: 'Para hoy', count: lists.hoy.length },
        { id: 'pruebas', label: 'Pruebas', count: lists.pruebas.length },
        { id: 'abiertos', label: 'Abiertos', count: lists.abiertos.length },
        { id: 'cerrados', label: 'Cerrados' },
      ]} />
      {rows.length === 0 ? <EmptyState icon={<UserPlus className="h-8 w-8" />} title={empty} action={tab !== 'cerrados' ? <Button onClick={() => setForm(null)}>Registrar prospecto</Button> : undefined} /> : (
        <div className="grid gap-3 lg:grid-cols-2">
          {rows.map((l) => {
            const g = cat.groups.find((x) => x.group_id === l.trial_group_id);
            const f = OPEN.includes(l.status) ? followLabel(l.next_follow_up) : null;
            const trialPast = l.status === 'prueba_agendada' && l.trial_date && l.trial_date <= today;
            return (
              <Card key={l.id} interactive onClick={() => setDetail(l)}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-lg font-semibold">{l.name}</p>
                    <p className="text-sm text-fg-muted">
                      {l.child_name ? `${l.child_name}${l.child_birthdate ? ` · ${ageLabel(l.child_birthdate)}` : ''} · ` : ''}{LEAD_SOURCES[l.source] ?? l.source}
                    </p>
                  </div>
                  <Badge tone={LEAD_STATUS[l.status].tone} size="sm">{LEAD_STATUS[l.status].label}</Badge>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                  {l.department && <Area code={l.department as DeptCode} />}
                  {g && l.trial_date && <span className="font-semibold">Prueba: {dateShort(l.trial_date)} {hhmm(g.start_time)} · {g.level_name}</span>}
                  {f && <span className={f.bad ? 'font-semibold text-danger-700' : 'text-fg-muted'}>{f.t}</span>}
                  {l.attempts > 0 && OPEN.includes(l.status) && <span className="text-fg-muted">{l.attempts} {l.attempts === 1 ? 'contacto' : 'contactos'}</span>}
                </div>
                {OPEN.includes(l.status) && (
                  <div className="mt-3 flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
                    {trialPast ? (
                      <>
                        <Button size="sm" variant="success" icon={<Check className="h-4 w-4" />} loading={busy} onClick={() => act(() => must(supabase.rpc('resultado_prueba', { p_lead: l.id, p_asistio: true })), 'Anotado: vino a su prueba')}>Vino</Button>
                        <Button size="sm" variant="secondary" icon={<X className="h-4 w-4" />} loading={busy} onClick={() => act(() => must(supabase.rpc('resultado_prueba', { p_lead: l.id, p_asistio: false })), 'Anotado: no llegó')}>No llegó</Button>
                      </>
                    ) : (
                      <Button size="sm" icon={<MessageCircle className="h-4 w-4" />} onClick={() => whatsapp(l)}>WhatsApp</Button>
                    )}
                    {l.status !== 'prueba_agendada' && <Button size="sm" variant="secondary" icon={<CalendarPlus className="h-4 w-4" />} onClick={() => setTrial(l)}>{l.status === 'prueba_hecha' ? 'Otra prueba' : 'Agendar prueba'}</Button>}
                    {isFrontOffice && (l.status === 'prueba_hecha' || l.status === 'contactado') && (
                      <Button size="sm" variant="ghost" icon={<UserPlus className="h-4 w-4" />} loading={busy} onClick={async () => {
                        const fam = await act(() => must<string>(supabase.rpc('convertir_prospecto', { p_lead: l.id })), 'Familia registrada. Completa sus datos e inscríbelo.');
                        if (fam) nav(`/familias/${fam}`);
                      }}>Inscribir</Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => setLost(l)}>Perdido</Button>
                  </div>
                )}
                {l.status === 'inscrito' && l.family_id && isFrontOffice && (
                  <div className="mt-3" onClick={(e) => e.stopPropagation()}><Button size="sm" variant="ghost" onClick={() => nav(`/familias/${l.family_id}`)}>Ver familia</Button></div>
                )}
                {l.status === 'perdido' && l.lost_reason && <p className="mt-2 text-sm text-fg-muted">Motivo: {l.lost_reason}</p>}
              </Card>
            );
          })}
        </div>
      )}

      <LeadForm lead={form} cat={cat} onClose={() => setForm(undefined)} onDone={reload} />
      <TrialModal lead={trial} cat={cat} onClose={() => setTrial(null)} onDone={reload} />
      <LeadDetail lead={detail} cat={cat} onClose={() => setDetail(null)} onEdit={(l) => { setDetail(null); setForm(l); }} onDone={reload} />
      <LostModal lead={lost} onClose={() => setLost(null)} onDone={reload} />
    </>
  );
}

const AREAS: DeptCode[] = ['natacion', 'ballet', 'gimnasia', 'oberfit', 'terapia', 'nutricion'];

function LeadForm({ lead, cat, onClose, onDone }: { lead: Lead | null | undefined; cat: Catalog; onClose: () => void; onDone: () => void }) {
  const { allDepartments } = useAuth();
  const blank = { name: '', phone: '', email: '', child_name: '', child_birthdate: '', department: 'natacion', source: 'visita', notes: '' };
  const [f, setF] = useState(blank);
  const { busy, run } = useAction();
  useEffect(() => {
    if (lead === undefined) return;
    setF(lead ? {
      name: lead.name, phone: lead.phone ?? '', email: lead.email ?? '', child_name: lead.child_name ?? '', child_birthdate: lead.child_birthdate ?? '',
      department: lead.department ?? '', source: lead.source, notes: lead.notes ?? '',
    } : blank);
  }, [lead]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k: keyof typeof blank) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  void cat;

  async function save() {
    const row = {
      name: f.name.trim(), phone: f.phone.replace(/\D/g, '') || null, email: f.email.trim() || null, child_name: f.child_name.trim() || null,
      child_birthdate: f.child_birthdate || null, department: f.department || null, source: f.source, notes: f.notes.trim() || null,
    };
    if (!row.name) return;
    const r = await run(() => lead
      ? must(supabase.from('leads').update({ ...row, updated_at: new Date().toISOString() }).eq('id', lead.id).select())
      : must(supabase.from('leads').insert(row).select()), lead ? 'Prospecto actualizado' : 'Prospecto registrado. Aparece en «Para hoy».');
    if (r) { onDone(); onClose(); }
  }

  return (
    <Modal open={lead !== undefined} onClose={onClose} title={lead ? 'Editar prospecto' : 'Nuevo prospecto'}
      footer={<ConfirmFooter onCancel={onClose} onConfirm={save} loading={busy} confirmLabel="Guardar" />}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre de quien pregunta" required className="sm:col-span-2">{(p) => <Input {...p} value={f.name} onChange={set('name')} placeholder="Ej. Mariana López" />}</Field>
        <Field label="Celular">{(p) => <Input {...p} type="tel" inputMode="tel" value={f.phone} onChange={set('phone')} placeholder="55 1234 5678" />}</Field>
        <Field label="Correo">{(p) => <Input {...p} type="email" value={f.email} onChange={set('email')} />}</Field>
        <Field label="Nombre del niño o niña">{(p) => <Input {...p} value={f.child_name} onChange={set('child_name')} placeholder="Si es para un hijo" />}</Field>
        <Field label="Fecha de nacimiento">{(p) => <Input {...p} type="date" value={f.child_birthdate} onChange={set('child_birthdate')} />}</Field>
        <Field label="Le interesa">{(p) => <Select {...p} value={f.department} onChange={set('department')}>
          <option value="">Aún no sabe</option>
          {AREAS.map((a) => <option key={a} value={a}>{deptName(allDepartments, a)}</option>)}
        </Select>}</Field>
        <Field label="¿Cómo nos conoció?">{(p) => <Select {...p} value={f.source} onChange={set('source')}>
          {Object.entries(LEAD_SOURCES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>}</Field>
        <Field label="Notas" className="sm:col-span-2">{(p) => <Textarea {...p} rows={2} value={f.notes} onChange={set('notes')} placeholder="Horario que busca, dudas, etc." />}</Field>
      </div>
    </Modal>
  );
}

function TrialModal({ lead, cat, onClose, onDone }: { lead: Lead | null; cat: Catalog; onClose: () => void; onDone: () => void }) {
  const { allDepartments } = useAuth();
  const [dep, setDep] = useState<string>('natacion');
  const [groupId, setGroupId] = useState('');
  const [date, setDate] = useState('');
  const { busy, run } = useAction();
  useEffect(() => { if (lead) { setDep(lead.department ?? 'natacion'); setGroupId(''); setDate(''); } }, [lead]);
  const age = lead?.child_birthdate ? ageYears(lead.child_birthdate) : null;
  const groups = cat.groups.filter((g) => g.active && g.department === dep && (age == null || (age >= Number(g.min_age) && age <= Number(g.max_age))))
    .sort((a, b) => a.level_name.localeCompare(b.level_name) || a.start_time.localeCompare(b.start_time));
  const g = groups.find((x) => x.group_id === groupId);
  const dates = g ? nextClassDates(g.weekdays, 8) : [];
  return (
    <Modal open={!!lead} onClose={onClose} title={`Clase de prueba para ${lead?.child_name?.split(' ')[0] ?? lead?.name.split(' ')[0] ?? ''}`}
      footer={<ConfirmFooter onCancel={onClose} loading={busy} confirmLabel="Agendar prueba" onConfirm={async () => {
        if (!groupId || !date) return;
        const r = await run(() => must(supabase.rpc('agendar_prueba', { p_lead: lead!.id, p_group: groupId, p_date: date })), 'Prueba agendada. Aparecerá en la lista del coach ese día.');
        if (r) { onDone(); onClose(); }
      }} />}>
      <div className="space-y-4">
        <Field label="Área">{(p) => <Select {...p} value={dep} onChange={(e) => { setDep(e.target.value); setGroupId(''); }}>
          {AREAS.map((a) => <option key={a} value={a}>{deptName(allDepartments, a)}</option>)}
        </Select>}</Field>
        <Field label="Grupo" hint={age != null ? `Solo grupos para ${age} años` : undefined}>{(p) => <Select {...p} value={groupId} onChange={(e) => { setGroupId(e.target.value); setDate(''); }}>
          <option value="">Elige un grupo</option>
          {groups.map((x) => <option key={x.group_id} value={x.group_id}>{x.level_name} · {daysLabel(x.weekdays)} {hhmm(x.start_time)} ({x.enrolled}/{x.capacity})</option>)}
        </Select>}</Field>
        {g && (
          <Field label="Día">{() => (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {dates.map((d) => (
                <button key={d} type="button" onClick={() => setDate(d)} className={`rounded-lg border-2 px-3 py-2 text-left ${date === d ? 'border-primary bg-primary-soft' : 'border-border bg-surface'}`}>
                  <span className="block font-semibold">{dateShort(d)}</span><span className="text-sm text-fg-muted">{hhmm(g.start_time)}</span>
                </button>
              ))}
            </div>
          )}</Field>
        )}
      </div>
    </Modal>
  );
}

function LeadDetail({ lead, cat, onClose, onEdit, onDone }: { lead: Lead | null; cat: Catalog; onClose: () => void; onEdit: (l: Lead) => void; onDone: () => void }) {
  const { allDepartments } = useAuth();
  const [note, setNote] = useState('');
  const [kind, setKind] = useState<'nota' | 'llamada'>('nota');
  const { busy, run } = useAction();
  const { data, reload } = useAsync(async () => {
    if (!lead) return [] as LeadActivity[];
    return (await must(supabase.from('lead_activities').select('*').eq('lead_id', lead.id).order('created_at', { ascending: false }))) as LeadActivity[];
  }, [lead?.id]);
  useEffect(() => setNote(''), [lead?.id]);
  if (!lead) return null;
  const staff = (id: string | null) => cat.staff.find((s) => s.id === id)?.full_name ?? '';
  return (
    <Modal open={!!lead} onClose={onClose} title={lead.name} size="lg"
      footer={<><Button variant="secondary" onClick={() => onEdit(lead)}>Editar datos</Button><Button onClick={onClose}>Cerrar</Button></>}>
      <div className="mb-4 grid gap-1 text-base">
        <p><Badge tone={LEAD_STATUS[lead.status].tone} size="sm">{LEAD_STATUS[lead.status].label}</Badge> <span className="ml-2 text-fg-muted">desde {dateShort(lead.created_at)} · {LEAD_SOURCES[lead.source]}</span></p>
        {lead.phone && <p className="flex items-center gap-2"><Phone className="h-4 w-4 text-fg-muted" /><a className="text-primary underline" href={`tel:${lead.phone}`}>{lead.phone}</a></p>}
        {lead.email && <p className="text-fg-muted">{lead.email}</p>}
        {lead.child_name && <p>Para: <strong>{lead.child_name}</strong>{lead.child_birthdate ? ` (${ageLabel(lead.child_birthdate)})` : ''}</p>}
        {lead.department && <p>Interés: {deptName(allDepartments, lead.department)}</p>}
        {lead.notes && <p className="rounded-md bg-surface-sunken px-3 py-2 text-sm">{lead.notes}</p>}
      </div>
      <div className="mb-4 rounded-lg border border-border p-3">
        <div className="mb-2 flex gap-2">
          {(['nota', 'llamada'] as const).map((k) => <button key={k} type="button" onClick={() => setKind(k)} className={`rounded-full px-3 py-1 text-sm font-semibold ${kind === k ? 'bg-primary text-primary-fg' : 'bg-surface-sunken'}`}>{k === 'nota' ? 'Nota' : 'Llamé'}</button>)}
        </div>
        <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder={kind === 'llamada' ? '¿Qué te dijo?' : 'Escribe una nota'} />
        <Button className="mt-2" size="sm" icon={<NotebookPen className="h-4 w-4" />} loading={busy} disabled={!note.trim() && kind === 'nota'} onClick={async () => {
          const r = await run(() => must(supabase.rpc('seguimiento_prospecto', { p_lead: lead.id, p_kind: kind, p_body: note || (kind === 'llamada' ? 'Llamada' : null) })), 'Anotado');
          if (r) { setNote(''); reload(); onDone(); }
        }}>Guardar</Button>
      </div>
      <p className="mb-2 font-semibold">Historial</p>
      <ul className="space-y-2">
        {(data ?? []).map((a) => (
          <li key={a.id} className="rounded-md bg-surface-sunken px-3 py-2 text-sm">
            <span className="font-semibold capitalize">{a.kind}</span> · {dateTime(a.created_at)}{a.created_by ? ` · ${staff(a.created_by)}` : ''}
            {a.body && <p className="mt-0.5 whitespace-pre-line text-fg-muted">{a.body}</p>}
          </li>
        ))}
        {data?.length === 0 && <li className="text-sm text-fg-muted">Sin movimientos todavía.</li>}
      </ul>
    </Modal>
  );
}

function LostModal({ lead, onClose, onDone }: { lead: Lead | null; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('');
  const { busy, run } = useAction();
  useEffect(() => setReason(''), [lead?.id]);
  const opts = ['Precio', 'Horario', 'Ubicación', 'Eligió otro club', 'No contestó', 'Ya no le interesa'];
  return (
    <Modal open={!!lead} onClose={onClose} title="Marcar como perdido" size="sm"
      footer={<ConfirmFooter onCancel={onClose} loading={busy} confirmLabel="Marcar perdido" danger onConfirm={async () => {
        const r = await run(() => must(supabase.rpc('seguimiento_prospecto', { p_lead: lead!.id, p_kind: 'estado', p_status: 'perdido', p_lost_reason: reason || null, p_body: reason ? `Perdido: ${reason}` : 'Perdido' })), 'Prospecto cerrado');
        if (r) { onDone(); onClose(); }
      }} />}>
      <p className="mb-3 text-base text-fg-muted">¿Por qué no se inscribió? Ayuda a entender qué mejorar.</p>
      <div className="flex flex-wrap gap-2">
        {opts.map((o) => <button key={o} type="button" onClick={() => setReason(o)} className={`rounded-full border-2 px-3 py-1.5 text-sm font-semibold ${reason === o ? 'border-primary bg-primary-soft text-primary' : 'border-border'}`}>{o}</button>)}
      </div>
    </Modal>
  );
}
