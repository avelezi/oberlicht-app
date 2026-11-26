import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ClipboardCheck, Pencil, TrendingUp } from 'lucide-react';
import { Avatar, Button, ConfirmFooter, Field, Modal, PageHeader, Select, StatCard, Table, Textarea } from '@/design-system';
import { useAuth } from '@/lib/auth';
import { useAction, useAsync } from '@/lib/hooks';
import { supabase, must } from '@/lib/supabase';
import { useCatalog, staffName } from '@/lib/catalog';
import { ageLabel, dateShort, daysLabel, fullName, hhmm, rangeLabel } from '@/lib/format';
import type { Enrollment, Level, Member } from '@/lib/types';
import { CapacityBar, EnrollmentBadge, ErrorBox, HealthFlag, Loading, Section } from '@/components/common';
import { GroupModal } from './Niveles';

type Row = Enrollment & { members: Member };

/** Lista del grupo: alumnos inscritos, lista de espera, asistencia y pase de nivel. */
export default function Grupo() {
  const { id } = useParams();
  const nav = useNavigate();
  const { isManager, profile, hasDept, isFrontOffice } = useAuth();
  const { data: cat, reload: reloadCat } = useCatalog();
  const [edit, setEdit] = useState(false);
  const [promote, setPromote] = useState<Member | null>(null);
  const { busy, run } = useAction();

  const { data, error, loading, reload } = useAsync(async () => {
    const [rows, att] = await Promise.all([
      must(supabase.from('enrollments').select('*, members(*)').eq('group_id', id!).in('status', ['activa', 'lista_espera', 'congelada']).order('enrolled_at')),
      must(supabase.from('attendance').select('member_id, status, date').eq('group_id', id!).gte('date', new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10))),
    ]);
    return { rows: rows as Row[], att: att as { member_id: string; status: string; date: string }[] };
  }, [id]);

  if ((loading && !data) || !cat) return <Loading />;
  if (error || !data) return <ErrorBox error={error ?? 'Sin datos'} onRetry={reload} />;
  const g = cat.groups.find((x) => x.group_id === id);
  if (!g) return <ErrorBox error="Este grupo no existe o no tienes acceso." />;
  const level = cat.levels.find((l) => l.id === g.level_id);
  const canEdit = isManager || (profile?.role === 'coordinador' && hasDept(g.department));
  const active = data.rows.filter((r) => r.status === 'activa');
  const waiting = data.rows.filter((r) => r.status === 'lista_espera');
  const frozen = data.rows.filter((r) => r.status === 'congelada');
  const sessions = new Set(data.att.map((a) => a.date)).size;
  const pct = (mid: string) => {
    const mine = data.att.filter((a) => a.member_id === mid);
    if (!mine.length) return null;
    return Math.round((100 * mine.filter((a) => a.status === 'presente' || a.status === 'retardo').length) / mine.length);
  };

  const columns = [
    { key: 'n', header: 'Alumno', cell: (r: Row) => (
      <div className="flex items-center gap-3">
        <Avatar name={fullName(r.members)} size={36} />
        <div>
          <p className="font-semibold">{fullName(r.members)}</p>
          <p className="text-sm text-fg-muted">{ageLabel(r.members.birthdate)}</p>
          <div className="mt-1"><HealthFlag allergies={r.members.allergies} medical={r.members.medical_notes} /></div>
        </div>
      </div>
    ) },
    { key: 'a', header: 'Asistencia (30 días)', hideOnMobile: true, cell: (r: Row) => { const p = pct(r.member_id); return p === null ? '—' : <span className={p < 70 ? 'font-semibold text-warning-700' : 'font-semibold text-success-700'}>{p}%</span>; } },
    { key: 'e', header: 'Desde', hideOnMobile: true, cell: (r: Row) => dateShort(r.enrolled_at) },
    { key: 's', header: 'Estado', cell: (r: Row) => <EnrollmentBadge e={r} /> },
    { key: 'x', header: '', align: 'right' as const, cell: (r: Row) => (
      <div className="flex justify-end gap-1">
        {!isFrontOffice || hasDept(g.department) ? <Button size="sm" variant="ghost" icon={<TrendingUp className="h-4 w-4" />} onClick={() => setPromote(r.members)}>Subir de nivel</Button> : null}
        {isFrontOffice && <Button size="sm" variant="ghost" onClick={() => nav(`/familias/${r.members.family_id}`)}>Expediente</Button>}
      </div>
    ) },
  ];

  return (
    <>
      <PageHeader
        breadcrumb={<button onClick={() => nav('/niveles')} className="inline-flex items-center gap-1 text-sm text-fg-muted hover:text-primary"><ArrowLeft className="h-4 w-4" /> Niveles y grupos</button>}
        title={`${g.level_name} · ${daysLabel(g.weekdays)} ${hhmm(g.start_time)}`}
        description={`${rangeLabel(Number(g.min_age), Number(g.max_age))} · ${g.location ?? 'Sin ubicación'} · Instructor: ${staffName(cat, g.coach_id)}`}
        actions={<>
          {canEdit && <Button variant="secondary" icon={<Pencil className="h-5 w-5" />} onClick={() => setEdit(true)}>Editar grupo</Button>}
          <Button icon={<ClipboardCheck className="h-5 w-5" />} onClick={() => nav(`/asistencia?grupo=${g.group_id}`)}>Pasar lista</Button>
        </>}
      />
      <div className="ob-stats mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        <StatCard label="Inscritos" value={<span className="ob-num">{active.length}/{g.capacity}</span>} hint={<CapacityBar used={active.length} total={g.capacity} />} />
        <StatCard label="Lista de espera" value={waiting.length} hint="Entran solos cuando se libera un lugar" />
        <StatCard label="Clases registradas" value={sessions} hint="Últimos 30 días" />
      </div>
      <div className="space-y-6">
        <Section title="Alumnos inscritos"><Table columns={columns} rows={active} rowKey={(r) => r.id} empty="Aún no hay alumnos en este grupo." /></Section>
        {waiting.length > 0 && <Section title="Lista de espera" description="En orden de llegada."><Table columns={columns} rows={waiting} rowKey={(r) => r.id} /></Section>}
        {frozen.length > 0 && <Section title="Congelados"><Table columns={columns} rows={frozen} rowKey={(r) => r.id} /></Section>}
      </div>
      <GroupModal level={edit ? (level ?? null) : null} groupId={g.group_id} onClose={() => setEdit(false)} cat={cat} onDone={() => { reloadCat(); reload(); }} />
      <PromoteModal member={promote} onClose={() => setPromote(null)} levels={cat.levels.filter((l) => l.department === g.department && l.active)} currentLevel={g.level_id}
        busy={busy} onSave={async (levelId, notes) => {
          const r = await run(() => must(supabase.rpc('subir_nivel', { p_member: promote!.id, p_level: levelId, p_notes: notes || null })), 'Nivel actualizado. Avisamos a la familia para reinscribir.');
          if (r) setPromote(null);
        }} />
    </>
  );
}

