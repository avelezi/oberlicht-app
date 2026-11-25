import { useNavigate } from 'react-router-dom';
import { CalendarCheck, ClipboardCheck, Users } from 'lucide-react';
import { Button, Card, EmptyState, PageHeader } from '@/design-system';
import { useAuth } from '@/lib/auth';
import { useAsync } from '@/lib/hooks';
import { supabase, must } from '@/lib/supabase';
import { hhmm, weekdayLong } from '@/lib/format';
import type { AgendaItem, Announcement } from '@/lib/types';
import { Area, CapacityBar, ErrorBox, Loading } from '@/components/common';

/** Inicio del instructor: sus clases y sesiones de hoy, con acceso directo a pasar lista. */
export default function MiDia() {
  const nav = useNavigate();
  const { profile } = useAuth();
  const { data, error, loading, reload } = useAsync(async () => {
    const [agenda, avisos] = await Promise.all([
      must(supabase.rpc('mi_agenda', {})),
      must(supabase.from('announcements').select('*').in('audience', ['todos', 'personal']).order('starts_on', { ascending: false }).limit(3)),
    ]);
    return { agenda: agenda as AgendaItem[], avisos: avisos as Announcement[] };
  }, []);
  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  const { agenda, avisos } = data!;
  const now = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Mexico_City' });

  return (
    <>
      <PageHeader title={`Hola, ${profile?.full_name?.split(' ')[0] ?? ''}`} description={<span className="capitalize">{weekdayLong()}</span>} />
      {avisos.map((a) => (
        <Card key={a.id} className="mb-4 border-l-4 border-l-primary"><p className="font-bold">{a.title}</p><p className="text-base text-fg-muted">{a.body}</p></Card>
      ))}
      <h2 className="mb-3 text-xl font-bold">Tus clases de hoy</h2>
      {agenda.length === 0 ? (
        <EmptyState icon={<CalendarCheck className="h-8 w-8" />} title="Hoy no tienes clases asignadas" description="Si crees que es un error, avisa a tu coordinador."
          action={<Button variant="secondary" onClick={() => nav('/clases')}>Ver horario completo</Button>} />
      ) : (
        <ul className="space-y-3">
          {agenda.map((a) => {
            const isNow = hhmm(a.starts) <= now && now <= hhmm(a.ends);
            const past = hhmm(a.ends) < now;
            return (
              <li key={a.kind + a.ref_id}>
                <Card className={isNow ? 'border-2 border-primary' : past ? 'opacity-70' : undefined}>
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                    <div className="w-28 shrink-0">
                      <p className="text-2xl font-bold ob-num">{hhmm(a.starts)}</p>
                      <p className="text-base text-fg-muted ob-num">a {hhmm(a.ends)}</p>
                      {isNow && <p className="text-sm font-bold text-primary">● Ahora</p>}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-lg font-semibold">{a.title}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-base text-fg-muted"><Area code={a.department} /> {a.location}</div>
                      <div className="mt-2 max-w-xs"><CapacityBar used={a.people} total={a.capacity} /></div>
                    </div>
                    {a.kind === 'grupo' ? (
                      <div className="flex gap-2">
                        <Button variant="secondary" icon={<Users className="h-5 w-5" />} onClick={() => nav(`/grupos/${a.ref_id}`)}>Alumnos</Button>
                        <Button size="lg" icon={<ClipboardCheck className="h-5 w-5" />} onClick={() => nav(`/asistencia?grupo=${a.ref_id}`)}>Pasar lista</Button>
                      </div>
                    ) : <Button variant="secondary" onClick={() => nav('/reservas')}>Ver reservas</Button>}
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
