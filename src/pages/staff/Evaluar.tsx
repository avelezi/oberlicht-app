import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Award, FileText, ListChecks, Plus } from 'lucide-react';
import { Alert, Avatar, Button, Card, ConfirmFooter, EmptyState, Field, Input, Modal, PageHeader, Select, Switch, Textarea } from '@/design-system';
import { useAuth } from '@/lib/auth';
import { useAction, useAsync } from '@/lib/hooks';
import { supabase, must } from '@/lib/supabase';
import { useCatalog } from '@/lib/catalog';
import { daysLabel, fullName, hhmm, isoDowMx, rangeLabel } from '@/lib/format';
import type { Level, Member } from '@/lib/types';
import { Area, ErrorBox, Loading } from '@/components/common';
import { SkillBar } from '@/components/Escuela';
import { SKILL_LABEL, SKILL_NEXT, type Skill, type SkillProgress, type SkillStatus } from '@/lib/escuela';

const CHIP: Record<SkillStatus, string> = {
  sin_iniciar: 'border-border-strong bg-surface text-fg-muted',
  en_proceso: 'border-warning-600 bg-warning-50 text-warning-700',
  lograda: 'border-success-600 bg-success-600 text-white',
};
const SYM: Record<SkillStatus, string> = { sin_iniciar: '○', en_proceso: '◐', lograda: '✓' };

