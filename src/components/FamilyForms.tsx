import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Checkbox, ConfirmFooter, Field, Input, Modal, Select, Textarea } from '@/design-system';
import { supabase, must } from '@/lib/supabase';
import { useAction } from '@/lib/hooks';
import { ageLabel, ageYears, daysLabel, hhmm, money, rangeLabel, todayMx } from '@/lib/format';
import type { Catalog } from '@/lib/catalog';
import { staffName } from '@/lib/catalog';
import type { Charge, DeptCode, Family, Member } from '@/lib/types';
import { CapacityBar, Area } from './common';

// ───────────────────────────── Familia ─────────────────────────────

export const REGIMENES: [string, string][] = [
  ['601', '601 General de Ley Personas Morales'], ['603', '603 Personas Morales sin fines de lucro'],
  ['605', '605 Sueldos y Salarios'], ['606', '606 Arrendamiento'], ['612', '612 Actividades Empresariales y Profesionales'],
  ['616', '616 Sin obligaciones fiscales'], ['621', '621 Incorporación Fiscal'], ['626', '626 Régimen Simplificado de Confianza'],
];
export const USOS_CFDI: [string, string][] = [
  ['D10', 'D10 Pagos por servicios educativos (colegiaturas)'], ['G03', 'G03 Gastos en general'],
  ['D01', 'D01 Honorarios médicos y gastos hospitalarios'], ['S01', 'S01 Sin efectos fiscales'], ['CP01', 'CP01 Pagos'],
];

