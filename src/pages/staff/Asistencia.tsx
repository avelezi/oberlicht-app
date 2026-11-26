import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Check, X, Clock, FileCheck, UserPlus, CalendarPlus } from 'lucide-react';
import { Alert, Avatar, Badge, Button, Card, EmptyState, Field, Input, PageHeader, Select } from '@/design-system';
import { useAuth } from '@/lib/auth';
import { useAction, useAsync } from '@/lib/hooks';
import { supabase, must } from '@/lib/supabase';
import { useCatalog } from '@/lib/catalog';
import { daysLabel, fullName, hhmm, isoDowMx, todayMx } from '@/lib/format';
import type { Attendance, Member } from '@/lib/types';
import { Area, ErrorBox, HealthFlag, Loading } from '@/components/common';
import type { Lead, MakeupCredit } from '@/lib/escuela';

type Guest = { kind: 'repo'; id: string; name: string; status: string; extra?: string } | { kind: 'prueba'; id: string; name: string; status: string; extra?: string };

type St = Attendance['status'];
const OPTS: { id: St; label: string; icon: typeof Check; on: string }[] = [
  { id: 'presente', label: 'Vino', icon: Check, on: 'bg-success-600 text-white border-success-600' },
  { id: 'ausente', label: 'Faltó', icon: X, on: 'bg-danger-600 text-white border-danger-600' },
  { id: 'retardo', label: 'Tarde', icon: Clock, on: 'bg-warning-600 text-white border-warning-600' },
  { id: 'justificada', label: 'Justificó', icon: FileCheck, on: 'bg-info-600 text-white border-info-600' },
];

