import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Badge, Button, Card, CardHeader, ConfirmFooter, Field, Input, Modal, PageHeader, Segmented, Select, StatCard, Switch, Table } from '@/design-system';
import { useAction, useAsync } from '@/lib/hooks';
import { supabase, must } from '@/lib/supabase';
import { dateTime, downloadCsv, money, todayMx } from '@/lib/format';
import { ErrorBox, Loading } from '@/components/common';
import type { Product } from './Venta';

interface Move { id: number; qty: number; kind: string; note: string | null; created_at: string; products: { name: string } | null }
const KIND: Record<string, string> = { compra: 'Entrada (compra)', ajuste: 'Ajuste de conteo', merma: 'Merma', venta: 'Venta', cancelacion: 'Venta cancelada' };

/** Catálogo de barra y tienda con existencias, mínimos, entradas, mermas y conteo físico. */
export default function Productos() {
  const [edit, setEdit] = useState<Partial<Product> | null>(null);
  const [move, setMove] = useState<{ p: Product; kind: 'compra' | 'merma' | 'conteo'; qty: string; note: string } | null>(null);
  const [filter, setFilter] = useState<'todos' | 'bajo'>('todos');
  const { busy, run } = useAction();
  const { data, error, reload } = useAsync(async () => {
    const [p, m, sold] = await Promise.all([
      must(supabase.from('products').select('*').order('category').order('name')),
      must(supabase.from('inventory_moves').select('id, qty, kind, note, created_at, products(name)').order('created_at', { ascending: false }).limit(30)),
      must(supabase.from('sale_items').select('total, qty, sales!inner(status, created_at)').neq('sales.status', 'cancelada').gte('sales.created_at', new Date(`${todayMx().slice(0, 7)}-01T00:00:00-06:00`).toISOString())),
    ]);
    return { products: p as Product[], moves: m as unknown as Move[], monthSales: (sold as { total: number }[]).reduce((a, s) => a + Number(s.total), 0) };
  }, []);
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return <Loading />;
  const set = (k: keyof Product, v: unknown) => setEdit((x) => ({ ...x, [k]: v }));
  const low = data.products.filter((p) => p.active && p.track_stock && p.stock <= p.min_stock);
  const value = data.products.filter((p) => p.track_stock && p.stock > 0).reduce((a, p) => a + p.stock * Number(p.cost ?? 0), 0);
  const rows = filter === 'bajo' ? low : data.products;

  async function save() {
    const p = edit!;
    if (!p.name?.trim()) throw new Error('Escribe el nombre del producto.');
    if (p.price == null || String(p.price) === '' || Number(p.price) < 0) throw new Error('Escribe el precio de venta.');
    const payload = { name: p.name.trim(), category: p.category ?? 'barra', sku: p.sku?.trim() || null, price: Number(p.price), cost: p.cost != null && String(p.cost) !== '' ? Number(p.cost) : null,
      min_stock: Number(p.min_stock) || 0, track_stock: p.track_stock ?? true, active: p.active ?? true };
    if (p.id) await must(supabase.from('products').update(payload).eq('id', p.id).select());
    else {
      const created = (await must(supabase.from('products').insert(payload).select().single())) as Product;
      if (Number(p.stock) > 0 && payload.track_stock) await must(supabase.rpc('mover_inventario', { p_product: created.id, p_qty: Number(p.stock), p_kind: 'compra', p_note: 'Existencia inicial' }));
    }
  }
  async function doMove() {
    const m = move!;
    const n = Number(m.qty);
    if (!Number.isFinite(n) || (m.kind !== 'conteo' && n <= 0) || (m.kind === 'conteo' && n < 0)) throw new Error('Escribe una cantidad válida.');
    if (m.kind === 'conteo') {
      const delta = n - m.p.stock;
      if (delta === 0) return;
      await must(supabase.rpc('mover_inventario', { p_product: m.p.id, p_qty: delta, p_kind: 'ajuste', p_note: m.note || `Conteo físico: ${n}` }));
    } else await must(supabase.rpc('mover_inventario', { p_product: m.p.id, p_qty: n, p_kind: m.kind, p_note: m.note || null }));
  }

  return (
    <>
      <PageHeader title="Productos e inventario" description="Barra saludable y tienda: precios, existencias y movimientos."
        actions={<Button icon={<Plus className="h-5 w-5" />} onClick={() => setEdit({ category: 'barra', track_stock: true, active: true, min_stock: 5 })}>Nuevo producto</Button>} />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Productos activos" value={String(data.products.filter((p) => p.active).length)} />
        <StatCard label="Por surtir" value={String(low.length)} hint="En o bajo su mínimo" />
        <StatCard label="Inventario a costo" value={money(value)} />
        <StatCard label="Vendido este mes" value={money(data.monthSales)} />
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Segmented value={filter} onChange={(v) => setFilter(v as 'todos' | 'bajo')} options={[{ id: 'todos', label: 'Todos' }, { id: 'bajo', label: `Por surtir (${low.length})` }]} />
        <Button variant="secondary" className="ml-auto" onClick={() => downloadCsv(filter === 'bajo' ? 'lista-de-surtido' : 'productos', rows.map((p) => ({ Producto: p.name, Categoria: p.category, Codigo: p.sku ?? '', Precio: p.price, Costo: p.cost ?? '', Existencia: p.stock, Minimo: p.min_stock, Sugerido: Math.max(p.min_stock * 2 - p.stock, 0) })))}>Descargar {filter === 'bajo' ? 'lista de surtido' : 'catálogo'}</Button>
      </div>
      <Table rows={rows} rowKey={(p) => p.id} onRowClick={setEdit} empty={filter === 'bajo' ? 'Todo está surtido.' : 'Da de alta tus productos de barra y tienda.'} columns={[
        { key: 'n', header: 'Producto', cell: (p) => <div><p className="font-semibold">{p.name}{!p.active && <span className="text-sm font-normal text-fg-muted"> · inactivo</span>}</p><p className="text-sm text-fg-muted">{p.category === 'barra' ? 'Barra' : 'Tienda'}{p.sku ? ` · ${p.sku}` : ''}</p></div> },
        { key: 'p', header: 'Precio', align: 'right', cell: (p) => <div className="ob-num"><p className="font-semibold">{money(p.price)}</p>{p.cost != null && Number(p.price) > 0 && <p className="text-sm text-fg-muted">Margen {Math.round((100 * (Number(p.price) - Number(p.cost))) / Number(p.price))}%</p>}</div> },
        { key: 's', header: 'Existencia', align: 'right', cell: (p) => !p.track_stock ? <span className="text-sm text-fg-muted">Sin control</span> : p.stock <= p.min_stock ? <Badge tone={p.stock <= 0 ? 'danger' : 'warning'}>{p.stock} (mín. {p.min_stock})</Badge> : <span className="ob-num">{p.stock}</span> },
        { key: 'a', header: '', align: 'right', cell: (p) => p.track_stock ? (
          <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            <Button size="sm" variant="secondary" onClick={() => setMove({ p, kind: 'compra', qty: '', note: '' })}>Entrada</Button>
            <Button size="sm" variant="ghost" onClick={() => setMove({ p, kind: 'conteo', qty: String(p.stock), note: '' })}>Contar</Button>
            <Button size="sm" variant="ghost" onClick={() => setMove({ p, kind: 'merma', qty: '', note: '' })}>Merma</Button>
          </div>
        ) : null },
      ]} />

      <Card className="mt-6">
        <CardHeader title="Últimos movimientos" />
        <Table dense rows={data.moves} rowKey={(m) => String(m.id)} empty="Sin movimientos." columns={[
          { key: 'd', header: 'Fecha', cell: (m) => <span className="text-sm">{dateTime(m.created_at)}</span> },
          { key: 'p', header: 'Producto', cell: (m) => m.products?.name ?? '—' },
          { key: 'k', header: 'Tipo', hideOnMobile: true, cell: (m) => <span className="text-sm">{KIND[m.kind] ?? m.kind}{m.note ? ` · ${m.note}` : ''}</span> },
          { key: 'q', header: 'Cantidad', align: 'right', cell: (m) => <span className={`font-semibold ob-num ${m.qty < 0 ? 'text-danger-700' : 'text-success-700'}`}>{m.qty > 0 ? '+' : ''}{m.qty}</span> },
        ]} />
      </Card>

      <Modal open={!!move} onClose={() => setMove(null)} title={move ? `${move.kind === 'compra' ? 'Entrada' : move.kind === 'merma' ? 'Merma' : 'Conteo físico'}: ${move.p.name}` : ''}
        footer={<ConfirmFooter onCancel={() => setMove(null)} confirmLabel="Guardar" loading={busy} onConfirm={async () => { const ok = await run(async () => { await doMove(); return true; }, 'Inventario actualizado'); if (ok) { setMove(null); reload(); } }} />}>
        {move && <div className="grid gap-4">
          <p className="text-base">Existencia actual: <span className="font-semibold ob-num">{move.p.stock}</span></p>
          <Field label={move.kind === 'conteo' ? '¿Cuántos hay físicamente?' : move.kind === 'compra' ? 'Piezas que llegaron' : 'Piezas perdidas, caducas o dañadas'}>{(p) => <Input {...p} type="number" min={0} value={move.qty} onChange={(e) => setMove({ ...move, qty: e.target.value })} autoFocus />}</Field>
          {move.kind === 'conteo' && move.qty !== '' && Number(move.qty) !== move.p.stock && <p className="text-base">Se ajustará en <span className="font-semibold ob-num">{Number(move.qty) - move.p.stock > 0 ? '+' : ''}{Number(move.qty) - move.p.stock}</span> piezas.</p>}
          <Field label="Nota">{(p) => <Input {...p} value={move.note} onChange={(e) => setMove({ ...move, note: e.target.value })} placeholder={move.kind === 'compra' ? 'Proveedor o factura' : 'Opcional'} />}</Field>
        </div>}
      </Modal>

      <Modal open={!!edit} onClose={() => setEdit(null)} size="lg" title={edit?.id ? 'Editar producto' : 'Nuevo producto'}
        footer={<ConfirmFooter onCancel={() => setEdit(null)} confirmLabel="Guardar" loading={busy} onConfirm={async () => { const ok = await run(async () => { await save(); return true; }, 'Producto guardado'); if (ok) { setEdit(null); reload(); } }} />}>
        {edit && <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombre" required className="sm:col-span-2">{(p) => <Input {...p} value={edit.name ?? ''} onChange={(e) => set('name', e.target.value)} placeholder="Ej. Smoothie de fresa" />}</Field>
          <Field label="Categoría">{(p) => <Select {...p} value={edit.category} onChange={(e) => set('category', e.target.value)}><option value="barra">Barra</option><option value="tienda">Tienda</option></Select>}</Field>
          <Field label="Código o SKU">{(p) => <Input {...p} value={edit.sku ?? ''} onChange={(e) => set('sku', e.target.value)} />}</Field>
          <Field label="Precio de venta (MXN)" required>{(p) => <Input {...p} type="number" min={0} step="0.5" value={edit.price ?? ''} onChange={(e) => set('price', e.target.value)} />}</Field>
          <Field label="Costo (MXN)" hint="Para calcular margen">{(p) => <Input {...p} type="number" min={0} step="0.5" value={edit.cost ?? ''} onChange={(e) => set('cost', e.target.value)} />}</Field>
          {!edit.id && <Field label="Existencia inicial">{(p) => <Input {...p} type="number" min={0} value={edit.stock ?? ''} onChange={(e) => set('stock', e.target.value)} />}</Field>}
          <Field label="Mínimo para resurtir">{(p) => <Input {...p} type="number" min={0} value={edit.min_stock ?? ''} onChange={(e) => set('min_stock', e.target.value)} />}</Field>
          <div className="sm:col-span-2 grid gap-3">
            <Switch checked={edit.track_stock ?? true} onChange={(v) => set('track_stock', v)} label="Llevar control de existencias (apágalo para bebidas preparadas al momento)" />
            {edit.id && <Switch checked={edit.active ?? true} onChange={(v) => set('active', v)} label="Producto a la venta" />}
          </div>
        </div>}
      </Modal>
    </>
  );
}
