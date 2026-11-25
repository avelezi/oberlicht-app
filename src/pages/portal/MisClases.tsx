import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GraduationCap } from 'lucide-react';
import { Button, Card, EmptyState, PageHeader } from '@/design-system';
import { useAuth, deptName } from '@/lib/auth';
import { useAsync } from '@/lib/hooks';
import { supabase, must } from '@/lib/supabase';
import { useCatalog } from '@/lib/catalog';
import { useMyFamily } from '@/lib/portal';
import { ageLabel, dateShort, daysLabel, fullName, hhmm, money } from '@/lib/format';
import type { DeptCode, Enrollment } from '@/lib/types';
import { Area, EnrollmentBadge, ErrorBox, Loading } from '@/components/common';
import { InscribirModal } from '@/components/FamilyForms';

type Note = { id: string; member_id: string; department: DeptCode; note: string; created_at: string };
type Hist = { id: string; member_id: string; level_id: string; created_at: string; notes: string | null };

/** Portal: inscripciones de cada hijo, su nivel y las notas de avance de los instructores. */
export default function MisClases() {
  const nav = useNavigate();
  const { allDepartments } = useAuth();
  const { data: mine, error } = useMyFamily();
  const { data: cat } = useCatalog();
  const [inscribir, setInscribir] = useState<string | null>(null);

  const { data, reload } = useAsync(async () => {
    const mids = mine?.members.map((m) => m.id) ?? [];
    if (!mids.length) return { enr: [] as Enrollment[], notes: [] as Note[], hist: [] as Hist[] };
    const [enr, notes, hist] = await Promise.all([
      must(supabase.from('enrollments').select('*').in('member_id', mids).neq('status', 'baja').order('enrolled_at', { ascending: false })),
      must(supabase.from('progress_notes').select('id, member_id, department, note, created_at').in('member_id', mids).order('created_at', { ascending: false }).limit(20)),
      must(supabase.from('level_history').select('id, member_id, level_id, created_at, notes').in('member_id', mids).order('created_at', { ascending: false })),
    ]);
    return { enr: enr as Enrollment[], notes: notes as Note[], hist: hist as Hist[] };
  }, [mine?.members.map((m) => m.id).join()]);

  if (error) return <ErrorBox error={error} />;
  if (!mine || !cat || !data) return <Loading />;
  if (!mine.fam) { nav('/'); return null; }

  return (
    <>
      <PageHeader title="Clases e inscripciones" description="Solo verás los grupos que corresponden a la edad de cada quien."
        actions={<Button icon={<GraduationCap className="h-5 w-5" />} onClick={() => setInscribir(mine.members[0]?.id ?? '')} disabled={!mine.members.length}>Inscribir</Button>} />
      {mine.members.length === 0 ? <EmptyState title="Primero agrega a tus hijos" action={<Button onClick={() => nav('/mi-cuenta')}>Ir a Mi familia</Button>} /> : (
        <div className="grid gap-4 lg:grid-cols-2">
          {mine.members.map((m) => {
            const enr = data.enr.filter((e) => e.member_id === m.id);
            const notes = data.notes.filter((n) => n.member_id === m.id).slice(0, 3);
            const lastLevel = data.hist.find((h) => h.member_id === m.id);
            return (
              <Card key={m.id}>
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xl font-bold">{fullName(m)}</p>
                    <p className="text-base text-fg-muted">{ageLabel(m.birthdate)}</p>
                  </div>
                  <Button size="sm" variant="secondary" onClick={() => setInscribir(m.id)}>Inscribir</Button>
                </div>
                {lastLevel && <p className="mb-3 rounded-md bg-success-50 px-3 py-2 text-sm text-success-700">★ Nuevo nivel: <strong>{cat.levels.find((l) => l.id === lastLevel.level_id)?.name}</strong> desde el {dateShort(lastLevel.created_at)}</p>}
                {enr.length === 0 ? <p className="text-base text-fg-muted">Sin clases todavía.</p> : (
                  <ul className="space-y-3">
                    {enr.map((e) => { const g = cat.groups.find((x) => x.group_id === e.group_id); return (
                      <li key={e.id} className="rounded-md border border-border p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2"><Area code={g?.department} /><span className="font-semibold">{g?.level_name}</span></div>
                          <EnrollmentBadge e={e} />
                        </div>
                        <p className="mt-1 text-base">{g ? `${daysLabel(g.weekdays)} · ${hhmm(g.start_time)}–${hhmm(g.end_time)} · ${g.location ?? ''}` : ''}</p>
                        <p className="text-sm text-fg-muted">{money(e.monthly_price)} al mes{Number(e.discount_pct) > 0 ? ` (−${Number(e.discount_pct)}% por hermanos)` : ''}</p>
                        {e.status === 'lista_espera' && <p className="mt-1 text-sm text-info-700">Te avisamos en cuanto se libere un lugar.</p>}
                      </li>
                    ); })}
                  </ul>
                )}
                {notes.length > 0 && (
                  <div className="mt-4">
                    <p className="mb-1 text-sm font-semibold text-fg-muted">Comentarios de sus instructores</p>
                    {notes.map((n) => <p key={n.id} className="mb-1 rounded-md bg-surface-sunken px-3 py-2 text-sm"><strong>{deptName(allDepartments, n.department)} · {dateShort(n.created_at)}:</strong> {n.note}</p>)}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
      <InscribirModal open={inscribir !== null} onClose={() => setInscribir(null)} members={mine.members} cat={cat} defaultMemberId={inscribir ?? undefined} onDone={reload} />
    </>
  );
}
