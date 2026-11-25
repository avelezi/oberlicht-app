import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Pencil, Plus, Wallet, GraduationCap, Snowflake, LogOut, ArrowRightLeft, NotebookPen } from 'lucide-react';
import {
  Alert, Avatar, Button, Card, ConfirmFooter, Field, Input, Modal, PageHeader, Select, StatusBadge, Table, Tabs, Textarea, Checkbox,
} from '@/design-system';
import { useAuth, deptName } from '@/lib/auth';
import { useAction, useAsync } from '@/lib/hooks';
import { supabase, must } from '@/lib/supabase';
import { useCatalog, staffName, type Catalog } from '@/lib/catalog';
import { ageLabel, dateLong, dateShort, dateTime, daysLabel, fullName, hhmm, money, money0, seniority, todayMx } from '@/lib/format';
import type { Charge, DeptCode, Enrollment, Family, Invoice, Member, Membership, Payment } from '@/lib/types';
import { Area, ChargeBadge, EnrollmentBadge, ErrorBox, HealthFlag, Info, InvoiceBadge, Loading, Section } from '@/components/common';
import { CobrarModal, FamilyFormModal, InscribirModal, MemberFormModal, REGIMENES } from '@/components/FamilyForms';

type Note = { id: string; member_id: string; department: DeptCode; note: string; visible_to_family: boolean; created_at: string };

