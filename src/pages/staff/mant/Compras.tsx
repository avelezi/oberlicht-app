import { useRef, useState } from 'react';
import { FileText, Paperclip, Plus, Trash2, Upload } from 'lucide-react';
import { Alert, Badge, Button, ConfirmFooter, Field, Input, Modal, Segmented, Select, Table, Textarea } from '@/design-system';
import { useAction, useAsync, useToast } from '@/lib/hooks';
import { supabase, must, friendlyError } from '@/lib/supabase';
import { dateShort, money, money0, todayMx } from '@/lib/format';
import { ErrorBox, Loading } from '@/components/common';
import { areaName, parseCfdi, type Purchase, type Supplier, type Supply } from './shared';
import type { MantCtx } from '../Mantenimiento';

type Item = { description: string; supply_id: string; qty: string; unit_price: string };
const BUCKET = 'facturas-compras';

/** Compras con factura: sube el XML (se llena solo) y/o el PDF, asigna partidas a materiales y lleva lo pagado y por pagar. */
export function Compras({ ctx }: { ctx: MantCtx }) {
  const [filter, setFilter] = useState('todas');
  const [open, setOpen] = useState(false);
  const toast = useToast();
  const { busy, run } = useAction();
  const { data, error, reload } = useAsync(async () => {
    let q = supabase.from('purchases').select('*').order('invoice_date', { ascending: false }).limit(300);
    if (ctx.area) q = q.eq('area', ctx.area);
    if (filter === 'por_pagar') q = q.eq('status', 'por_pagar');
    const [p, s] = await Promise.all([must(q), must(supabase.from('suppliers').select('id, name, rfc').order('name'))]);
    return { p: p as Purchase[], s: s as Supplier[] };
  }, [ctx.area, filter]);
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return <Loading />;

  async function openFile(path: string) {
    const { data: u, error: e } = await supabase.storage.from(BUCKET).createSignedUrl(path, 300);
    if (e || !u) { toast(friendlyError(e), 'danger'); return; }
    window.open(u.signedUrl, '_blank', 'noopener');
  }
  const totalPend = data.p.filter((p) => p.status === 'por_pagar').reduce((s, p) => s + Number(p.total), 0);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Segmented value={filter} onChange={setFilter} options={[{ id: 'todas', label: 'Todas' }, { id: 'por_pagar', label: 'Por pagar' }]} />
        <div className="flex items-center gap-3">
          {totalPend > 0 && <span className="text-base">Por pagar: <b className="ob-num">{money0(totalPend)}</b></span>}
          <Button icon={<Plus className="h-5 w-5" />} onClick={() => setOpen(true)}>Registrar compra</Button>
        </div>
      </div>
      <Table rows={data.p} rowKey={(p) => p.id} empty="Registra tus compras subiendo la factura en XML o PDF." columns={[
        { key: 'f', header: 'Fecha', cell: (p) => dateShort(p.invoice_date) },
        { key: 'p', header: 'Proveedor', cell: (p) => <div><p className="font-semibold">{data.s.find((s) => s.id === p.supplier_id)?.name ?? 'Sin proveedor'}</p><p className="text-sm text-fg-muted">{areaName(ctx.areas, p.area)}{p.invoice_number ? ` · Factura ${p.invoice_number}` : ''}</p></div> },
        { key: 't', header: 'Total', align: 'right', cell: (p) => <span className="font-semibold ob-num">{money(p.total)}</span> },
        { key: 's', header: 'Estado', cell: (p) => p.status === 'pagada' ? <Badge tone="success" icon={<span aria-hidden>✓</span>}>Pagada</Badge> : p.status === 'cancelada' ? <Badge tone="neutral">Cancelada</Badge> : <Badge tone="warning" icon={<span aria-hidden>◷</span>}>Por pagar</Badge> },
        { key: 'a', header: '', align: 'right', cell: (p) => <div className="flex justify-end gap-1">
          {p.pdf_path && <Button size="sm" variant="ghost" icon={<FileText className="h-4 w-4" />} onClick={() => openFile(p.pdf_path!)}>PDF</Button>}
          {p.xml_path && <Button size="sm" variant="ghost" onClick={() => openFile(p.xml_path!)}>XML</Button>}
          {p.status === 'por_pagar' && <Button size="sm" variant="secondary" loading={busy} onClick={async () => { const r = await run(() => must(supabase.from('purchases').update({ status: 'pagada', paid_at: todayMx() }).eq('id', p.id).select()), 'Marcada como pagada'); if (r) { reload(); ctx.reloadAll(); } }}>Pagada</Button>}
        </div> },
      ]} />
      {open && <NewPurchase ctx={ctx} suppliers={data.s} onClose={() => setOpen(false)} onSaved={() => { reload(); ctx.reloadAll(); }} />}
    </>
  );
}

