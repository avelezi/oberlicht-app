import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarCheck, CalendarDays, Receipt, UserPlus } from 'lucide-react';
import { Alert, Button, Card, CardHeader, EmptyState, PageHeader } from '@/design-system';
import { useAuth } from '@/lib/auth';
import { useAsync } from '@/lib/hooks';
import { supabase, must } from '@/lib/supabase';
import { useMyFamily } from '@/lib/portal';
import { WEEKDAYS_LONG, dateShort, fullName, hhmm, isoDowMx, money0 } from '@/lib/format';
import type { Announcement, Charge, Enrollment, GroupOccupancy } from '@/lib/types';
import { Area, ErrorBox, Loading } from '@/components/common';
import { FamilyFormModal } from '@/components/FamilyForms';
import logoClaro from '@/design-system/assets/oberlicht-logo-fondo-claro.png';

/** Inicio del portal de familias. Si aún no hay familia registrada, guía el alta en un paso. */
export default function PortalInicio() {
  const nav = useNavigate();
  const { profile } = useAuth();
  const { data: mine, error, loading, reload } = useMyFamily();
  const [creating, setCreating] = useState(false);

  const { data } = useAsync(async () => {
    if (!mine?.fam) return null;
    const mids = mine.members.map((m) => m.id);
    const [charges, enr, avisos] = await Promise.all([
      must(supabase.from('charges').select('*').eq('family_id', mine.fam.id).in('status', ['pendiente', 'vencido']).order('due_date')),
      mids.length ? must(supabase.from('enrollments').select('*').in('member_id', mids).in('status', ['activa', 'lista_espera'])) : [],
      must(supabase.from('announcements').select('*').in('audience', ['todos', 'familias']).order('starts_on', { ascending: false }).limit(5)),
    ]);
    const gids = (enr as Enrollment[]).map((e) => e.group_id);
    const groups = gids.length ? ((await must(supabase.from('group_occupancy').select('*').in('group_id', gids))) as GroupOccupancy[]) : [];
    return { charges: charges as Charge[], enr: enr as Enrollment[], avisos: avisos as Announcement[], groups };
  }, [mine?.fam?.id]);

  if (loading && !mine) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;

  if (!mine?.fam) {
    return (
      <div className="mx-auto max-w-xl py-8 text-center">
        <img src={logoClaro} alt="Oberlicht" className="mx-auto mb-6 h-16 w-auto" />
        <h1 className="text-3xl font-bold">¡Bienvenida, bienvenido!</h1>
        <p className="mt-3 text-lg text-fg-muted">Para inscribir a tus hijos, reservar y pagar en línea, primero registra a tu familia. Toma un par de minutos.</p>
        <Button size="xl" className="mt-8" icon={<UserPlus className="h-6 w-6" />} onClick={() => setCreating(true)}>Registrar a mi familia</Button>
        <p className="mt-4 text-sm text-fg-muted">¿Ya eres socio? Pide en recepción que vinculen tu cuenta ({profile?.email}) con tu familia.</p>
        <FamilyFormModal open={creating} onClose={() => setCreating(false)} titularProfileId={profile?.id} onSaved={() => { reload(); nav('/mi-cuenta'); }} />
      </div>
    );
  }

  const { fam, members } = mine;
  const balance = (data?.charges ?? []).reduce((s, c) => s + Number(c.amount), 0);
  const overdue = (data?.charges ?? []).some((c) => c.status === 'vencido');
  const today = isoDowMx();
  const upcoming = (data?.enr ?? []).filter((e) => e.status === 'activa').flatMap((e) => {
    const g = data!.groups.find((x) => x.group_id === e.group_id);
    const m = members.find((x) => x.id === e.member_id);
    if (!g || !m) return [];
    const next = [...g.weekdays].sort((a, b) => ((a - today + 7) % 7) - ((b - today + 7) % 7))[0];
    return [{ e, g, m, next, inDays: (next - today + 7) % 7 }];
  }).sort((a, b) => a.inDays - b.inDays || a.g.start_time.localeCompare(b.g.start_time));

  return (
    <>
      <PageHeader title={`Hola, ${members.find((m) => m.is_titular)?.first_name ?? fam.name}`} description={`${fam.name} · Socio #${fam.number}`} />
      <div className="mb-6 grid gap-3">
        {balance > 0 && (
          <Alert tone={overdue ? 'danger' : 'warning'} title={overdue ? `Tienes ${money0(balance)} vencido` : `Tienes ${money0(balance)} por pagar`}
            action={<Button variant="secondary" size="sm" onClick={() => nav('/mis-pagos')}>Ver pagos</Button>}>
            {overdue ? 'Mientras haya un adeudo vencido no se pueden hacer reservas. Puedes pagar en recepción.' : `Vence el ${dateShort(data!.charges[0].due_date)}.`}
          </Alert>
        )}
        {members.length <= 1 && <Alert tone="info" title="Agrega a tus hijos" action={<Button size="sm" variant="secondary" onClick={() => nav('/mi-cuenta')}>Agregar</Button>}>Así podrás inscribirlos a natación, ballet o gimnasia.</Alert>}
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader title="Próximas clases" actions={<Button variant="ghost" size="sm" onClick={() => nav('/mis-clases')}>Ver todo</Button>} />
          {upcoming.length === 0 ? (
            <EmptyState icon={<CalendarDays className="h-8 w-8" />} title="Aún no hay inscripciones" action={<Button onClick={() => nav('/mis-clases')}>Inscribir a una clase</Button>} />
          ) : (
            <ul className="divide-y divide-border">
              {upcoming.slice(0, 6).map(({ e, g, m, next, inDays }) => (
                <li key={e.id} className="flex items-center justify-between gap-3 py-3">
                  <div>
                    <p className="text-base font-semibold">{fullName(m)} · {g.level_name}</p>
                    <div className="mt-0.5 flex items-center gap-2 text-sm text-fg-muted"><Area code={g.department} /> {g.location}</div>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">{inDays === 0 ? 'Hoy' : inDays === 1 ? 'Mañana' : WEEKDAYS_LONG[next]}</p>
                    <p className="text-sm text-fg-muted ob-num">{hhmm(g.start_time)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <div className="space-y-6">
          <div className="grid grid-cols-3 gap-3">
            {[{ l: 'Reservar', i: CalendarCheck, h: '/reservas' }, { l: 'Clases', i: CalendarDays, h: '/mis-clases' }, { l: 'Pagos', i: Receipt, h: '/mis-pagos' }].map((q) => (
              <button key={q.l} onClick={() => nav(q.h)} className="flex min-h-[88px] flex-col items-center justify-center gap-2 rounded-lg border border-border bg-surface text-base font-semibold hover:bg-primary-soft">
                <q.i className="h-6 w-6 text-primary" /> {q.l}
              </button>
            ))}
          </div>
          <Card>
            <CardHeader title="Avisos del club" />
            {(data?.avisos ?? []).length === 0 ? <p className="text-base text-fg-muted">Sin avisos por ahora.</p> : (
              <ul className="space-y-3">{data!.avisos.map((a) => <li key={a.id}><p className="font-semibold">{a.title}</p><p className="text-sm text-fg-muted">{a.body}</p></li>)}</ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