/** Expediente único de la familia: miembros, clases, pagos y facturas en un solo lugar. */
export default function Familia() {
  const { id } = useParams();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const { isFrontOffice, myAreas, allDepartments } = useAuth();
  const { data: cat } = useCatalog();
  const [tab, setTab] = useState('miembros');
  const [editFam, setEditFam] = useState(false);
  const [editMember, setEditMember] = useState<Member | null | undefined>(undefined);
  const [inscribir, setInscribir] = useState<string | null>(null);
  const [membership, setMembership] = useState<string | null>(null);
  const [note, setNote] = useState<Member | null>(null);
  const [move, setMove] = useState<Enrollment | null>(null);
  const [coupon, setCoupon] = useState<{ charge: Charge; code: string } | null>(null);
  const cobrar = params.get('cobrar') === '1';
  const { busy, run } = useAction();

  const { data, error, loading, reload } = useAsync(async () => {
    const fam = (await must(supabase.from('families').select('*').eq('id', id!).single())) as Family;
    const members = (await must(supabase.from('members').select('*').eq('family_id', id!).order('is_titular', { ascending: false }).order('birthdate'))) as Member[];
    const mids = members.map((m) => m.id);
    const [enr, mem, notes] = await Promise.all([
      mids.length ? must(supabase.from('enrollments').select('*').in('member_id', mids).order('enrolled_at', { ascending: false })) : [],
      mids.length ? must(supabase.from('memberships').select('*').in('member_id', mids).order('starts_on', { ascending: false })) : [],
      mids.length ? must(supabase.from('progress_notes').select('*').in('member_id', mids).order('created_at', { ascending: false }).limit(30)) : [],
    ]);
    let charges: Charge[] = [], payments: Payment[] = [], invoices: Invoice[] = [];
    if (isFrontOffice) {
      [charges, payments, invoices] = (await Promise.all([
        must(supabase.from('charges').select('*').eq('family_id', id!).order('due_date', { ascending: false }).limit(60)),
        must(supabase.from('payments').select('*').eq('family_id', id!).order('paid_at', { ascending: false }).limit(60)),
        must(supabase.from('invoices').select('*').eq('family_id', id!).order('created_at', { ascending: false }).limit(60)),
      ])) as [Charge[], Payment[], Invoice[]];
    }
    return { fam, members, enr: enr as Enrollment[], mem: mem as Membership[], notes: notes as Note[], charges, payments, invoices };
  }, [id, isFrontOffice]);

  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data || !cat) return <Loading />;
  const { fam, members, enr, mem, notes, charges, payments, invoices } = data;
  const due = charges.filter((c) => c.status === 'pendiente' || c.status === 'vencido');
  const balance = due.reduce((s, c) => s + Number(c.amount), 0);
  const overdue = charges.some((c) => c.status === 'vencido');
  const group = (gid: string) => cat.groups.find((g) => g.group_id === gid);

  async function changeStatus(e: Enrollment, status: 'activa' | 'congelada' | 'baja', msg: string) {
    const r = await run(() => must(supabase.rpc('cambiar_estado_inscripcion', { p_enrollment: e.id, p_status: status })), msg);
    if (r) reload();
  }

  const tabs = [
    { id: 'miembros', label: 'Miembros', count: members.filter((m) => m.active).length },
    { id: 'clases', label: 'Clases', count: enr.filter((e) => e.status !== 'baja').length + mem.filter((m) => m.status !== 'baja').length },
    ...(isFrontOffice ? [
      { id: 'pagos', label: 'Pagos', count: due.length || undefined },
      { id: 'facturas', label: 'Facturas' },
      { id: 'datos', label: 'Datos y facturación' },
    ] : []),
  ];

  return (
    <>
      <PageHeader
        breadcrumb={<button onClick={() => nav('/socios')} className="inline-flex items-center gap-1 text-sm text-fg-muted hover:text-primary"><ArrowLeft className="h-4 w-4" /> Socios y familias</button>}
        title={fam.name}
        description={<>Familia #{fam.number} · Socios desde {dateShort(fam.member_since ?? fam.created_at)} ({seniority(fam.member_since ?? fam.created_at)}) · {fam.phone ?? 'sin celular'}{fam.email ? ` · ${fam.email}` : ''}</>}
        actions={
          <>
            {isFrontOffice && <Button variant="secondary" icon={<Pencil className="h-5 w-5" />} onClick={() => setEditFam(true)}>Editar datos</Button>}
            {isFrontOffice && balance > 0
              ? <Button icon={<Wallet className="h-5 w-5" />} onClick={() => setParams({ cobrar: '1' })}>Cobrar {money0(balance)}</Button>
              : <Button icon={<GraduationCap className="h-5 w-5" />} onClick={() => setInscribir(members[0]?.id ?? '')} disabled={!members.length}>Inscribir</Button>}
          </>
        }
      />

      <div className="mb-4 grid gap-3">
        {fam.status === 'bloqueada' && <Alert tone="danger" title="Familia bloqueada">No puede reservar ni inscribirse hasta liquidar su adeudo.</Alert>}
        {isFrontOffice && overdue && fam.status !== 'bloqueada' && <Alert tone="danger" title={`Tiene pagos vencidos: ${money0(balance)} por cobrar`}>Cobra en recepción o envía la liga de pago.</Alert>}
        {fam.notes && <Alert tone="info" title="Nota de recepción">{fam.notes}</Alert>}
      </div>

      <Tabs items={tabs} value={tab} onChange={setTab} className="mb-6" />

      {tab === 'miembros' && (
        <div className="grid gap-4 lg:grid-cols-2">
          {members.map((m) => {
            const myEnr = enr.filter((e) => e.member_id === m.id && e.status !== 'baja');
            const myMem = mem.filter((x) => x.member_id === m.id && x.status !== 'baja');
            const myNotes = notes.filter((n) => n.member_id === m.id).slice(0, 2);
            return (
              <Card key={m.id} className={!m.active ? 'opacity-60' : undefined}>
                <div className="flex items-start gap-4">
                  <Avatar name={fullName(m)} src={m.photo_url ?? undefined} size={56} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-lg font-bold">{fullName(m)}</p>
                      {m.is_titular && <StatusBadge status="activo" label="Titular" size="sm" />}
                      {!m.active && <StatusBadge status="inactivo" size="sm" />}
                    </div>
                    <p className="text-base text-fg-muted">{ageLabel(m.birthdate)}{m.birthdate ? ` · nació el ${dateLong(m.birthdate)}` : ''}</p>
                    {(m.member_since || m.created_at) && <p className="text-sm text-fg-muted">Antigüedad: {seniority(m.member_since ?? m.created_at)} · desde {dateShort(m.member_since ?? m.created_at)}</p>}
                  </div>
                </div>
                <div className="mt-3 space-y-2">
                  <HealthFlag allergies={m.allergies} medical={m.medical_notes} />
                  {!m.is_titular && !m.waiver_signed_at && <p className="text-sm font-semibold text-warning-700">! Falta firmar el deslinde de responsabilidad</p>}
                  {(myEnr.length > 0 || myMem.length > 0) && (
                    <ul className="space-y-1.5">
                      {myEnr.map((e) => { const g = group(e.group_id); return (
                        <li key={e.id} className="flex flex-wrap items-center gap-2 text-base">
                          <Area code={g?.department} /> <span className="font-semibold">{g?.level_name}</span>
                          <span className="text-fg-muted">{g ? `${daysLabel(g.weekdays)} ${hhmm(g.start_time)}` : ''}</span>
                          <EnrollmentBadge e={e} />
                        </li>
                      ); })}
                      {myMem.map((x) => { const p = cat.plans.find((pl) => pl.id === x.plan_id); return (
                        <li key={x.id} className="flex flex-wrap items-center gap-2 text-base">
                          <Area code={p?.department} /> <span className="font-semibold">{p?.name}</span>
                          {x.sessions_remaining !== null && <span className="text-fg-muted">{x.sessions_remaining} sesiones restantes</span>}
                          <StatusBadge status={x.status === 'activa' ? 'activo' : 'congelado'} size="sm" />
                        </li>
                      ); })}
                    </ul>
                  )}
                  {myNotes.map((n) => (
                    <p key={n.id} className="rounded-md bg-surface-sunken px-3 py-2 text-sm"><strong>{deptName(allDepartments, n.department)} · {dateShort(n.created_at)}:</strong> {n.note}</p>
                  ))}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button size="sm" icon={<GraduationCap className="h-4 w-4" />} onClick={() => setInscribir(m.id)}>Inscribir a clase</Button>
                  {isFrontOffice && <Button size="sm" variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={() => setMembership(m.id)}>Membresía o paquete</Button>}
                  {isFrontOffice && <Button size="sm" variant="ghost" icon={<Pencil className="h-4 w-4" />} onClick={() => setEditMember(m)}>Editar</Button>}
                  {!isFrontOffice && <Button size="sm" variant="ghost" icon={<NotebookPen className="h-4 w-4" />} onClick={() => setNote(m)}>Nota de avance</Button>}
                </div>
              </Card>
            );
          })}
          {isFrontOffice && (
            <button onClick={() => setEditMember(null)} className="flex min-h-[160px] flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border-strong text-lg font-semibold text-primary hover:bg-primary-soft">
              <Plus className="h-7 w-7" /> Agregar miembro
            </button>
          )}
        </div>
      )}

      {tab === 'clases' && (
        <Section title="Clases, membresías y paquetes" description="Congela una inscripción si el alumno se ausenta un tiempo; al darla de baja, su lugar pasa al primero de la lista de espera.">
          <Table
            rows={enr} rowKey={(e) => e.id}
            empty="Sin inscripciones. Usa «Inscribir a clase» en la ficha del miembro."
            columns={[
              { key: 'm', header: 'Alumno', cell: (e) => { const m = members.find((x) => x.id === e.member_id); return m ? fullName(m) : '—'; } },
              { key: 'g', header: 'Grupo', cell: (e) => { const g = group(e.group_id); return g ? (
                <div><div className="flex items-center gap-2"><Area code={g.department} /><span className="font-semibold">{g.level_name}</span></div>
                  <p className="text-sm text-fg-muted">{daysLabel(g.weekdays)} · {hhmm(g.start_time)}–{hhmm(g.end_time)} · {staffName(cat, g.coach_id)}</p></div>) : '—'; } },
              { key: 'p', header: 'Mensualidad', align: 'right', hideOnMobile: true, cell: (e) => <span className="ob-num">{money(e.monthly_price)}{Number(e.discount_pct) > 0 && <span className="block text-sm text-success-700">−{Number(e.discount_pct)}% hermanos</span>}</span> },
              { key: 's', header: 'Estado', cell: (e) => <EnrollmentBadge e={e} /> },
              { key: 'a', header: '', align: 'right', cell: (e) => e.status === 'baja' ? <span className="text-sm text-fg-muted">{dateShort(e.ended_at)}</span> : (
                <div className="flex justify-end gap-1">
                  {e.status === 'activa' && <Button size="sm" variant="ghost" icon={<ArrowRightLeft className="h-4 w-4" />} onClick={() => setMove(e)}>Cambiar</Button>}
                  {e.status === 'activa' && <Button size="sm" variant="ghost" icon={<Snowflake className="h-4 w-4" />} loading={busy} onClick={() => changeStatus(e, 'congelada', 'Inscripción congelada')}>Congelar</Button>}
                  {e.status === 'congelada' && <Button size="sm" variant="ghost" loading={busy} onClick={() => changeStatus(e, 'activa', 'Inscripción reactivada')}>Reactivar</Button>}
                  <Button size="sm" variant="ghost" icon={<LogOut className="h-4 w-4" />} loading={busy} onClick={() => changeStatus(e, 'baja', 'Baja registrada')}>Baja</Button>
                </div>
              ) },
            ]}
          />
          {mem.length > 0 && (
            <div className="mt-6">
              <h3 className="mb-2 text-base font-bold">Membresías y paquetes</h3>
              <Table rows={mem} rowKey={(x) => x.id} columns={[
                { key: 'm', header: 'Socio', cell: (x) => { const m = members.find((y) => y.id === x.member_id); return m ? fullName(m) : '—'; } },
                { key: 'p', header: 'Plan', cell: (x) => { const p = cat.plans.find((pl) => pl.id === x.plan_id); return <div className="flex items-center gap-2"><Area code={p?.department} />{p?.name}</div>; } },
                { key: 'r', header: 'Sesiones', cell: (x) => x.sessions_remaining ?? 'Ilimitado', hideOnMobile: true },
                { key: 'pr', header: 'Mensualidad', align: 'right', cell: (x) => money(x.monthly_price), hideOnMobile: true },
                { key: 's', header: 'Estado', cell: (x) => <StatusBadge status={x.status === 'activa' ? 'activo' : x.status === 'congelada' ? 'congelado' : 'cancelado'} label={x.status === 'baja' ? 'Baja' : undefined} /> },
                ...(isFrontOffice ? [{ key: 'a', header: '', align: 'right' as const, cell: (x: Membership) => x.status !== 'baja' && (
                  <Button size="sm" variant="ghost" loading={busy} onClick={async () => {
                    const r = await run(() => must(supabase.from('memberships').update({ status: 'baja', ends_on: todayMx() }).eq('id', x.id).select()), 'Membresía dada de baja');
                    if (r) reload();
                  }}>Baja</Button>
                ) }] : []),
              ]} />
            </div>
          )}
        </Section>
      )}

      {tab === 'pagos' && (
        <div className="grid gap-6">
          <Section title="Cargos" description="Mensualidades, inscripciones y sesiones. Lo vencido aparece en rojo."
            actions={balance > 0 && <Button icon={<Wallet className="h-5 w-5" />} onClick={() => setParams({ cobrar: '1' })}>Cobrar {money0(balance)}</Button>}>
            <Table rows={charges} rowKey={(c) => c.id} empty="Sin cargos." columns={[
              { key: 'c', header: 'Concepto', cell: (c) => <div><p className="font-semibold">{c.concept}</p>{c.period && <p className="text-sm text-fg-muted">Periodo {c.period}</p>}</div> },
              { key: 'd', header: 'Vence', cell: (c) => dateShort(c.due_date), hideOnMobile: true },
              { key: 'a', header: 'Importe', align: 'right', cell: (c) => <span className="font-semibold ob-num">{money(c.amount)}</span> },
              { key: 's', header: 'Estado', cell: (c) => <ChargeBadge c={c} /> },
              { key: 'x', header: '', align: 'right', cell: (c) => (c.status === 'pendiente' || c.status === 'vencido') && Number(c.amount) > 0 ? <Button size="sm" variant="ghost" onClick={() => setCoupon({ charge: c, code: '' })}>Aplicar cupón</Button> : null },
            ]} />
          </Section>
          <Section title="Pagos recibidos">
            <Table rows={payments} rowKey={(p) => p.id} empty="Sin pagos registrados." columns={[
              { key: 'd', header: 'Fecha', cell: (p) => dateTime(p.paid_at) },
              { key: 'm', header: 'Forma de pago', cell: (p) => ({ efectivo: 'Efectivo', tarjeta: 'Tarjeta guardada', terminal: 'Terminal', transferencia: 'Transferencia', liga: 'Liga de pago' })[p.method] },
              { key: 'r', header: 'Referencia', cell: (p) => p.reference ?? '—', hideOnMobile: true },
              { key: 'a', header: 'Importe', align: 'right', cell: (p) => <span className="font-semibold ob-num">{money(p.amount)}</span> },
            ]} />
          </Section>
        </div>
      )}

      {tab === 'facturas' && (
        <Section title="Facturas (CFDI 4.0)" description={fam.wants_invoice ? `Se factura a ${fam.razon_social} (${fam.rfc}).` : 'Esta familia no pide factura: sus pagos entran en la factura global del mes.'}>
          <Table rows={invoices} rowKey={(i) => i.id} empty="Sin facturas." columns={[
            { key: 'f', header: 'Folio', cell: (i) => i.folio ? `${i.serie ?? ''}${i.folio}` : 'Por asignar' },
            { key: 'd', header: 'Fecha', cell: (i) => dateShort(i.issued_at ?? i.created_at) },
            { key: 'r', header: 'Receptor', cell: (i) => i.receptor_rfc ?? '—', hideOnMobile: true },
            { key: 't', header: 'Total', align: 'right', cell: (i) => money(i.total) },
            { key: 's', header: 'Estado', cell: (i) => <InvoiceBadge i={i} /> },
          ]} />
        </Section>
      )}

      {tab === 'datos' && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Section title="Contacto" actions={<Button variant="secondary" size="sm" onClick={() => setEditFam(true)}>Editar</Button>}>
            <dl className="grid gap-4 sm:grid-cols-2">
              <Info label="Celular">{fam.phone}</Info><Info label="Correo">{fam.email}</Info>
              <Info label="Dirección">{fam.address}</Info><Info label="Alta">{dateLong(fam.created_at)}</Info>
              <Info label="Tarjeta para cargo automático">{fam.card_last4 ? `${fam.card_brand ?? ''} •••• ${fam.card_last4}` : 'Sin tarjeta (pendiente procesador de pagos)'}</Info>
            </dl>
          </Section>
          <Section title="Datos fiscales">
            {fam.wants_invoice ? (
              <dl className="grid gap-4 sm:grid-cols-2">
                <Info label="RFC">{fam.rfc}</Info><Info label="Razón social">{fam.razon_social}</Info>
                <Info label="Régimen fiscal">{REGIMENES.find((r) => r[0] === fam.regimen_fiscal)?.[1] ?? fam.regimen_fiscal}</Info>
                <Info label="Código postal fiscal">{fam.cp_fiscal}</Info><Info label="Uso de CFDI">{fam.uso_cfdi}</Info>
              </dl>
            ) : <p className="text-base text-fg-muted">No solicita factura. Edita los datos si la necesita.</p>}
          </Section>
        </div>
      )}

      <FamilyFormModal open={editFam} onClose={() => setEditFam(false)} family={fam} onSaved={() => reload()} />
      <MemberFormModal open={editMember !== undefined} onClose={() => setEditMember(undefined)} familyId={fam.id} member={editMember} onSaved={reload} />
      <InscribirModal open={inscribir !== null} onClose={() => setInscribir(null)} members={members.filter((m) => m.active)} cat={cat}
        defaultMemberId={inscribir ?? undefined} onDone={reload} areas={isFrontOffice ? undefined : myAreas} />
      {isFrontOffice && <CobrarModal open={cobrar} onClose={() => setParams({})} family={fam} onDone={reload} />}
      <MembershipModal memberId={membership} onClose={() => setMembership(null)} cat={cat} onDone={reload} />
      <NoteModal member={note} onClose={() => setNote(null)} areas={myAreas} onDone={reload} />
      <MoveModal enrollment={move} onClose={() => setMove(null)} cat={cat} onDone={reload} />
      <Modal open={!!coupon} onClose={() => setCoupon(null)} title={`Aplicar cupón a: ${coupon?.charge.concept ?? ''}`}
        footer={<ConfirmFooter onCancel={() => setCoupon(null)} confirmLabel="Aplicar" loading={busy} onConfirm={async () => {
          if (!coupon?.code.trim()) return;
          const ok = await run(() => must(supabase.rpc('aplicar_cupon_cargo', { p_charge: coupon.charge.id, p_code: coupon.code.trim() })), 'Descuento aplicado');
          if (ok) { setCoupon(null); reload(); }
        }} />}>
        {coupon && <div className="grid gap-3">
          <p className="text-base">Importe actual: <span className="font-semibold ob-num">{money(coupon.charge.amount)}</span></p>
          <Field label="Código del cupón">{(p) => <Input {...p} className="font-mono uppercase" autoFocus value={coupon.code} onChange={(e) => setCoupon({ ...coupon, code: e.target.value.toUpperCase() })} />}</Field>
        </div>}
      </Modal>
    </>
  );
}

