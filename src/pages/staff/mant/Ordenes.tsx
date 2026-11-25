import { useEffect, useState } from 'react';
import { Button, ConfirmFooter, Field, Input, Modal, Segmented, Select, Table, Textarea } from '@/design-system';
import { useAction, useAsync } from '@/lib/hooks';
import { supabase, must } from '@/lib/supabase';
import { dateShort, money0, todayMx } from '@/lib/format';
import { ErrorBox, Loading } from '@/components/common';
import { areaName, Pri, WoStatus, PRIORITY, WO_STATUS, type Asset, type Supplier, type Supply, type WorkOrder } from './shared';
import type { MantCtx } from '../Mantenimiento';

/** Órdenes de trabajo: fallas reportadas por cualquier persona del personal y su seguimiento hasta cerrarlas. */
export function Ordenes({ ctx }: { ctx: MantCtx }) {
  const [filter, setFilter] = useState('abiertas');
  const [edit, setEdit] = useState<WorkOrder | null>(null);
  const { data, error, reload } = useAsync(async () => {
    let q = supabase.from('work_orders').select('*').order('created_at', { ascending: false }).limit(200);
    if (ctx.area) q = q.eq('area', ctx.area);
    if (filter === 'abiertas') q = q.in('status', ['abierta', 'en_proceso', 'en_espera']);
    if (filter === 'terminadas') q = q.eq('status', 'terminada');
    const [wo, assets] = await Promise.all([must(q), must(supabase.from('maint_assets').select('id, name'))]);
    return { wo: wo as WorkOrder[], assets: assets as Pick<Asset, 'id' | 'name'>[] };
  }, [filter, ctx.area]);
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return <Loading />;
  const order = { urgente: 0, alta: 1, media: 2, baja: 3 };
  const rows = filter === 'abiertas' ? [...data.wo].sort((a, b) => order[a.priority] - order[b.priority]) : data.wo;
  const staffName = (id: string | null) => ctx.staff.find((s) => s.id === id)?.full_name ?? 'Sin asignar';

  return (
    <>
      <div className="mb-4"><Segmented value={filter} onChange={setFilter} options={[{ id: 'abiertas', label: 'Pendientes' }, { id: 'terminadas', label: 'Terminadas' }, { id: 'todas', label: 'Todas' }]} /></div>
      <Table rows={rows} rowKey={(w) => w.id} onRowClick={ctx.isMaint ? setEdit : undefined} empty="No hay órdenes aquí." columns={[
        { key: 'f', header: '#', width: '60px', cell: (w) => <span className="text-fg-muted ob-num">{w.folio}</span> },
        { key: 't', header: 'Trabajo', cell: (w) => <div><p className="font-semibold">{w.title}</p><p className="text-sm text-fg-muted">{areaName(ctx.areas, w.area)}{w.asset_id ? ` · ${data.assets.find((a) => a.id === w.asset_id)?.name ?? ''}` : ''} · {w.kind}</p></div> },
        { key: 'p', header: 'Prioridad', cell: (w) => <Pri p={w.priority} /> },
        { key: 's', header: 'Estado', cell: (w) => <WoStatus s={w.status} /> },
        { key: 'a', header: 'Responsable', hideOnMobile: true, cell: (w) => staffName(w.assigned_to) },
        { key: 'd', header: 'Fecha', hideOnMobile: true, cell: (w) => w.completed_at ? `Cerró ${dateShort(w.completed_at)}` : w.due_on ? `Para ${dateShort(w.due_on)}` : dateShort(w.created_at) },
        { key: 'c', header: 'Costo', align: 'right', hideOnMobile: true, cell: (w) => (Number(w.labor_cost) + Number(w.materials_cost)) > 0 ? money0(Number(w.labor_cost) + Number(w.materials_cost)) : '—' },
      ]} />
      {edit && <EditOrderModal wo={edit} ctx={ctx} onClose={() => setEdit(null)} onSaved={() => { reload(); ctx.reloadAll(); }} />}
    </>
  );
}

