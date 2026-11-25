import { useState } from 'react';
import { CheckCircle2, Plus } from 'lucide-react';
import { Badge, Button, ConfirmFooter, Field, Input, Modal, Select, Switch, Table, Textarea } from '@/design-system';
import { useAction, useAsync } from '@/lib/hooks';
import { supabase, must } from '@/lib/supabase';
import { dateShort, todayMx } from '@/lib/format';
import { ErrorBox, Loading } from '@/components/common';
import { areaName, type Asset, type Task } from './shared';
import type { MantCtx } from '../Mantenimiento';

const FREQ = [{ d: 1, l: 'Diario' }, { d: 2, l: 'Cada 2 días' }, { d: 3, l: 'Cada 3 días' }, { d: 7, l: 'Semanal' }, { d: 14, l: 'Cada 2 semanas' }, { d: 30, l: 'Mensual' }, { d: 90, l: 'Trimestral' }, { d: 180, l: 'Semestral' }, { d: 365, l: 'Anual' }];
const freqLabel = (d: number) => FREQ.find((f) => f.d === d)?.l ?? `Cada ${d} días`;

function due(t: Task) {
  const today = todayMx();
  if (t.next_due_on < today) return <Badge tone="danger" icon={<span aria-hidden>!</span>}>Vencida</Badge>;
  if (t.next_due_on === today) return <Badge tone="warning" icon={<span aria-hidden>◷</span>}>Hoy</Badge>;
  return <Badge tone="neutral">{dateShort(t.next_due_on)}</Badge>;
}

