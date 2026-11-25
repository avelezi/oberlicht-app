import { useState } from 'react';
import { Plus, Star } from 'lucide-react';
import { Button, Card, CardHeader, ConfirmFooter, Field, Input, Modal, Select, Switch, Table, Textarea } from '@/design-system';
import { useAction, useAsync } from '@/lib/hooks';
import { supabase, must } from '@/lib/supabase';
import { dateShort, money } from '@/lib/format';
import { ErrorBox, Loading } from '@/components/common';
import { areaName, type PriceCompare, type Supplier } from './shared';
import type { MantCtx } from '../Mantenimiento';

export function Stars({ n }: { n: number | null }) {
  if (!n) return <span className="text-fg-subtle">—</span>;
  return <span className="inline-flex items-center gap-0.5 text-sm" aria-label={`${n} de 5`}>{Array.from({ length: 5 }, (_, i) => <Star key={i} className={`h-3.5 w-3.5 ${i < n ? 'fill-current text-gold-600' : 'text-fg-subtle'}`} />)}</span>;
}

/** Proveedores y comparativo de precios por material (de facturas y cotizaciones). */
export function Proveedores({ ctx }: { ctx: MantCtx }) {
  const [edit, setEdit] = useState<Partial<Supplier> | null>(null);
  const { busy, run } = useAction();
  const { data, error, reload } = useAsync(async () => {
    const [sup, cmp] = await Promise.all([
      must(supabase.from('suppliers').select('*').order('name')),
      must(supabase.from('supplier_price_compare').select('*')),
    ]);
    return { sup: sup as Supplier[], cmp: (cmp as PriceCompare[]).filter((c) => !ctx.area || c.area === ctx.area) };
  }, [ctx.area]);
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return <Loading />;
  const set = (k: keyof Supplier, v: unknown) => setEdit((x) => ({ ...x, [k]: v }));
  async function save() {
    const s = edit!;
    if (!s.name?.trim()) throw new Error('Escribe el nombre del proveedor.');
    const payload = { name: s.name.trim(), rfc: s.rfc ? s.rfc.toUpperCase().trim() : null, contact: s.contact || null, phone: s.phone || null, email: s.email || null, areas: s.areas ?? [], payment_terms: s.payment_terms || null, delivery_days: s.delivery_days ? Number(s.delivery_days) : null, rating: s.rating ? Number(s.rating) : null, notes: s.notes || null, active: s.active ?? true };
    if (s.id) await must(supabase.from('suppliers').update(payload).eq('id', s.id)); else await must(supabase.from('suppliers').insert(payload));
  }

  // Comparativo agrupado por material
  const bySupply = new Map<string, PriceCompare[]>();
  for (const c of data.cmp) bySupply.set(c.supply_id, [...(bySupply.get(c.supply_id) ?? []), c]);
  const groups = [...bySupply.values()].filter((g) => g.length > 0).sort((a, b) => a[0].supply_name.localeCompare(b[0].supply_name));

  return (
    <div className="space-y-6">
      <div className="flex justify-end"><Button icon={<Plus className="h-5 w-5" />} onClick={() => setEdit({ areas: ctx.area ? [ctx.area] : [], active: true })}>Nuevo proveedor</Button></div>
      <Table rows={data.sup} rowKey={(s) => s.id} onRowClick={setEdit} empty="Agrega a tus proveedores para comparar precios." columns={[
        { key: 'n', header: 'Proveedor', cell: (s) => <div><p className="font-semibold">{s.name}{!s.active && <span className="text-sm font-normal text-fg-muted"> · inactivo</span>}</p><p className="text-sm text-fg-muted">{s.areas.map((a) => areaName(ctx.areas, a)).join(', ') || '—'}</p></div> },
        { key: 'c', header: 'Contacto', hideOnMobile: true, cell: (s) => <div className="text-sm"><p>{s.contact ?? ''}</p><p className="text-fg-muted">{[s.phone, s.email].filter(Boolean).join(' · ')}</p></div> },
        { key: 'e', header: 'Entrega', hideOnMobile: true, cell: (s) => s.delivery_days != null ? `${s.delivery_days} días` : '—' },
        { key: 'r', header: 'Calificación', cell: (s) => <Stars n={s.rating} /> },
      ]} />

      <Card>
        <CardHeader title="Comparativo de precios" description="Último precio conocido de cada proveedor por material. Se llena solo con cada factura; también puedes agregar cotizaciones desde Materiales." />
        {groups.length === 0 ? <p className="text-base text-fg-muted">Aún no hay precios. Registra una compra o una cotización.</p> : (
          <div className="space-y-5">
            {groups.map((g) => {
              const min = Math.min(...g.map((x) => Number(x.unit_price)));
              const sorted = [...g].sort((a, b) => Number(a.unit_price) - Number(b.unit_price));
              return (
                <div key={g[0].supply_id}>
                  <p className="mb-1 font-semibold">{g[0].supply_name} <span className="text-sm font-normal text-fg-muted">por {g[0].unit}</span></p>
                  <ul className="divide-y divide-border rounded-md border border-border">
                    {sorted.map((x) => {
                      const diff = min > 0 ? Math.round((100 * (Number(x.unit_price) - min)) / min) : 0;
                      return (
                        <li key={x.supplier_id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-base">
                          <span className="flex items-center gap-2">{Number(x.unit_price) === min && <span className="rounded bg-success-50 px-1.5 py-0.5 text-xs font-bold text-success-700">✓ Mejor precio</span>}{x.supplier_name}</span>
                          <span className="flex items-center gap-4 text-sm text-fg-muted">
                            <span>{x.source === 'factura' ? 'Factura' : 'Cotización'} {dateShort(x.quoted_on)}</span>
                            {x.delivery_days != null && <span>{x.delivery_days} días</span>}
                            <span className="text-base font-semibold text-fg ob-num">{money(x.unit_price)}</span>
                            {diff > 0 && <span className="font-semibold text-warning-700">+{diff}%</span>}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Modal open={!!edit} onClose={() => setEdit(null)} size="lg" title={edit?.id ? 'Editar proveedor' : 'Nuevo proveedor'}
        footer={<ConfirmFooter onCancel={() => setEdit(null)} confirmLabel="Guardar" loading={busy} onConfirm={async () => { const ok = await run(async () => { await save(); return true; }, 'Proveedor guardado'); if (ok) { setEdit(null); reload(); } }} />}>
        {edit && <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombre o razón social" required className="sm:col-span-2">{(p) => <Input {...p} value={edit.name ?? ''} onChange={(e) => set('name', e.target.value)} />}</Field>
          <Field label="RFC">{(p) => <Input {...p} value={edit.rfc ?? ''} onChange={(e) => set('rfc', e.target.value)} />}</Field>
          <Field label="Contacto">{(p) => <Input {...p} value={edit.contact ?? ''} onChange={(e) => set('contact', e.target.value)} />}</Field>
          <Field label="Teléfono / WhatsApp">{(p) => <Input {...p} type="tel" value={edit.phone ?? ''} onChange={(e) => set('phone', e.target.value)} />}</Field>
          <Field label="Correo">{(p) => <Input {...p} type="email" value={edit.email ?? ''} onChange={(e) => set('email', e.target.value)} />}</Field>
          <Field label="Días de entrega">{(p) => <Input {...p} type="number" min={0} value={edit.delivery_days ?? ''} onChange={(e) => set('delivery_days', e.target.value)} />}</Field>
          <Field label="Condiciones de pago">{(p) => <Input {...p} placeholder="Contado, 15 días, 30 días…" value={edit.payment_terms ?? ''} onChange={(e) => set('payment_terms', e.target.value)} />}</Field>
          <Field label="Calificación (servicio y calidad)">{(p) => <Select {...p} value={edit.rating ?? ''} onChange={(e) => set('rating', e.target.value)}><option value="">Sin calificar</option>{[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{'★'.repeat(n)} ({n})</option>)}</Select>}</Field>
          <div className="sm:col-span-2">
            <p className="mb-1 text-sm font-semibold">Especialidades que surte</p>
            <div className="flex flex-wrap gap-2">
              {ctx.areas.map((a) => {
                const on = (edit.areas ?? []).includes(a.code);
                return <button key={a.code} type="button" onClick={() => set('areas', on ? (edit.areas ?? []).filter((x) => x !== a.code) : [...(edit.areas ?? []), a.code])}
                  className={`min-h-[40px] rounded-full border px-3 text-sm font-semibold ${on ? 'border-primary bg-primary-soft text-primary' : 'border-border text-fg-muted'}`}>{on ? '✓ ' : ''}{a.name}</button>;
              })}
            </div>
          </div>
          <Field label="Notas" className="sm:col-span-2">{(p) => <Textarea {...p} rows={2} value={edit.notes ?? ''} onChange={(e) => set('notes', e.target.value)} />}</Field>
          {edit.id && <div className="sm:col-span-2"><Switch checked={edit.active ?? true} onChange={(v) => set('active', v)} label="Proveedor activo" /></div>}
        </div>}
      </Modal>
    </div>
  );
}