export function NewOrderModal({ open, onClose, ctx, onSaved }: { open: boolean; onClose: () => void; ctx: MantCtx; onSaved: () => void }) {
  const [f, setF] = useState<Partial<WorkOrder>>({});
  const { busy, run } = useAction();
  const { data: assets } = useAsync(async () => ctx.isMaint && open ? (await must(supabase.from('maint_assets').select('id, name, area').neq('status', 'baja').order('name'))) as Asset[] : [], [open]);
  useEffect(() => { if (open) setF({ area: ctx.area || 'alberca', priority: 'media', kind: 'correctivo' }); }, [open, ctx.area]);
  const set = (k: keyof WorkOrder, v: unknown) => setF((x) => ({ ...x, [k]: v }));
  async function save() {
    if (!f.title?.trim()) throw new Error('Describe brevemente la falla.');
    await must(supabase.from('work_orders').insert({ area: f.area, title: f.title.trim(), description: f.description || null, priority: f.priority, kind: f.kind, asset_id: f.asset_id || null, assigned_to: f.assigned_to || null, due_on: f.due_on || null }));
  }
  return (
    <Modal open={open} onClose={onClose} title="Reportar falla o pedir un trabajo"
      footer={<ConfirmFooter onCancel={onClose} confirmLabel="Enviar" loading={busy} onConfirm={async () => { const ok = await run(async () => { await save(); return true; }, 'Reporte enviado a mantenimiento'); if (ok) { onSaved(); onClose(); } }} />}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="¿Qué pasa?" required className="sm:col-span-2">{(p) => <Input {...p} autoFocus placeholder="Ej. Regadera 3 de vestidores sin agua caliente" value={f.title ?? ''} onChange={(e) => set('title', e.target.value)} />}</Field>
        <Field label="Especialidad">{(p) => <Select {...p} value={f.area} onChange={(e) => set('area', e.target.value)}>{ctx.areas.map((a) => <option key={a.code} value={a.code}>{a.name}</option>)}</Select>}</Field>
        <Field label="Prioridad">{(p) => <Select {...p} value={f.priority} onChange={(e) => set('priority', e.target.value)}>{Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select>}</Field>
        {ctx.isMaint && <>
          <Field label="Tipo">{(p) => <Select {...p} value={f.kind} onChange={(e) => set('kind', e.target.value)}><option value="correctivo">Correctivo (falla)</option><option value="preventivo">Preventivo</option><option value="mejora">Mejora</option></Select>}</Field>
          <Field label="Equipo">{(p) => <Select {...p} value={f.asset_id ?? ''} onChange={(e) => set('asset_id', e.target.value)}><option value="">—</option>{(assets ?? []).filter((a) => a.area === f.area).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select>}</Field>
          <Field label="Responsable">{(p) => <Select {...p} value={f.assigned_to ?? ''} onChange={(e) => set('assigned_to', e.target.value)}><option value="">Sin asignar</option>{ctx.staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}</Select>}</Field>
          <Field label="Para cuándo">{(p) => <Input {...p} type="date" min={todayMx()} value={f.due_on ?? ''} onChange={(e) => set('due_on', e.target.value)} />}</Field>
        </>}
        <Field label="Detalles" className="sm:col-span-2">{(p) => <Textarea {...p} rows={3} placeholder="Dónde está, desde cuándo, qué se ha intentado" value={f.description ?? ''} onChange={(e) => set('description', e.target.value)} />}</Field>
      </div>
    </Modal>
  );
}

function EditOrderModal({ wo, ctx, onClose, onSaved }: { wo: WorkOrder; ctx: MantCtx; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<WorkOrder>(wo);
  const [use, setUse] = useState<{ supply: string; qty: string }>({ supply: '', qty: '' });
  const { busy, run } = useAction();
  const { data } = useAsync(async () => {
    const [supplies, suppliers] = await Promise.all([
      must(supabase.from('supplies').select('id, name, unit, stock, area').eq('active', true).order('name')),
      must(supabase.from('suppliers').select('id, name').eq('active', true).order('name')),
    ]);
    return { supplies: supplies as Supply[], suppliers: suppliers as Supplier[] };
  }, []);
  const set = (k: keyof WorkOrder, v: unknown) => setF((x) => ({ ...x, [k]: v }));
  async function save() {
    const patch: Partial<WorkOrder> = {
      status: f.status, priority: f.priority, assigned_to: f.assigned_to || null, supplier_id: f.supplier_id || null, due_on: f.due_on || null,
      labor_cost: Number(f.labor_cost) || 0, resolution: f.resolution || null, title: f.title,
    };
    if (f.status === 'en_proceso' && !wo.started_at) patch.started_at = new Date().toISOString();
    if (f.status === 'terminada' && !wo.completed_at) patch.completed_at = new Date().toISOString();
    await must(supabase.from('work_orders').update(patch).eq('id', wo.id));
  }
  async function useSupply() {
    const r = await run(() => must(supabase.rpc('usar_insumo', { p_supply: use.supply, p_qty: Number(use.qty), p_work_order: wo.id, p_note: `Orden #${wo.folio}` })), 'Material descontado');
    if (r) { setUse({ supply: '', qty: '' }); const w = await must(supabase.from('work_orders').select('*').eq('id', wo.id).single()); setF((x) => ({ ...x, materials_cost: (w as WorkOrder).materials_cost })); }
  }
  return (
    <Modal open onClose={onClose} size="lg" title={`Orden #${wo.folio} · ${wo.title}`}
      footer={<ConfirmFooter onCancel={onClose} confirmLabel="Guardar" loading={busy} onConfirm={async () => { const ok = await run(async () => { await save(); return true; }, 'Orden actualizada'); if (ok) { onSaved(); onClose(); } }} />}>
      <div className="grid gap-4 sm:grid-cols-2">
        {wo.description && <p className="rounded-md bg-surface-sunken p-3 text-base sm:col-span-2">{wo.description}</p>}
        <Field label="Estado">{(p) => <Select {...p} value={f.status} onChange={(e) => set('status', e.target.value)}>{Object.entries(WO_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select>}</Field>
        <Field label="Prioridad">{(p) => <Select {...p} value={f.priority} onChange={(e) => set('priority', e.target.value)}>{Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select>}</Field>
        <Field label="Responsable">{(p) => <Select {...p} value={f.assigned_to ?? ''} onChange={(e) => set('assigned_to', e.target.value)}><option value="">Sin asignar</option>{ctx.staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}</Select>}</Field>
        <Field label="Proveedor externo">{(p) => <Select {...p} value={f.supplier_id ?? ''} onChange={(e) => set('supplier_id', e.target.value)}><option value="">— Lo hace el personal —</option>{(data?.suppliers ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>}</Field>
        <Field label="Para cuándo">{(p) => <Input {...p} type="date" value={f.due_on ?? ''} onChange={(e) => set('due_on', e.target.value)} />}</Field>
        <Field label="Mano de obra (MXN)">{(p) => <Input {...p} type="number" min={0} value={f.labor_cost ?? 0} onChange={(e) => set('labor_cost', e.target.value)} />}</Field>
        <Field label="Qué se hizo" className="sm:col-span-2">{(p) => <Textarea {...p} rows={2} value={f.resolution ?? ''} onChange={(e) => set('resolution', e.target.value)} />}</Field>
        <div className="rounded-lg border border-border p-3 sm:col-span-2">
          <p className="mb-2 text-sm font-semibold">Material usado · costo acumulado {money0(f.materials_cost)}</p>
          <div className="flex flex-wrap gap-2">
            <Select className="min-w-[200px] flex-1" value={use.supply} onChange={(e) => setUse((x) => ({ ...x, supply: e.target.value }))}>
              <option value="">Elige material…</option>
              {(data?.supplies ?? []).filter((s) => s.area === wo.area || !ctx.area).map((s) => <option key={s.id} value={s.id}>{s.name} (hay {s.stock} {s.unit})</option>)}
            </Select>
            <Input className="w-28" type="number" min={0} step="0.1" placeholder="Cantidad" value={use.qty} onChange={(e) => setUse((x) => ({ ...x, qty: e.target.value }))} />
            <Button variant="secondary" disabled={!use.supply || !Number(use.qty)} loading={busy} onClick={useSupply}>Descontar</Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