/** Plan preventivo: tareas que se repiten. Al marcarlas hechas se programa la siguiente y queda la orden en el historial. */
export function Preventivo({ ctx }: { ctx: MantCtx }) {
  const [edit, setEdit] = useState<Partial<Task> | null>(null);
  const [done, setDone] = useState<Task | null>(null);
  const [res, setRes] = useState({ notes: '', labor: '' });
  const { busy, run } = useAction();
  const { data, error, reload } = useAsync(async () => {
    let q = supabase.from('maint_tasks').select('*').order('next_due_on');
    if (ctx.area) q = q.eq('area', ctx.area);
    const [tasks, assets] = await Promise.all([must(q), must(supabase.from('maint_assets').select('id, name, area').neq('status', 'baja'))]);
    return { tasks: tasks as Task[], assets: assets as Asset[] };
  }, [ctx.area]);
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return <Loading />;
  const set = (k: keyof Task, v: unknown) => setEdit((x) => ({ ...x, [k]: v }));

  async function save() {
    const t = edit!;
    if (!t.title?.trim()) throw new Error('Escribe la tarea.');
    const payload = { area: t.area, title: t.title.trim(), instructions: t.instructions || null, frequency_days: Number(t.frequency_days) || 7, next_due_on: t.next_due_on || todayMx(), assigned_to: t.assigned_to || null, asset_id: t.asset_id || null, est_minutes: t.est_minutes ? Number(t.est_minutes) : null, active: t.active ?? true };
    if (t.id) await must(supabase.from('maint_tasks').update(payload).eq('id', t.id)); else await must(supabase.from('maint_tasks').insert(payload));
  }

  return (
    <>
      <div className="mb-4 flex justify-end"><Button icon={<Plus className="h-5 w-5" />} onClick={() => setEdit({ area: ctx.area || 'alberca', frequency_days: 7, next_due_on: todayMx(), active: true })}>Nueva tarea</Button></div>
      <Table rows={data.tasks.filter((t) => t.active)} rowKey={(t) => t.id} onRowClick={setEdit} empty="Sin tareas." columns={[
        { key: 'd', header: 'Toca', cell: due },
        { key: 't', header: 'Tarea', cell: (t) => <div><p className="font-semibold">{t.title}</p><p className="text-sm text-fg-muted">{areaName(ctx.areas, t.area)} · {freqLabel(t.frequency_days)}{t.asset_id ? ` · ${data.assets.find((a) => a.id === t.asset_id)?.name ?? ''}` : ''}</p></div> },
        { key: 'r', header: 'Responsable', hideOnMobile: true, cell: (t) => ctx.staff.find((s) => s.id === t.assigned_to)?.full_name ?? '—' },
        { key: 'l', header: 'Última vez', hideOnMobile: true, cell: (t) => t.last_done_on ? dateShort(t.last_done_on) : 'Nunca' },
        { key: 'a', header: '', align: 'right', cell: (t) => <Button size="sm" variant="success" icon={<CheckCircle2 className="h-4 w-4" />} onClick={(e) => { e.stopPropagation(); setDone(t); setRes({ notes: '', labor: '' }); }}>Hecha</Button> },
      ]} />

      <Modal open={!!done} onClose={() => setDone(null)} title={`Marcar hecha: ${done?.title ?? ''}`}
        footer={<ConfirmFooter onCancel={() => setDone(null)} confirmLabel="Marcar hecha" loading={busy} onConfirm={async () => {
          const r = await run(() => must(supabase.rpc('completar_tarea', { p_task: done!.id, p_resolution: res.notes || null, p_labor: Number(res.labor) || 0 })), 'Listo. Se programó la siguiente.');
          if (r) { setDone(null); reload(); ctx.reloadAll(); }
        }} />}>
        {done?.instructions && <p className="mb-3 rounded-md bg-surface-sunken p-3 text-base">{done.instructions}</p>}
        <div className="grid gap-4">
          <Field label="Observaciones">{(p) => <Textarea {...p} rows={2} value={res.notes} onChange={(e) => setRes((x) => ({ ...x, notes: e.target.value }))} />}</Field>
          <Field label="Costo de mano de obra externa (MXN)">{(p) => <Input {...p} type="number" min={0} value={res.labor} onChange={(e) => setRes((x) => ({ ...x, labor: e.target.value }))} />}</Field>
          <p className="text-sm text-fg-muted">La próxima vez se programa en {done ? freqLabel(done.frequency_days).toLowerCase() : ''}.</p>
        </div>
      </Modal>

      <Modal open={!!edit} onClose={() => setEdit(null)} size="lg" title={edit?.id ? 'Editar tarea' : 'Nueva tarea preventiva'}
        footer={<ConfirmFooter onCancel={() => setEdit(null)} confirmLabel="Guardar" loading={busy} onConfirm={async () => { const ok = await run(async () => { await save(); return true; }, 'Tarea guardada'); if (ok) { setEdit(null); reload(); ctx.reloadAll(); } }} />}>
        {edit && <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tarea" required className="sm:col-span-2">{(p) => <Input {...p} value={edit.title ?? ''} onChange={(e) => set('title', e.target.value)} placeholder="Ej. Revisar presión del filtro" />}</Field>
          <Field label="Especialidad">{(p) => <Select {...p} value={edit.area} onChange={(e) => set('area', e.target.value)}>{ctx.areas.map((a) => <option key={a.code} value={a.code}>{a.name}</option>)}</Select>}</Field>
          <Field label="Cada cuánto">{(p) => <Select {...p} value={edit.frequency_days} onChange={(e) => set('frequency_days', Number(e.target.value))}>{FREQ.map((f) => <option key={f.d} value={f.d}>{f.l}</option>)}{!FREQ.some((f) => f.d === edit.frequency_days) && <option value={edit.frequency_days}>{freqLabel(edit.frequency_days ?? 7)}</option>}</Select>}</Field>
          <Field label="Próxima vez">{(p) => <Input {...p} type="date" value={edit.next_due_on ?? ''} onChange={(e) => set('next_due_on', e.target.value)} />}</Field>
          <Field label="Responsable">{(p) => <Select {...p} value={edit.assigned_to ?? ''} onChange={(e) => set('assigned_to', e.target.value)}><option value="">—</option>{ctx.staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}</Select>}</Field>
          <Field label="Equipo">{(p) => <Select {...p} value={edit.asset_id ?? ''} onChange={(e) => set('asset_id', e.target.value)}><option value="">—</option>{data.assets.filter((a) => a.area === edit.area).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select>}</Field>
          <Field label="Minutos estimados">{(p) => <Input {...p} type="number" min={0} value={edit.est_minutes ?? ''} onChange={(e) => set('est_minutes', e.target.value)} />}</Field>
          <Field label="Instrucciones" className="sm:col-span-2">{(p) => <Textarea {...p} rows={3} value={edit.instructions ?? ''} onChange={(e) => set('instructions', e.target.value)} />}</Field>
          {edit.id && <div className="sm:col-span-2"><Switch checked={edit.active ?? true} onChange={(v) => set('active', v)} label="Tarea activa" /></div>}
        </div>}
      </Modal>
    </>
  );
}
