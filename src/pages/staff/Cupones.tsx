import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, UserPlus } from 'lucide-react';
import { Badge, Button, Card, CardHeader, ConfirmFooter, Field, Input, Modal, PageHeader, Select, StatCard, Switch, Table, Tabs, Textarea } from '@/design-system';
import { useAuth } from '@/lib/auth';
import { useAction, useAsync } from '@/lib/hooks';
import { supabase, must } from '@/lib/supabase';
import { dateShort, money, todayMx } from '@/lib/format';
import { ErrorBox, Loading } from '@/components/common';
import { FamilyPicker, type PickedFamily } from '@/components/FamilyPicker';

interface Coupon {
  id: string; code: string; description: string; kind: 'porcentaje' | 'monto'; value: number; applies_to: string;
  starts_on: string | null; ends_on: string | null; max_uses: number | null; uses: number; once_per_family: boolean;
  family_id: string | null; active: boolean; created_at: string; families: { name: string; number: number } | null;
}
interface Redemption { id: string; amount: number; created_at: string; coupons: { code: string } | null; families: { name: string; number: number } | null; sale_id: string | null }
interface Referral { id: string; status: string; created_at: string; rewarded_at: string | null; referrer: { id: string; name: string; number: number } | null; referred: { id: string; name: string; number: number } | null; reward: { code: string; uses: number } | null }

export const APLICA: Record<string, string> = { todo: 'Todo', mensualidad: 'Mensualidades', inscripcion: 'Inscripciones', tienda: 'Barra y tienda', privadas: 'Clases privadas', casilleros: 'Casilleros' };
const valueLabel = (c: Pick<Coupon, 'kind' | 'value'>) => (c.kind === 'porcentaje' ? `${Number(c.value)}%` : money(c.value));

function couponState(c: Coupon) {
  const t = todayMx();
  if (!c.active) return <Badge tone="neutral">Pausado</Badge>;
  if (c.ends_on && c.ends_on < t) return <Badge tone="neutral">Vencido</Badge>;
  if (c.max_uses != null && c.uses >= c.max_uses) return <Badge tone="neutral">Agotado</Badge>;
  if (c.starts_on && c.starts_on > t) return <Badge tone="info">Programado</Badge>;
  return <Badge tone="success">Activo</Badge>;
}

/** Promociones con código, su uso, y el programa de recomendación entre familias. */
export default function Cupones() {
  const { isManager } = useAuth();
  const [tab, setTab] = useState('cupones');
  return (
    <>
      <PageHeader title="Promociones y referidos" description="Cupones de descuento para mensualidades, inscripciones, tienda y más. Las familias que recomiendan ganan un cupón cuando la familia nueva paga por primera vez." />
      <Tabs className="mb-4" value={tab} onChange={setTab} items={[{ id: 'cupones', label: 'Cupones' }, { id: 'referidos', label: 'Recomendaciones' }, { id: 'canjes', label: 'Historial de uso' }]} />
      {tab === 'cupones' && <CuponesTab canEdit={isManager} />}
      {tab === 'referidos' && <Referidos />}
      {tab === 'canjes' && <Canjes />}
    </>
  );
}

