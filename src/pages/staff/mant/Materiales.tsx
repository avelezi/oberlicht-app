import { useState } from 'react';
import { ClipboardList, Plus, Scale } from 'lucide-react';
import { Badge, Button, ConfirmFooter, Field, Input, Modal, Segmented, Select, Switch, Table, Textarea } from '@/design-system';
import { useAction, useAsync } from '@/lib/hooks';
import { supabase, must } from '@/lib/supabase';
import { dateShort, downloadCsv, money, todayMx } from '@/lib/format';
import { ErrorBox, Loading } from '@/components/common';
import { areaName, type Supplier, type SupplyStatus } from './shared';
import type { MantCtx } from '../Mantenimiento';

const UNITS = ['pieza', 'kg', 'litro', 'galón', 'cubeta', 'saco', 'caja', 'metro', 'rollo', 'tableta'];

/** Lista de materiales e insumos: existencias, consumo, periodicidad de compra y lista de compra sugerida. */
export function Materiales({ ctx }: { ctx: MantCtx }) {
  const [edit, setEdit] = useState<Partial<SupplyStatus> | null>(null);
  const [count, setCount] = useState<SupplyStatus | null>(null);
  const [quote, setQuote] = useState<SupplyStatus | null>(null);
  const [val, setVal] = useState({ n: '', supplier: '', price: '' });
  const [filter, setFilter] = useState('todos');
  const { busy, run } = useAction();
  const { data, error, reload } = useAsync(async () => {
    let q = supabase.from('supply_status').select('*').eq('active', true).order('name');
    if (ctx.area) q = q.eq('area', ctx.area);
    const [s, sup] = await Promise.all([must(q), must(supabase.from('suppliers').select('id, name, delivery_days').eq('active', true).order('name'))]);
    return { s: s as SupplyStatus[], sup: sup as Supplier[] };
  }, [ctx.area]);
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return <Loading />;
  const set = (k: keyof SupplyStatus, v: unknown) => setEdit((x) => ({ ...x, [k]: v }));
  const rows = filter === 'comprar' ? data.s.filter((s) => s.needs_reorder) : data.s;
  const suggested = (s: SupplyStatus) => Math.max(Number(s.reorder_qty ?? 0), Math.ceil(Number(s.min_stock) * 2 - Number(s.stock)), s.daily_use && s.purchase_every_days ? Math.ceil(Number(s.daily_use) * s.purchase_every_days - Number(s.stock)) : 0);

  async function save() {
    const s = edit!;
    if (!s.name?.trim()) throw new Error('Escribe el nombre del material.');
    const payload = { area: s.area, name: s.name.trim(), category: s.category || null, unit: s.unit || 'pieza', min_stock: Number(s.min_stock) || 0, reorder_qty: s.reorder_qty ? Number(s.reorder_qty) : null, daily_use: s.daily_use ? Number(s.daily_use) : null, purchase_every_days: s.purchase_every_days ? Number(s.purchase_every_days) : null, preferred_supplier: s.preferred_supplier || null, notes: s.notes || null, active: s.active ?? true, ...(s.id ? {} : { stock: Number(s.stock) || 0 }) };
    if (s.id) await must(supabase.from('supplies').update(payload).eq('id', s.id)); else await must(supabase.from('supplies').insert(payload));
  }

  function shoppingList() {
    const list = data!.s.filter((s) => s.needs_reorder);
    downloadCsv(`lista-de-compra-${todayMx()}.csv`, list.map((s) => ({
      Material: s.name, Especialidad: areaName(ctx.areas, s.area), Unidad: s.unit, Hay: s.stock, Mínimo: s.min_stock, 'Comprar (sugerido)': suggested(s),
      'Proveedor preferido': s.preferred_supplier_name ?? '', 'Último precio': s.last_price ?? '', 'Mejor precio conocido': s.best_price ?? '',
      'Costo estimado': s.best_price ? Math.round(suggested(s) * Number(s.best_price)) : '',
    })));
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Segmented value={filter} onChange={setFilter} options={[{ id: 'todos', label: 'Todos' }, { id: 'comprar', label: `Por comprar (${data.s.filter((s) => s.needs_reorder).length})` }]} />
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" icon={<ClipboardList className="h-5 w-5" />} onClick={shoppingList}>Lista de compra</Button>
          <Button icon={<Plus className="h-5 w-5" />} onClick={() => setEdit({ area: ctx.area || 'alberca', unit: 'kg', min_stock: 0, stock: 0, active: true })}>Nuevo material</Button>
        </div>
      </div>
      <Table rows={rows} rowKey={(s) => s.id} onRowClick={setEdit} empty="Agrega cloro, ácido, refacciones, artículos de limpieza…" columns={[
        { key: 'n', header: 'Material', cell: (s) => <div><p className="font-semibold">{s.name}</p><p className="text-sm text-fg-muted">{areaName(ctx.areas, s.area)}{s.category ? ` · ${s.category}` : ''}</p></div> },
        { key: 'h', header: 'Hay', align: 'right', cell: (s) => <span className={`font-semibold ob-num ${Number(s.stock) <= Number(s.min_stock) ? 'text-danger-700' : ''}`}>{Number(s.stock)} {s.unit}</span> },
        { key: 'd', header: 'Alcanza', align: 'right', hideOnMobile: true, cell: (s) => s.days_left == null ? '—' : `${s.days_left} días` },
        { key: 'p', header: 'Próxima compra', hideOnMobile: true, cell: (s) => s.next_purchase_on ? dateShort(s.next_purchase_on) : s.purchase_every_days ? 'Sin compras registradas' : '—' },
        { key: 'pr', header: 'Precio', align: 'right', hideOnMobile: true, cell: (s) => s.last_price == null ? '—' : <div><p className="ob-num">{money(s.last_price)}</p>{s.best_price != null && Number(s.best_price) < Number(s.last_price) && <p className="text-xs font-semibold text-success-700">Hay a {money(s.best_price)}</p>}</div> },
        { key: 's', header: '', cell: (s) => s.needs_reorder ? <Badge tone="warning" icon={<span aria-hidden>!</span>}>Comprar</Badge> : <Badge tone="success" icon={<span aria-hidden>✓</span>}>Bien</Badge> },
        { key: 'a', header: '', align: 'right', cell: (s) => <div className="flex justify-end gap-1">
          <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setCount(s); setVal({ n: String(Number(s.stock)), supplier: '', price: '' }); }}>Conteo</Button>
          <Button size="sm" variant="ghost" icon={<Scale className="h-4 w-4" />} onClick={(e) => { e.stopPropagation(); setQuote(s); setVal({ n: '', supplier: '', price: '' }); }}>Cotizar</Button>
        </div> },
      ]} />

      <Modal open={!!count} onClose={() => setCount(null)} title={`Conteo físico: ${count?.name ?? ''}`}
        footer={<ConfirmFooter onCancel={() => setCount(null)} confirmLabel="Guardar conteo" loading={busy} onConfirm={async () => {
          const r = await run(() => must(supabase.rpc('ajustar_insumo', { p_supply: count!.id, p_new_stock: Number(val.n), p_note: 'Conteo físico' })), 'Existencia actualizada');
          if (r) { setCount(null); reload(); ctx.reloadAll(); }
        }} />}>
        <Field label={`¿Cuánto hay realmente? (${count?.unit ?? ''})`} hint={`El sistema dice ${count ? Number(count.stock) : 0}. La diferencia queda registrada como ajuste.`}>{(p) => <Input {...p} type="number" min={0} step="0.1" value={val.n} onChange={(e) => setVal((x) => ({ ...x, n: e.target.value }))} />}</Field>
      </Modal>

      <Modal open={!!quote} onClose={() => setQuote(null)} title={`Agregar cotización: ${quote?.name ?? ''}`}
        footer={<ConfirmFooter onCancel={() => setQuote(null)} confirmLabel="Guardar" loading={busy} onConfirm={async () => {
          const r = await run(async () => {
            if (!val.supplier || !Number(val.price)) throw new Error('Elige proveedor y escribe el precio.');
            return must(supabase.from('supplier_prices').insert({ supply_id: quote!.id, supplier_id: val.supplier, unit_price: Number(val.price), source: 'cotizacion' }));
          }, 'Cotización guardada. Ya aparece en el comparativo.');
          if (r !== undefined) { setQuote(null); reload(); }
        }} />}>
        <div className="grid gap-4">
          <Field label="Proveedor">{(p) => <Select {...p} value={val.supplier} onChange={(e) => setVal((x) => ({ ...x, supplier: e.target.value }))}><option value="">Elige…</option>{data.sup.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>}</Field>
          <Field label={`Precio por ${quote?.unit ?? 'unidad'} (MXN, con IVA)`}>{(p) => <Input {...p} type="number" min={0} step="0.01" value={val.price} onChange={(e) => setVal((x) => ({ ...x, price: e.target.value }))} />}</Field>
        </div>
      </Modal>

      <Modal open={!!edit} onClose={() => setEdit(null)} size="lg" title={edit?.id ? 'Editar material' : 'Nuevo material'}
        footer={<ConfirmFooter onCancel={() => setEdit(null)} confirmLabel="Guardar" loading={busy} onConfirm={async () => { const ok = await run(async () => { await save(); return true; }, 'Material guardado'); if (ok) { setEdit(null); reload(); ctx.reloadAll(); } }} />}>
        {edit && <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombre" required className="sm:col-span-2">{(p) => <Input {...p} value={edit.name ?? ''} onChange={(e) => set('name', e.target.value)} placeholder="Cloro granulado 70%" />}</Field>
          <Field label="Especialidad">{(p) => <Select {...p} value={edit.area} onChange={(e) => set('area', e.target.value)}>{ctx.areas.map((a) => <option key={a.code} value={a.code}>{a.name}</option>)}</Select>}</Field>
          <Field label="Categoría">{(p) => <Input {...p} list="cats" value={edit.category ?? ''} onChange={(e) => set('category', e.target.value)} placeholder="Químicos, refacciones, limpieza…" />}</Field>
          <datalist id="cats"><option value="Químicos" /><option value="Refacciones" /><option value="Limpieza" /><option value="Herramienta" /><option value="Pintura" /><option value="Eléctrico" /></datalist>
          <Field label="Unidad">{(p) => <Select {...p} value={edit.unit} onChange={(e) => set('unit', e.target.value)}>{UNITS.map((u) => <option key={u} value={u}>{u}</option>)}</Select>}</Field>
          {!edit.id && <Field label="Existencia actual">{(p) => <Input {...p} type="number" min={0} step="0.1" value={edit.stock ?? 0} onChange={(e) => set('stock', e.target.value)} />}</Field>}
          <Field label="Mínimo" hint="Abajo de esto se marca para comprar">{(p) => <Input {...p} type="number" min={0} step="0.1" value={edit.min_stock ?? 0} onChange={(e) => set('min_stock', e.target.value)} />}</Field>
          <Field label="Cantidad a pedir">{(p) => <Input {...p} type="number" min={0} step="0.1" value={edit.reorder_qty ?? ''} onChange={(e) => set('reorder_qty', e.target.value)} />}</Field>
          <Field label="Consumo diario aproximado" hint="Para calcular cuántos días alcanza">{(p) => <Input {...p} type="number" min={0} step="0.01" value={edit.daily_use ?? ''} onChange={(e) => set('daily_use', e.target.value)} />}</Field>
          <Field label="Se compra cada (días)" hint="Periodicidad de compra">{(p) => <Input {...p} type="number" min={0} value={edit.purchase_every_days ?? ''} onChange={(e) => set('purchase_every_days', e.target.value)} />}</Field>
          <Field label="Proveedor preferido">{(p) => <Select {...p} value={edit.preferred_supplier ?? ''} onChange={(e) => set('preferred_supplier', e.target.value)}><option value="">—</option>{data.sup.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>}</Field>
          <Field label="Notas" className="sm:col-span-2">{(p) => <Textarea {...p} rows={2} value={edit.notes ?? ''} onChange={(e) => set('notes', e.target.value)} />}</Field>
          {edit.id && <div className="sm:col-span-2"><Switch checked={edit.active ?? true} onChange={(v) => set('active', v)} label="Material activo" /></div>}
        </div>}
      </Modal>
    </>
  );
}
