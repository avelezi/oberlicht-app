import { useState } from 'react';
import { Banknote, Check, Plus, Repeat } from 'lucide-react';
import { Alert, Badge, Button, Card, CardHeader, ConfirmFooter, EmptyState, Field, Input, Modal, PageHeader, Select, StatCard, Table, Tabs, Textarea } from '@/design-system';
import { useAction, useAsync } from '@/lib/hooks';
import { supabase, must } from '@/lib/supabase';
import { dateShort, downloadCsv, money0, money, todayMx } from '@/lib/format';
import { ErrorBox, Loading } from '@/components/common';
import { GroupedBars, HBars, Legend } from '@/components/charts';

interface Payable {
  id: string; supplier_id: string | null; payee: string | null; category: string; concept: string; amount: number; due_date: string;
  status: 'pendiente' | 'pagada' | 'cancelada'; paid_on: string | null; paid_method: string | null; reference: string | null; invoice_number: string | null;
  recurrence: string; department: string | null; notes: string | null; suppliers: { name: string } | null;
}
interface Compra { id: string; total: number; invoice_date: string; invoice_number: string | null; area: string; suppliers: { name: string } | null }
interface Semana { semana: string; entra: number; mensualidades_estimadas: number; sale: number; saldo: number }
interface Resumen {
  saldo_inicial: number | null; fecha_saldo: string | null; saldo_actual: number | null; cobranza_esperada_pct: number;
  meses: { mes: string; cobros: number; ventas: number; egresos: number }[]; categorias_mes: Record<string, number>;
  por_cobrar: number; por_cobrar_vencido: number; por_pagar: number; por_pagar_vencido: number; por_pagar_7dias: number;
  venta_semanal_promedio: number; proyeccion: Semana[];
}