function MembershipModal({ memberId, onClose, cat, onDone }: { memberId: string | null; onClose: () => void; cat: Catalog; onDone: () => void }) {
  const plans = cat.plans.filter((p) => p.active && (p.kind === 'membresia' || p.kind === 'paquete'));
  const [planId, setPlanId] = useState('');
  const { busy, run } = useAction();
  useEffect(() => { if (memberId) setPlanId(plans[0]?.id ?? ''); }, [memberId]); // eslint-disable-line react-hooks/exhaustive-deps
  const plan = plans.find((p) => p.id === planId);
  async function save() {
    if (!plan || !memberId) return;
    const r = await run(async () => {
      await must(supabase.from('memberships').insert({
        member_id: memberId, plan_id: plan.id, monthly_price: plan.price_monthly, sessions_remaining: plan.sessions_per_month,
      }).select());
      return true;
    }, 'Membresía agregada. Se cobra en la próxima mensualidad.');
    if (r) { onDone(); onClose(); }
  }
  return (
    <Modal open={!!memberId} onClose={onClose} title="Agregar membresía o paquete"
      footer={<ConfirmFooter onCancel={onClose} onConfirm={save} loading={busy} confirmLabel="Agregar" />}>
      <div className="space-y-4">
        <Field label="Plan" required>
          {(p) => <Select {...p} value={planId} onChange={(e) => setPlanId(e.target.value)}>
            {plans.map((pl) => <option key={pl.id} value={pl.id}>{pl.name} · {money0(pl.price_monthly)}/mes</option>)}
          </Select>}
        </Field>
        {plan && <Alert tone="info" title={plan.name}>{plan.description ?? ''} {plan.sessions_per_month ? `Incluye ${plan.sessions_per_month} sesiones al mes.` : 'Acceso libre.'}</Alert>}
      </div>
    </Modal>
  );
}

