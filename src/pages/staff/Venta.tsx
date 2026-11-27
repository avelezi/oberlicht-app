import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Coins, Minus, Package, Plus, Search, ShoppingCart, Trash2, X } from 'lucide-react';
import { Badge, Button, Card, CardHeader, ConfirmFooter, EmptyState, Field, Input, Modal, PageHeader, Segmented, StatCard, Table, Tabs } from '@/design-system';
import { useAuth } from '@/lib/auth';
import { useAction, useAsync } from '@/lib/hooks';
import { supabase, must } from '@/lib/supabase';
import { downloadCsv, fullName, money, timeOnly, todayMx } from '@/lib/format';
import { ErrorBox, Loading } from '@/components/common';
import { MemberPicker, type PickedMember } from '@/components/MemberPicker';
import { cargarPuntos, pts, type PuntosFamilia } from '@/components/Puntos';

export interface Product {
  id: string; name: string; category: 'barra' | 'tienda'; sku: string | null; price: number; cost: number | null;
  stock: number; min_stock: number; track_stock: boolean; active: boolean;
}
interface Sale {
  id: string; folio: number; total: number; discount: number; points_used: number; points_discount: number; method: string; status: 'pagada' | 'a_cuenta' | 'cancelada'; created_at: string;
  cancel_reason: string | null; families: { name: string; number: number } | null; sale_items: { name: string; qty: number; total: number }[];
}
const METHODS = [
  { value: 'efectivo', label: 'Efectivo' }, { value: 'tarjeta', label: 'Tarjeta' }, { value: 'transferencia', label: 'Transferencia' }, { value: 'cuenta', label: 'A la cuenta' },
];
const methodLabel = (m: string) => METHODS.find((x) => x.value === m)?.label ?? m;

/** Punto de venta de barra y tienda: cuadrícula de productos, carrito, cupón y cargo a la cuenta de la familia. */
export default function Venta() {
  const { isManager, profile } = useAuth();
  const [tab, setTab] = useState<'vender' | 'hoy'>('vender');
  const canManage = isManager || profile?.role === 'ventas';
  return (
    <>
      <PageHeader title="Punto de venta" description="Barra saludable y tienda."
        actions={canManage ? <Link to="/productos"><Button variant="secondary" icon={<Package className="h-5 w-5" />}>Productos e inventario</Button></Link> : undefined} />
      <Tabs className="mb-4" value={tab} onChange={(v) => setTab(v as 'vender' | 'hoy')} items={[{ id: 'vender', label: 'Vender' }, { id: 'hoy', label: 'Ventas y corte del día' }]} />
      {tab === 'vender' ? <Vender /> : <VentasDia />}
    </>
  );
}

