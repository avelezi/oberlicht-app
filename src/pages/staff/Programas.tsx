import { useState } from 'react';
import { ArrowLeft, CalendarRange, Plus, Trash2 } from 'lucide-react';
import { Badge, Button, Card, EmptyState, Field, Input, Modal, PageHeader, Select, Textarea } from '@/design-system';
import { useAuth, deptName } from '@/lib/auth';
import { useAction, useAsync } from '@/lib/hooks';
import { supabase, must } from '@/lib/supabase';
import { DISCIPLINAS, type Ejercicio, type Programa, type SemanaPrograma } from '@/lib/academia';
import type { DeptCode } from '@/lib/types';
import { Area, ErrorBox, Loading } from '@/components/common';
import { CompararTecnica } from '@/components/VideoTecnica';

/** Programas por ciclo: qué se trabaja cada semana en cada nivel, con los ejercicios de la biblioteca. */
export default function Programas() {
  const { isManager, profile, hasDept, myAreas } = useAuth();
  const puedeEditar = (d: DeptCode) => isManager || (profile?.role === 'coordinador' && hasDept(d));
  const [abierto, setAbierto] = useState<Programa | null>(null);
  const [edit, setEdit] = useState<Partial<Programa> | null>(null);
  const { data, error, reload } = useAsync(async () => (await must(supabase.from('programs').select('*, levels(name)').neq('status', 'archivado').order('department').order('title'))) as Programa[], []);
  const { data: ejercicios } = useAsync(async () => (await must(supabase.from('exercises').select('*, exercise_videos(*)').eq('status', 'aprobado'))) as Ejercicio[], []);

  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data || !ejercicios) return <Loading />;
  const area0 = (isManager ? DISCIPLINAS : DISCIPLINAS.filter((d) => myAreas.includes(d)))[0] ?? 'natacion';

  if (abierto) {
    const p = data.find((x) => x.id === abierto.id) ?? abierto;
    return <VerPrograma p={p} ejercicios={ejercicios} puedeEditar={puedeEditar(p.department)} onBack={() => setAbierto(null)} onEdit={() => setEdit(p)}
      modal={edit && <EditarPrograma p={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />} />;
  }
  return (
    <>
      <PageHeader title="Programas por ciclo" description="El plan de cada nivel semana por semana: el enfoque, las habilidades que se buscan y los ejercicios de la biblioteca que se usan. Así todos los coaches del nivel avanzan igual."
        actions={(isManager || profile?.role === 'coordinador') && <Button icon={<Plus className="h-5 w-5" />} onClick={() => setEdit({ department: area0, weeks: [{ semana: 1, enfoque: '' }] })}>Nuevo programa</Button>} />
      {data.length === 0 ? <EmptyState icon={<CalendarRange className="h-8 w-8" />} title="Aún no hay programas" /> : (
        <div className="grid gap-3 md:grid-cols-2">
          {data.map((p) => (
            <Card key={p.id} interactive onClick={() => setAbierto(p)}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-semibold">{p.title}</h3>
                  <p className="text-sm text-fg-muted">{[p.levels?.name, `${p.weeks.length} semanas`].filter(Boolean).join(' · ')}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5"><Area code={p.department} />{p.is_example && <Badge size="sm">Ejemplo</Badge>}</div>
              </div>
            </Card>
          ))}
        </div>
      )}
      {edit && <EditarPrograma p={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
    </>
  );
}

function VerPrograma({ p, ejercicios, puedeEditar, onBack, onEdit, modal }: { p: Programa; ejercicios: Ejercicio[]; puedeEditar: boolean; onBack: () => void; onEdit: () => void; modal: React.ReactNode }) {
  const [ver, setVer] = useState<Ejercicio | null>(null);
  const porSlug = new Map(ejercicios.filter((e) => e.slug).map((e) => [e.slug!, e]));
  return (
    <>
      <Button variant="ghost" icon={<ArrowLeft className="h-4 w-4" />} onClick={onBack} className="mb-2">Programas</Button>
      <PageHeader title={p.title} description={[p.levels?.name, `${p.weeks.length} semanas`, p.notes].filter(Boolean).join(' · ')} actions={puedeEditar && <Button variant="secondary" onClick={onEdit}>Editar</Button>} />
      <ol className="space-y-3">
        {p.weeks.map((w) => (
          <li key={w.semana}>
            <Card>
              <div className="flex gap-4">
                <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-lg bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200"><span className="text-[10px] uppercase">Sem</span><span className="text-lg font-bold leading-none">{w.semana}</span></div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold">{w.enfoque}</h3>
                  {w.habilidades?.length ? <p className="mt-1 text-sm text-fg-muted">Habilidades: {w.habilidades.join(', ')}</p> : null}
                  {w.ejercicios?.length ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {w.ejercicios.map((s) => { const e = porSlug.get(s); return e
                        ? <Button key={s} size="sm" variant="secondary" onClick={() => setVer(e)}>{e.title}{e.exercise_videos?.some((v) => v.url) ? ' 🎬' : ''}</Button>
                        : <Badge key={s} size="sm">{s}</Badge>; })}
                    </div>
                  ) : null}
                  {w.nota && <p className="mt-2 text-sm text-fg-subtle">{w.nota}</p>}
                </div>
              </div>
            </Card>
          </li>
        ))}
      </ol>
      {ver && (
        <Modal open onClose={() => setVer(null)} title={ver.title} size="lg">
          <p className="mb-3 text-fg-muted">{ver.objective}</p>
          <CompararTecnica ejercicio={ver} />
        </Modal>
      )}
      {modal}
    </>
  );
}

function EditarPrograma({ p, onClose, onSaved }: { p: Partial<Programa>; onClose: () => void; onSaved: () => void }) {
  const { allDepartments } = useAuth();
  const { run, busy } = useAction();
  const [title, setTitle] = useState(p.title ?? '');
  const [dep, setDep] = useState<DeptCode>(p.department ?? 'natacion');
  const [nivel, setNivel] = useState(p.level_id ?? '');
  const [notes, setNotes] = useState(p.notes ?? '');
  const [weeks, setWeeks] = useState<SemanaPrograma[]>(p.weeks ?? []);
  const { data: niveles } = useAsync(async () => (await must(supabase.from('levels').select('id,name').eq('department', dep).eq('active', true).order('sort_order'))) as { id: string; name: string }[], [dep]);
  const setW = (i: number, w: Partial<SemanaPrograma>) => setWeeks(weeks.map((x, j) => (j === i ? { ...x, ...w } : x)));
  const lista = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);
  async function save() {
    if (!title.trim()) return;
    const row = { title: title.trim(), department: dep, level_id: nivel || null, notes: notes || null, weeks: weeks.map((w, i) => ({ ...w, semana: i + 1 })) };
    const ok = await run(async () => { if (p.id) await must(supabase.from('programs').update(row).eq('id', p.id)); else await must(supabase.from('programs').insert(row)); return true; }, 'Programa guardado');
    if (ok) onSaved();
  }
  return (
    <Modal open onClose={onClose} title={p.id ? 'Editar programa' : 'Nuevo programa'} size="lg" footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button loading={busy} onClick={save}>Guardar</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre" required className="sm:col-span-2">{(f) => <Input {...f} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ciclo otoño · Pececitos" />}</Field>
        <Field label="Área">{(f) => <Select {...f} value={dep} onChange={(e) => { setDep(e.target.value as DeptCode); setNivel(''); }}>{DISCIPLINAS.map((d) => <option key={d} value={d}>{deptName(allDepartments, d)}</option>)}</Select>}</Field>
        <Field label="Nivel">{(f) => <Select {...f} value={nivel} onChange={(e) => setNivel(e.target.value)}><option value="">—</option>{(niveles ?? []).map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}</Select>}</Field>
        <Field label="Notas" className="sm:col-span-2">{(f) => <Input {...f} value={notes} onChange={(e) => setNotes(e.target.value)} />}</Field>
      </div>
      <div className="mt-5 space-y-3">
        {weeks.map((w, i) => (
          <div key={i} className="rounded-lg border border-border p-3">
            <div className="mb-2 flex items-center justify-between"><span className="font-semibold">Semana {i + 1}</span><Button size="sm" variant="ghost" icon={<Trash2 className="h-4 w-4" />} onClick={() => setWeeks(weeks.filter((_, j) => j !== i))} aria-label="Quitar semana" /></div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Input value={w.enfoque} onChange={(e) => setW(i, { enfoque: e.target.value })} placeholder="Enfoque de la semana" aria-label="Enfoque" className="sm:col-span-2" />
              <Input value={(w.habilidades ?? []).join(', ')} onChange={(e) => setW(i, { habilidades: lista(e.target.value) })} placeholder="Habilidades, separadas por coma" aria-label="Habilidades" />
              <Input value={(w.ejercicios ?? []).join(', ')} onChange={(e) => setW(i, { ejercicios: lista(e.target.value) })} placeholder="Ejercicios (clave), separados por coma" aria-label="Ejercicios" />
              <Textarea rows={2} value={w.nota ?? ''} onChange={(e) => setW(i, { nota: e.target.value })} placeholder="Nota para el coach" aria-label="Nota" className="sm:col-span-2" />
            </div>
          </div>
        ))}
        <Button variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={() => setWeeks([...weeks, { semana: weeks.length + 1, enfoque: '' }])}>Agregar semana</Button>
      </div>
    </Modal>
  );
}