function PromoteModal({ member, onClose, levels, currentLevel, onSave, busy }: {
  member: Member | null; onClose: () => void; levels: Level[]; currentLevel: string; onSave: (levelId: string, notes: string) => void; busy: boolean;
}) {
  const idx = levels.findIndex((l) => l.id === currentLevel);
  const [lvl, setLvl] = useState('');
  const [notes, setNotes] = useState('');
  const [last, setLast] = useState<string | null>(null);
  if (member && last !== member.id) { setLast(member.id); setLvl(levels[idx + 1]?.id ?? levels[idx]?.id ?? ''); setNotes(''); }
  return (
    <Modal open={!!member} onClose={onClose} title={`Nuevo nivel para ${member?.first_name ?? ''}`}
      footer={<ConfirmFooter onCancel={onClose} onConfirm={() => onSave(lvl, notes)} loading={busy} confirmLabel="Asignar nivel" />}>
      <div className="space-y-4">
        <Field label="Pasa a" hint="Queda en su historial y la familia recibe aviso para reinscribirlo.">
          {(p) => <Select {...p} value={lvl} onChange={(e) => setLvl(e.target.value)}>
            {levels.map((l) => <option key={l.id} value={l.id}>{l.name} ({rangeLabel(Number(l.min_age), Number(l.max_age))})</option>)}
          </Select>}
        </Field>
        <Field label="Comentario (opcional)">{(p) => <Textarea {...p} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ej. Domina crol y dorso 25 m." />}</Field>
      </div>
    </Modal>
  );
}
