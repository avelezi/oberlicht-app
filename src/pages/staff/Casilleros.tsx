import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Button, ConfirmFooter, Field, Input, Modal, PageHeader, Segmented, Select, StatCard, Textarea } from '@/design-system';
import { useAuth } from '@/lib/auth';
import { useAction, useAsync } from '@/lib/hooks';
import { supabase, must } from '@/lib/supabase';
import { dateShort, fullName, money, todayMx } from '@/lib/format';
import { ErrorBox, Loading } from '@/components/common';
import { FamilyPicker, type PickedFamily } from '@/components/FamilyPicker';

interface Locker { id: string; code: string; zone: string; size: 'chico' | 'mediano' | 'grande'; monthly_price: number; status: 'disponible' | 'ocupado' | 'mantenimiento'; notes: string | null }
interface Rental {
  id: string; locker_id: string; family_id: string; member_id: string | null; starts_on: string; ends_on: string; monthly_price: number; status: string;
  families: { name: string; number: number } | null; members: { first_name: string; last_name: string | null } | null;
}
const SIZE = { chico: 'Chico', mediano: 'Mediano', grande: 'Grande' };
const daysTo = (d: string) => Math.round((new Date(`${d}T12:00:00`).getTime() - new Date(`${todayMx()}T12:00:00`).getTime()) / 86400000);