function CuponesTab({ canEdit }: { canEdit: boolean }) {
  const [edit, setEdit] = useState<Partial<Coupon> | null>(null);
  const { busy, run } = useAction();
  const { data, error, reload } = useAsync(async () => (await must(supabase.from('coupons').select('*, families(name, number)').order('created_at', { ascending: false }))) as Coupon[], []);
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return <Loading />;
  const set = (k: keyof Coupon, v: unknown) => setEdit((x) => ({ ...x, [k]: v }));
  async function save() {
    const c = edit!;
    const code = (c.code ?? '').toUpperCase().trim().replace(/\s+/g, '-');
    if (!/^[A-Z0-9-]{3,30}$/.test(code)) throw new Error('El código debe tener de 3 a 30 letras, números o guiones, sin espacios.');
    const value = Number(c.value);
    if (!(value > 0)) throw new Error('Escribe el valor del descuento.');
    if (c.kind === 'porcentaje' && value > 100) throw new Error('El porcentaje no puede pasar de 100.');
    const payload = { code, description: c.description?.trim() ?? '', kind: c.kind ?? 'porcentaje', value, applies_to: c.applies_to ?? 'todo',
      starts_on: c.starts_on || null, ends_on: c.ends_on || null, max_uses: c.max_uses ? Number(c.max_uses) : null, once_per_family: c.once_per_family ?? true, active: c.active ?? true };
    if (c.id) await must(supabase.from('coupons').update(payload).eq('id', c.id).select()); else await must(supabase.from('coupons').insert(payload).select());
  }
  const active = data.filter((c) => c.active && (!c.ends_on || c.ends_on >= todayMx()) && (c.max_uses == null || c.uses < c.max_uses));
  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatCard label="Cupones vigentes" value={String(active.length)} />
        <StatCard label="Usos totales" value={String(data.reduce((a, c) => a + c.uses, 0))} />
        <StatCard label="De recomendaciones" value={String(data.filter((c) => c.code.startsWith('REF-')).length)} />
      </div>
      {canEdit && <div className="mb-3 flex justify-end"><Button icon={<Plus className="h-5 w-5" />} onClick={() => setEdit({ kind: 'porcentaje', applies_to: 'todo', once_per_family: true, active: true })}>Nuevo cupón</Button></div>}
      <Table rows={data} rowKey={(c) => c.id} onRowClick={canEdit ? setEdit : undefined} empty="Crea tu primer cupón, por ejemplo INSCRIPCION50 para 50% en inscripción." columns={[
        { key: 'c', header: 'Código', cell: (c) => <div><p className="font-mono font-semibold">{c.code}</p><p className="text-sm text-fg-muted">{c.description || '—'}{c.families ? ` · solo ${c.families.name}` : ''}</p></div> },
        { key: 'v', header: 'Descuento', cell: (c) => <div><p className="font-semibold">{valueLabel(c)}</p><p className="text-sm text-fg-muted">{APLICA[c.applies_to]}</p></div> },
        { key: 'f', header: 'Vigencia', hideOnMobile: true, cell: (c) => <span className="text-sm">{c.starts_on || c.ends_on ? `${c.starts_on ? dateShort(c.starts_on) : 'Hoy'} – ${c.ends_on ? dateShort(c.ends_on) : 'sin fin'}` : 'Sin fecha límite'}</span> },
        { key: 'u', header: 'Usos', align: 'right', cell: (c) => <span className="ob-num">{c.uses}{c.max_uses ? ` / ${c.max_uses}` : ''}</span> },
        { key: 's', header: 'Estado', cell: couponState },
      ]} />
      <p className="mt-3 text-sm text-fg-muted">Para usar un cupón: en la caja del punto de venta, o en el expediente de la familia sobre un cargo pendiente (botón “Aplicar cupón”).</p>

      <Modal open={!!edit} onClose={() => setEdit(null)} size="lg" title={edit?.id ? `Editar ${edit.code}` : 'Nuevo cupón'}
        footer={<ConfirmFooter onCancel={() => setEdit(null)} confirmLabel="Guardar" loading={busy} onConfirm={async () => { const ok = await run(async () => { await save(); return true; }, 'Cupón guardado'); if (ok) { setEdit(null); reload(); } }} />}>
        {edit && <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Código" required hint="Lo que la familia dice o escribe">{(p) => <Input {...p} className="font-mono uppercase" value={edit.code ?? ''} onChange={(e) => set('code', e.target.value.toUpperCase())} placeholder="VERANO20" />}</Field>
          <Field label="Aplica a">{(p) => <Select {...p} value={edit.applies_to} onChange={(e) => set('applies_to', e.target.value)}>{Object.entries(APLICA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>}</Field>
          <Field label="Tipo">{(p) => <Select {...p} value={edit.kind} onChange={(e) => set('kind', e.target.value)}><option value="porcentaje">Porcentaje</option><option value="monto">Monto fijo (MXN)</option></Select>}</Field>
          <Field label={edit.kind === 'monto' ? 'Monto (MXN)' : 'Porcentaje'} required>{(p) => <Input {...p} type="number" min={0} max={edit.kind === 'porcentaje' ? 100 : undefined} value={edit.value ?? ''} onChange={(e) => set('value', e.target.value)} />}</Field>
          <Field label="Desde">{(p) => <Input {...p} type="date" value={edit.starts_on ?? ''} onChange={(e) => set('starts_on', e.target.value)} />}</Field>
          <Field label="Hasta">{(p) => <Input {...p} type="date" value={edit.ends_on ?? ''} onChange={(e) => set('ends_on', e.target.value)} />}</Field>
          <Field label="Máximo de usos" hint="Vacío = sin límite">{(p) => <Input {...p} type="number" min={1} value={edit.max_uses ?? ''} onChange={(e) => set('max_uses', e.target.value)} />}</Field>
          <Field label="Descripción" className="sm:col-span-2">{(p) => <Textarea {...p} rows={2} value={edit.description ?? ''} onChange={(e) => set('description', e.target.value)} placeholder="Ej. Promoción de regreso a clases" />}</Field>
          <div className="sm:col-span-2 grid gap-3">
            <Switch checked={edit.once_per_family ?? true} onChange={(v) => set('once_per_family', v)} label="Una sola vez por familia" />
            <Switch checked={edit.active ?? true} onChange={(v) => set('active', v)} label="Cupón activo" />
          </div>
        </div>}
      </Modal>
    </>
  );
}

function Referidos() {
  const [open, setOpen] = useState(false);
  const [a, setA] = useState<PickedFamily | null>(null);
  const [b, setB] = useState<PickedFamily | null>(null);
  const { busy, run } = useAction();
  const { data, error, reload } = useAsync(async () => {
    const [refs, cfg] = await Promise.all([
      must(supabase.from('referrals').select('id, status, created_at, rewarded_at, referrer:families!referrals_referrer_family_id_fkey(id, name, number), referred:families!referrals_referred_family_id_fkey(id, name, number), reward:coupons(code, uses)').order('created_at', { ascending: false })),
      must(supabase.from('settings').select('value').eq('key', 'referidos').maybeSingle()),
    ]);
    return { refs: refs as unknown as Referral[], cfg: (cfg as { value: { tipo: string; valor: number; aplica: string; vigencia_dias: number } } | null)?.value };
  }, []);
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return <Loading />;
  const reward = data.cfg ? `${data.cfg.tipo === 'porcentaje' ? `${data.cfg.valor}%` : money(data.cfg.valor)} en ${APLICA[data.cfg.aplica]?.toLowerCase() ?? data.cfg.aplica}, válido ${data.cfg.vigencia_dias} días` : '';
  return (
    <>
      <Card className="mb-4">
        <CardHeader title="Cómo funciona" description={`Registra qué familia recomendó a una familia nueva. Cuando la familia nueva hace su primer pago, la que recomendó recibe un cupón automático: ${reward}. Lo puedes cambiar en Configuración.`}
          actions={<Button icon={<UserPlus className="h-5 w-5" />} onClick={() => { setOpen(true); setA(null); setB(null); }}>Registrar recomendación</Button>} />
      </Card>
      <Table rows={data.refs} rowKey={(r) => r.id} empty="Aún no hay recomendaciones registradas." columns={[
        { key: 'a', header: 'Recomendó', cell: (r) => r.referrer ? <Link className="font-semibold text-primary" to={`/familias/${r.referrer.id}`}>{r.referrer.name} #{r.referrer.number}</Link> : '—' },
        { key: 'b', header: 'Familia nueva', cell: (r) => r.referred ? <Link className="text-primary" to={`/familias/${r.referred.id}`}>{r.referred.name} #{r.referred.number}</Link> : '—' },
        { key: 'd', header: 'Fecha', hideOnMobile: true, cell: (r) => dateShort(r.created_at) },
        { key: 's', header: 'Recompensa', cell: (r) => r.status === 'recompensado' ? <span><Badge tone="success">Cupón {r.reward?.code}</Badge>{r.reward && r.reward.uses > 0 && <span className="ml-1 text-sm text-fg-muted">usado</span>}</span> : r.status === 'cancelado' ? <Badge tone="neutral">Cancelada</Badge> : <Badge tone="warning">Esperando primer pago</Badge> },
      ]} />
      <Modal open={open} onClose={() => setOpen(false)} title="Registrar recomendación"
        footer={<ConfirmFooter onCancel={() => setOpen(false)} confirmLabel="Registrar" loading={busy} onConfirm={async () => {
          if (!a || !b) return;
          const ok = await run(() => must(supabase.rpc('registrar_referido', { p_referrer: a.id, p_referred: b.id })), 'Recomendación registrada');
          if (ok) { setOpen(false); reload(); }
        }} />}>
        <div className="grid gap-4">
          <div><p className="mb-1 text-sm font-semibold">Familia que recomendó</p><FamilyPicker value={a} onChange={setA} /></div>
          <div><p className="mb-1 text-sm font-semibold">Familia nueva</p><FamilyPicker value={b} onChange={setB} /></div>
          <p className="text-sm text-fg-muted">Regístrala antes del primer pago de la familia nueva.</p>
        </div>
      </Modal>
    </>
  );
}

function Canjes() {
  const { data, error, reload } = useAsync(async () => (await must(supabase.from('coupon_redemptions').select('id, amount, created_at, sale_id, coupons(code), families(name, number)').order('created_at', { ascending: false }).limit(200))) as unknown as Redemption[], []);
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return <Loading />;
  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3"><StatCard label="Descuentos otorgados" value={money(data.reduce((a, r) => a + Number(r.amount), 0))} hint={`${data.length} usos`} /></div>
      <Table rows={data} rowKey={(r) => r.id} empty="Aún no se ha usado ningún cupón." columns={[
        { key: 'd', header: 'Fecha', cell: (r) => dateShort(r.created_at) },
        { key: 'c', header: 'Cupón', cell: (r) => <span className="font-mono font-semibold">{r.coupons?.code ?? '—'}</span> },
        { key: 'f', header: 'Familia', cell: (r) => r.families ? `${r.families.name} #${r.families.number}` : 'Venta de mostrador' },
        { key: 'w', header: 'Dónde', hideOnMobile: true, cell: (r) => r.sale_id ? 'Punto de venta' : 'Cargo' },
        { key: 'a', header: 'Descuento', align: 'right', cell: (r) => <span className="font-semibold ob-num">{money(r.amount)}</span> },
      ]} />
    </>
  );
}