function Vender() {
  const [cat, setCat] = useState<'barra' | 'tienda'>('barra');
  const [q, setQ] = useState('');
  const [cart, setCart] = useState<Record<string, number>>({});
  const [method, setMethod] = useState('efectivo');
  const [member, setMember] = useState<PickedMember | null>(null);
  const [coupon, setCoupon] = useState('');
  const [cash, setCash] = useState('');
  const [done, setDone] = useState<{ folio: number; total: number; change: number; points: number } | null>(null);
  const [usePts, setUsePts] = useState(false);
  const [ptsIn, setPtsIn] = useState('');
  const { busy, run } = useAction();
  const { data, error, reload } = useAsync(async () => (await must(supabase.from('products').select('*').eq('active', true).order('name'))) as Product[], []);

  const lines = useMemo(() => Object.entries(cart).map(([id, qty]) => ({ p: data?.find((x) => x.id === id), qty })).filter((l): l is { p: Product; qty: number } => !!l.p), [cart, data]);
  const subtotal = lines.reduce((s, l) => s + Number(l.p.price) * l.qty, 0);
  const { data: puntos } = useAsync(async () => (member?.family_id ? await cargarPuntos(member.family_id) : null) as PuntosFamilia | null, [member?.family_id, done]);
  const ptsMax = puntos ? Math.min(puntos.saldo, Math.ceil(subtotal / puntos.pesos_por_punto)) : 0;
  const ptsUse = usePts && puntos ? Math.max(0, Math.min(ptsMax, Math.round(Number(ptsIn || ptsMax)))) : 0;
  const ptsDisc = puntos ? Math.min(subtotal, Math.round(ptsUse * puntos.pesos_por_punto * 100) / 100) : 0;
  const ptsOk = !usePts || !puntos || ptsUse >= puntos.minimo_canje;
  const toPay = subtotal - ptsDisc;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return <Loading />;
  if (data.length === 0) return <Card><EmptyState icon={<Package className="h-8 w-8" />} title="Aún no hay productos" description="Pide a Dirección o al encargado de ventas que dé de alta los productos de barra y tienda en Productos e inventario." /></Card>;

  const shown = data.filter((p) => p.category === cat && (!q || p.name.toLowerCase().includes(q.toLowerCase()) || p.sku === q));
  const add = (p: Product, d = 1) => setCart((c) => {
    const n = (c[p.id] ?? 0) + d;
    if (p.track_stock && n > p.stock) return c;
    const next = { ...c };
    if (n <= 0) delete next[p.id]; else next[p.id] = n;
    return next;
  });

  async function cobrar() {
    const s = await run(() => must(supabase.rpc('vender_pos', {
      p_items: lines.map((l) => ({ product_id: l.p.id, qty: l.qty })), p_method: method,
      p_family: member?.family_id ?? null, p_member: member?.id ?? null, p_coupon: coupon.trim() || null, p_points: ptsUse,
    })) as Promise<{ folio: number; total: number; points_used: number }>);
    if (s) {
      setDone({ folio: s.folio, total: Number(s.total), change: method === 'efectivo' && Number(cash) > 0 ? Number(cash) - Number(s.total) : 0, points: s.points_used });
      setCart({}); setCoupon(''); setCash(''); setMember(null); setMethod('efectivo'); setUsePts(false); setPtsIn(''); reload();
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
      <div>
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <Segmented value={cat} onChange={(v) => setCat(v as 'barra' | 'tienda')} options={[{ id: 'barra', label: 'Barra' }, { id: 'tienda', label: 'Tienda' }]} />
          <div className="min-w-[200px] flex-1"><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar producto o código" leading={<Search className="h-5 w-5" />} aria-label="Buscar producto" /></div>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {shown.map((p) => {
            const out = p.track_stock && p.stock <= 0;
            const inCart = cart[p.id] ?? 0;
            return (
              <button key={p.id} type="button" disabled={out} onClick={() => add(p)}
                className={`relative flex min-h-[96px] flex-col justify-between rounded-lg border p-3 text-left transition ${out ? 'cursor-not-allowed border-border opacity-50' : 'border-border bg-surface hover:border-primary hover:bg-primary-soft'}`}>
                <span className="text-base font-semibold leading-tight">{p.name}</span>
                <span className="mt-2 flex items-end justify-between">
                  <span className="text-lg font-bold ob-num">{money(p.price)}</span>
                  {p.track_stock && <span className={`text-xs ${p.stock <= p.min_stock ? 'font-semibold text-warning-700' : 'text-fg-muted'}`}>{out ? 'Agotado' : `Quedan ${p.stock}`}</span>}
                </span>
                {inCart > 0 && <span className="absolute right-2 top-2 rounded-full bg-primary px-2 text-sm font-bold text-white">{inCart}</span>}
              </button>
            );
          })}
          {shown.length === 0 && <p className="col-span-full text-base text-fg-muted">Sin productos con ese nombre.</p>}
        </div>
      </div>

      {lines.length > 0 && (
        <button type="button" onClick={() => document.getElementById('ticket')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          className="ob-press ob-fab-bar fixed inset-x-3 z-30 flex h-14 items-center justify-between rounded-xl bg-primary px-4 text-primary-fg shadow-lg lg:hidden">
          <span className="flex items-center gap-2 text-base font-semibold"><ShoppingCart className="h-5 w-5" aria-hidden /> Ver ticket · {lines.reduce((a, l) => a + l.qty, 0)}</span>
          <span className="text-lg font-bold ob-num">{money(lines.reduce((a, l) => a + Number(l.p.price) * l.qty, 0))}</span>
        </button>
      )}
      <Card id="ticket" className="h-fit scroll-mt-20 lg:sticky lg:top-4">
        <CardHeader title="Ticket" actions={lines.length > 0 ? <Button size="sm" variant="ghost" icon={<Trash2 className="h-4 w-4" />} onClick={() => setCart({})}>Vaciar</Button> : undefined} />
        {lines.length === 0 ? <p className="py-6 text-center text-base text-fg-muted"><ShoppingCart className="mx-auto mb-2 h-8 w-8" />Toca un producto para agregarlo.</p> : (
          <ul className="mb-4 divide-y divide-border">
            {lines.map((l) => (
              <li key={l.p.id} className="flex items-center gap-2 py-2">
                <span className="flex-1 text-base">{l.p.name}</span>
                <button type="button" aria-label="Quitar uno" className="grid h-9 w-9 place-items-center rounded-md border border-border" onClick={() => add(l.p, -1)}><Minus className="h-4 w-4" /></button>
                <span className="w-6 text-center font-semibold ob-num">{l.qty}</span>
                <button type="button" aria-label="Agregar uno" className="grid h-9 w-9 place-items-center rounded-md border border-border" onClick={() => add(l.p, 1)}><Plus className="h-4 w-4" /></button>
                <span className="w-20 text-right font-semibold ob-num">{money(Number(l.p.price) * l.qty)}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="space-y-3">
          <div>
            <p className="mb-1 text-sm font-semibold">Socio (opcional, obligatorio para cargar a la cuenta)</p>
            {member ? (
              <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                <span><span className="font-semibold">{fullName(member)}</span> <span className="text-sm text-fg-muted">{member.families?.name} #{member.families?.number}</span></span>
                <button type="button" aria-label="Quitar socio" onClick={() => { setMember(null); setUsePts(false); setPtsIn(''); }}><X className="h-4 w-4" /></button>
              </div>
            ) : <MemberPicker onPick={setMember} />}
          </div>
          {member && puntos?.activo && (
            <div className="rounded-md border border-gold-100 bg-gold-50 px-3 py-2 text-gold-800">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-base"><Coins className="h-5 w-5" aria-hidden /><span><strong className="ob-num">{pts(puntos.saldo)}</strong> <span className="text-sm">(= {money(puntos.valor)})</span></span></span>
                {puntos.saldo >= puntos.minimo_canje && subtotal > 0 && (
                  <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" className="h-5 w-5" checked={usePts} onChange={(e) => { setUsePts(e.target.checked); setPtsIn(''); }} /> Usar</label>
                )}
              </div>
              {puntos.saldo < puntos.minimo_canje && <p className="mt-1 text-sm">Se pueden canjear desde {puntos.minimo_canje} puntos.</p>}
              {usePts && (
                <div className="mt-2 flex items-end gap-2">
                  <label className="flex-1 text-sm font-semibold">Puntos a usar (máx. {ptsMax})
                    <Input className="mt-1" type="number" min={puntos.minimo_canje} max={ptsMax} value={ptsIn === '' ? String(ptsMax) : ptsIn} onChange={(e) => setPtsIn(e.target.value)} />
                  </label>
                  <span className="pb-3 text-base font-semibold ob-num">−{money(ptsDisc)}</span>
                </div>
              )}
              {usePts && !ptsOk && <p className="mt-1 text-sm font-semibold text-danger-700">El mínimo es {puntos.minimo_canje} puntos.</p>}
            </div>
          )}
          <Field label="Cupón">{(p) => <Input {...p} value={coupon} onChange={(e) => setCoupon(e.target.value.toUpperCase())} placeholder="Opcional" />}</Field>
          <div>
            <p className="mb-1 text-sm font-semibold">Forma de pago</p>
            <div className="grid grid-cols-2 gap-2">
              {METHODS.map((m) => <button key={m.value} type="button" onClick={() => setMethod(m.value)} disabled={m.value === 'cuenta' && !member}
                className={`min-h-[44px] rounded-md border px-2 text-sm font-semibold disabled:opacity-40 ${method === m.value ? 'border-primary bg-primary-soft text-primary' : 'border-border'}`}>{m.label}</button>)}
            </div>
          </div>
          {method === 'efectivo' && <Field label="Recibido (para calcular cambio)">{(p) => <Input {...p} type="number" min={0} value={cash} onChange={(e) => setCash(e.target.value)} />}</Field>}
          <div className="flex items-baseline justify-between border-t border-border pt-3">
            <span className="text-base font-semibold">{ptsDisc > 0 ? 'A pagar' : 'Total'}{coupon ? ' (antes de cupón)' : ''}</span>
            <span className="text-2xl font-bold ob-num">{money(toPay)}</span>
          </div>
          {method === 'efectivo' && Number(cash) > toPay && !coupon && <p className="text-right text-base">Cambio: <span className="font-bold ob-num">{money(Number(cash) - toPay)}</span></p>}
          <Button className="w-full" size="lg" disabled={lines.length === 0 || (method === 'cuenta' && !member) || !ptsOk} loading={busy} onClick={cobrar}>
            {toPay <= 0 && ptsDisc > 0 ? 'Pagar con puntos' : method === 'cuenta' ? 'Cargar a la cuenta' : 'Cobrar'}
          </Button>
        </div>
      </Card>

      <Modal open={!!done} onClose={() => setDone(null)} title={`Venta registrada · ticket ${done?.folio ?? ''}`}
        footer={<Button onClick={() => setDone(null)}>Nueva venta</Button>}>
        <p className="text-base">Total cobrado: <span className="text-xl font-bold ob-num">{money(done?.total)}</span></p>
        {done && done.points > 0 && <p className="mt-2 text-base">Se usaron <strong className="ob-num">{pts(done.points)}</strong>.</p>}
        {done && done.change > 0 && <p className="mt-2 text-base">Cambio a entregar: <span className="text-xl font-bold ob-num">{money(done.change)}</span></p>}
      </Modal>
    </div>
  );
}

function VentasDia() {
  const { isManager } = useAuth();
  const [day, setDay] = useState(todayMx());
  const [cancel, setCancel] = useState<Sale | null>(null);
  const [reason, setReason] = useState('');
  const { busy, run } = useAction();
  const { data, error, reload } = useAsync(async () => {
    const from = new Date(`${day}T00:00:00-06:00`).toISOString();
    const to = new Date(new Date(`${day}T00:00:00-06:00`).getTime() + 86400000).toISOString();
    return (await must(supabase.from('sales').select('id, folio, total, discount, points_used, points_discount, method, status, created_at, cancel_reason, families(name, number), sale_items(name, qty, total)')
      .gte('created_at', from).lt('created_at', to).order('folio', { ascending: false }))) as unknown as Sale[];
  }, [day]);
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return <Loading />;
  const valid = data.filter((s) => s.status !== 'cancelada');
  const by = (m: string) => valid.filter((s) => s.method === m).reduce((a, s) => a + Number(s.total), 0);
  const total = valid.reduce((a, s) => a + Number(s.total), 0);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="text-sm font-semibold">Día<Input className="mt-1" type="date" value={day} max={todayMx()} onChange={(e) => setDay(e.target.value || todayMx())} disabled={!isManager} /></label>
        <Button variant="secondary" className="ml-auto" disabled={data.length === 0} onClick={() => downloadCsv(`ventas-${day}`, data.map((s) => ({ Ticket: s.folio, Hora: timeOnly(s.created_at), Familia: s.families?.name ?? '', Productos: s.sale_items.map((i) => `${i.name} x${i.qty}`).join('; '), Descuento: s.discount, Puntos: s.points_used, PagadoConPuntos: s.points_discount, Total: s.total, Forma: methodLabel(s.method), Estado: s.status })))}>Descargar</Button>
      </div>
      <div className="ob-stats mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard label="Total vendido" value={money(total)} hint={`${valid.length} tickets`} />
        <StatCard label="Efectivo en caja" value={money(by('efectivo'))} />
        <StatCard label="Tarjeta" value={money(by('tarjeta') + by('terminal'))} />
        <StatCard label="Transferencia" value={money(by('transferencia'))} />
        <StatCard label="A cuenta de familias" value={money(by('cuenta'))} hint={valid.some((s) => s.points_used > 0) ? `Con puntos: ${money(valid.reduce((a, s) => a + Number(s.points_discount), 0))}` : undefined} />
      </div>
      <Table rows={data} rowKey={(s) => s.id} empty="Sin ventas este día." columns={[
        { key: 'f', header: 'Ticket', cell: (s) => <div><p className="font-semibold ob-num">#{s.folio}</p><p className="text-sm text-fg-muted">{timeOnly(s.created_at)}</p></div> },
        { key: 'p', header: 'Productos', cell: (s) => <div className="text-sm"><p>{s.sale_items.map((i) => `${i.name} ×${i.qty}`).join(', ')}</p>{s.families && <p className="text-fg-muted">{s.families.name} #{s.families.number}</p>}</div> },
        { key: 'm', header: 'Pago', hideOnMobile: true, cell: (s) => methodLabel(s.method) },
        { key: 't', header: 'Total', align: 'right', cell: (s) => <div><span className={`font-semibold ob-num ${s.status === 'cancelada' ? 'line-through text-fg-muted' : ''}`}>{money(s.total)}</span>{s.points_used > 0 && <p className="text-xs text-fg-muted">{s.points_used} pts (−{money(s.points_discount)})</p>}</div> },
        { key: 's', header: '', align: 'right', cell: (s) => s.status === 'cancelada' ? <Badge tone="danger">Cancelada</Badge> : <Button size="sm" variant="ghost" onClick={() => { setCancel(s); setReason(''); }}>Cancelar</Button> },
      ]} />
      <Modal open={!!cancel} onClose={() => setCancel(null)} title={`Cancelar ticket #${cancel?.folio ?? ''}`}
        footer={<ConfirmFooter danger onCancel={() => setCancel(null)} confirmLabel="Cancelar venta" loading={busy} onConfirm={async () => {
          if (!reason.trim()) return;
          const ok = await run(() => must(supabase.rpc('cancelar_venta', { p_sale: cancel!.id, p_reason: reason.trim() })), 'Venta cancelada. El inventario se regresó.');
          if (ok) { setCancel(null); reload(); }
        }} />}>
        <p className="mb-3 text-base">Se regresa el inventario, los puntos que se hayan usado y, si fue a la cuenta, se cancela el cargo de la familia.</p>
        <Field label="Motivo" required>{(p) => <Input {...p} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej. Se cobró dos veces" />}</Field>
      </Modal>
    </>
  );
}
