import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarCheck } from 'lucide-react';
import { Alert, Button, Card, EmptyState, Field, PageHeader, Segmented, Select, StatusBadge } from '@/design-system';
import { useAction, useAsync } from '@/lib/hooks';
import { supabase, must } from '@/lib/supabase';
import { useMyFamily } from '@/lib/portal';
import { dateLong, fullName, money0, timeOnly } from '@/lib/format';
import type { Booking, Slot } from '@/lib/types';
import { Area, ErrorBox, Loading } from '@/components/common';

type S = Slot & { bookings: { id: string; status: string }[] };
type MyB = Booking & { slots: Slot };

const mxDate = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });

/** Portal: reservar clases con cupo o sesiones (Oberfit, terapia, nutrición) y ver/cancelar mis reservas. */
export default function Reservar() {
  const nav = useNavigate();
  const { data: mine, error } = useMyFamily();
  const [who, setWho] = useState('');
  const [view, setView] = useState('reservar');
  const { busy, run } = useAction();

  const { data, reload } = useAsync(async () => {
    const until = new Date(Date.now() + 14 * 864e5).toISOString();
    const [slots, rules] = await Promise.all([
      must(supabase.from('slots').select('*, bookings(id, status)').eq('cancelled', false).gte('starts_at', new Date().toISOString()).lte('starts_at', until).order('starts_at')),
      must(supabase.from('settings').select('value').eq('key', 'reservas').maybeSingle()),
    ]);
    const mids = mine?.members.map((m) => m.id) ?? [];
    const myB = mids.length ? ((await must(supabase.from('bookings').select('*, slots(*)').in('member_id', mids).eq('status', 'reservada').order('created_at', { ascending: false }))) as MyB[]) : [];
    return { slots: slots as S[], myB, hours: Number((rules as { value: { horas_cancelacion?: number } } | null)?.value?.horas_cancelacion ?? 12) };
  }, [mine?.fam?.id]);

  if (error) return <ErrorBox error={error} />;
  if (!mine || !data) return <Loading />;
  if (!mine.fam) { nav('/'); return null; }
  const memberId = who || mine.members[0]?.id || '';
  const member = mine.members.find((m) => m.id === memberId);
  const days = [...new Set(data.slots.map((s) => mxDate(s.starts_at)))];
  const upcomingMine = data.myB.filter((b) => b.slots && new Date(b.slots.starts_at) > new Date()).sort((a, b) => a.slots.starts_at.localeCompare(b.slots.starts_at));

  async function book(s: S) {
    const r = await run(() => must(supabase.rpc('reservar', { p_slot: s.id, p_member: memberId })), `Listo: ${s.title} reservado para ${member?.first_name}`);
    if (r) reload();
  }
  async function cancel(b: MyB) {
    const r = await run(() => must(supabase.rpc('cancelar_reserva', { p_booking: b.id })), 'Reserva cancelada');
    if (r) reload();
  }

  return (
    <>
      <PageHeader title="Reservar" description={`Puedes reservar hasta 14 días antes. Cancela con al menos ${data.hours} horas para no perder la sesión.`} />
      <div className="mb-6 flex flex-wrap items-end gap-4">
        <Segmented value={view} onChange={setView} options={[{ id: 'reservar', label: 'Horarios disponibles' }, { id: 'mias', label: `Mis reservas (${upcomingMine.length})` }]} />
        {view === 'reservar' && mine.members.length > 1 && (
          <div className="w-64"><Field label="Reservar para">{(p) => <Select {...p} value={memberId} onChange={(e) => setWho(e.target.value)}>
            {mine.members.map((m) => <option key={m.id} value={m.id}>{fullName(m)}</option>)}</Select>}</Field></div>
        )}
      </div>
      {mine.fam.status === 'bloqueada' && <div className="mb-4"><Alert tone="danger" title="Reservas en pausa por adeudo">Liquida tu saldo en recepción para volver a reservar.</Alert></div>}

      {view === 'mias' ? (
        upcomingMine.length === 0 ? <EmptyState icon={<CalendarCheck className="h-8 w-8" />} title="No tienes reservas próximas" /> : (
          <div className="grid gap-3 md:grid-cols-2">
            {upcomingMine.map((b) => {
              const m = mine.members.find((x) => x.id === b.member_id);
              const late = new Date(b.slots.starts_at).getTime() - Date.now() < data.hours * 3600e3;
              return (
                <Card key={b.id}>
                  <p className="text-lg font-bold">{b.slots.title}</p>
                  <p className="text-base capitalize">{dateLong(b.slots.starts_at)} · {timeOnly(b.slots.starts_at)}</p>
                  <p className="text-sm text-fg-muted">{m ? fullName(m) : ''} · {b.slots.location ?? ''}</p>
                  <div className="mt-3 flex items-center gap-3">
                    <Button variant="secondary" size="sm" loading={busy} onClick={() => cancel(b)}>Cancelar reserva</Button>
                    {late && b.used_session && <span className="text-sm text-warning-700">! Ya pasó el límite: la sesión no se devuelve</span>}
                  </div>
                </Card>
              );
            })}
          </div>
        )
      ) : days.length === 0 ? (
        <EmptyState icon={<CalendarCheck className="h-8 w-8" />} title="No hay horarios abiertos por ahora" description="El club publica los horarios cada semana." />
      ) : (
        <div className="space-y-6">
          {days.map((d) => (
            <section key={d}>
              <h2 className="mb-3 text-lg font-bold capitalize">{dateLong(d)}</h2>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {data.slots.filter((s) => mxDate(s.starts_at) === d).map((s) => {
                  const taken = s.bookings.filter((b) => b.status !== 'cancelada').length;
                  const left = s.capacity - taken;
                  const already = data.myB.some((b) => b.slot_id === s.id && b.member_id === memberId);
                  return (
                    <Card key={s.id}>
                      <p className="text-lg font-bold ob-num">{timeOnly(s.starts_at)} · {s.title}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-fg-muted"><Area code={s.department} /> {s.location}{Number(s.price) > 0 ? ` · ${money0(s.price)}` : ''}</div>
                      <p className={`mt-2 text-sm font-semibold ${left > 0 ? 'text-success-700' : 'text-danger-700'}`}>{left > 0 ? `${left} ${left === 1 ? 'lugar' : 'lugares'}` : 'Lleno'}</p>
                      <div className="mt-3">
                        {already ? <StatusBadge status="activo" label="Ya reservaste" /> :
                          <Button block loading={busy} disabled={left <= 0 || mine.fam!.status === 'bloqueada'} onClick={() => book(s)}>Reservar{member && mine.members.length > 1 ? ` para ${member.first_name}` : ''}</Button>}
                      </div>
                    </Card>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