/** Casilleros: mapa por zona, renta con cargo automático, renovaciones y vencimientos. */
export default function Casilleros() {
  const { isManager } = useAuth();
  const [zone, setZone] = useState('');
  const [view, setView] = useState<'todos' | 'disponible' | 'vencen'>('todos');
  const [sel, setSel] = useState<Locker | null>(null);
  const [edit, setEdit] = useState<Partial<Locker> | null>(null);
  const [bulk, setBulk] = useState<{ prefix: string; from: string; to: string; zone: string; size: Locker['size']; price: string } | null>(null);
  const { busy, run } = useAction();
  const { data, error, reload } = useAsync(async () => {
    const [l, r, cfg] = await Promise.all([
      must(supabase.from('lockers').select('*').order('zone').order('code')),
      must(supabase.from('locker_rentals').select('*, families(name, number), members(first_name, last_name)').eq('status', 'activa')),
      must(supabase.from('settings').select('value').eq('key', 'recordatorios').maybeSingle()),
    ]);
    return { lockers: l as Locker[], rentals: r as unknown as Rental[], warn: Number((cfg as { value: { dias_aviso_casillero?: number } } | null)?.value?.dias_aviso_casillero ?? 5) };
  }, []);
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return <Loading />;

  const rentalOf = (l: Locker) => data.rentals.find((r) => r.locker_id === l.id);
  const zones = [...new Set(data.lockers.map((l) => l.zone))];
  const expiring = data.rentals.filter((r) => daysTo(r.ends_on) <= data.warn);
  const shown = data.lockers.filter((l) => (!zone || l.zone === zone) && (view === 'todos' || (view === 'disponible' ? l.status === 'disponible' : expiring.some((r) => r.locker_id === l.id))));
  const occ = data.lockers.filter((l) => l.status === 'ocupado').length;
  const income = data.rentals.reduce((a, r) => a + Number(r.monthly_price), 0);

  async function saveLocker() {
    const l = edit!;
    if (!l.code?.trim()) throw new Error('Escribe el número o código del casillero.');
    const payload = { code: l.code.trim().toUpperCase(), zone: l.zone?.trim() || 'General', size: l.size ?? 'chico', monthly_price: Number(l.monthly_price) || 0, notes: l.notes || null,
      ...(l.status && l.status !== 'ocupado' ? { status: l.status } : {}) };
    if (l.id) await must(supabase.from('lockers').update(payload).eq('id', l.id).select()); else await must(supabase.from('lockers').insert(payload).select());
  }
  async function saveBulk() {
    const b = bulk!;
    const a = Number(b.from), z = Number(b.to);
    if (!(a > 0) || !(z >= a) || z - a > 300) throw new Error('Revisa el rango de números (máximo 300 a la vez).');
    const width = String(z).length;
    const rows = Array.from({ length: z - a + 1 }, (_, i) => ({ code: `${b.prefix.trim().toUpperCase()}${String(a + i).padStart(width, '0')}`, zone: b.zone.trim() || 'General', size: b.size, monthly_price: Number(b.price) || 0 }));
    await must(supabase.from('lockers').upsert(rows, { onConflict: 'code', ignoreDuplicates: true }).select());
  }

  return (
    <>
      <PageHeader title="Casilleros" description="Toca un casillero para rentarlo, renovarlo o liberarlo. La renta genera el cargo a la familia."
        actions={isManager ? <div className="flex gap-2"><Button variant="secondary" onClick={() => setBulk({ prefix: '', from: '1', to: '50', zone: zones[0] ?? 'Vestidor', size: 'chico', price: '' })}>Alta por rango</Button><Button icon={<Plus className="h-5 w-5" />} onClick={() => setEdit({ size: 'chico', zone: zone || zones[0] || 'General' })}>Nuevo</Button></div> : undefined} />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Ocupados" value={`${occ} de ${data.lockers.length}`} hint={data.lockers.length ? `${Math.round((100 * occ) / data.lockers.length)}% de ocupación` : undefined} />
        <StatCard label="Disponibles" value={String(data.lockers.filter((l) => l.status === 'disponible').length)} />
        <StatCard label="Vencen pronto" value={String(expiring.length)} hint={`En ${data.warn} días o menos`} />
        <StatCard label="Ingreso mensual" value={money(income)} />
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Segmented value={view} onChange={(v) => setView(v as typeof view)} options={[{ id: 'todos', label: 'Todos' }, { id: 'disponible', label: 'Disponibles' }, { id: 'vencen', label: `Vencen pronto (${expiring.length})` }]} />
        {zones.length > 1 && <Select className="w-48" value={zone} onChange={(e) => setZone(e.target.value)} aria-label="Zona"><option value="">Todas las zonas</option>{zones.map((z) => <option key={z} value={z}>{z}</option>)}</Select>}
        {expiring.length > 0 && <Link to="/recordatorios?tipo=casillero_vence" className="ml-auto text-base font-semibold text-primary">Avisar a quienes vencen →</Link>}
      </div>
      {data.lockers.length === 0 ? <p className="text-base text-fg-muted">{isManager ? 'Da de alta los casilleros con “Alta por rango”, por ejemplo del 1 al 60 en el vestidor de mujeres.' : 'Dirección aún no da de alta los casilleros.'}</p> : (
        zones.filter((z) => !zone || z === zone).map((z) => {
          const ls = shown.filter((l) => l.zone === z);
          if (!ls.length) return null;
          return (
            <section key={z} className="mb-6">
              <h2 className="mb-2 text-lg font-semibold">{z}</h2>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10">
                {ls.map((l) => {
                  const r = rentalOf(l);
                  const d = r ? daysTo(r.ends_on) : null;
                  const tone = l.status === 'mantenimiento' ? 'border-border bg-surface-sunken text-fg-muted' : !r ? 'border-success-100 bg-success-50 text-success-700' : d! < 0 ? 'border-danger-100 bg-danger-50 text-danger-700' : d! <= data.warn ? 'border-warning-100 bg-warning-50 text-warning-700' : 'border-border bg-surface';
                  return (
                    <button key={l.id} type="button" onClick={() => setSel(l)} className={`flex min-h-[72px] flex-col items-start justify-between rounded-md border p-2 text-left ${tone}`}>
                      <span className="text-base font-bold">{l.code}</span>
                      <span className="w-full truncate text-xs">{l.status === 'mantenimiento' ? 'En reparación' : r ? (d! < 0 ? `Venció hace ${-d!} d` : `${d} d · ${r.families?.name ?? ''}`) : 'Libre'}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })
      )}
      <p className="text-sm text-fg-muted">Verde: libre · Amarillo: vence pronto · Rojo: vencido · Gris: en reparación.</p>

      {sel && <LockerModal locker={sel} rental={rentalOf(sel)} canEdit={isManager} onEdit={() => { setEdit(sel); setSel(null); }} onClose={() => setSel(null)} onDone={() => { setSel(null); reload(); }} />}

      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? `Casillero ${edit.code}` : 'Nuevo casillero'}
        footer={<ConfirmFooter onCancel={() => setEdit(null)} confirmLabel="Guardar" loading={busy} onConfirm={async () => { const ok = await run(async () => { await saveLocker(); return true; }, 'Casillero guardado'); if (ok) { setEdit(null); reload(); } }} />}>
        {edit && <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Número o código" required>{(p) => <Input {...p} value={edit.code ?? ''} onChange={(e) => setEdit({ ...edit, code: e.target.value })} />}</Field>
          <Field label="Zona">{(p) => <Input {...p} value={edit.zone ?? ''} onChange={(e) => setEdit({ ...edit, zone: e.target.value })} placeholder="Vestidor mujeres" list="zonas" />}</Field>
          <datalist id="zonas">{zones.map((z) => <option key={z} value={z} />)}</datalist>
          <Field label="Tamaño">{(p) => <Select {...p} value={edit.size} onChange={(e) => setEdit({ ...edit, size: e.target.value as Locker['size'] })}>{Object.entries(SIZE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>}</Field>
          <Field label="Renta mensual (MXN)">{(p) => <Input {...p} type="number" min={0} value={edit.monthly_price ?? ''} onChange={(e) => setEdit({ ...edit, monthly_price: e.target.value as unknown as number })} />}</Field>
          {edit.id && edit.status !== 'ocupado' && <Field label="Estado">{(p) => <Select {...p} value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value as Locker['status'] })}><option value="disponible">Disponible</option><option value="mantenimiento">En reparación</option></Select>}</Field>}
          <Field label="Notas" className="sm:col-span-2">{(p) => <Textarea {...p} rows={2} value={edit.notes ?? ''} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} />}</Field>
        </div>}
      </Modal>

      <Modal open={!!bulk} onClose={() => setBulk(null)} title="Alta de casilleros por rango"
        footer={<ConfirmFooter onCancel={() => setBulk(null)} confirmLabel="Crear" loading={busy} onConfirm={async () => { const ok = await run(async () => { await saveBulk(); return true; }, 'Casilleros creados'); if (ok) { setBulk(null); reload(); } }} />}>
        {bulk && <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Prefijo" hint="Opcional, p. ej. M- o H-">{(p) => <Input {...p} value={bulk.prefix} onChange={(e) => setBulk({ ...bulk, prefix: e.target.value })} />}</Field>
          <Field label="Zona">{(p) => <Input {...p} value={bulk.zone} onChange={(e) => setBulk({ ...bulk, zone: e.target.value })} />}</Field>
          <Field label="Del número">{(p) => <Input {...p} type="number" min={1} value={bulk.from} onChange={(e) => setBulk({ ...bulk, from: e.target.value })} />}</Field>
          <Field label="Al número">{(p) => <Input {...p} type="number" min={1} value={bulk.to} onChange={(e) => setBulk({ ...bulk, to: e.target.value })} />}</Field>
          <Field label="Tamaño">{(p) => <Select {...p} value={bulk.size} onChange={(e) => setBulk({ ...bulk, size: e.target.value as Locker['size'] })}>{Object.entries(SIZE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>}</Field>
          <Field label="Renta mensual (MXN)">{(p) => <Input {...p} type="number" min={0} value={bulk.price} onChange={(e) => setBulk({ ...bulk, price: e.target.value })} />}</Field>
          <p className="sm:col-span-2 text-sm text-fg-muted">Los códigos que ya existan no se duplican.</p>
        </div>}
      </Modal>
    </>
  );
}

function LockerModal({ locker, rental, canEdit, onEdit, onClose, onDone }: { locker: Locker; rental?: Rental; canEdit: boolean; onEdit: () => void; onClose: () => void; onDone: () => void }) {
  const [fam, setFam] = useState<PickedFamily | null>(null);
  const [member, setMember] = useState('');
  const [months, setMonths] = useState('1');
  const [confirmFree, setConfirmFree] = useState(false);
  const { busy, run } = useAction();
  const { data: members } = useAsync(async () => fam ? (await must(supabase.from('members').select('id, first_name, last_name').eq('family_id', fam.id).eq('active', true))) as { id: string; first_name: string; last_name: string | null }[] : [], [fam?.id]);
  const n = Number(months);
  const title = `Casillero ${locker.code} · ${locker.zone}`;

  if (rental) {
    const d = daysTo(rental.ends_on);
    return (
      <Modal open onClose={onClose} title={title} footer={<div className="flex w-full flex-wrap justify-between gap-2">
        {confirmFree ? <Button variant="danger" loading={busy} onClick={async () => { const ok = await run(() => must(supabase.rpc('liberar_casillero', { p_rental: rental.id })), 'Casillero liberado'); if (ok) onDone(); }}>Sí, liberar</Button>
          : <Button variant="ghost" onClick={() => setConfirmFree(true)}>Liberar casillero</Button>}
        <Button loading={busy} onClick={async () => { const ok = await run(() => must(supabase.rpc('renovar_casillero', { p_rental: rental.id, p_months: n })), 'Renovado. El cargo quedó en la cuenta.'); if (ok) onDone(); }}>Renovar {n} {n === 1 ? 'mes' : 'meses'} · {money(Number(rental.monthly_price) * n)}</Button>
      </div>}>
        <div className="grid gap-3 text-base">
          <p><span className="text-fg-muted">Familia:</span> <Link className="font-semibold text-primary" to={`/familias/${rental.family_id}`}>{rental.families?.name} #{rental.families?.number}</Link></p>
          {rental.members && <p><span className="text-fg-muted">Socio:</span> {fullName(rental.members)}</p>}
          <p><span className="text-fg-muted">Desde</span> {dateShort(rental.starts_on)} <span className="text-fg-muted">hasta</span> <span className={`font-semibold ${d < 0 ? 'text-danger-700' : d <= 5 ? 'text-warning-700' : ''}`}>{dateShort(rental.ends_on)}</span> {d < 0 ? `(venció hace ${-d} días)` : `(faltan ${d} días)`}</p>
          <p><span className="text-fg-muted">Renta:</span> {money(rental.monthly_price)} al mes</p>
          <Field label="Meses a renovar">{(p) => <Select {...p} value={months} onChange={(e) => setMonths(e.target.value)}>{[1, 2, 3, 6, 12].map((m) => <option key={m} value={m}>{m}</option>)}</Select>}</Field>
          {confirmFree && <p className="text-sm text-danger-700">Al liberarlo queda disponible para otra familia. Pide la llave antes.</p>}
        </div>
      </Modal>
    );
  }
  return (
    <Modal open onClose={onClose} title={title}
      footer={locker.status === 'mantenimiento' ? <Button onClick={canEdit ? onEdit : onClose}>{canEdit ? 'Editar' : 'Cerrar'}</Button> : <div className="flex w-full justify-between gap-2">
        {canEdit ? <Button variant="ghost" onClick={onEdit}>Editar casillero</Button> : <span />}
        <Button disabled={!fam} loading={busy} onClick={async () => { const ok = await run(() => must(supabase.rpc('rentar_casillero', { p_locker: locker.id, p_family: fam!.id, p_member: member || null, p_months: n })), 'Casillero rentado. El cargo quedó en la cuenta.'); if (ok) onDone(); }}>
          Rentar · {money(Number(locker.monthly_price) * n)}
        </Button>
      </div>}>
      {locker.status === 'mantenimiento' ? <p className="text-base">Este casillero está en reparación{locker.notes ? `: ${locker.notes}` : ''}.</p> : (
        <div className="grid gap-4">
          <p className="text-base">{SIZE[locker.size]} · {money(locker.monthly_price)} al mes</p>
          <div><p className="mb-1 text-sm font-semibold">Familia</p><FamilyPicker value={fam} onChange={(f) => { setFam(f); setMember(''); }} /></div>
          {fam && <Field label="Socio que lo usa">{(p) => <Select {...p} value={member} onChange={(e) => setMember(e.target.value)}><option value="">Toda la familia</option>{(members ?? []).map((m) => <option key={m.id} value={m.id}>{fullName(m)}</option>)}</Select>}</Field>}
          <Field label="Meses">{(p) => <Select {...p} value={months} onChange={(e) => setMonths(e.target.value)}>{[1, 2, 3, 6, 12].map((m) => <option key={m} value={m}>{m}</option>)}</Select>}</Field>
        </div>
      )}
    </Modal>
  );
}