export function FamilyFormModal({ open, onClose, family, onSaved, titularProfileId }: {
  open: boolean; onClose: () => void; family?: Family | null; onSaved: (f: Family) => void; titularProfileId?: string;
}) {
  const [f, setF] = useState<Partial<Family>>({});
  const [titularName, setTitularName] = useState('');
  const [titularLast, setTitularLast] = useState('');
  const { busy, run } = useAction();
  useEffect(() => { if (open) { setF(family ?? { wants_invoice: false, uso_cfdi: 'D10' }); setTitularName(''); setTitularLast(''); } }, [open, family]);
  const set = (k: keyof Family, v: unknown) => setF((x) => ({ ...x, [k]: v }));
  const isNew = !family;

  async function save() {
    const payload = {
      name: f.name?.trim() || (titularLast ? `Familia ${titularLast.trim()}` : ''),
      email: f.email || null, phone: f.phone || null, address: f.address || null,
      rfc: f.rfc?.toUpperCase().trim() || null, razon_social: f.razon_social || null,
      regimen_fiscal: f.regimen_fiscal || null, cp_fiscal: f.cp_fiscal || null, uso_cfdi: f.uso_cfdi || 'D10',
      wants_invoice: !!f.wants_invoice, notes: f.notes || null,
    };
    if (!payload.name) throw new Error('Escribe el nombre de la familia o los apellidos del titular.');
    if (payload.wants_invoice && (!payload.rfc || !payload.razon_social || !payload.cp_fiscal || !payload.regimen_fiscal))
      throw new Error('Para facturar se necesitan RFC, razón social, régimen fiscal y código postal.');
    if (isNew) {
      const row = await must(supabase.from('families').insert({ ...payload, titular_profile_id: titularProfileId ?? null }).select().single());
      if (titularName.trim()) {
        await must(supabase.from('members').insert({
          family_id: (row as Family).id, first_name: titularName.trim(), last_name: titularLast.trim(),
          is_titular: true, email: payload.email, phone: payload.phone,
        }));
      }
      return row as Family;
    }
    return (await must(supabase.from('families').update(payload).eq('id', family!.id).select().single())) as Family;
  }

  return (
    <Modal open={open} onClose={onClose} size="lg" title={isNew ? 'Nueva familia' : 'Editar datos de la familia'}
      footer={<ConfirmFooter onCancel={onClose} confirmLabel={isNew ? 'Crear familia' : 'Guardar cambios'} loading={busy}
        onConfirm={async () => { const r = await run(save, isNew ? 'Familia creada' : 'Datos guardados'); if (r) { onSaved(r); onClose(); } }} />}>
      <div className="grid gap-4 sm:grid-cols-2">
        {isNew && (
          <>
            <Field label="Nombre del titular (quien paga)" required>
              {(p) => <Input {...p} value={titularName} onChange={(e) => setTitularName(e.target.value)} placeholder="Ej. Mariana" />}
            </Field>
            <Field label="Apellidos del titular" required>
              {(p) => <Input {...p} value={titularLast} onChange={(e) => setTitularLast(e.target.value)} placeholder="Ej. López Ruiz" />}
            </Field>
          </>
        )}
        <Field label="Nombre de la familia" hint={isNew ? 'Si lo dejas vacío se usa "Familia" + apellidos.' : undefined}>
          {(p) => <Input {...p} value={f.name ?? ''} onChange={(e) => set('name', e.target.value)} placeholder="Familia López Ruiz" />}
        </Field>
        <Field label="Celular (WhatsApp)" required>
          {(p) => <Input {...p} type="tel" value={f.phone ?? ''} onChange={(e) => set('phone', e.target.value)} placeholder="10 dígitos" />}
        </Field>
        <Field label="Correo">
          {(p) => <Input {...p} type="email" value={f.email ?? ''} onChange={(e) => set('email', e.target.value)} placeholder="correo@ejemplo.com" />}
        </Field>
        <Field label="Domicilio">
          {(p) => <Input {...p} value={f.address ?? ''} onChange={(e) => set('address', e.target.value)} />}
        </Field>
      </div>

      <div className="mt-6 rounded-lg border border-border bg-surface-muted p-4">
        <Checkbox checked={!!f.wants_invoice} onChange={(e) => set('wants_invoice', e.target.checked)}
          label="Quiere factura (CFDI)" description="Si no, sus pagos entran a la factura global del mes." />
        {f.wants_invoice && (
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <Field label="RFC" required>{(p) => <Input {...p} value={f.rfc ?? ''} onChange={(e) => set('rfc', e.target.value.toUpperCase())} maxLength={13} placeholder="XAXX010101000" />}</Field>
            <Field label="Nombre o razón social" required hint="Exactamente como aparece en su constancia fiscal.">
              {(p) => <Input {...p} value={f.razon_social ?? ''} onChange={(e) => set('razon_social', e.target.value.toUpperCase())} />}
            </Field>
            <Field label="Régimen fiscal" required>
              {(p) => <Select {...p} value={f.regimen_fiscal ?? ''} onChange={(e) => set('regimen_fiscal', e.target.value)}>
                <option value="">Elige…</option>{REGIMENES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </Select>}
            </Field>
            <Field label="Código postal fiscal" required>{(p) => <Input {...p} inputMode="numeric" maxLength={5} value={f.cp_fiscal ?? ''} onChange={(e) => set('cp_fiscal', e.target.value)} />}</Field>
            <Field label="Uso del CFDI" required className="sm:col-span-2">
              {(p) => <Select {...p} value={f.uso_cfdi ?? 'D10'} onChange={(e) => set('uso_cfdi', e.target.value)}>
                {USOS_CFDI.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </Select>}
            </Field>
          </div>
        )}
      </div>

      <Field label="Notas internas" className="mt-4">
        {(p) => <Textarea {...p} value={f.notes ?? ''} onChange={(e) => set('notes', e.target.value)} placeholder="Solo las ve el personal." />}
      </Field>
    </Modal>
  );
}

// ───────────────────────────── Miembro ─────────────────────────────

export function MemberFormModal({ open, onClose, familyId, member, onSaved, portal }: {
  open: boolean; onClose: () => void; familyId: string; member?: Member | null; onSaved: () => void; portal?: boolean;
}) {
  const [m, setM] = useState<Partial<Member>>({});
  const [waiver, setWaiver] = useState(false);
  const [waiverName, setWaiverName] = useState('');
  const { busy, run } = useAction();
  useEffect(() => { if (open) { setM(member ?? { gender: null }); setWaiver(!!member?.waiver_signed_at); setWaiverName(member?.waiver_signed_by ?? ''); } }, [open, member]);
  const set = (k: keyof Member, v: unknown) => setM((x) => ({ ...x, [k]: v }));
  const minor = (ageYears(m.birthdate ?? null) ?? 99) < 18;

  async function save() {
    if (!m.first_name?.trim()) throw new Error('Escribe el nombre.');
    if (!m.birthdate) throw new Error('La fecha de nacimiento es necesaria para asignar el nivel correcto.');
    if (waiver && !waiverName.trim()) throw new Error('Escribe el nombre de quien firma el deslinde.');
    const payload = {
      first_name: m.first_name.trim(), last_name: (m.last_name ?? '').trim(), birthdate: m.birthdate, gender: m.gender || null,
      phone: m.phone || null, email: m.email || null, allergies: m.allergies || null, medical_notes: m.medical_notes || null,
      emergency_name: m.emergency_name || null, emergency_phone: m.emergency_phone || null,
      waiver_signed_at: waiver ? (member?.waiver_signed_at ?? new Date().toISOString()) : null,
      waiver_signed_by: waiver ? waiverName.trim() : null,
    };
    if (member) await must(supabase.from('members').update(payload).eq('id', member.id));
    else await must(supabase.from('members').insert({ ...payload, family_id: familyId }));
  }

  return (
    <Modal open={open} onClose={onClose} size="lg" title={member ? `Editar a ${member.first_name}` : portal ? 'Agregar a un hijo o familiar' : 'Agregar miembro'}
      footer={<ConfirmFooter onCancel={onClose} confirmLabel={member ? 'Guardar' : 'Agregar'} loading={busy}
        onConfirm={async () => { const ok = await run(async () => { await save(); return true; }, 'Guardado'); if (ok) { onSaved(); onClose(); } }} />}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre(s)" required>{(p) => <Input {...p} value={m.first_name ?? ''} onChange={(e) => set('first_name', e.target.value)} />}</Field>
        <Field label="Apellidos" required>{(p) => <Input {...p} value={m.last_name ?? ''} onChange={(e) => set('last_name', e.target.value)} />}</Field>
        <Field label="Fecha de nacimiento" required hint={m.birthdate ? `Edad: ${ageLabel(m.birthdate)}` : 'Con ella se calcula el nivel que le corresponde.'}>
          {(p) => <Input {...p} type="date" max={todayMx()} value={m.birthdate ?? ''} onChange={(e) => set('birthdate', e.target.value)} />}
        </Field>
        <Field label="Sexo">
          {(p) => <Select {...p} value={m.gender ?? ''} onChange={(e) => set('gender', e.target.value || null)}>
            <option value="">Prefiero no decir</option><option value="F">Femenino</option><option value="M">Masculino</option><option value="X">Otro</option>
          </Select>}
        </Field>
      </div>

      <h3 className="mb-2 mt-6 text-base font-bold">Salud y emergencias</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Alergias" hint="Medicamentos, alimentos, cloro, látex…">{(p) => <Input {...p} value={m.allergies ?? ''} onChange={(e) => set('allergies', e.target.value)} placeholder="Ninguna" />}</Field>
        <Field label="Condiciones médicas" hint="Asma, epilepsia, lesiones…">{(p) => <Input {...p} value={m.medical_notes ?? ''} onChange={(e) => set('medical_notes', e.target.value)} placeholder="Ninguna" />}</Field>
        <Field label="Contacto de emergencia" required={minor}>{(p) => <Input {...p} value={m.emergency_name ?? ''} onChange={(e) => set('emergency_name', e.target.value)} placeholder="Nombre y parentesco" />}</Field>
        <Field label="Teléfono de emergencia" required={minor}>{(p) => <Input {...p} type="tel" value={m.emergency_phone ?? ''} onChange={(e) => set('emergency_phone', e.target.value)} />}</Field>
      </div>

      {minor && (
        <div className="mt-6 rounded-lg border border-border bg-surface-muted p-4">
          <h3 className="text-base font-bold">Deslinde de responsabilidad (menores)</h3>
          <p className="mt-1 text-sm text-fg-muted">
            Como madre, padre o tutor autorizo la participación del menor en las actividades del club, declaro que su información de salud es
            verídica y acepto el reglamento interno de Oberlicht. Es obligatorio para inscribir a natación, ballet o gimnasia.
          </p>
          <Checkbox className="mt-2" checked={waiver} onChange={(e) => setWaiver(e.target.checked)} label="Acepto y firmo el deslinde" />
          {waiver && (
            <Field label="Nombre completo de quien firma" required>
              {(p) => <Input {...p} value={waiverName} onChange={(e) => setWaiverName(e.target.value)} />}
            </Field>
          )}
        </div>
      )}
    </Modal>
  );
}

// ───────────────────────────── Inscribir ─────────────────────────────

export function InscribirModal({ open, onClose, members, cat, onDone, defaultMemberId, areas }: {
  open: boolean; onClose: () => void; members: Member[]; cat: Catalog; onDone: () => void; defaultMemberId?: string; areas?: DeptCode[];
}) {
  const [memberId, setMemberId] = useState<string>('');
  const [dept, setDept] = useState<DeptCode>('natacion');
  const [groupId, setGroupId] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const { busy, run } = useAction();
  const schoolAreas: DeptCode[] = (areas ?? ['natacion', 'ballet', 'gimnasia', 'oberfit']).filter((a) => cat.levels.some((l) => l.department === a));

  useEffect(() => { if (open) { setMemberId(defaultMemberId ?? members[0]?.id ?? ''); setGroupId(''); setError(null); setDept(schoolAreas[0] ?? 'natacion'); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const member = members.find((x) => x.id === memberId);
  const age = ageYears(member?.birthdate ?? null);
  const options = useMemo(() => {
    return cat.groups
      .filter((g) => g.department === dept && g.active)
      .map((g) => ({ g, fits: age !== null && age >= Number(g.min_age) && age <= Number(g.max_age), plan: cat.plans.find((p) => p.id === g.plan_id) }))
      .sort((a, b) => Number(b.fits) - Number(a.fits) || a.g.level_name.localeCompare(b.g.level_name));
  }, [cat, dept, age]);
  const fitting = options.filter((o) => o.fits);
  const needsWaiver = member && !member.waiver_signed_at && (age ?? 99) < 18 && ['natacion', 'ballet', 'gimnasia'].includes(dept);

  async function submit() {
    setError(null);
    const r = await run(async () => {
      const { data, error } = await supabase.rpc('inscribir', { p_member: memberId, p_group: groupId });
      if (error) throw error;
      return data as { status: string };
    });
    if (r) {
      onDone(); onClose();
    }
  }

  const selected = options.find((o) => o.g.group_id === groupId);

  return (
    <Modal open={open} onClose={onClose} size="lg" title="Inscribir a una clase"
      footer={<ConfirmFooter onCancel={onClose} onConfirm={submit} loading={busy}
        confirmLabel={selected ? (selected.g.free_spots > 0 ? `Inscribir en ${selected.g.level_name}` : 'Anotar en lista de espera') : 'Elige un grupo'} />}>
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="¿A quién inscribes?" required hint={member ? `Edad: ${ageLabel(member.birthdate)}` : undefined}>
            {(p) => <Select {...p} value={memberId} onChange={(e) => { setMemberId(e.target.value); setGroupId(''); }}>
              {members.map((m) => <option key={m.id} value={m.id}>{m.first_name} {m.last_name}</option>)}
            </Select>}
          </Field>
          <Field label="Área" required>
            {(p) => <Select {...p} value={dept} onChange={(e) => { setDept(e.target.value as DeptCode); setGroupId(''); }}>
              {schoolAreas.map((a) => <option key={a} value={a}>{({ natacion: 'Natación', ballet: 'Ballet', gimnasia: 'Gimnasia rítmica', oberfit: 'Oberfit (clases)' } as Record<string, string>)[a] ?? a}</option>)}
            </Select>}
          </Field>
        </div>

        {needsWaiver && (
          <Alert tone="warning" title="Falta firmar el deslinde">Edita los datos del menor y acepta el deslinde de responsabilidad antes de inscribirlo.</Alert>
        )}
        {member && !member.birthdate && <Alert tone="warning" title="Falta la fecha de nacimiento">Sin ella no podemos saber qué nivel le corresponde.</Alert>}

        <div>
          <p className="mb-2 text-sm font-semibold">
            {fitting.length ? `Grupos para su edad (${fitting.length})` : 'No hay grupos para su edad en esta área'}
          </p>
          <div className="grid max-h-[46vh] gap-2 overflow-y-auto pr-1">
            {options.filter((o) => o.fits).map(({ g }) => (
              <button key={g.group_id} type="button" onClick={() => setGroupId(g.group_id)}
                className={`rounded-lg border p-4 text-left transition-colors ${groupId === g.group_id ? 'border-primary bg-primary-soft ring-2 ring-primary' : 'border-border hover:bg-surface-sunken'}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-base font-bold">{g.level_name} · {g.name}</p>
                    <p className="text-sm text-fg-muted">{daysLabel(g.weekdays)} · {hhmm(g.start_time)} a {hhmm(g.end_time)} · {g.location ?? ''} · {staffName(cat, g.coach_id)}</p>
                    <p className="text-sm text-fg-muted">Edad {rangeLabel(Number(g.min_age), Number(g.max_age))}</p>
                  </div>
                  <div className="w-40">
                    <CapacityBar used={g.enrolled} total={g.capacity} />
                    <p className="mt-1 text-right text-sm font-semibold">
                      {g.free_spots > 0 ? <span className="text-success-700">{g.free_spots} lugares</span> : <span className="text-warning-700">Lleno · {g.waitlist} en espera</span>}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {selected && (() => {
          const plan = selected.plan;
          return plan ? (
            <Alert tone="info" title={plan.name}>
              Mensualidad {money(plan.price_monthly)}{Number(plan.enrollment_fee) > 0 ? ` · Inscripción ${money(plan.enrollment_fee)}` : ''}. Si ya hay un hermano inscrito se aplica el descuento automáticamente.
            </Alert>
          ) : null;
        })()}
        {error && <Alert tone="danger" title="No se pudo inscribir">{error}</Alert>}
        <Area code={dept} />
      </div>
    </Modal>
  );
}

// ───────────────────────────── Cobrar ─────────────────────────────

export function CobrarModal({ open, onClose, family, onDone }: { open: boolean; onClose: () => void; family: Family; onDone: () => void }) {
  const [charges, setCharges] = useState<Charge[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [method, setMethod] = useState<'efectivo' | 'terminal' | 'transferencia' | 'tarjeta'>('efectivo');
  const [reference, setReference] = useState('');
  const [received, setReceived] = useState('');
  const { busy, run } = useAction();

  useEffect(() => {
    if (!open) return;
    supabase.from('charges').select('*').eq('family_id', family.id).in('status', ['pendiente', 'vencido']).order('due_date')
      .then(({ data }) => { const cs = (data ?? []) as Charge[]; setCharges(cs); setSelected(cs.map((c) => c.id)); setReceived(''); setReference(''); });
  }, [open, family.id]);

  const total = charges.filter((c) => selected.includes(c.id)).reduce((s, c) => s + Number(c.amount), 0);
  const change = method === 'efectivo' && Number(received) > total ? Number(received) - total : 0;

  async function pay() {
    const r = await run(async () => {
      if (!selected.length) throw new Error('Elige al menos un concepto para cobrar.');
      for (const id of selected) {
        const c = charges.find((x) => x.id === id)!;
        const { error } = await supabase.rpc('registrar_pago', { p_family: family.id, p_amount: c.amount, p_method: method, p_charge: id, p_reference: reference || null });
        if (error) throw error;
      }
      return true;
    }, `Cobro registrado: ${money(total)}`);
    if (r) { onDone(); onClose(); }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Cobrar a ${family.name}`}
      footer={<><Button variant="secondary" onClick={onClose}>Regresar</Button>
        <Button variant="success" size="lg" loading={busy} disabled={!selected.length} onClick={pay}>Cobrar {money(total)}</Button></>}>
      {charges.length === 0 ? (
        <Alert tone="success" title="Está al corriente">Esta familia no tiene pagos pendientes.</Alert>
      ) : (
        <div className="space-y-4">
          <div className="divide-y divide-border rounded-lg border border-border">
            {charges.map((c) => (
              <label key={c.id} className="flex min-h-[56px] cursor-pointer items-center gap-3 px-4">
                <input type="checkbox" className="h-5 w-5 accent-[var(--ob-primary)]" checked={selected.includes(c.id)}
                  onChange={(e) => setSelected((s) => e.target.checked ? [...s, c.id] : s.filter((x) => x !== c.id))} />
                <span className="flex-1">
                  <span className="block text-base">{c.concept}</span>
                  <span className={`text-sm ${c.status === 'vencido' ? 'font-semibold text-danger-700' : 'text-fg-muted'}`}>
                    {c.status === 'vencido' ? 'Vencido desde ' : 'Vence '}{c.due_date}
                  </span>
                </span>
                <span className="text-base font-semibold ob-num">{money(c.amount)}</span>
              </label>
            ))}
          </div>
          <Field label="Forma de pago" required>
            {() => (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {(['efectivo', 'terminal', 'transferencia', 'tarjeta'] as const).map((m) => (
                  <button key={m} type="button" onClick={() => setMethod(m)}
                    className={`min-h-control-lg rounded-md border text-base font-semibold capitalize ${method === m ? 'border-primary bg-primary text-primary-fg' : 'border-border-strong bg-surface hover:bg-surface-sunken'}`}>
                    {m === 'terminal' ? 'Terminal' : m === 'tarjeta' ? 'Tarjeta guardada' : m}
                  </button>
                ))}
              </div>
            )}
          </Field>
          {method === 'efectivo' && (
            <Field label="Recibido en efectivo" hint={change > 0 ? `Cambio a entregar: ${money(change)}` : 'Escribe cuánto te dieron para calcular el cambio.'}>
              {(p) => <Input {...p} inputMode="decimal" value={received} onChange={(e) => setReceived(e.target.value)} placeholder={String(total)} />}
            </Field>
          )}
          {(method === 'terminal' || method === 'transferencia') && (
            <Field label={method === 'terminal' ? 'Número de autorización' : 'Referencia o rastreo'}>
              {(p) => <Input {...p} value={reference} onChange={(e) => setReference(e.target.value)} />}
            </Field>
          )}
          {method === 'tarjeta' && (
            <Alert tone="warning" title="Procesador de pagos pendiente">
              El cargo a tarjeta guardada se activa cuando el club elija su procesador (Openpay, Conekta, Stripe México o Mercado Pago). Por ahora registra el pago con la terminal.
            </Alert>
          )}
          <p className="text-sm text-fg-muted">
            {family.wants_invoice ? `Se generará factura a ${family.razon_social ?? family.rfc}.` : 'Sin datos fiscales: el pago entra en la factura global del mes.'}
          </p>
        </div>
      )}
    </Modal>
  );
}