function NewPurchase({ ctx, suppliers, onClose, onSaved }: { ctx: MantCtx; suppliers: Supplier[]; onClose: () => void; onSaved: () => void }) {
  const xmlRef = useRef<HTMLInputElement>(null);
  const pdfRef = useRef<HTMLInputElement>(null);
  const [xml, setXml] = useState<File | null>(null);
  const [pdf, setPdf] = useState<File | null>(null);
  const [f, setF] = useState({ area: ctx.area || 'alberca', supplier_id: '', new_supplier: '', rfc: '', invoice_number: '', invoice_uuid: '', invoice_date: todayMx(), subtotal: '', tax: '', total: '', status: 'por_pagar', notes: '' });
  const [items, setItems] = useState<Item[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const { busy, run } = useAction();
  const { data: supplies } = useAsync(async () => (await must(supabase.from('supplies').select('id, name, unit, area').eq('active', true).order('name'))) as Supply[], []);
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));

  async function readXml(file: File) {
    setXml(file); setMsg(null);
    try {
      const c = parseCfdi(await file.text());
      const match = suppliers.find((s) => s.rfc && s.rfc.toUpperCase() === c.rfc.toUpperCase());
      setF((x) => ({ ...x, invoice_number: c.serieFolio, invoice_uuid: c.uuid, invoice_date: c.fecha || x.invoice_date, subtotal: String(c.subtotal), tax: String(c.tax), total: String(c.total),
        supplier_id: match?.id ?? '', new_supplier: match ? '' : c.nombre, rfc: c.rfc }));
      setItems(c.conceptos.map((k) => {
        const guess = (supplies ?? []).find((s) => k.descripcion.toLowerCase().includes(s.name.toLowerCase().split(' ')[0]));
        return { description: k.descripcion, supply_id: guess?.id ?? '', qty: String(k.cantidad), unit_price: String(Math.round(k.valorUnitario * (c.subtotal ? c.total / c.subtotal : 1.16) * 100) / 100) };
      }));
      setMsg(match ? `Factura leída. Proveedor: ${match.name}.` : `Factura leída. ${c.nombre} se dará de alta como proveedor nuevo.`);
    } catch (e) { setMsg(friendlyError(e)); }
  }

  async function save() {
    if (!Number(f.total)) throw new Error('Escribe el total de la factura.');
    let supplier = f.supplier_id;
    if (!supplier && f.new_supplier.trim()) {
      const s = await must(supabase.from('suppliers').insert({ name: f.new_supplier.trim(), rfc: f.rfc || null, areas: [f.area] }).select('id').single());
      supplier = (s as { id: string }).id;
    }
    const stamp = `${f.invoice_date.slice(0, 7)}/${Date.now()}`;
    const up = async (file: File | null, ext: string) => {
      if (!file) return null;
      const path = `${f.area}/${stamp}-${(f.invoice_number || 'factura').replace(/[^A-Za-z0-9-]/g, '')}.${ext}`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined });
      if (error) throw error;
      return path;
    };
    const [pdf_path, xml_path] = await Promise.all([up(pdf, pdf?.name.split('.').pop()?.toLowerCase() || 'pdf'), up(xml, 'xml')]);
    const p = await must(supabase.from('purchases').insert({
      area: f.area, supplier_id: supplier || null, invoice_number: f.invoice_number || null, invoice_uuid: f.invoice_uuid || null, invoice_date: f.invoice_date,
      subtotal: f.subtotal ? Number(f.subtotal) : null, tax: f.tax ? Number(f.tax) : null, total: Number(f.total), pdf_path, xml_path,
      status: f.status, paid_at: f.status === 'pagada' ? todayMx() : null, notes: f.notes || null,
    }).select('id').single());
    const rows = items.filter((i) => i.description.trim() && Number(i.qty) > 0).map((i) => ({ purchase_id: (p as { id: string }).id, supply_id: i.supply_id || null, description: i.description.trim(), qty: Number(i.qty), unit_price: Number(i.unit_price) || 0 }));
    if (rows.length) await must(supabase.from('purchase_items').insert(rows));
  }

  const linked = items.filter((i) => i.supply_id).length;
  return (
    <Modal open onClose={onClose} size="lg" title="Registrar compra"
      footer={<ConfirmFooter onCancel={onClose} confirmLabel="Guardar compra" loading={busy} onConfirm={async () => { const ok = await run(async () => { await save(); return true; }, 'Compra registrada'); if (ok) { onSaved(); onClose(); } }} />}>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <button type="button" onClick={() => xmlRef.current?.click()} className="flex min-h-[88px] flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-border-strong p-3 text-center hover:bg-primary-soft">
            <Upload className="h-6 w-6 text-primary" /><span className="font-semibold">{xml ? xml.name : 'Subir XML de la factura'}</span><span className="text-xs text-fg-muted">Llena todo automáticamente</span>
          </button>
          <button type="button" onClick={() => pdfRef.current?.click()} className="flex min-h-[88px] flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-border-strong p-3 text-center hover:bg-primary-soft">
            <Paperclip className="h-6 w-6 text-primary" /><span className="font-semibold">{pdf ? pdf.name : 'Subir PDF o foto'}</span><span className="text-xs text-fg-muted">Queda guardado para consulta</span>
          </button>
          <input ref={xmlRef} type="file" accept=".xml,text/xml" className="hidden" onChange={(e) => { const x = e.target.files?.[0]; if (x) readXml(x); e.target.value = ''; }} />
          <input ref={pdfRef} type="file" accept=".pdf,image/*" className="hidden" onChange={(e) => { const x = e.target.files?.[0]; if (x) setPdf(x); e.target.value = ''; }} />
        </div>
        {msg && <Alert tone="info" title={msg} />}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Especialidad">{(p) => <Select {...p} value={f.area} onChange={(e) => set('area', e.target.value)}>{ctx.areas.map((a) => <option key={a.code} value={a.code}>{a.name}</option>)}</Select>}</Field>
          <Field label="Proveedor">{(p) => <Select {...p} value={f.supplier_id} onChange={(e) => set('supplier_id', e.target.value)}><option value="">{f.new_supplier ? `Nuevo: ${f.new_supplier}` : '— Elige o escribe uno nuevo abajo —'}</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>}</Field>
          {!f.supplier_id && <Field label="Proveedor nuevo" className="sm:col-span-2">{(p) => <Input {...p} value={f.new_supplier} onChange={(e) => set('new_supplier', e.target.value)} placeholder="Nombre del proveedor" />}</Field>}
          <Field label="Folio de factura">{(p) => <Input {...p} value={f.invoice_number} onChange={(e) => set('invoice_number', e.target.value)} />}</Field>
          <Field label="Fecha">{(p) => <Input {...p} type="date" value={f.invoice_date} onChange={(e) => set('invoice_date', e.target.value)} />}</Field>
          <Field label="Subtotal">{(p) => <Input {...p} type="number" step="0.01" value={f.subtotal} onChange={(e) => set('subtotal', e.target.value)} />}</Field>
          <Field label="Total (con IVA)" required>{(p) => <Input {...p} type="number" step="0.01" value={f.total} onChange={(e) => set('total', e.target.value)} />}</Field>
          <Field label="¿Ya se pagó?">{(p) => <Select {...p} value={f.status} onChange={(e) => set('status', e.target.value)}><option value="por_pagar">Por pagar</option><option value="pagada">Pagada</option></Select>}</Field>
          {f.invoice_uuid && <Field label="Folio fiscal (UUID)">{(p) => <Input {...p} value={f.invoice_uuid} readOnly />}</Field>}
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between"><p className="text-sm font-semibold">Partidas {items.length > 0 && <span className="font-normal text-fg-muted">· {linked} ligadas a materiales (suben existencias y precios)</span>}</p>
            <Button size="sm" variant="ghost" icon={<Plus className="h-4 w-4" />} onClick={() => setItems((x) => [...x, { description: '', supply_id: '', qty: '1', unit_price: '' }])}>Agregar</Button></div>
          <div className="space-y-2">
            {items.map((it, i) => (
              <div key={i} className="grid gap-2 rounded-md border border-border p-2 sm:grid-cols-[1fr_180px_80px_100px_40px]">
                <Input value={it.description} placeholder="Descripción" onChange={(e) => setItems((x) => x.map((y, j) => j === i ? { ...y, description: e.target.value } : y))} />
                <Select value={it.supply_id} onChange={(e) => setItems((x) => x.map((y, j) => j === i ? { ...y, supply_id: e.target.value } : y))}>
                  <option value="">No es material de inventario</option>
                  {(supplies ?? []).map((s) => <option key={s.id} value={s.id}>{s.name} ({s.unit})</option>)}
                </Select>
                <Input type="number" step="0.01" value={it.qty} aria-label="Cantidad" onChange={(e) => setItems((x) => x.map((y, j) => j === i ? { ...y, qty: e.target.value } : y))} />
                <Input type="number" step="0.01" value={it.unit_price} aria-label="Precio unitario con IVA" placeholder="$ c/u" onChange={(e) => setItems((x) => x.map((y, j) => j === i ? { ...y, unit_price: e.target.value } : y))} />
                <Button size="sm" variant="ghost" aria-label="Quitar" icon={<Trash2 className="h-4 w-4" />} onClick={() => setItems((x) => x.filter((_, j) => j !== i))} />
              </div>
            ))}
          </div>
          {items.length > 0 && <p className="mt-1 text-xs text-fg-muted">Precio unitario con IVA. Si la cantidad viene en otra presentación (p. ej. cubeta de 25 kg), ajústala a la unidad del material.</p>}
        </div>
        <Field label="Notas">{(p) => <Textarea {...p} rows={2} value={f.notes} onChange={(e) => set('notes', e.target.value)} />}</Field>
      </div>
    </Modal>
  );
}