export const CATEGORIAS: Record<string, string> = {
  nomina: 'Nómina', renta: 'Renta', servicios: 'Luz, agua, internet', mantenimiento: 'Mantenimiento', alberca: 'Alberca (gas y químicos)',
  insumos: 'Insumos de barra y tienda', impuestos: 'Impuestos', marketing: 'Publicidad', honorarios: 'Honorarios', financiero: 'Créditos y comisiones', otros: 'Otros',
};
const METODOS: Record<string, string> = { transferencia: 'Transferencia', domiciliacion: 'Domiciliación', efectivo: 'Efectivo', tarjeta: 'Tarjeta', cheque: 'Cheque' };
const REPITE: Record<string, string> = { no: 'Una sola vez', semanal: 'Cada semana', quincenal: 'Cada quincena', mensual: 'Cada mes', bimestral: 'Cada dos meses', anual: 'Cada año' };
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const mesLabel = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`;
const addDays = (d: string, n: number) => new Date(new Date(`${d}T12:00:00`).getTime() + n * 864e5).toISOString().slice(0, 10);
const k = (n: number) => (Math.abs(n) >= 1000 ? `${Math.round(n / 1000)}k` : String(Math.round(n)));

/** Flujo de caja: lo que entra (cobros y barra/tienda) contra lo que sale (cuentas por pagar y compras), y la proyección de 8 semanas. */
export default function Flujo() {
  const [tab, setTab] = useState('pagar');
  const [edit, setEdit] = useState<Partial<Payable> | null>(null);
  const [pay, setPay] = useState<Payable | null>(null);
  const [saldo, setSaldo] = useState(false);
  const { busy, run } = useAction();
  const { data, error, reload } = useAsync(async () => {
    const [res, pend, pagadas, compras] = await Promise.all([
      must(supabase.rpc('flujo_resumen', { p_meses: 6 })),
      must(supabase.from('payables').select('*, suppliers(name)').eq('status', 'pendiente').order('due_date')),
      must(supabase.from('payables').select('*, suppliers(name)').eq('status', 'pagada').gte('paid_on', addDays(todayMx(), -120)).order('paid_on', { ascending: false })),
      must(supabase.from('purchases').select('id, total, invoice_date, invoice_number, area, suppliers(name)').eq('status', 'por_pagar').order('invoice_date')),
    ]);
    return { res: res as Resumen, pend: pend as Payable[], pagadas: pagadas as Payable[], compras: compras as unknown as Compra[] };
  }, []);
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return <Loading />;
  const { res: r, pend, pagadas, compras } = data;
  const hoy = todayMx();
  const mes = r.meses[r.meses.length - 1];
  const vencidas = pend.filter((p) => p.due_date < hoy);
  const negativa = r.proyeccion.find((s) => s.saldo < 0);
  const cats = Object.entries(r.categorias_mes).sort((a, b) => b[1] - a[1]);

  return (
    <>
      <PageHeader title="Flujo de caja y cuentas por pagar" description="Lo que entra (pagos de familias y barra/tienda) contra lo que sale (proveedores, nómina, servicios y compras de mantenimiento). Solo lo ven Dirección y Administración."
        actions={<>
          <Button variant="secondary" icon={<Banknote className="h-5 w-5" />} onClick={() => setSaldo(true)}>Saldo en bancos</Button>
          <Button icon={<Plus className="h-5 w-5" />} onClick={() => setEdit({ category: 'servicios', recurrence: 'no', due_date: hoy, status: 'pendiente' })}>Nueva cuenta por pagar</Button>
        </>} />

      <div className="mb-4 grid gap-3">
        {r.saldo_actual == null && <Alert tone="info" title="Captura tu saldo en bancos" action={<Button size="sm" variant="secondary" onClick={() => setSaldo(true)}>Capturar</Button>}>
          Con el saldo a una fecha, la app calcula cuánto debería haber hoy y cómo se verá en las próximas semanas.</Alert>}
        {vencidas.length > 0 && <Alert tone="danger" title={`${vencidas.length} ${vencidas.length === 1 ? 'cuenta vencida' : 'cuentas vencidas'} por ${money0(r.por_pagar_vencido)}`}>Revisa la pestaña «Por pagar».</Alert>}
        {negativa && <Alert tone="warning" title={`El saldo podría quedar en negativo la semana del ${dateShort(negativa.semana)}`}>Considera mover pagos o reforzar la cobranza de adeudos vencidos ({money0(r.por_cobrar_vencido)}).</Alert>}
      </div>

      <div className="ob-stats mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Saldo estimado hoy" value={r.saldo_actual != null ? money0(r.saldo_actual) : '—'} hint={r.fecha_saldo ? `Desde ${money0(r.saldo_inicial)} el ${dateShort(r.fecha_saldo)}` : 'Falta el saldo inicial'} />
        <StatCard label="Entró este mes" value={money0(Number(mes?.cobros ?? 0) + Number(mes?.ventas ?? 0))} hint={`Cobros ${money0(mes?.cobros)} · barra y tienda ${money0(mes?.ventas)}`} />
        <StatCard label="Salió este mes" value={money0(mes?.egresos)} />
        <StatCard label="Por pagar" value={money0(r.por_pagar)} hint={`${money0(r.por_pagar_7dias)} en los próximos 7 días`} />
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader title="Entradas y salidas por mes" />
          <GroupedBars height={230} format={(n) => k(n)} series={[{ key: 'entra', label: 'Entró' }, { key: 'sale', label: 'Salió' }]}
            data={r.meses.map((m) => ({ label: mesLabel(m.mes), values: { entra: Number(m.cobros) + Number(m.ventas), sale: Number(m.egresos) } }))} />
          <Legend series={[{ key: 'entra', label: 'Entró' }, { key: 'sale', label: 'Salió' }]} />
          <ul className="mt-3 grid grid-cols-3 gap-2 text-sm sm:grid-cols-6">
            {r.meses.map((m) => { const n = Number(m.cobros) + Number(m.ventas) - Number(m.egresos); return (
              <li key={m.mes}><p className="text-fg-muted">{mesLabel(m.mes)}</p><p className={`font-semibold ob-num ${n < 0 ? 'text-danger-700' : 'text-success-700'}`}>{n < 0 ? '−' : '+'}{money0(Math.abs(n))}</p></li>); })}
          </ul>
        </Card>
        <Card>
          <CardHeader title="En qué se fue este mes" />
          {cats.length === 0 ? <p className="text-base text-fg-muted">Aún no hay pagos registrados este mes.</p>
            : <HBars format={(n) => '$' + k(n)} data={cats.map(([c, v]) => ({ label: CATEGORIAS[c] ?? c, value: Number(v) }))} />}
        </Card>
      </div>

      <Card className="mb-6">
        <CardHeader title="Próximas 8 semanas (estimado)" description={`Entra: cargos que vencen × ${r.cobranza_esperada_pct}% de cobranza esperada, mensualidades que aún no se generan (con el último mes) y ${money0(r.venta_semanal_promedio)} de barra y tienda por semana. Sale: cuentas por pagar (las que se repiten se proyectan) y compras de mantenimiento por pagar.`} />
        <Table rows={r.proyeccion} rowKey={(s) => s.semana} dense columns={[
          { key: 's', header: 'Semana del', cell: (s) => <span className="font-semibold">{dateShort(s.semana)}</span> },
          { key: 'e', header: 'Entra', align: 'right', cell: (s) => <span className="ob-num text-success-700">{money0(s.entra)}{Number(s.mensualidades_estimadas) > 0 && <span className="block text-xs text-fg-muted">incluye mensualidades</span>}</span> },
          { key: 'o', header: 'Sale', align: 'right', cell: (s) => <span className="ob-num text-danger-700">{money0(s.sale)}</span> },
          { key: 'b', header: r.saldo_actual != null ? 'Saldo' : 'Acumulado', align: 'right', cell: (s) => <span className={`font-bold ob-num ${s.saldo < 0 ? 'text-danger-700' : ''}`}>{money0(s.saldo)}</span> },
        ]} />
      </Card>

      <Tabs className="mb-4" value={tab} onChange={setTab} items={[
        { id: 'pagar', label: 'Por pagar', count: pend.length + compras.length }, { id: 'pagadas', label: 'Pagadas (últimos 4 meses)' },
      ]} />
      {tab === 'pagar' && (
        <>
          <Table rows={pend} rowKey={(p) => p.id} onRowClick={setEdit} empty="No hay cuentas pendientes." columns={[
            { key: 'c', header: 'Concepto', cell: (p) => <div><p className="font-semibold">{p.concept}</p><p className="text-sm text-fg-muted">{p.suppliers?.name ?? p.payee ?? '—'} · {CATEGORIAS[p.category]}</p></div> },
            { key: 'd', header: 'Vence', cell: (p) => <div><p className={p.due_date < hoy ? 'font-semibold text-danger-700' : ''}>{dateShort(p.due_date)}</p>
              {p.due_date < hoy ? <Badge tone="danger" size="sm">Vencida</Badge> : p.due_date <= addDays(hoy, 7) ? <Badge tone="warning" size="sm">Esta semana</Badge> : null}</div> },
            { key: 'r', header: 'Se repite', hideOnMobile: true, cell: (p) => p.recurrence === 'no' ? <span className="text-fg-subtle">—</span> : <span className="flex items-center gap-1 text-sm"><Repeat className="h-4 w-4" />{REPITE[p.recurrence]}</span> },
            { key: 'm', header: 'Monto', align: 'right', cell: (p) => <span className="font-semibold ob-num">{money(p.amount)}</span> },
            { key: 'a', header: '', align: 'right', cell: (p) => <Button size="sm" icon={<Check className="h-4 w-4" />} onClick={(e) => { e.stopPropagation(); setPay(p); }}>Pagar</Button> },
          ]} />
          {compras.length > 0 && (
            <Card className="mt-4">
              <CardHeader title="Compras de mantenimiento por pagar" description="Facturas capturadas en Mantenimiento → Compras. Se estiman a 30 días de la factura." />
              <ul className="divide-y divide-border">
                {compras.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                    <span><span className="font-semibold">{c.suppliers?.name ?? 'Proveedor'}</span> <span className="text-sm text-fg-muted">{c.invoice_number ? `Factura ${c.invoice_number} · ` : ''}{dateShort(c.invoice_date)}</span></span>
                    <span className="flex items-center gap-3"><span className="font-semibold ob-num">{money(c.total)}</span>
                      <Button size="sm" variant="secondary" loading={busy} onClick={async () => {
                        const ok = await run(() => must(supabase.from('purchases').update({ status: 'pagada', paid_at: hoy }).eq('id', c.id).select()), 'Compra marcada como pagada');
                        if (ok) reload();
                      }}>Marcar pagada</Button></span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}
      {tab === 'pagadas' && (
        <>
          <div className="mb-3 flex justify-end">
            <Button variant="secondary" disabled={!pagadas.length} onClick={() => downloadCsv('pagos-proveedores', pagadas.map((p) => ({
              Pagado: p.paid_on, Concepto: p.concept, Proveedor: p.suppliers?.name ?? p.payee ?? '', Categoria: CATEGORIAS[p.category], Monto: p.amount,
              Forma: METODOS[p.paid_method ?? ''] ?? '', Referencia: p.reference ?? '', Factura: p.invoice_number ?? '' })))}>Descargar</Button>
          </div>
          <Table rows={pagadas} rowKey={(p) => p.id} onRowClick={setEdit} empty={<EmptyState title="Aún no hay pagos registrados" />} columns={[
            { key: 'f', header: 'Pagado', cell: (p) => dateShort(p.paid_on) },
            { key: 'c', header: 'Concepto', cell: (p) => <div><p className="font-semibold">{p.concept}</p><p className="text-sm text-fg-muted">{p.suppliers?.name ?? p.payee ?? '—'} · {CATEGORIAS[p.category]}</p></div> },
            { key: 'm', header: 'Forma', hideOnMobile: true, cell: (p) => <span className="text-sm">{METODOS[p.paid_method ?? ''] ?? '—'}{p.reference ? ` · ${p.reference}` : ''}</span> },
            { key: 'a', header: 'Monto', align: 'right', cell: (p) => <span className="font-semibold ob-num">{money(p.amount)}</span> },
          ]} />
        </>
      )}

      {edit && <EditPayable value={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
      {pay && <PayModal p={pay} onClose={() => setPay(null)} onSaved={() => { setPay(null); reload(); }} />}
      {saldo && <SaldoModal r={r} onClose={() => setSaldo(false)} onSaved={() => { setSaldo(false); reload(); }} />}
    </>
  );
}

function EditPayable({ value, onClose, onSaved }: { value: Partial<Payable>; onClose: () => void; onSaved: () => void }) {
  const [p, setP] = useState(value);
  const [yaPagada, setYaPagada] = useState(false);
  const { busy, run } = useAction();
  const { data: sups } = useAsync(async () => (await must(supabase.from('suppliers').select('id, name').eq('active', true).order('name'))) as { id: string; name: string }[], []);
  const set = (key: keyof Payable, v: unknown) => setP((x) => ({ ...x, [key]: v }));
  const locked = p.status === 'pagada' || p.status === 'cancelada';
  async function save() {
    if (!p.concept?.trim()) throw new Error('Escribe el concepto.');
    if (!(Number(p.amount) > 0)) throw new Error('Escribe el monto.');
    if (!p.due_date) throw new Error('Elige la fecha de vencimiento.');
    const payload = {
      concept: p.concept.trim(), amount: Number(p.amount), due_date: p.due_date, category: p.category ?? 'otros', supplier_id: p.supplier_id || null,
      payee: p.payee?.trim() || null, recurrence: p.recurrence ?? 'no', invoice_number: p.invoice_number?.trim() || null, notes: p.notes?.trim() || null,
      ...(yaPagada && !p.id ? { status: 'pagada', paid_on: p.due_date, paid_method: p.paid_method ?? 'transferencia' } : {}),
    };
    if (p.id) await must(supabase.from('payables').update(payload).eq('id', p.id).select()); else await must(supabase.from('payables').insert(payload).select());
  }
  return (
    <Modal open onClose={onClose} title={p.id ? (locked ? 'Cuenta pagada' : 'Editar cuenta por pagar') : 'Nueva cuenta por pagar'} size="lg"
      footer={<div className="flex flex-wrap justify-between gap-2">
        {p.id && p.status === 'pendiente' ? <Button variant="ghost" loading={busy} onClick={async () => {
          const ok = await run(() => must(supabase.from('payables').update({ status: 'cancelada' }).eq('id', p.id!).select()), 'Cuenta cancelada');
          if (ok) onSaved();
        }}>Cancelar esta cuenta</Button> : <span />}
        <ConfirmFooter onCancel={onClose} confirmLabel="Guardar" loading={busy} onConfirm={async () => { if (await run(async () => { await save(); return true; }, 'Guardado')) onSaved(); }} />
      </div>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Concepto" required className="sm:col-span-2">{(f) => <Input {...f} value={p.concept ?? ''} onChange={(e) => set('concept', e.target.value)} placeholder="Ej. Luz de noviembre" />}</Field>
        <Field label="Monto" required>{(f) => <Input {...f} type="number" min={0} step="0.01" value={p.amount ?? ''} onChange={(e) => set('amount', e.target.value)} />}</Field>
        <Field label={yaPagada ? 'Fecha de pago' : 'Vence'} required>{(f) => <Input {...f} type="date" value={p.due_date ?? ''} onChange={(e) => set('due_date', e.target.value)} />}</Field>
        <Field label="Categoría">{(f) => <Select {...f} value={p.category ?? 'otros'} onChange={(e) => set('category', e.target.value)}>{Object.entries(CATEGORIAS).map(([c, l]) => <option key={c} value={c}>{l}</option>)}</Select>}</Field>
        <Field label="Se repite">{(f) => <Select {...f} value={p.recurrence ?? 'no'} onChange={(e) => set('recurrence', e.target.value)}>{Object.entries(REPITE).map(([c, l]) => <option key={c} value={c}>{l}</option>)}</Select>}</Field>
        <Field label="Proveedor registrado" hint="De Mantenimiento → Proveedores">{(f) => <Select {...f} value={p.supplier_id ?? ''} onChange={(e) => set('supplier_id', e.target.value)}>
          <option value="">— Ninguno —</option>{(sups ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>}</Field>
        <Field label="O a quién se paga">{(f) => <Input {...f} value={p.payee ?? ''} onChange={(e) => set('payee', e.target.value)} placeholder="Ej. CFE, Nómina" />}</Field>
        <Field label="Factura (opcional)">{(f) => <Input {...f} value={p.invoice_number ?? ''} onChange={(e) => set('invoice_number', e.target.value)} />}</Field>
        <Field label="Notas">{(f) => <Textarea {...f} rows={1} value={p.notes ?? ''} onChange={(e) => set('notes', e.target.value)} />}</Field>
        {!p.id && (
          <label className="flex items-center gap-2 text-base sm:col-span-2">
            <input type="checkbox" className="h-5 w-5" checked={yaPagada} onChange={(e) => setYaPagada(e.target.checked)} /> Ya está pagada (solo registrar el gasto)
          </label>
        )}
        {locked && <p className="text-sm text-fg-muted sm:col-span-2">{p.status === 'pagada' ? `Pagada el ${dateShort(p.paid_on)}${p.paid_method ? ` por ${METODOS[p.paid_method]}` : ''}.` : 'Cancelada.'}</p>}
      </div>
    </Modal>
  );
}

function PayModal({ p, onClose, onSaved }: { p: Payable; onClose: () => void; onSaved: () => void }) {
  const [fecha, setFecha] = useState(todayMx());
  const [metodo, setMetodo] = useState('transferencia');
  const [ref, setRef] = useState('');
  const { busy, run } = useAction();
  return (
    <Modal open onClose={onClose} title={`Pagar · ${p.concept}`}
      footer={<ConfirmFooter onCancel={onClose} confirmLabel={`Registrar pago de ${money0(p.amount)}`} loading={busy} onConfirm={async () => {
        const ok = await run(() => must(supabase.rpc('pagar_cuenta', { p_id: p.id, p_fecha: fecha, p_metodo: metodo, p_referencia: ref || null })),
          p.recurrence !== 'no' ? 'Pago registrado. Ya quedó lista la siguiente.' : 'Pago registrado');
        if (ok) onSaved();
      }} />}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Fecha de pago">{(f) => <Input {...f} type="date" max={todayMx()} value={fecha} onChange={(e) => setFecha(e.target.value)} />}</Field>
        <Field label="Forma de pago">{(f) => <Select {...f} value={metodo} onChange={(e) => setMetodo(e.target.value)}>{Object.entries(METODOS).map(([c, l]) => <option key={c} value={c}>{l}</option>)}</Select>}</Field>
        <Field label="Referencia o folio (opcional)" className="sm:col-span-2">{(f) => <Input {...f} value={ref} onChange={(e) => setRef(e.target.value)} />}</Field>
      </div>
      {p.recurrence !== 'no' && <p className="mt-3 text-sm text-fg-muted">Esta cuenta se repite {REPITE[p.recurrence].toLowerCase()}; al pagarla se crea la siguiente.</p>}
    </Modal>
  );
}

function SaldoModal({ r, onClose, onSaved }: { r: Resumen; onClose: () => void; onSaved: () => void }) {
  const [monto, setMonto] = useState(r.saldo_inicial != null ? String(r.saldo_inicial) : '');
  const [fecha, setFecha] = useState(r.fecha_saldo ?? todayMx());
  const [pct, setPct] = useState(String(r.cobranza_esperada_pct ?? 85));
  const { busy, run } = useAction();
  return (
    <Modal open onClose={onClose} title="Saldo en bancos"
      footer={<ConfirmFooter onCancel={onClose} confirmLabel="Guardar" loading={busy} onConfirm={async () => {
        if (monto === '' || !fecha) return;
        const ok = await run(() => must(supabase.rpc('fijar_saldo_flujo', { p_saldo: Number(monto), p_fecha: fecha, p_pct: pct === '' ? null : Number(pct) })), 'Saldo guardado');
        if (ok) onSaved();
      }} />}>
      <p className="mb-3 text-base">Escribe cuánto había en bancos y caja al cierre de un día. A partir de ahí se suman los cobros y se restan los pagos registrados.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Saldo" required>{(f) => <Input {...f} type="number" step="0.01" value={monto} onChange={(e) => setMonto(e.target.value)} />}</Field>
        <Field label="Al cierre del día" required>{(f) => <Input {...f} type="date" max={todayMx()} value={fecha} onChange={(e) => setFecha(e.target.value)} />}</Field>
        <Field label="% de cobranza esperada" hint="Qué parte de lo que vence se suele cobrar a tiempo" className="sm:col-span-2">{(f) => <Input {...f} type="number" min={0} max={100} value={pct} onChange={(e) => setPct(e.target.value)} />}</Field>
      </div>
    </Modal>
  );
}