function NoteModal({ member, onClose, areas, onDone }: { member: Member | null; onClose: () => void; areas: DeptCode[]; onDone: () => void }) {
  const { allDepartments } = useAuth();
  const [dept, setDept] = useState<DeptCode>(areas[0] ?? 'natacion');
  const [text, setText] = useState('');
  const [visible, setVisible] = useState(true);
  const { busy, run } = useAction();
  useEffect(() => { if (member) { setText(''); setVisible(true); setDept(areas[0] ?? 'natacion'); } }, [member]); // eslint-disable-line react-hooks/exhaustive-deps
  async function save() {
    const r = await run(async () => {
      if (!text.trim()) throw new Error('Escribe la nota.');
      return must(supabase.from('progress_notes').insert({ member_id: member!.id, department: dept, note: text.trim(), visible_to_family: visible }).select());
    }, 'Nota guardada');
    if (r) { onDone(); onClose(); }
  }
  return (
    <Modal open={!!member} onClose={onClose} title={`Nota de avance · ${member ? member.first_name : ''}`}
      footer={<ConfirmFooter onCancel={onClose} onConfirm={save} loading={busy} confirmLabel="Guardar nota" />}>
      <div className="space-y-4">
        {areas.length > 1 && <Field label="Área">{(p) => <Select {...p} value={dept} onChange={(e) => setDept(e.target.value as DeptCode)}>
          {areas.map((a) => <option key={a} value={a}>{deptName(allDepartments, a)}</option>)}</Select>}</Field>}
        <Field label="¿Cómo va?" hint="Ej. Ya flota de espalda sin apoyo. Practicar patada de crol.">
          {(p) => <Textarea {...p} rows={4} value={text} onChange={(e) => setText(e.target.value)} />}
        </Field>
        <Checkbox checked={visible} onChange={(e) => setVisible(e.target.checked)} label="La familia puede verla en su portal" />
      </div>
    </Modal>
  );
}

