import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Badge, Button, ConfirmFooter, Field, Input, Modal, Select, Table, Textarea } from '@/design-system';
import { useAction, useAsync } from '@/lib/hooks';
import { supabase, must } from '@/lib/supabase';
import { dateShort, todayMx } from '@/lib/format';
import { ErrorBox, Loading } from '@/components/common';
import { areaName, ASSET_STATUS, type Asset } from './shared';
import type { MantCtx } from '../Mantenimiento';

/** Inventario de equipos (bombas, filtros, calentadores, caminadoras…) con garantía y estado. */
export function Equipos({ ctx }: { ctx: MantCtx }) {
  const [edit, setEdit] = useState<Partial<Asset> | null>(null);
  const { busy, run } = useAction();
  const { data, error, reload } = useAsync(async () => {
    let q = supabase.from('maint_assets').select('*').order('area').order('name');
    if (ctx.area) q = q.eq('area', ctx.area);
    return (await must(q)) as Asset[];
  }, [ctx.area]);
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return <Loading />;
  const set = (k: keyof Asset, v: unknown) => setEdit((x) => ({ ...x, [k]: v }));
  async function save() {
    const a = edit!;
    if (!a.name?.trim()) throw new Error('Escribe el nombre del equipo.');
    const payload = { area: a.area, name: a.name.trim(), brand: a.brand || null, model: a.model || null, serial: a.serial || null, location: a.location || null, purchase_date: a.purchase_date || null, warranty_until: a.warranty_until || null, status: a.status ?? 'operando', notes: a.notes || null };
    if (a.id) await must(supabase.from('maint_assets').update(payload).eq('id', a.id)); else await must(supabase.from('maint_assets').insert(payload));
  }
  return (
    <>
      <div className="mb-4 flex justify-end"><Button icon={<Plus className="h-5 w-5" />} onClick={() => setEdit({ area: ctx.area || 'alberca', status: 'operando' })}>Nuevo equipo</Button></div>
      <Table rows={data} rowKey={(a) => a.id} onRowClick={setEdit} empty="Registra bombas, filtros, calentadores, caminadoras… para llevar su historial." columns={[
        { key: 'n', header: 'Equipo', cell: (a) => <div><p className="font-semibold">{a.name}</p><p className="text-sm text-fg-muted">{[a.brand, a.model].filter(Boolean).join(' ') || '—'}{a.location ? ` · ${a.location}` : ''}</p></div> },
        { key: 'a', header: 'Especialidad', hideOnMobile: true, cell: (a) => areaName(ctx.areas, a.area) },
        { key: 's', header: 'Estado', cell: (a) => <Badge tone={ASSET_STATUS[a.status].tone}>{ASSET_STATUS[a.status].label}</Badge> },
        { key: 'g', header: 'Garantía', hideOnMobile: true, cell: (a) => !a.warranty_until ? '—' : a.warranty_until < todayMx() ? <span className="text-fg-muted">Venció {dateShort(a.warranty_until)}</span> : <span className="font-semibold text-success-700">Hasta {dateShort(a.warranty_until)}</span> },
      ]} />
      <Modal open={!!edit} onClose={() => setEdit(null)} size="lg" title={edit?.id ? 'Editar equipo' : 'Nuevo equipo'}
        footer={<ConfirmFooter onCancel={() => setEdit(null)} confirmLabel="Guardar" loading={busy} onConfirm={async () => { const ok = await run(async () => { await save(); return true; }, 'Equipo guardado'); if (ok) { setEdit(null); reload(); } }} />}>
        {edit && <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombre" required className="sm:col-span-2">{(p) => <Input {...p} value={edit.name ?? ''} onChange={(e) => set('name', e.target.value)} placeholder="Bomba 2 HP filtrado principal" />}</Field>
          <Field label="Especialidad">{(p) => <Select {...p} value={edit.area} onChange={(e) => set('area', e.target.value)}>{ctx.areas.map((a) => <option key={a.code} value={a.code}>{a.name}</option>)}</Select>}</Field>
          <Field label="Estado">{(p) => <Select {...p} value={edit.status} onChange={(e) => set('status', e.target.value)}>{Object.entries(ASSET_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select>}</Field>
          <Field label="Marca">{(p) => <Input {...p} value={edit.brand ?? ''} onChange={(e) => set('brand', e.target.value)} />}</Field>
          <Field label="Modelo">{(p) => <Input {...p} value={edit.model ?? ''} onChange={(e) => set('model', e.target.value)} />}</Field>
          <Field label="Número de serie">{(p) => <Input {...p} value={edit.serial ?? ''} onChange={(e) => set('serial', e.target.value)} />}</Field>
          <Field label="Ubicación">{(p) => <Input {...p} value={edit.location ?? ''} onChange={(e) => set('location', e.target.value)} placeholder="Cuarto de máquinas" />}</Field>
          <Field label="Fecha de compra">{(p) => <Input {...p} type="date" value={edit.purchase_date ?? ''} onChange={(e) => set('purchase_date', e.target.value)} />}</Field>
          <Field label="Garantía hasta">{(p) => <Input {...p} type="date" value={edit.warranty_until ?? ''} onChange={(e) => set('warranty_until', e.target.value)} />}</Field>
          <Field label="Notas" className="sm:col-span-2">{(p) => <Textarea {...p} rows={2} value={edit.notes ?? ''} onChange={(e) => set('notes', e.target.value)} />}</Field>
        </div>}
      </Modal>
    </>
  );
}
