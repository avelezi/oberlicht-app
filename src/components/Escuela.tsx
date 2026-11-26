import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Award, CalendarPlus, Check, FileText, PartyPopper, Snowflake, Tag, ArrowRightLeft, LogOut } from 'lucide-react';
import { Alert, Badge, Button, ConfirmFooter, Field, Modal, Select, Textarea } from '@/design-system';
import { useAction, useAsync } from '@/lib/hooks';
import { supabase, must } from '@/lib/supabase';
import type { Catalog } from '@/lib/catalog';
import { WEEKDAYS_LONG, dateLong, dateShort, daysLabel, hhmm, money } from '@/lib/format';
import type { Enrollment, GroupOccupancy, Member, Membership } from '@/lib/types';
import {
  BAJA_MOTIVOS, SKILL_LABEL, nextClassDates, timeLeft,
  type Certificate, type MakeupCredit, type MakeupOption, type ReportCard, type Skill, type SkillProgress, type WaitlistOffer,
} from '@/lib/escuela';

const dayName = (iso: string) => WEEKDAYS_LONG[((new Date(iso + 'T12:00:00').getDay() + 6) % 7) + 1];

// ─────────────────────────────────────────────────────────────
// Reposiciones
// ─────────────────────────────────────────────────────────────

/** Avisar que el alumno faltará a una clase próxima. Si cumple las reglas, gana un crédito para reponerla. */
export function AvisarFaltaModal({ enrollment, group, memberName, onClose, onDone }: {
  enrollment: Enrollment | null; group: GroupOccupancy | undefined; memberName: string; onClose: () => void; onDone: () => void;
}) {
  const dates = group ? nextClassDates(group.weekdays, 6) : [];
  const [date, setDate] = useState('');
  const [reason, setReason] = useState('');
  const [msg, alertMsg] = useState<string | null>(null);
  const { busy, run } = useAction();
  useEffect(() => { if (enrollment) { setDate(dates[0] ?? ''); setReason(''); } }, [enrollment?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    const r = await run(() => must<{ credito: boolean; mensaje: string }>(supabase.rpc('avisar_falta', { p_enrollment: enrollment!.id, p_date: date, p_reason: reason || null })));
    if (r) { onDone(); onClose(); alertMsg(r.mensaje); }
  }
  return (
    <>
      <Modal open={!!enrollment} onClose={onClose} title={`Avisar falta de ${memberName}`}
        footer={<ConfirmFooter onCancel={onClose} onConfirm={save} loading={busy} confirmLabel="Avisar falta" />}>
        <div className="space-y-4">
          <p className="text-base text-fg-muted">Si avisas con tiempo, {memberName} gana un crédito para reponer la clase en otro grupo de su mismo nivel.</p>
          <Field label="¿Qué clase va a faltar?">
            {() => (
              <div className="grid grid-cols-2 gap-2">
                {dates.map((d) => (
                  <button key={d} type="button" onClick={() => setDate(d)}
                    className={`rounded-lg border-2 px-3 py-2 text-left ${date === d ? 'border-primary bg-primary-soft' : 'border-border bg-surface'}`}>
                    <span className="block font-semibold">{dayName(d)}</span>
                    <span className="text-sm text-fg-muted">{dateShort(d)} · {hhmm(group?.start_time)}</span>
                  </button>
                ))}
              </div>
            )}
          </Field>
          <Field label="Motivo">{(p) => <Textarea {...p} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej. Está enfermo" />}</Field>
        </div>
      </Modal>
      <Modal open={!!msg} onClose={() => alertMsg(null)} title="Listo" size="sm" footer={<Button onClick={() => alertMsg(null)}>Entendido</Button>}>
        <p className="text-base">{msg}</p>
      </Modal>
    </>
  );
}

/** Elegir clase para usar un crédito de reposición. */
export function ReponerModal({ credit, memberName, onClose, onDone }: { credit: MakeupCredit | null; memberName: string; onClose: () => void; onDone: () => void }) {
  const { busy, run } = useAction();
  const [pick, setPick] = useState<MakeupOption | null>(null);
  const { data, error, loading } = useAsync(async () => {
    if (!credit) return [] as MakeupOption[];
    return (await must(supabase.rpc('opciones_reposicion', { p_credit: credit.id }))) as MakeupOption[];
  }, [credit?.id]);
  useEffect(() => setPick(null), [credit?.id]);

  async function save() {
    if (!pick) return;
    const r = await run(() => must(supabase.rpc('usar_reposicion', { p_credit: credit!.id, p_group: pick.group_id, p_date: pick.fecha })), 'Reposición agendada');
    if (r) { onDone(); onClose(); }
  }
  return (
    <Modal open={!!credit} onClose={onClose} title={`Reponer clase de ${memberName}`}
      footer={<ConfirmFooter onCancel={onClose} onConfirm={save} loading={busy} confirmLabel="Agendar reposición" />}>
      {credit && <p className="mb-3 text-base text-fg-muted">Crédito por la falta del {dateShort(credit.missed_date)}. Úsalo antes del {dateLong(credit.expires_on)}.</p>}
      {error ? <Alert tone="danger" title="No se pudieron cargar las clases">{error}</Alert>
        : loading ? <p className="text-fg-muted">Buscando lugares…</p>
        : !data?.length ? <Alert tone="info" title="Por ahora no hay lugares libres">Vuelve a revisar en unos días; los lugares se liberan cuando otros alumnos avisan que faltarán.</Alert>
        : (
          <ul className="grid gap-2">
            {data.map((o) => {
              const on = pick?.group_id === o.group_id && pick.fecha === o.fecha;
              return (
                <li key={o.group_id + o.fecha}>
                  <button type="button" onClick={() => setPick(o)}
                    className={`flex w-full items-center justify-between gap-3 rounded-lg border-2 px-3 py-2.5 text-left ${on ? 'border-primary bg-primary-soft' : 'border-border bg-surface'}`}>
                    <span>
                      <span className="block font-semibold">{dayName(o.fecha)} {dateShort(o.fecha)} · {hhmm(o.hora_inicio)}</span>
                      <span className="text-sm text-fg-muted">{o.nivel} · {o.grupo}{o.ubicacion ? ` · ${o.ubicacion}` : ''}</span>
                    </span>
                    <span className="shrink-0 text-sm font-semibold text-success-700">{o.libres} {o.libres === 1 ? 'lugar' : 'lugares'}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
    </Modal>
  );
}

/** Lista de créditos de reposición de unos alumnos, con acciones. */
export function CreditosReposicion({ members, cat, credits, onChanged }: { members: Member[]; cat: Catalog; credits: MakeupCredit[]; onChanged: () => void }) {
  const [use, setUse] = useState<MakeupCredit | null>(null);
  const { busy, run } = useAction();
  const open = credits.filter((c) => c.status === 'disponible' || c.status === 'agendada');
  if (!open.length) return null;
  const name = (id: string) => members.find((m) => m.id === id)?.first_name ?? '';
  const grp = (id: string | null) => cat.groups.find((g) => g.group_id === id);
  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <p className="mb-2 flex items-center gap-2 font-semibold"><CalendarPlus className="h-5 w-5 text-primary" /> Clases por reponer</p>
      <ul className="divide-y divide-border">
        {open.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <div className="min-w-0">
              <p className="font-semibold">{name(c.member_id)} · falta del {dateShort(c.missed_date)}</p>
              {c.status === 'agendada'
                ? <p className="text-sm text-success-700">Repone el {dayName(c.used_date!)} {dateShort(c.used_date)} a las {hhmm(grp(c.used_group_id)?.start_time)} ({grp(c.used_group_id)?.location ?? grp(c.used_group_id)?.name})</p>
                : <p className="text-sm text-fg-muted">Disponible hasta el {dateShort(c.expires_on)}</p>}
            </div>
            {c.status === 'disponible'
              ? <Button size="sm" onClick={() => setUse(c)}>Reponer</Button>
              : <Button size="sm" variant="ghost" loading={busy} onClick={async () => { const r = await run(() => must(supabase.rpc('cancelar_reposicion', { p_credit: c.id })), 'Reposición cancelada; el crédito sigue disponible'); if (r) onChanged(); }}>Cancelar</Button>}
          </li>
        ))}
      </ul>
      <ReponerModal credit={use} memberName={use ? name(use.member_id) : ''} onClose={() => setUse(null)} onDone={onChanged} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Lista de espera: lugar ofrecido
// ─────────────────────────────────────────────────────────────

export function OfertasLugar({ offers, members, cat, onChanged }: { offers: WaitlistOffer[]; members: Member[]; cat: Catalog; onChanged: () => void }) {
  const { busy, run } = useAction();
  const pend = offers.filter((o) => o.status === 'pendiente' && new Date(o.expires_at) > new Date());
  if (!pend.length) return null;
  return (
    <div className="grid gap-3">
      {pend.map((o) => {
        const m = members.find((x) => x.id === o.member_id);
        const g = cat.groups.find((x) => x.group_id === o.group_id);
        return (
          <Alert key={o.id} tone="success" title={`¡Hay lugar para ${m?.first_name ?? 'tu hijo'} en ${g?.level_name ?? 'su clase'}!`}
            action={<div className="flex flex-wrap gap-2">
              <Button size="sm" variant="success" icon={<Check className="h-4 w-4" />} loading={busy} onClick={async () => { const r = await run(() => must(supabase.rpc('responder_oferta', { p_offer: o.id, p_aceptar: true })), '¡Lugar apartado! Ya quedó inscrito.'); if (r) onChanged(); }}>Aceptar lugar</Button>
              <Button size="sm" variant="ghost" loading={busy} onClick={async () => { const r = await run(() => must(supabase.rpc('responder_oferta', { p_offer: o.id, p_aceptar: false })), 'Listo, se lo ofrecemos al siguiente. Sigues en la lista.'); if (r) onChanged(); }}>Ahora no</Button>
            </div>}>
            {g ? `${daysLabel(g.weekdays)} · ${hhmm(g.start_time)}–${hhmm(g.end_time)}${g.location ? ` · ${g.location}` : ''}. ` : ''}
            Tienes {timeLeft(o.expires_at)} para aceptarlo; después pasa al siguiente en la lista.
          </Alert>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Flujo para salvar bajas
// ─────────────────────────────────────────────────────────────

interface Retencion { descuento_pct: number; meses_descuento: number; max_meses_congelar: number }

export function BajaFlowModal({ target, cat, onClose, onDone, portal }: {
  target: { enrollment?: Enrollment; membership?: Membership; memberName: string } | null;
  cat: Catalog; onClose: () => void; onDone: () => void; portal?: boolean;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [reason, setReason] = useState('');
  const [detail, setDetail] = useState('');
  const [months, setMonths] = useState(1);
  const [newGroup, setNewGroup] = useState('');
  const [choice, setChoice] = useState<'congelar' | 'descuento' | 'cambio_grupo' | 'baja' | ''>('');
  const { busy, run } = useAction();
  const { data: rules } = useAsync(async () => {
    const r = (await must(supabase.from('settings').select('value').eq('key', 'retencion').maybeSingle())) as { value: Retencion } | null;
    return r?.value ?? { descuento_pct: 15, meses_descuento: 2, max_meses_congelar: 2 };
  }, []);
  useEffect(() => { if (target) { setStep(1); setReason(''); setDetail(''); setMonths(1); setNewGroup(''); setChoice(''); } }, [target]);

  const e = target?.enrollment;
  const g = e ? cat.groups.find((x) => x.group_id === e.group_id) : undefined;
  const plan = target?.membership ? cat.plans.find((p) => p.id === target.membership!.plan_id) : undefined;
  const others = g ? cat.groups.filter((x) => x.level_id === g.level_id && x.group_id !== g.group_id && x.active && x.free_spots > 0) : [];
  const price = Number(e?.monthly_price ?? target?.membership?.monthly_price ?? 0);
  const pct = rules?.descuento_pct ?? 15;
  const name = target?.memberName ?? '';

  async function confirm() {
    if (!choice) return;
    const r = await run(() => must(supabase.rpc('solicitar_baja', {
      p_enrollment: e?.id ?? null, p_membership: target?.membership?.id ?? null, p_reason: reason, p_detail: detail || null,
      p_choice: choice, p_months: months, p_new_group: choice === 'cambio_grupo' ? newGroup : null,
    })), {
      congelar: `Listo: ${name} queda congelado y conserva su lugar.`,
      descuento: `Listo: se aplicó ${pct}% de descuento por ${rules?.meses_descuento ?? 2} meses.`,
      cambio_grupo: `Listo: ${name} cambió de horario.`,
      baja: 'Baja registrada. Lamentamos que se vaya.',
    }[choice]);
    if (r) { onDone(); onClose(); }
  }

  const Opt = ({ id, icon, title, desc, disabled }: { id: typeof choice; icon: ReactNode; title: string; desc: string; disabled?: boolean }) => (
    <button type="button" disabled={disabled} onClick={() => setChoice(id)}
      className={`flex w-full items-start gap-3 rounded-lg border-2 p-3 text-left disabled:opacity-50 ${choice === id ? 'border-primary bg-primary-soft' : 'border-border bg-surface'}`}>
      <span className="mt-0.5 text-primary">{icon}</span>
      <span><span className="block font-semibold">{title}</span><span className="text-sm text-fg-muted">{desc}</span></span>
    </button>
  );

  return (
    <Modal open={!!target} onClose={onClose} title={step === 1 ? `¿Por qué se va ${name}?` : 'Antes de irte, ¿te sirve alguna de estas opciones?'}
      footer={step === 1
        ? <><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button disabled={!reason} onClick={() => setStep(2)}>Continuar</Button></>
        : <><Button variant="secondary" onClick={() => setStep(1)}>Atrás</Button>
            <Button variant={choice === 'baja' ? 'danger' : 'primary'} disabled={!choice || (choice === 'cambio_grupo' && !newGroup)} loading={busy} onClick={confirm}>
              {choice === 'baja' ? 'Confirmar baja' : 'Aplicar'}
            </Button></>}>
      {step === 1 ? (
        <div className="space-y-4">
          <p className="text-base text-fg-muted">{g ? `${g.level_name} · ${daysLabel(g.weekdays)} ${hhmm(g.start_time)}` : plan?.name}</p>
          <div className="flex flex-wrap gap-2">
            {BAJA_MOTIVOS.map((m) => (
              <button key={m} type="button" onClick={() => setReason(m)}
                className={`rounded-full border-2 px-3.5 py-2 text-base font-semibold ${reason === m ? 'border-primary bg-primary-soft text-primary' : 'border-border bg-surface'}`}>{m}</button>
            ))}
          </div>
          <Field label="¿Algo más que debamos saber?">{(p) => <Textarea {...p} rows={2} value={detail} onChange={(ev) => setDetail(ev.target.value)} />}</Field>
        </div>
      ) : (
        <div className="space-y-3">
          <Opt id="congelar" icon={<Snowflake className="h-5 w-5" />} title="Congelar y guardar su lugar"
            desc={`No se cobra mientras esté congelado y regresa solo en la fecha elegida, con su mismo horario.`} />
          {choice === 'congelar' && (
            <Field label="¿Cuánto tiempo?">{(p) => <Select {...p} value={months} onChange={(ev) => setMonths(Number(ev.target.value))}>
              {Array.from({ length: rules?.max_meses_congelar ?? 2 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n} {n === 1 ? 'mes' : 'meses'}</option>)}
            </Select>}</Field>
          )}
          {price > 0 && <Opt id="descuento" icon={<Tag className="h-5 w-5" />} title={`${pct}% de descuento por ${rules?.meses_descuento ?? 2} meses`}
            desc={`Pagaría ${money(price * (1 - (Number(e?.discount_pct ?? target?.membership?.discount_pct ?? 0) + pct) / 100))} al mes en lugar de ${money(price * (1 - Number(e?.discount_pct ?? target?.membership?.discount_pct ?? 0) / 100))}. Una vez al año.`} />}
          {e && <Opt id="cambio_grupo" icon={<ArrowRightLeft className="h-5 w-5" />} title="Cambiar de horario" disabled={!others.length}
            desc={others.length ? 'Mismo nivel, otro día u hora con lugar disponible.' : 'Por ahora no hay otros horarios con lugar en su nivel.'} />}
          {choice === 'cambio_grupo' && (
            <Field label="Nuevo horario">{(p) => <Select {...p} value={newGroup} onChange={(ev) => setNewGroup(ev.target.value)}>
              <option value="">Elige un horario</option>
              {others.map((o) => <option key={o.group_id} value={o.group_id}>{daysLabel(o.weekdays)} {hhmm(o.start_time)} · {o.location ?? o.name} ({o.free_spots} lugares)</option>)}
            </Select>}</Field>
          )}
          <Opt id="baja" icon={<LogOut className="h-5 w-5" />} title="No, quiero dar de baja"
            desc={portal ? 'Su lugar se ofrecerá a quien esté en lista de espera. Puedes volver a inscribirlo cuando quieras.' : 'Libera el lugar y se ofrece al primero de la lista de espera.'} />
        </div>
      )}
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────
// Avance de habilidades (portal y expediente)
// ─────────────────────────────────────────────────────────────

export function SkillBar({ done, total }: { done: number; total: number }) {
  const pct = total ? Math.round((100 * done) / total) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-sunken" aria-hidden><div className="h-full bg-success-600" style={{ width: `${pct}%` }} /></div>
      <span className="text-sm font-semibold ob-num">{done}/{total}</span>
    </div>
  );
}

export function SkillChip({ status }: { status: SkillProgress['status'] }) {
  const tone = status === 'lograda' ? 'success' : status === 'en_proceso' ? 'warning' : 'neutral';
  const sym = status === 'lograda' ? '✓' : status === 'en_proceso' ? '◐' : '○';
  return <Badge tone={tone} size="sm">{sym} {SKILL_LABEL[status]}</Badge>;
}

/** Avance del alumno en las habilidades de su nivel actual, con boletas y certificados. */
export function AvanceAlumno({ member, levelIds, cat }: { member: Member; levelIds: string[]; cat: Catalog }) {
  const { data } = useAsync(async () => {
    if (!levelIds.length) return null;
    const [skills, prog, cards, certs] = await Promise.all([
      must(supabase.from('skills').select('*').in('level_id', levelIds).eq('active', true).order('sort_order')),
      must(supabase.from('skill_progress').select('*').eq('member_id', member.id)),
      must(supabase.from('report_cards').select('id, title, created_at, achieved, total').eq('member_id', member.id).order('created_at', { ascending: false }).limit(5)),
      must(supabase.from('certificates').select('id, folio, level_id, issued_at').eq('member_id', member.id).order('issued_at', { ascending: false })),
    ]);
    return { skills: skills as Skill[], prog: prog as SkillProgress[], cards: cards as Pick<ReportCard, 'id' | 'title' | 'created_at' | 'achieved' | 'total'>[], certs: certs as Pick<Certificate, 'id' | 'folio' | 'level_id' | 'issued_at'>[] };
  }, [member.id, levelIds.join()]);
  if (!data || (!data.skills.length && !data.cards.length && !data.certs.length)) return null;
  return (
    <div className="mt-4 space-y-3">
      {levelIds.map((lid) => {
        const sk = data.skills.filter((s) => s.level_id === lid);
        if (!sk.length) return null;
        const st = (id: string) => data.prog.find((p) => p.skill_id === id)?.status ?? 'sin_iniciar';
        const done = sk.filter((s) => st(s.id) === 'lograda').length;
        return (
          <details key={lid} className="rounded-lg border border-border p-3">
            <summary className="cursor-pointer list-none">
              <p className="mb-1 flex items-center gap-2 font-semibold"><Award className="h-5 w-5 text-primary" /> Habilidades de {cat.levels.find((l) => l.id === lid)?.name}</p>
              <SkillBar done={done} total={sk.length} />
            </summary>
            <ul className="mt-3 space-y-1.5">
              {sk.map((s) => <li key={s.id} className="flex items-center justify-between gap-2 text-base"><span>{s.name}</span><SkillChip status={st(s.id)} /></li>)}
            </ul>
          </details>
        );
      })}
      {(data.cards.length > 0 || data.certs.length > 0) && (
        <div className="flex flex-wrap gap-2">
          {data.certs.map((c) => (
            <Link key={c.id} to={`/certificado/${c.id}`} className="inline-flex items-center gap-1.5 rounded-full bg-gold-50 px-3 py-1.5 text-sm font-semibold text-gold-800">
              <PartyPopper className="h-4 w-4" /> Certificado {cat.levels.find((l) => l.id === c.level_id)?.name}
            </Link>
          ))}
          {data.cards.map((c) => (
            <Link key={c.id} to={`/boleta/${c.id}`} className="inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-3 py-1.5 text-sm font-semibold text-primary">
              <FileText className="h-4 w-4" /> {c.title}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