/** Pasar lista: un toque por alumno, pensado para usarse en tablet a la orilla de la alberca o del salón. */
export default function Asistencia() {
  const [params, setParams] = useSearchParams();
  const { profile, myAreas } = useAuth();
  const { data: cat, error: catErr } = useCatalog();
  const [date, setDate] = useState(todayMx());
  const [marks, setMarks] = useState<Record<string, St>>({});
  const { busy, run } = useAction();

  const myGroups = useMemo(() => {
    if (!cat) return [];
    const all = cat.groups.filter((g) => g.active && myAreas.includes(g.department));
    const mine = profile?.role === 'coach' ? all.filter((g) => g.coach_id === profile.id) : all;
    return [...mine].sort((a, b) => a.start_time.localeCompare(b.start_time));
  }, [cat, myAreas, profile]);
  const dow = date === todayMx() ? isoDowMx() : ((new Date(date + 'T12:00:00').getDay() + 6) % 7) + 1;
  const todays = myGroups.filter((g) => g.weekdays.includes(dow));
  const groupId = params.get('grupo') ?? todays[0]?.group_id ?? '';
  const group = cat?.groups.find((g) => g.group_id === groupId);

  const { data, error, loading, reload } = useAsync(async () => {
    if (!groupId) return { members: [] as Member[], existing: [] as Attendance[], guests: [] as Guest[] };
    const [enr, att, repos, trials] = await Promise.all([
      must(supabase.from('enrollments').select('members(*)').eq('group_id', groupId).eq('status', 'activa')),
      must(supabase.from('attendance').select('*').eq('group_id', groupId).eq('date', date)),
      must(supabase.from('makeup_credits').select('*, members(first_name, last_name, allergies, medical_notes)').eq('used_group_id', groupId).eq('used_date', date).in('status', ['agendada', 'usada', 'vencida'])),
      must(supabase.from('leads').select('*').eq('trial_group_id', groupId).eq('trial_date', date).in('status', ['prueba_agendada', 'prueba_hecha', 'contactado'])).catch(() => []),
    ]);
    const members = (enr as unknown as { members: Member }[]).map((e) => e.members).sort((a, b) => a.first_name.localeCompare(b.first_name));
    const guests: Guest[] = [
      ...(repos as (MakeupCredit & { members: Member })[]).map((c) => ({ kind: 'repo' as const, id: c.id, name: fullName(c.members), status: c.status === 'usada' ? 'vino' : c.status === 'vencida' ? 'falto' : '', extra: c.members.allergies ?? undefined })),
      ...(trials as Lead[]).map((l) => ({ kind: 'prueba' as const, id: l.id, name: l.child_name ?? l.name, status: l.trial_attended === true ? 'vino' : l.trial_attended === false ? 'falto' : '', extra: l.child_name ? `Mamá/papá: ${l.name}${l.phone ? ` · ${l.phone}` : ''}` : l.phone ?? undefined })),
    ];
    return { members, existing: att as Attendance[], guests };
  }, [groupId, date]);
  const guestAct = useAction();
  async function markGuest(g: Guest, vino: boolean) {
    const r = await guestAct.run(() => g.kind === 'repo'
      ? must(supabase.rpc('marcar_reposicion', { p_credit: g.id, p_asistio: vino }))
      : must(supabase.rpc('resultado_prueba', { p_lead: g.id, p_asistio: vino })), vino ? `${g.name.split(' ')[0]}: vino` : `${g.name.split(' ')[0]}: no vino`);
    if (r) reload();
  }

  useEffect(() => {
    if (!data) return;
    const m: Record<string, St> = {};
    data.existing.forEach((a) => { m[a.member_id] = a.status; });
    setMarks(m);
  }, [data]);

  if (catErr) return <ErrorBox error={catErr} />;
  if (!cat) return <Loading />;
  const members = data?.members ?? [];
  const pending = members.filter((m) => !marks[m.id]).length;
  const alreadySaved = (data?.existing.length ?? 0) > 0;

  async function save() {
    const items = members.map((m) => ({ member_id: m.id, status: marks[m.id] ?? 'ausente' }));
    await run(() => must(supabase.rpc('pasar_asistencia', { p_group: groupId, p_date: date, p_items: items })),
      `Lista guardada: ${items.filter((i) => i.status === 'presente' || i.status === 'retardo').length} de ${items.length} vinieron`);
  }

  return (
    <>
      <PageHeader title="Pasar lista" description="Toca «Vino» o «Faltó» en cada alumno y guarda al final. Puedes corregirla después." />
      <Card className="mb-6">
        <div className="grid gap-4 md:grid-cols-[1fr_200px]">
          <Field label="Grupo">
            {(p) => <Select {...p} value={groupId} onChange={(e) => setParams({ grupo: e.target.value })}>
              {!groupId && <option value="">Elige un grupo</option>}
              {todays.length > 0 && <optgroup label="Hoy">
                {todays.map((g) => <option key={g.group_id} value={g.group_id}>{hhmm(g.start_time)} · {g.level_name} · {g.location ?? ''}</option>)}
              </optgroup>}
              <optgroup label="Todos mis grupos">
                {myGroups.map((g) => <option key={g.group_id} value={g.group_id}>{g.level_name} · {daysLabel(g.weekdays)} {hhmm(g.start_time)}</option>)}
              </optgroup>
            </Select>}
          </Field>
          <Field label="Fecha">{(p) => <Input {...p} type="date" value={date} max={todayMx()} onChange={(e) => setDate(e.target.value)} />}</Field>
        </div>
        {group && <div className="mt-3 flex flex-wrap items-center gap-3 text-base text-fg-muted"><Area code={group.department} /> {daysLabel(group.weekdays)} · {hhmm(group.start_time)}–{hhmm(group.end_time)}</div>}
      </Card>

      {!groupId ? <EmptyState title="No tienes grupos asignados" description="Pide a tu coordinador que te asigne a un grupo." />
        : error ? <ErrorBox error={error} />
        : loading && !data ? <Loading />
        : members.length === 0 && !(data?.guests.length) ? <EmptyState title="Este grupo no tiene alumnos inscritos" />
        : (
          <>
            {(data?.guests.length ?? 0) > 0 && (
              <Card className="mb-4">
                <p className="mb-2 text-lg font-bold">Hoy también vienen</p>
                <ul className="divide-y divide-border">
                  {data!.guests.map((g) => (
                    <li key={g.kind + g.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold">{g.name}</p>
                          {g.kind === 'repo'
                            ? <Badge tone="info" size="sm" icon={<CalendarPlus className="h-3.5 w-3.5" />}>Reposición</Badge>
                            : <Badge tone="brand" size="sm" icon={<UserPlus className="h-3.5 w-3.5" />}>Clase de prueba</Badge>}
                        </div>
                        {g.extra && <p className="text-sm text-fg-muted">{g.extra}</p>}
                      </div>
                      {g.status ? <Badge tone={g.status === 'vino' ? 'success' : 'danger'} size="sm">{g.status === 'vino' ? '✓ Vino' : '✕ No vino'}</Badge> : (
                        <div className="flex gap-2">
                          <Button size="sm" variant="success" loading={guestAct.busy} onClick={() => markGuest(g, true)}>Vino</Button>
                          <Button size="sm" variant="secondary" loading={guestAct.busy} onClick={() => markGuest(g, false)}>No vino</Button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </Card>
            )}
            {alreadySaved && <div className="mb-4"><Alert tone="info" title="Esta lista ya se había guardado">Si cambias algo, vuelve a guardar para corregirla.</Alert></div>}
            <div className="mb-3 flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={() => setMarks(Object.fromEntries(members.map((m) => [m.id, 'presente'])))}>Todos vinieron</Button>
              <Button variant="ghost" size="sm" onClick={() => setMarks({})}>Limpiar</Button>
            </div>
            <ul className="space-y-3">
              {members.map((m) => (
                <li key={m.id}>
                  <Card padded={false} className="p-3 sm:p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <Avatar name={fullName(m)} src={m.photo_url ?? undefined} size={48} />
                        <div className="min-w-0">
                          <p className="text-lg font-semibold">{fullName(m)}</p>
                          <HealthFlag allergies={m.allergies} medical={m.medical_notes} />
                        </div>
                      </div>
                      <div className="grid grid-cols-4 gap-2 sm:flex" role="radiogroup" aria-label={`Asistencia de ${m.first_name}`}>
                        {OPTS.map((o) => {
                          const on = marks[m.id] === o.id;
                          return (
                            <button key={o.id} role="radio" aria-checked={on} onClick={() => setMarks((x) => ({ ...x, [m.id]: o.id }))}
                              className={`flex h-14 min-w-[72px] flex-col items-center justify-center rounded-lg border-2 text-sm font-semibold transition ${on ? o.on : 'border-border-strong bg-surface text-fg hover:bg-surface-sunken'}`}>
                              <o.icon className="h-5 w-5" aria-hidden /> {o.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
            <div className="sticky bottom-0 mt-6 -mx-4 ob-glass border-t border-border px-4 py-4 sm:mx-0 sm:rounded-lg sm:border">
              <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
                <p className="text-base text-fg-muted">{pending > 0 ? `Faltan ${pending} por marcar (se guardarán como «Faltó»)` : '✓ Todos marcados'}</p>
                <Button size="lg" loading={busy} onClick={save} block>Guardar lista</Button>
              </div>
            </div>
          </>
        )}
    </>
  );
}