function MoveModal({ enrollment, onClose, cat, onDone }: { enrollment: Enrollment | null; onClose: () => void; cat: Catalog; onDone: () => void }) {
  const current = cat.groups.find((g) => g.group_id === enrollment?.group_id);
  const options = cat.groups.filter((g) => g.active && g.department === current?.department && g.group_id !== current?.group_id);
  const [gid, setGid] = useState('');
  const { busy, run } = useAction();
  useEffect(() => { setGid(''); }, [enrollment]);
  async function save() {
    const r = await run(async () => {
      if (!gid) throw new Error('Elige el grupo nuevo.');
      return must(supabase.rpc('cambiar_grupo', { p_enrollment: enrollment!.id, p_new_group: gid }));
    }, 'Cambio de grupo listo');
    if (r) { onDone(); onClose(); }
  }
  return (
    <Modal open={!!enrollment} onClose={onClose} title="Cambiar de grupo u horario"
      footer={<ConfirmFooter onCancel={onClose} onConfirm={save} loading={busy} confirmLabel="Cambiar" />}>
      <div className="space-y-4">
        <p className="text-base">Grupo actual: <strong>{current?.level_name} · {current ? `${daysLabel(current.weekdays)} ${hhmm(current.start_time)}` : ''}</strong></p>
        <Field label="Nuevo grupo" hint="Puede ser otro horario del mismo nivel o el siguiente nivel.">
          {(p) => <Select {...p} value={gid} onChange={(e) => setGid(e.target.value)}>
            <option value="">Elige…</option>
            {options.map((g) => <option key={g.group_id} value={g.group_id} disabled={g.free_spots <= 0}>
              {g.level_name} · {daysLabel(g.weekdays)} {hhmm(g.start_time)} · {g.free_spots > 0 ? `${g.free_spots} lugares` : 'lleno'}
            </option>)}
          </Select>}
        </Field>
        <Input type="hidden" value={gid} readOnly />
      </div>
    </Modal>
  );
}