/** Evaluar habilidades: el coach toca cada habilidad para marcar su avance; luego emite boleta o certificado. */
export default function Evaluar() {
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const { profile, myAreas, isManager, hasDept } = useAuth();
  const { data: cat, error: catErr } = useCatalog();
  const [changes, setChanges] = useState<Record<string, SkillStatus>>({});
  const [boleta, setBoleta] = useState<Member | null>(null);
  const [cert, setCert] = useState<Member | null>(null);
  const [editSkills, setEditSkills] = useState(false);
  const { busy, run } = useAction();

  const myGroups = useMemo(() => {
    if (!cat) return [];
    const all = cat.groups.filter((g) => g.active && myAreas.includes(g.department) && ['natacion', 'ballet', 'gimnasia'].includes(g.department));
    const mine = profile?.role === 'coach' ? all.filter((g) => g.coach_id === profile.id) : all;
    return [...mine].sort((a, b) => a.department.localeCompare(b.department) || a.level_name.localeCompare(b.level_name) || a.start_time.localeCompare(b.start_time));
  }, [cat, myAreas, profile]);
  const today = myGroups.filter((g) => g.weekdays.includes(isoDowMx()));
  const groupId = params.get('grupo') ?? today[0]?.group_id ?? myGroups[0]?.group_id ?? '';
  const group = cat?.groups.find((g) => g.group_id === groupId);

  const { data, error, loading, reload } = useAsync(async () => {
    if (!group) return null;
    const [enr, skills] = await Promise.all([
      must(supabase.from('enrollments').select('members(*)').eq('group_id', group.group_id).eq('status', 'activa')),
      must(supabase.from('skills').select('*').eq('level_id', group.level_id).order('sort_order').order('name')),
    ]);
    const members = (enr as unknown as { members: Member }[]).map((e) => e.members).sort((a, b) => a.first_name.localeCompare(b.first_name));
    const sk = skills as Skill[];
    const prog = members.length && sk.length
      ? ((await must(supabase.from('skill_progress').select('*').in('member_id', members.map((m) => m.id)).in('skill_id', sk.map((s) => s.id)))) as SkillProgress[])
      : [];
    return { members, skills: sk, prog };
  }, [group?.group_id]);
  useEffect(() => setChanges({}), [data]);

  if (catErr) return <ErrorBox error={catErr} />;
  if (!cat) return <Loading />;
  const level = cat.levels.find((l) => l.id === group?.level_id);
  const canEditSkills = !!group && (isManager || (profile?.role === 'coordinador' && hasDept(group.department)));
  const activeSkills = data?.skills.filter((s) => s.active) ?? [];
  const status = (mid: string, sid: string): SkillStatus => changes[`${mid}:${sid}`] ?? data?.prog.find((p) => p.member_id === mid && p.skill_id === sid)?.status ?? 'sin_iniciar';
  const nChanges = Object.keys(changes).length;

  async function save() {
    const items = Object.entries(changes).map(([k, st]) => { const [member_id, skill_id] = k.split(':'); return { member_id, skill_id, status: st }; });
    const r = await run(() => must(supabase.rpc('evaluar_habilidades', { p_items: items })), `Evaluación guardada (${items.length} ${items.length === 1 ? 'cambio' : 'cambios'})`);
    if (r !== undefined) reload();
  }

  return (
    <>
      <PageHeader title="Evaluar habilidades" description="Toca cada habilidad para marcarla: sin iniciar → en proceso → lograda. Las familias ven el avance en su portal."
        actions={canEditSkills ? <Button variant="secondary" icon={<ListChecks className="h-5 w-5" />} onClick={() => setEditSkills(true)}>Habilidades del nivel</Button> : undefined} />
      <Card className="mb-6">
        <Field label="Grupo">
          {(p) => <Select {...p} value={groupId} onChange={(e) => setParams({ grupo: e.target.value })}>
            {!groupId && <option value="">Elige un grupo</option>}
            {myGroups.map((g) => <option key={g.group_id} value={g.group_id}>{g.level_name} · {daysLabel(g.weekdays)} {hhmm(g.start_time)}{g.location ? ` · ${g.location}` : ''}</option>)}
          </Select>}
        </Field>
        {group && <div className="mt-3 flex flex-wrap items-center gap-3 text-base text-fg-muted"><Area code={group.department} /> {level?.name} · {rangeLabel(Number(group.min_age), Number(group.max_age))}</div>}
      </Card>

      {!groupId ? <EmptyState title="No tienes grupos de natación, ballet o gimnasia" description="Pide a tu coordinador que te asigne a un grupo." />
        : error ? <ErrorBox error={error} onRetry={reload} />
        : loading && !data ? <Loading />
        : !data ? null
        : activeSkills.length === 0 ? (
          <EmptyState icon={<ListChecks className="h-8 w-8" />} title="Este nivel aún no tiene habilidades"
            description={canEditSkills ? 'Agrega la lista de habilidades que se evalúan en este nivel.' : 'Pide a tu coordinador que cargue la lista de habilidades del nivel.'}
            action={canEditSkills ? <Button icon={<Plus className="h-5 w-5" />} onClick={() => setEditSkills(true)}>Agregar habilidades</Button> : undefined} />
        ) : data.members.length === 0 ? <EmptyState title="Este grupo no tiene alumnos inscritos" />
        : (
          <>
            {data.skills.some((s) => s.is_example) && canEditSkills && (
              <div className="mb-4"><Alert tone="info" title="Habilidades de ejemplo">Este nivel trae una lista inicial. Ajústala con «Habilidades del nivel» para que sea la del club.</Alert></div>
            )}
            <div className="grid gap-4 lg:grid-cols-2">
              {data.members.map((m) => {
                const done = activeSkills.filter((s) => status(m.id, s.id) === 'lograda').length;
                const all = done === activeSkills.length;
                return (
                  <Card key={m.id}>
                    <div className="mb-3 flex items-center gap-3">
                      <Avatar name={fullName(m)} src={m.photo_url ?? undefined} size={44} />
                      <div className="min-w-0 flex-1">
                        <p className="text-lg font-semibold">{fullName(m)}</p>
                        <SkillBar done={done} total={activeSkills.length} />
                      </div>
                    </div>
                    <ul className="space-y-2">
                      {activeSkills.map((s) => {
                        const st = status(m.id, s.id);
                        return (
                          <li key={s.id}>
                            <button type="button" onClick={() => setChanges((c) => ({ ...c, [`${m.id}:${s.id}`]: SKILL_NEXT[st] }))}
                              className={`flex min-h-[48px] w-full items-center justify-between gap-3 rounded-lg border-2 px-3 py-2 text-left transition ${CHIP[st]}`}
                              aria-label={`${s.name}: ${SKILL_LABEL[st]}. Toca para cambiar.`}>
                              <span className="font-medium">{s.name}</span>
                              <span className="shrink-0 text-sm font-semibold">{SYM[st]} {SKILL_LABEL[st]}</span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button size="sm" variant="secondary" icon={<FileText className="h-4 w-4" />} onClick={() => setBoleta(m)} disabled={nChanges > 0}>Boleta</Button>
                      <Button size="sm" variant={all ? 'accent' : 'ghost'} icon={<Award className="h-4 w-4" />} onClick={() => setCert(m)} disabled={nChanges > 0}>
                        {all ? 'Certificado y nuevo nivel' : 'Certificado'}
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>
            <div className="sticky bottom-0 mt-6 -mx-4 ob-glass border-t border-border px-4 py-4 sm:mx-0 sm:rounded-lg sm:border">
              <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
                <p className="text-base text-fg-muted">{nChanges ? `${nChanges} ${nChanges === 1 ? 'cambio' : 'cambios'} sin guardar` : 'Todo guardado'}</p>
                <Button size="lg" loading={busy} disabled={!nChanges} onClick={save} block>Guardar evaluación</Button>
              </div>
            </div>
          </>
        )}

      <BoletaModal member={boleta} levelId={group?.level_id ?? ''} groupId={groupId} onClose={() => setBoleta(null)} onDone={(id) => nav(`/boleta/${id}`)} />
      <CertModal member={cert} level={level} levels={cat.levels.filter((l) => l.department === group?.department && l.active)} onClose={() => setCert(null)} onDone={(id) => nav(`/certificado/${id}`)} />
      {level && <SkillsEditor open={editSkills} level={level} skills={data?.skills ?? []} onClose={() => setEditSkills(false)} onDone={reload} />}
    </>
  );
}

function BoletaModal({ member, levelId, groupId, onClose, onDone }: { member: Member | null; levelId: string; groupId: string; onClose: () => void; onDone: (id: string) => void }) {
  const [comment, setComment] = useState('');
  const { busy, run } = useAction();
  useEffect(() => setComment(''), [member?.id]);
  return (
    <Modal open={!!member} onClose={onClose} title={`Boleta de ${member?.first_name ?? ''}`}
      footer={<ConfirmFooter onCancel={onClose} loading={busy} confirmLabel="Emitir boleta" onConfirm={async () => {
        const r = await run(() => must<{ id: string }>(supabase.rpc('emitir_boleta', { p_member: member!.id, p_level: levelId, p_comment: comment || null, p_group: groupId || null })), 'Boleta emitida. La familia ya la puede ver.');
        if (r) { onClose(); onDone(r.id); }
      }} />}>
      <p className="mb-3 text-base text-fg-muted">La boleta guarda cómo va en cada habilidad hoy, su asistencia de los últimos 3 meses y tu comentario.</p>
      <Field label="Comentario para la familia">{(p) => <Textarea {...p} rows={4} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Ej. Avanzó mucho en su respiración. Practicar flotación en casa." />}</Field>
    </Modal>
  );
}

function CertModal({ member, level, levels, onClose, onDone }: { member: Member | null; level: Level | undefined; levels: Level[]; onClose: () => void; onDone: (id: string) => void }) {
  const idx = levels.findIndex((l) => l.id === level?.id);
  const [next, setNext] = useState('');
  const [notes, setNotes] = useState('');
  const { busy, run } = useAction();
  useEffect(() => { setNext(levels[idx + 1]?.id ?? ''); setNotes(''); }, [member?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Modal open={!!member} onClose={onClose} title={`Certificado de ${member?.first_name ?? ''}`}
      footer={<ConfirmFooter onCancel={onClose} loading={busy} confirmLabel="Emitir certificado" onConfirm={async () => {
        const r = await run(() => must<{ id: string }>(supabase.rpc('emitir_certificado', { p_member: member!.id, p_level: level!.id, p_next_level: next || null, p_notes: notes || null })),
          next ? 'Certificado emitido y nivel actualizado. Avisamos a la familia.' : 'Certificado emitido.');
        if (r) { onClose(); onDone(r.id); }
      }} />}>
      <div className="space-y-4">
        <p className="text-base">Certifica que <strong>{member?.first_name}</strong> completó <strong>{level?.name}</strong>.</p>
        <Field label="Pasa al nivel" hint="Queda en su historial y la familia recibe aviso para reinscribirlo.">
          {(p) => <Select {...p} value={next} onChange={(e) => setNext(e.target.value)}>
            <option value="">Todavía no cambia de nivel</option>
            {levels.filter((l) => l.id !== level?.id).map((l) => <option key={l.id} value={l.id}>{l.name} ({rangeLabel(Number(l.min_age), Number(l.max_age))})</option>)}
          </Select>}
        </Field>
        <Field label="Mensaje">{(p) => <Input {...p} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ej. ¡Felicidades por tu esfuerzo!" />}</Field>
      </div>
    </Modal>
  );
}

function SkillsEditor({ open, level, skills, onClose, onDone }: { open: boolean; level: Level; skills: Skill[]; onClose: () => void; onDone: () => void }) {
  const [rows, setRows] = useState<(Partial<Skill> & { key: string })[]>([]);
  const { busy, run } = useAction();
  useEffect(() => { if (open) setRows(skills.map((s) => ({ ...s, key: s.id }))); }, [open, skills]);
  const upd = (key: string, patch: Partial<Skill>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  async function save() {
    const r = await run(async () => {
      for (const [i, row] of rows.entries()) {
        const name = (row.name ?? '').trim();
        if (!name) continue;
        const orig = skills.find((s) => s.id === row.id);
        if (!row.id) {
          await must(supabase.from('skills').insert({ level_id: level.id, name, sort_order: i + 1, active: row.active ?? true }));
        } else if (!orig || orig.name !== name || orig.active !== row.active || orig.sort_order !== i + 1) {
          await must(supabase.from('skills').update({ name, active: row.active, sort_order: i + 1, is_example: orig?.name === name ? orig.is_example : false }).eq('id', row.id));
        }
      }
      return true;
    }, 'Habilidades guardadas');
    if (r) { onDone(); onClose(); }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Habilidades de ${level.name}`} size="lg"
      footer={<ConfirmFooter onCancel={onClose} onConfirm={save} loading={busy} confirmLabel="Guardar" />}>
      <p className="mb-3 text-base text-fg-muted">En orden de aprendizaje. Si una ya no se evalúa, desactívala; su historial se conserva.</p>
      <ul className="space-y-2">
        {rows.map((r, i) => (
          <li key={r.key} className="flex items-center gap-2">
            <span className="w-6 shrink-0 text-right text-sm text-fg-muted ob-num">{i + 1}</span>
            <Input value={r.name ?? ''} onChange={(e) => upd(r.key, { name: e.target.value })} placeholder="Ej. Flota boca arriba 10 s" />
            <Switch checked={r.active ?? true} onChange={(v) => upd(r.key, { active: v })} label="Activa" />
          </li>
        ))}
      </ul>
      <Button className="mt-3" variant="secondary" icon={<Plus className="h-5 w-5" />} onClick={() => setRows((rs) => [...rs, { key: 'n' + Date.now(), name: '', active: true }])}>Agregar habilidad</Button>
    </Modal>
  );
}
