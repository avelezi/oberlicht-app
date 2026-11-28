import { useMemo, useState } from 'react';
import { CheckCircle2, CloudDownload, Film, Plus, Search, ShieldAlert, Trash2 } from 'lucide-react';
import { Alert, Badge, Button, Card, EmptyState, Field, Input, Modal, PageHeader, Select, Switch, Textarea } from '@/design-system';
import { useAuth, deptName } from '@/lib/auth';
import { useAction, useAsync, useToast } from '@/lib/hooks';
import { supabase, must } from '@/lib/supabase';
import { BLOQUE_LABEL, DISCIPLINAS, edadTexto, type Bloque, type Ejercicio, type Marca, type VideoTecnica } from '@/lib/academia';
import type { DeptCode } from '@/lib/types';
import { Area, ErrorBox, Loading } from '@/components/common';
import { CompararTecnica } from '@/components/VideoTecnica';

const SELECT = '*, exercise_videos(*)';

/** Biblioteca de ejercicios: ficha técnica + video «así no / así sí» con marcas de corrección. */
export default function Biblioteca() {
  const { myAreas, allDepartments, isManager, profile, hasDept } = useAuth();
  const toast = useToast();
  const { run, busy } = useAction();
  const areas = (isManager ? DISCIPLINAS : DISCIPLINAS.filter((d) => myAreas.includes(d)));
  const [area, setArea] = useState<string>('');
  const [bloque, setBloque] = useState<string>('');
  const [q, setQ] = useState('');
  const [soloVideo, setSoloVideo] = useState(false);
  const [abierto, setAbierto] = useState<Ejercicio | null>(null);
  const [edit, setEdit] = useState<Partial<Ejercicio> | null>(null);
  const puedeEditar = (d: DeptCode) => isManager || (profile?.role === 'coordinador' && hasDept(d));

  const { data, error, reload } = useAsync(async () =>
    (await must(supabase.from('exercises').select(SELECT).neq('status', 'retirado').order('department').order('title'))) as Ejercicio[], []);

  const lista = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (data ?? []).filter((e) => (!area || e.department === area) && (!bloque || e.block === bloque)
      && (!soloVideo || (e.exercise_videos ?? []).some((v) => v.url))
      && (!s || `${e.title} ${e.objective ?? ''}`.toLowerCase().includes(s)));
  }, [data, area, bloque, q, soloVideo]);

  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return <Loading />;
  const conVideo = data.filter((e) => (e.exercise_videos ?? []).some((v) => v.url)).length;
  const externos = data.flatMap((e) => e.exercise_videos ?? []).filter((v) => v.url && /cloudfront\.net/.test(v.url));

  async function copiarVideos() {
    const r = await run(async () => {
      const { data: out, error: err } = await supabase.functions.invoke('importar-video', { body: { ids: externos.map((v) => v.id) } });
      if (err) throw err;
      return out as { copiados: number; fallaron: number };
    });
    if (r) { toast(`${r.copiados} videos copiados al almacenamiento del club${r.fallaron ? ` · ${r.fallaron} fallaron` : ''}`); reload(); }
  }

  return (
    <>
      <PageHeader title="Biblioteca de ejercicios"
        description="Cada ejercicio trae su explicación, claves técnicas, errores comunes y, cuando ya lo tiene, un video «así no» contra «así sí» con las correcciones marcadas. Solo lo aprobado por coordinación se usa en rutinas."
        actions={areas.some(puedeEditar) ? <Button icon={<Plus className="h-5 w-5" />} onClick={() => setEdit({ department: areas.find(puedeEditar), block: 'principal', min_age: 4, max_age: 99, minutes: 5, steps: [], key_points: [], errors: [], status: 'aprobado' })}>Nuevo ejercicio</Button> : undefined} />

      {data.some((e) => e.is_example) && (
        <Alert tone="info" title="Ejercicios de ejemplo">Los ejercicios marcados «Ejemplo» vienen para mostrar cómo funciona. La coordinación de cada área los revisa, corrige o reemplaza por el método del club.</Alert>
      )}
      {isManager && externos.length > 0 && (
        <div className="mt-3">
          <Alert tone="warning" title={`${externos.length} videos siguen guardados en Higgsfield`}
            action={<Button size="sm" variant="secondary" loading={busy} icon={<CloudDownload className="h-4 w-4" />} onClick={copiarVideos}>Copiar al club</Button>}>
            Copiarlos al almacenamiento de Oberlicht evita depender del enlace externo.
          </Alert>
        </div>
      )}

      <div className="my-4 flex flex-col gap-3 lg:flex-row lg:items-end">
        <div className="lg:w-72"><Input leading={<Search className="h-4 w-4" />} placeholder="Buscar ejercicio" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar" /></div>
        <div className="grid grid-cols-2 gap-3 lg:flex">
          <Select value={area} onChange={(e) => setArea(e.target.value)} aria-label="Área">
            <option value="">Todas las áreas</option>
            {DISCIPLINAS.map((a) => <option key={a} value={a}>{deptName(allDepartments, a)}</option>)}
          </Select>
          <Select value={bloque} onChange={(e) => setBloque(e.target.value)} aria-label="Parte de la clase">
            <option value="">Toda la clase</option>
            {(Object.keys(BLOQUE_LABEL) as Bloque[]).map((b) => <option key={b} value={b}>{BLOQUE_LABEL[b]}</option>)}
          </Select>
        </div>
        <Switch checked={soloVideo} onChange={setSoloVideo} label={`Solo con video (${conVideo})`} />
      </div>

      {lista.length === 0 ? <EmptyState title="Sin ejercicios" description="Cambia los filtros o agrega uno nuevo." /> : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {lista.map((e) => {
            const bien = (e.exercise_videos ?? []).find((v) => v.kind === 'bien' && v.url);
            return (
              <Card key={e.id} interactive padded={false} onClick={() => setAbierto(e)} className="overflow-hidden">
                {bien ? (
                  <div className="relative aspect-video bg-black">
                    <video src={`${bien.url}#t=1.5`} muted playsInline preload="metadata" className="h-full w-full object-cover" />
                    <span className="absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-xs font-semibold text-white"><Film className="h-3.5 w-3.5" aria-hidden /> Así no / así sí</span>
                  </div>
                ) : (
                  <div className="flex aspect-video items-center justify-center bg-surface-sunken text-sm text-fg-subtle">Video pendiente</div>
                )}
                <div className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-base font-semibold leading-snug">{e.title}</h3>
                    {e.is_example && <Badge size="sm">Ejemplo</Badge>}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Area code={e.department} />
                    <Badge size="sm" tone="info">{BLOQUE_LABEL[e.block]}</Badge>
                    <Badge size="sm">{edadTexto(e.min_age, e.max_age)}</Badge>
                    {e.status !== 'aprobado' && <Badge size="sm" tone="warning">{e.status === 'revision' ? 'En revisión' : 'Borrador'}</Badge>}
                  </div>
                  {e.objective && <p className="line-clamp-2 text-sm text-fg-muted">{e.objective}</p>}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {abierto && <Ficha e={abierto} onClose={() => setAbierto(null)} onEdit={puedeEditar(abierto.department) ? () => { setEdit(abierto); setAbierto(null); } : undefined} />}
      {edit && <EditarEjercicio e={edit} areas={areas.filter(puedeEditar)} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
    </>
  );
}

function Ficha({ e, onClose, onEdit }: { e: Ejercicio; onClose: () => void; onEdit?: () => void }) {
  return (
    <Modal open onClose={onClose} title={e.title} size="lg" footer={<div className="flex justify-end gap-2">{onEdit && <Button variant="secondary" onClick={onEdit}>Editar</Button>}<Button onClick={onClose}>Cerrar</Button></div>}>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-1.5">
          <Area code={e.department} /><Badge size="sm" tone="info">{BLOQUE_LABEL[e.block]}</Badge><Badge size="sm">{edadTexto(e.min_age, e.max_age)}</Badge>
          {e.dose && <Badge size="sm">{e.dose}</Badge>}<Badge size="sm">{e.minutes} min</Badge>
          {e.status === 'aprobado' && <Badge size="sm" tone="success" icon={<CheckCircle2 className="h-3.5 w-3.5" />}>Aprobado por coordinación</Badge>}
        </div>
        <CompararTecnica ejercicio={e} />
        {e.objective && <p className="text-base"><strong>Objetivo:</strong> {e.objective}</p>}
        <div className="grid gap-5 md:grid-cols-2">
          {e.steps.length > 0 && (<section><h4 className="mb-1.5 font-semibold">Cómo se hace</h4><ol className="list-decimal space-y-1 pl-5 text-base">{e.steps.map((s, i) => <li key={i}>{s}</li>)}</ol></section>)}
          {e.key_points.length > 0 && (<section><h4 className="mb-1.5 font-semibold">Claves técnicas</h4><ul className="list-disc space-y-1 pl-5 text-base">{e.key_points.map((s, i) => <li key={i}>{s}</li>)}</ul></section>)}
        </div>
        {e.kid_version && <div className="rounded-lg bg-gold-50 px-4 py-3 text-base text-gold-900 dark:bg-gold-900/20 dark:text-gold-100"><strong>Para explicarlo a los niños:</strong> {e.kid_version}</div>}
        <div className="grid gap-3 text-base sm:grid-cols-2">
          {e.easier && <p><strong>Más fácil:</strong> {e.easier}</p>}
          {e.harder && <p><strong>Más difícil:</strong> {e.harder}</p>}
          {e.equipment && <p><strong>Material:</strong> {e.equipment}</p>}
        </div>
        {e.safety_note && <div className="flex items-start gap-2 rounded-md border border-warning-200 bg-warning-50 px-3 py-2 text-sm text-warning-800"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{e.safety_note}</div>}
      </div>
    </Modal>
  );
}

const POS: { id: string; label: string; x: number; y: number }[] = [
  { id: 'ai', label: 'Arriba izquierda', x: 0.3, y: 0.3 }, { id: 'ac', label: 'Arriba centro', x: 0.5, y: 0.3 }, { id: 'ad', label: 'Arriba derecha', x: 0.7, y: 0.3 },
  { id: 'ci', label: 'Centro izquierda', x: 0.3, y: 0.5 }, { id: 'cc', label: 'Centro', x: 0.5, y: 0.5 }, { id: 'cd', label: 'Centro derecha', x: 0.7, y: 0.5 },
  { id: 'bi', label: 'Abajo izquierda', x: 0.3, y: 0.72 }, { id: 'bc', label: 'Abajo centro', x: 0.5, y: 0.72 }, { id: 'bd', label: 'Abajo derecha', x: 0.7, y: 0.72 },
];
const posDe = (m: Marca) => POS.reduce((best, p) => (Math.hypot(p.x - m.x, p.y - m.y) < Math.hypot(best.x - m.x, best.y - m.y) ? p : best), POS[4]).id;
const lineas = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean);

function EditarEjercicio({ e, areas, onClose, onSaved }: { e: Partial<Ejercicio>; areas: DeptCode[]; onClose: () => void; onSaved: () => void }) {
  const { allDepartments } = useAuth();
  const { run, busy } = useAction();
  const [f, setF] = useState({
    department: e.department ?? areas[0], title: e.title ?? '', block: e.block ?? 'principal', objective: e.objective ?? '',
    steps: (e.steps ?? []).join('\n'), key_points: (e.key_points ?? []).join('\n'),
    errors: (e.errors ?? []).map((x) => `${x.error} → ${x.correccion}`).join('\n'),
    kid_version: e.kid_version ?? '', easier: e.easier ?? '', harder: e.harder ?? '', equipment: e.equipment ?? '',
    min_age: String(e.min_age ?? 4), max_age: String(e.max_age ?? 99), minutes: String(e.minutes ?? 5), dose: e.dose ?? '',
    for_families: e.for_families ?? false, safety_note: e.safety_note ?? '', status: e.status ?? 'aprobado',
  });
  const [videos, setVideos] = useState<VideoTecnica[]>(e.exercise_videos ?? []);
  const set = (k: keyof typeof f, v: string | boolean) => setF((x) => ({ ...x, [k]: v }));

  function setMarca(vi: number, mi: number, patch: Partial<Marca>) {
    setVideos((vs) => vs.map((v, i) => (i !== vi ? v : { ...v, annotations: v.annotations.map((m, j) => (j === mi ? { ...m, ...patch } : m)) })));
  }

  async function save() {
    const row = {
      department: f.department, title: f.title.trim(), block: f.block, objective: f.objective || null,
      steps: lineas(f.steps), key_points: lineas(f.key_points),
      errors: lineas(f.errors).map((l) => { const [a, b] = l.split(/→|->/); return { error: (a ?? '').trim(), correccion: (b ?? '').trim() }; }),
      kid_version: f.kid_version || null, easier: f.easier || null, harder: f.harder || null, equipment: f.equipment || null,
      min_age: Number(f.min_age) || 0, max_age: Number(f.max_age) || 99, minutes: Number(f.minutes) || 5, dose: f.dose || null,
      for_families: f.for_families, safety_note: f.safety_note || null, status: f.status,
      approved_at: f.status === 'aprobado' ? new Date().toISOString() : null, is_example: false,
    };
    const ok = await run(async () => {
      if (!row.title) throw new Error('Escribe el nombre del ejercicio');
      if (e.id) {
        await must(supabase.from('exercises').update(row).eq('id', e.id));
        for (const v of videos) await must(supabase.from('exercise_videos').update({ annotations: v.annotations }).eq('id', v.id));
      } else await must(supabase.from('exercises').insert(row));
      return true;
    }, 'Ejercicio guardado');
    if (ok) onSaved();
  }
  async function retirar() {
    const ok = await run(() => must(supabase.from('exercises').update({ status: 'retirado' }).eq('id', e.id!)), 'Ejercicio retirado de la biblioteca');
    if (ok !== undefined) onSaved();
  }

  return (
    <Modal open onClose={onClose} title={e.id ? 'Editar ejercicio' : 'Nuevo ejercicio'} size="lg"
      footer={<div className="flex flex-wrap justify-between gap-2">
        {e.id ? <Button variant="ghost" icon={<Trash2 className="h-4 w-4" />} onClick={retirar}>Retirar</Button> : <span />}
        <div className="flex gap-2"><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button loading={busy} onClick={save}>Guardar</Button></div>
      </div>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre" required className="sm:col-span-2">{(p) => <Input {...p} value={f.title} onChange={(x) => set('title', x.target.value)} />}</Field>
        <Field label="Área">{(p) => <Select {...p} value={f.department} onChange={(x) => set('department', x.target.value)}>{areas.map((a) => <option key={a} value={a}>{deptName(allDepartments, a)}</option>)}</Select>}</Field>
        <Field label="Parte de la clase">{(p) => <Select {...p} value={f.block} onChange={(x) => set('block', x.target.value)}>{(Object.keys(BLOQUE_LABEL) as Bloque[]).map((b) => <option key={b} value={b}>{BLOQUE_LABEL[b]}</option>)}</Select>}</Field>
        <Field label="Objetivo" className="sm:col-span-2">{(p) => <Input {...p} value={f.objective} onChange={(x) => set('objective', x.target.value)} />}</Field>
        <Field label="Cómo se hace" hint="Un paso por renglón">{(p) => <Textarea {...p} rows={4} value={f.steps} onChange={(x) => set('steps', x.target.value)} />}</Field>
        <Field label="Claves técnicas" hint="Una por renglón">{(p) => <Textarea {...p} rows={4} value={f.key_points} onChange={(x) => set('key_points', x.target.value)} />}</Field>
        <Field label="Errores comunes y su corrección" hint="Un renglón por error: «error → corrección»" className="sm:col-span-2">{(p) => <Textarea {...p} rows={3} value={f.errors} onChange={(x) => set('errors', x.target.value)} />}</Field>
        <Field label="Para explicarlo a los niños" className="sm:col-span-2">{(p) => <Input {...p} value={f.kid_version} onChange={(x) => set('kid_version', x.target.value)} />}</Field>
        <Field label="Versión más fácil">{(p) => <Input {...p} value={f.easier} onChange={(x) => set('easier', x.target.value)} />}</Field>
        <Field label="Versión más difícil">{(p) => <Input {...p} value={f.harder} onChange={(x) => set('harder', x.target.value)} />}</Field>
        <Field label="Edad mínima">{(p) => <Input {...p} type="number" min={0} value={f.min_age} onChange={(x) => set('min_age', x.target.value)} />}</Field>
        <Field label="Edad máxima">{(p) => <Input {...p} type="number" min={0} value={f.max_age} onChange={(x) => set('max_age', x.target.value)} />}</Field>
        <Field label="Minutos">{(p) => <Input {...p} type="number" min={1} value={f.minutes} onChange={(x) => set('minutes', x.target.value)} />}</Field>
        <Field label="Dosis" hint="Ej. 4 × 12.5 m">{(p) => <Input {...p} value={f.dose} onChange={(x) => set('dose', x.target.value)} />}</Field>
        <Field label="Material">{(p) => <Input {...p} value={f.equipment} onChange={(x) => set('equipment', x.target.value)} />}</Field>
        <Field label="Estado">{(p) => <Select {...p} value={f.status} onChange={(x) => set('status', x.target.value)}><option value="aprobado">Aprobado</option><option value="revision">En revisión</option><option value="borrador">Borrador</option></Select>}</Field>
        <Field label="Nota de seguridad" className="sm:col-span-2">{(p) => <Input {...p} value={f.safety_note} onChange={(x) => set('safety_note', x.target.value)} />}</Field>
        <div className="sm:col-span-2"><Switch checked={f.for_families} onChange={(v) => set('for_families', v)} label="Mostrarlo a las familias en «En casa»" /></div>
      </div>
      {videos.length > 0 && (
        <div className="mt-6 space-y-4">
          <h4 className="font-semibold">Marcas sobre los videos</h4>
          {videos.map((v, vi) => (
            <div key={v.id} className="rounded-lg border border-border p-3">
              <p className="mb-2 text-sm font-semibold">{v.kind === 'mal' ? 'Video «así no»' : 'Video «así sí»'}</p>
              {v.annotations.map((m, mi) => (
                <div key={mi} className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-[1fr_6rem_6rem_10rem]">
                  <Input className="col-span-2 sm:col-span-1" value={m.texto} onChange={(x) => setMarca(vi, mi, { texto: x.target.value })} aria-label="Texto de la marca" />
                  <Input type="number" step="0.1" value={m.desde} onChange={(x) => setMarca(vi, mi, { desde: Number(x.target.value) })} aria-label="Desde segundo" />
                  <Input type="number" step="0.1" value={m.hasta} onChange={(x) => setMarca(vi, mi, { hasta: Number(x.target.value) })} aria-label="Hasta segundo" />
                  <Select className="col-span-2 sm:col-span-1" value={posDe(m)} onChange={(x) => { const p = POS.find((q) => q.id === x.target.value)!; setMarca(vi, mi, { x: p.x, y: p.y }); }} aria-label="Dónde va la marca">
                    {POS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                  </Select>
                </div>
              ))}
              <Button size="sm" variant="ghost" icon={<Plus className="h-4 w-4" />} onClick={() => setVideos((vs) => vs.map((x, i) => (i !== vi ? x : { ...x, annotations: [...x.annotations, { desde: 0, hasta: 5, x: 0.5, y: 0.5, tipo: v.kind === 'mal' ? 'error' : 'ok', texto: '' }] })))}>Agregar marca</Button>
            </div>
          ))}
          <p className="text-sm text-fg-muted">Los segundos indican cuándo aparece cada marca. Los videos nuevos los genera Dirección con Higgsfield.</p>
        </div>
      )}
    </Modal>
  );
}
