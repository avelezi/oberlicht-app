import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, ChevronDown, ChevronUp, Copy, Pause, Play, Plus, Send, Sparkles, Timer, Trash2, Undo2 } from 'lucide-react';
import { Alert, Badge, Button, Card, CardHeader, EmptyState, Field, Input, Modal, PageHeader, Select, Tabs, Textarea, cn } from '@/design-system';
import { useAuth, deptName } from '@/lib/auth';
import { useAction, useAsync, useToast } from '@/lib/hooks';
import { supabase, must } from '@/lib/supabase';
import { dateShort } from '@/lib/format';
import { DISCIPLINAS, ESTADO_RUTINA, edadTexto, rutinaPorReglas, type BloqueRutina, type Ejercicio, type Rutina } from '@/lib/academia';
import type { DeptCode } from '@/lib/types';
import { Area, ErrorBox, Loading } from '@/components/common';
import { CompararTecnica } from '@/components/VideoTecnica';

const SEL = '*, autor:profiles!routines_created_by_fkey(full_name), revisor:profiles!routines_reviewed_by_fkey(full_name), levels(name)';
interface Nivel { id: string; name: string; department: DeptCode; min_age: number; max_age: number }
interface Grupo { id: string; name: string; level_id: string }

/** Rutinas de clase: el coach la pide (con IA o a mano), coordinación la aprueba y se usa en clase desde el celular. */
export default function Rutinas() {
  const { profile, myAreas, isManager, hasDept } = useAuth();
  const esCoord = isManager || profile?.role === 'coordinador';
  const puedeRevisar = (d: DeptCode) => isManager || (profile?.role === 'coordinador' && hasDept(d));
  const [tab, setTab] = useState(esCoord ? 'revisar' : 'mias');
  const [abierta, setAbierta] = useState<Rutina | null>(null);
  const [nueva, setNueva] = useState(false);
  const [borrador, setBorrador] = useState<Partial<Rutina> | null>(null);

  const { data, error, reload } = useAsync(async () => (await must(supabase.from('routines').select(SEL).neq('status', 'archivada').order('updated_at', { ascending: false }))) as Rutina[], []);
  const { data: ejercicios } = useAsync(async () => (await must(supabase.from('exercises').select('*, exercise_videos(*)').eq('status', 'aprobado'))) as Ejercicio[], []);
  const { data: niveles } = useAsync(async () => (await must(supabase.from('levels').select('id,name,department,min_age,max_age').eq('active', true).order('sort_order'))) as Nivel[], []);

  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data || !ejercicios || !niveles) return <Loading />;

  if (borrador) return <EditorRutina r={borrador} ejercicios={ejercicios} niveles={niveles} onClose={() => setBorrador(null)} onSaved={(r) => { setBorrador(null); reload(); setAbierta(r); }} />;
  if (abierta) {
    const fresca = data.find((x) => x.id === abierta.id) ?? abierta;
    return <VerRutina r={fresca} ejercicios={ejercicios} puedeRevisar={puedeRevisar(fresca.department)} esMia={fresca.created_by === profile?.id}
      onBack={() => setAbierta(null)} onEdit={() => { setBorrador(fresca); setAbierta(null); }}
      onDuplicate={() => { setBorrador({ ...fresca, id: undefined, status: 'borrador', review_note: null, is_template: false, used_on: [] }); setAbierta(null); }}
      onChanged={reload} />;
  }

  const mias = data.filter((r) => r.created_by === profile?.id);
  const revisar = data.filter((r) => r.status === 'revision' && puedeRevisar(r.department));
  const aprobadas = data.filter((r) => r.status === 'aprobada');
  const lista = tab === 'mias' ? mias : tab === 'revisar' ? revisar : tab === 'aprobadas' ? aprobadas : data;

  return (
    <>
      <PageHeader title="Rutinas de clase"
        description="Pide una rutina a la IA según edad, nivel y tiempo, o ármala tú. Solo usa ejercicios aprobados de la biblioteca y la coordinación del área la revisa antes de usarla con los alumnos."
        actions={<Button icon={<Sparkles className="h-5 w-5" />} onClick={() => setNueva(true)}>Nueva rutina</Button>} />
      <Tabs className="mb-4" value={tab} onChange={setTab} items={[
        ...(esCoord ? [{ id: 'revisar', label: 'Por revisar', count: revisar.length }] : []),
        { id: 'mias', label: 'Mis rutinas', count: mias.length },
        { id: 'aprobadas', label: 'Aprobadas', count: aprobadas.length },
        ...(esCoord ? [{ id: 'todas', label: 'Todas' }] : []),
      ]} />
      {lista.length === 0 ? (
        <EmptyState icon={<Sparkles className="h-8 w-8" />} title={tab === 'revisar' ? 'Nada por revisar' : 'Aún no hay rutinas aquí'} description="Crea una con la IA en menos de un minuto." action={<Button onClick={() => setNueva(true)}>Nueva rutina</Button>} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {lista.map((r) => (
            <Card key={r.id} interactive onClick={() => setAbierta(r)}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-semibold">{r.title}</h3>
                  <p className="text-sm text-fg-muted">{[r.levels?.name, edadTexto(r.age_min, r.age_max), `${r.minutes} min`].filter(Boolean).join(' · ')}</p>
                  <p className="mt-1 text-sm text-fg-subtle">{r.autor?.full_name ?? '—'} · {dateShort(r.updated_at.slice(0, 10))}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <Badge size="sm" tone={ESTADO_RUTINA[r.status].tone}>{ESTADO_RUTINA[r.status].label}</Badge>
                  <Area code={r.department} />
                  {r.source === 'ia' && <Badge size="sm" tone="accent" icon={<Sparkles className="h-3 w-3" />}>IA</Badge>}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
      {nueva && <PedirRutina ejercicios={ejercicios} niveles={niveles} areas={(isManager ? DISCIPLINAS : DISCIPLINAS.filter((d) => myAreas.includes(d)))}
        onClose={() => setNueva(false)} onListo={(r) => { setNueva(false); setBorrador(r); }} />}
    </>
  );
}

function PedirRutina({ ejercicios, niveles, areas, onClose, onListo }: { ejercicios: Ejercicio[]; niveles: Nivel[]; areas: DeptCode[]; onClose: () => void; onListo: (r: Partial<Rutina>) => void }) {
  const { allDepartments, profile } = useAuth();
  const { run, busy } = useAction();
  const [area, setArea] = useState<DeptCode>(areas[0] ?? 'natacion');
  const [nivel, setNivel] = useState('');
  const [grupo, setGrupo] = useState('');
  const [edad, setEdad] = useState({ min: '6', max: '8' });
  const [min, setMin] = useState('45');
  const [pedido, setPedido] = useState('');
  const { data: grupos } = useAsync(async () => (await must(supabase.from('groups').select('id,name,level_id').eq('coach_id', profile!.id).eq('active', true))) as Grupo[], []);
  const nivs = niveles.filter((n) => n.department === area);
  useEffect(() => { const n = niveles.find((x) => x.id === nivel); if (n) setEdad({ min: String(n.min_age), max: String(Math.min(n.max_age, 99)) }); }, [nivel, niveles]);

  async function generar() {
    const out = await run(async () => {
      const lv = niveles.find((x) => x.id === nivel);
      const g = (grupos ?? []).find((x) => x.id === grupo);
      // Habilidades que más cuestan en el grupo (de la boleta), para que la IA refuerce
      let foco: string[] = [];
      if (g) {
        const sk = (await must(supabase.from('skills').select('id,name').eq('level_id', g.level_id).eq('active', true))) as { id: string; name: string }[];
        const en = (await must(supabase.from('enrollments').select('member_id').eq('group_id', g.id).eq('status', 'activa'))) as { member_id: string }[];
        if (sk.length && en.length) {
          const pr = (await must(supabase.from('skill_progress').select('skill_id,member_id').in('member_id', en.map((x) => x.member_id)).in('skill_id', sk.map((s) => s.id)))) as { skill_id: string }[];
          foco = sk.map((s) => ({ s, n: pr.filter((p) => p.skill_id === s.id).length })).sort((a, b) => a.n - b.n).slice(0, 3).map((x) => x.s.name);
        }
      }
      const body = { department: area, level_name: lv?.name, group_name: g?.name, age_min: Number(edad.min), age_max: Number(edad.max), minutes: Number(min), request: pedido || 'Clase completa del nivel', skills_focus: foco };
      let ia: { modo?: string; error?: string; titulo?: string; objetivo?: string; bloques?: BloqueRutina[]; resumen_familias?: string; tarea_casa?: string } | null = null;
      try { const r = await supabase.functions.invoke('generar-rutina', { body }); ia = r.data ?? null; if (r.error) ia = null; } catch { ia = null; }
      const usarIA = ia?.modo === 'ia' && ia.bloques?.length;
      const base = usarIA ? ia! : rutinaPorReglas({ ejercicios: ejercicios.filter((e) => e.department === area), minutos: Number(min), edadMin: Number(edad.min), edadMax: Number(edad.max), pedido, sinCargaMenoresDe: 14 });
      return {
        department: area, level_id: lv?.id ?? null, group_id: g?.id ?? null, title: base.titulo ?? 'Rutina', objective: base.objetivo ?? null,
        age_min: Number(edad.min), age_max: Number(edad.max), minutes: Number(min), blocks: base.bloques ?? [],
        family_summary: base.resumen_familias ?? null, home_task: base.tarea_casa ?? null,
        source: usarIA ? 'ia' : 'demo', ai_request: pedido || null, status: 'borrador',
        review_note: usarIA ? null : 'Armada sin IA (modo de reserva): la IA se activa cuando el club configure su llave de API.',
      } as Partial<Rutina>;
    });
    if (out) onListo(out);
  }

  return (
    <Modal open onClose={onClose} title="Nueva rutina" footer={<div className="flex justify-between gap-2">
      <Button variant="ghost" onClick={() => onListo({ department: area, level_id: nivel || null, title: '', minutes: Number(min), age_min: Number(edad.min), age_max: Number(edad.max), blocks: [{ nombre: 'Calentamiento', minutos: 8, items: [] }, { nombre: 'Parte principal', minutos: 27, items: [] }, { nombre: 'Juego', minutos: 6, items: [] }, { nombre: 'Vuelta a la calma', minutos: 4, items: [] }], source: 'manual', status: 'borrador' })}>Armarla a mano</Button>
      <Button loading={busy} icon={<Sparkles className="h-5 w-5" />} onClick={generar}>Generar con IA</Button></div>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Área">{(p) => <Select {...p} value={area} onChange={(e) => { setArea(e.target.value as DeptCode); setNivel(''); }}>{areas.map((a) => <option key={a} value={a}>{deptName(allDepartments, a)}</option>)}</Select>}</Field>
        <Field label="Nivel">{(p) => <Select {...p} value={nivel} onChange={(e) => setNivel(e.target.value)}><option value="">Sin nivel específico</option>{nivs.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}</Select>}</Field>
        <Field label="Mi grupo (opcional)" hint="Usa la boleta del grupo para reforzar lo que más cuesta">{(p) => <Select {...p} value={grupo} onChange={(e) => { setGrupo(e.target.value); const g = grupos?.find((x) => x.id === e.target.value); if (g) setNivel(g.level_id); }}><option value="">—</option>{(grupos ?? []).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</Select>}</Field>
        <Field label="Duración (min)">{(p) => <Input {...p} type="number" min={15} max={120} value={min} onChange={(e) => setMin(e.target.value)} />}</Field>
        <Field label="Edad desde">{(p) => <Input {...p} type="number" value={edad.min} onChange={(e) => setEdad({ ...edad, min: e.target.value })} />}</Field>
        <Field label="Edad hasta">{(p) => <Input {...p} type="number" value={edad.max} onChange={(e) => setEdad({ ...edad, max: e.target.value })} />}</Field>
        <Field label="¿Qué quieres trabajar?" className="sm:col-span-2" hint="Escríbelo como se lo dirías a tu coordinador">{(p) => <Textarea {...p} rows={3} placeholder="Ej. patada de crol con juego al final" value={pedido} onChange={(e) => setPedido(e.target.value)} />}</Field>
      </div>
    </Modal>
  );
}

function EditorRutina({ r, ejercicios, niveles, onClose, onSaved }: { r: Partial<Rutina>; ejercicios: Ejercicio[]; niveles: Nivel[]; onClose: () => void; onSaved: (r: Rutina) => void }) {
  const { run, busy } = useAction();
  const [f, setF] = useState<Partial<Rutina>>(r);
  const [blocks, setBlocks] = useState<BloqueRutina[]>(r.blocks ?? []);
  const del = useMemo(() => ejercicios.filter((e) => e.department === f.department), [ejercicios, f.department]);
  const total = blocks.reduce((s, b) => s + (Number(b.minutos) || 0), 0);
  const setB = (i: number, p: Partial<BloqueRutina>) => setBlocks((bs) => bs.map((b, j) => (j === i ? { ...b, ...p } : b)));

  async function guardar(status: 'borrador' | 'revision') {
    const row = {
      department: f.department, level_id: f.level_id ?? null, group_id: f.group_id ?? null, title: (f.title ?? '').trim(), objective: f.objective ?? null,
      age_min: f.age_min ?? null, age_max: f.age_max ?? null, minutes: total || f.minutes || 45, blocks, family_summary: f.family_summary ?? null,
      home_task: f.home_task ?? null, source: f.source ?? 'manual', ai_request: f.ai_request ?? null, status,
      review_note: status === 'revision' ? null : f.review_note ?? null,
    };
    const saved = await run(async () => {
      if (!row.title) throw new Error('Ponle nombre a la rutina');
      if (!blocks.some((b) => b.items.length)) throw new Error('Agrega al menos un ejercicio');
      return (f.id ? await must(supabase.from('routines').update(row).eq('id', f.id).select(SEL).single()) : await must(supabase.from('routines').insert(row).select(SEL).single())) as Rutina;
    }, status === 'revision' ? 'Enviada a coordinación para revisión' : 'Borrador guardado');
    if (saved) onSaved(saved);
  }

  return (
    <>
      <PageHeader title={f.id ? 'Editar rutina' : 'Nueva rutina'} breadcrumb={<button className="flex items-center gap-1 text-sm text-fg-muted" onClick={onClose}><ArrowLeft className="h-4 w-4" /> Rutinas</button>}
        actions={<div className="flex gap-2"><Button variant="secondary" loading={busy} onClick={() => guardar('borrador')}>Guardar borrador</Button><Button loading={busy} icon={<Send className="h-4 w-4" />} onClick={() => guardar('revision')}>Mandar a revisión</Button></div>} />
      {f.source === 'ia' && <Alert tone="info" title="Propuesta de la IA">Revísala y ajústala. La IA solo usó ejercicios aprobados de la biblioteca; la coordinación la aprueba antes de usarla.</Alert>}
      {f.source === 'demo' && <Alert tone="warning" title="Armada sin IA">La IA todavía no está conectada (falta la llave de API del club), así que se armó con reglas desde la biblioteca. Funciona igual para revisar y usar.</Alert>}
      {f.status === 'devuelta' && f.review_note && <Alert tone="danger" title="Comentarios de coordinación">{f.review_note}</Alert>}
      <Card className="my-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Nombre" required className="sm:col-span-2">{(p) => <Input {...p} value={f.title ?? ''} onChange={(e) => setF({ ...f, title: e.target.value })} />}</Field>
          <Field label="Nivel">{(p) => <Select {...p} value={f.level_id ?? ''} onChange={(e) => setF({ ...f, level_id: e.target.value || null })}><option value="">—</option>{niveles.filter((n) => n.department === f.department).map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}</Select>}</Field>
          <Field label="Edades">{() => <div className="flex items-center gap-2"><Input type="number" value={f.age_min ?? ''} onChange={(e) => setF({ ...f, age_min: Number(e.target.value) })} aria-label="Desde" /><span>a</span><Input type="number" value={f.age_max ?? ''} onChange={(e) => setF({ ...f, age_max: Number(e.target.value) })} aria-label="Hasta" /></div>}</Field>
          <Field label="Objetivo" className="sm:col-span-2 lg:col-span-4">{(p) => <Input {...p} value={f.objective ?? ''} onChange={(e) => setF({ ...f, objective: e.target.value })} />}</Field>
        </div>
      </Card>
      <div className="space-y-4">
        {blocks.map((b, i) => (
          <Card key={i}>
            <div className="mb-3 flex flex-wrap items-end gap-3">
              <Field label="Bloque" className="min-w-[12rem] flex-1">{(p) => <Input {...p} value={b.nombre} onChange={(e) => setB(i, { nombre: e.target.value })} />}</Field>
              <Field label="Minutos" className="w-24">{(p) => <Input {...p} type="number" value={b.minutos} onChange={(e) => setB(i, { minutos: Number(e.target.value) })} />}</Field>
              <Button variant="ghost" size="sm" icon={<Trash2 className="h-4 w-4" />} onClick={() => setBlocks(blocks.filter((_, j) => j !== i))}>Quitar bloque</Button>
            </div>
            <ul className="space-y-2">
              {b.items.map((it, k) => (
                <li key={k} className="grid gap-2 rounded-md border border-border p-2 sm:grid-cols-[1fr_9rem_1fr_auto] sm:items-center">
                  <span className="font-medium">{it.titulo}</span>
                  <Input value={it.dosis ?? ''} placeholder="Dosis" onChange={(e) => setB(i, { items: b.items.map((x, j) => (j === k ? { ...x, dosis: e.target.value } : x)) })} aria-label="Dosis" />
                  <Input value={it.nota ?? ''} placeholder="Nota para el coach" onChange={(e) => setB(i, { items: b.items.map((x, j) => (j === k ? { ...x, nota: e.target.value } : x)) })} aria-label="Nota" />
                  <Button variant="ghost" size="sm" aria-label="Quitar ejercicio" icon={<Trash2 className="h-4 w-4" />} onClick={() => setB(i, { items: b.items.filter((_, j) => j !== k) })} />
                </li>
              ))}
            </ul>
            <div className="mt-3 sm:w-80">
              <Select value="" onChange={(e) => { const x = del.find((d) => d.id === e.target.value); if (x) setB(i, { items: [...b.items, { exercise_id: x.id, titulo: x.title, dosis: x.dose, nota: null }] }); }} aria-label="Agregar ejercicio">
                <option value="">+ Agregar ejercicio de la biblioteca</option>
                {del.map((d) => <option key={d.id} value={d.id}>{d.title} ({edadTexto(d.min_age, d.max_age)})</option>)}
              </Select>
            </div>
          </Card>
        ))}
        <div className="flex items-center justify-between">
          <Button variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={() => setBlocks([...blocks, { nombre: 'Nuevo bloque', minutos: 5, items: [] }])}>Agregar bloque</Button>
          <span className={cn('text-base font-semibold', f.minutes && total !== f.minutes ? 'text-warning-700' : '')}>Total: {total} min</span>
        </div>
        <Card>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Resumen para las familias" hint="Lo ven los papás en su app">{(p) => <Textarea {...p} rows={3} value={f.family_summary ?? ''} onChange={(e) => setF({ ...f, family_summary: e.target.value })} />}</Field>
            <Field label="Tarea para casa" hint="Algo seguro, sin alberca ni equipo">{(p) => <Textarea {...p} rows={3} value={f.home_task ?? ''} onChange={(e) => setF({ ...f, home_task: e.target.value })} />}</Field>
          </div>
        </Card>
      </div>
    </>
  );
}

function VerRutina({ r, ejercicios, puedeRevisar, esMia, onBack, onEdit, onDuplicate, onChanged }: {
  r: Rutina; ejercicios: Ejercicio[]; puedeRevisar: boolean; esMia: boolean; onBack: () => void; onEdit: () => void; onDuplicate: () => void; onChanged: () => void;
}) {
  const { allDepartments } = useAuth();
  const toast = useToast();
  const { run, busy } = useAction();
  const [abierto, setAbierto] = useState<string | null>(null);
  const [clase, setClase] = useState(false);
  const [devolver, setDevolver] = useState<string | null>(null);
  const byId = useMemo(() => new Map(ejercicios.map((e) => [e.id, e])), [ejercicios]);

  async function revisar(aprobar: boolean, nota?: string) {
    const ok = await run(() => must(supabase.from('routines').update({ status: aprobar ? 'aprobada' : 'devuelta', review_note: nota ?? null, is_template: aprobar ? true : r.is_template }).eq('id', r.id)),
      aprobar ? 'Rutina aprobada: ya se puede usar en clase' : 'Rutina devuelta al coach con tus comentarios');
    if (ok !== undefined) { setDevolver(null); onChanged(); }
  }
  async function usadaHoy() {
    const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
    await run(() => must(supabase.from('routines').update({ used_on: [...new Set([...(r.used_on ?? []), hoy])] }).eq('id', r.id)));
    toast('Clase registrada con esta rutina'); setClase(false); onChanged();
  }

  if (clase) return <ModoClase r={r} byId={byId} onExit={() => setClase(false)} onDone={usadaHoy} />;

  return (
    <>
      <PageHeader title={r.title} breadcrumb={<button className="flex items-center gap-1 text-sm text-fg-muted" onClick={onBack}><ArrowLeft className="h-4 w-4" /> Rutinas</button>}
        description={[deptName(allDepartments, r.department), r.levels?.name, edadTexto(r.age_min, r.age_max), `${r.minutes} min`].filter(Boolean).join(' · ')}
        actions={<div className="flex flex-wrap gap-2">
          {r.status === 'aprobada' && <Button icon={<Play className="h-5 w-5" />} onClick={() => setClase(true)}>Dar la clase</Button>}
          {(esMia || puedeRevisar) && r.status !== 'aprobada' && <Button variant="secondary" onClick={onEdit}>Editar</Button>}
          <Button variant="secondary" icon={<Copy className="h-4 w-4" />} onClick={onDuplicate}>Usar como base</Button>
        </div>} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge tone={ESTADO_RUTINA[r.status].tone}>{ESTADO_RUTINA[r.status].label}</Badge>
        {r.source === 'ia' && <Badge tone="accent" icon={<Sparkles className="h-3.5 w-3.5" />}>Hecha con IA</Badge>}
        <span className="text-sm text-fg-muted">Por {r.autor?.full_name ?? '—'}{r.revisor ? ` · revisó ${r.revisor.full_name}` : ''}{r.used_on?.length ? ` · usada ${r.used_on.length} ${r.used_on.length === 1 ? 'vez' : 'veces'}` : ''}</span>
      </div>
      {r.review_note && r.status === 'devuelta' && <Alert tone="danger" title="Comentarios de coordinación">{r.review_note}</Alert>}
      {puedeRevisar && r.status === 'revision' && (
        <Alert tone="warning" title="Esta rutina espera tu revisión" action={<div className="flex gap-2"><Button size="sm" variant="secondary" icon={<Undo2 className="h-4 w-4" />} onClick={() => setDevolver('')}>Devolver</Button><Button size="sm" loading={busy} icon={<Check className="h-4 w-4" />} onClick={() => revisar(true)}>Aprobar</Button></div>}>
          Revisa que los ejercicios, tiempos y edades sean seguros y correctos.
        </Alert>
      )}
      {r.objective && <p className="my-4 text-base"><strong>Objetivo:</strong> {r.objective}</p>}
      <div className="space-y-4">
        {r.blocks.map((b, i) => (
          <Card key={i}>
            <CardHeader title={b.nombre} actions={<Badge>{b.minutos} min</Badge>} />
            {b.items.length === 0 ? <p className="text-sm text-fg-muted">Libre a criterio del coach.</p> : (
              <ul className="divide-y divide-border">
                {b.items.map((it, k) => {
                  const e = it.exercise_id ? byId.get(it.exercise_id) : undefined;
                  const key = `${i}-${k}`;
                  const tieneVideo = (e?.exercise_videos ?? []).some((v) => v.url);
                  return (
                    <li key={k} className="py-3">
                      <button className="flex w-full items-center justify-between gap-3 text-left" onClick={() => setAbierto(abierto === key ? null : key)}>
                        <div><p className="font-semibold">{it.titulo}</p><p className="text-sm text-fg-muted">{[it.dosis, it.nota].filter(Boolean).join(' · ')}</p></div>
                        <span className="flex items-center gap-2 text-sm text-primary">{tieneVideo && <Badge size="sm" tone="info">Video</Badge>}{abierto === key ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}</span>
                      </button>
                      {abierto === key && e && (
                        <div className="mt-3 space-y-3">
                          <CompararTecnica ejercicio={e} />
                          {e.key_points.length > 0 && <ul className="list-disc pl-5 text-base">{e.key_points.map((x, j) => <li key={j}>{x}</li>)}</ul>}
                          {e.kid_version && <p className="text-base"><strong>A los niños:</strong> {e.kid_version}</p>}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        ))}
        {(r.family_summary || r.home_task) && (
          <Card>
            <CardHeader title="Para las familias" />
            {r.family_summary && <p className="text-base">{r.family_summary}</p>}
            {r.home_task && <p className="mt-2 text-base"><strong>Tarea en casa:</strong> {r.home_task}</p>}
          </Card>
        )}
      </div>
      {devolver !== null && (
        <Modal open onClose={() => setDevolver(null)} title="Devolver con comentarios" footer={<div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setDevolver(null)}>Cancelar</Button><Button loading={busy} onClick={() => revisar(false, devolver)}>Devolver al coach</Button></div>}>
          <Field label="¿Qué debe cambiar?">{(p) => <Textarea {...p} rows={4} value={devolver} onChange={(e) => setDevolver(e.target.value)} />}</Field>
        </Modal>
      )}
    </>
  );
}

/** Modo clase: un bloque a la vez, cronómetro y palomitas. Pensado para usarse en la alberca o el salón desde el celular. */
function ModoClase({ r, byId, onExit, onDone }: { r: Rutina; byId: Map<string, Ejercicio>; onExit: () => void; onDone: () => void }) {
  const [i, setI] = useState(0);
  const [seg, setSeg] = useState(r.blocks[0]?.minutos * 60 || 0);
  const [corre, setCorre] = useState(false);
  const [hechos, setHechos] = useState<Set<string>>(new Set());
  useEffect(() => { if (!corre) return; const t = setInterval(() => setSeg((s) => Math.max(0, s - 1)), 1000); return () => clearInterval(t); }, [corre]);
  useEffect(() => { setSeg((r.blocks[i]?.minutos ?? 0) * 60); setCorre(false); }, [i, r.blocks]);
  const b = r.blocks[i];
  const mm = String(Math.floor(seg / 60)).padStart(2, '0'); const ss = String(seg % 60).padStart(2, '0');
  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex items-center justify-between">
        <Button variant="ghost" icon={<ArrowLeft className="h-4 w-4" />} onClick={onExit}>Salir</Button>
        <span className="text-sm text-fg-muted">Bloque {i + 1} de {r.blocks.length}</span>
      </div>
      <Card>
        <h2 className="text-2xl font-bold">{b?.nombre}</h2>
        <div className="my-4 flex items-center gap-4">
          <span className={cn('font-mono text-5xl font-bold tabular-nums', seg === 0 && 'text-danger-600')}>{mm}:{ss}</span>
          <Button size="lg" variant={corre ? 'secondary' : 'primary'} icon={corre ? <Pause className="h-5 w-5" /> : <Timer className="h-5 w-5" />} onClick={() => setCorre(!corre)}>{corre ? 'Pausar' : 'Iniciar'}</Button>
        </div>
        <ul className="space-y-2">
          {b?.items.map((it, k) => {
            const key = `${i}-${k}`; const ok = hechos.has(key); const e = it.exercise_id ? byId.get(it.exercise_id) : undefined;
            return (
              <li key={k}>
                <button onClick={() => setHechos((h) => { const n = new Set(h); if (ok) n.delete(key); else n.add(key); return n; })}
                  className={cn('flex w-full items-start gap-3 rounded-lg border p-3 text-left', ok ? 'border-success-300 bg-success-50 dark:bg-success-900/20' : 'border-border')}>
                  <span className={cn('mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2', ok ? 'border-success-600 bg-success-600 text-white' : 'border-border-strong')}>{ok && <Check className="h-4 w-4" />}</span>
                  <span><span className="block text-lg font-semibold">{it.titulo}</span><span className="block text-base text-fg-muted">{[it.dosis, it.nota].filter(Boolean).join(' · ')}</span>
                    {e?.key_points?.[0] && <span className="mt-1 block text-sm">Clave: {e.key_points[0]}</span>}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <div className="mt-6 flex justify-between gap-2">
          <Button variant="secondary" disabled={i === 0} onClick={() => setI(i - 1)}>Anterior</Button>
          {i < r.blocks.length - 1 ? <Button size="lg" onClick={() => setI(i + 1)}>Siguiente bloque</Button> : <Button size="lg" variant="success" icon={<Check className="h-5 w-5" />} onClick={onDone}>Terminar clase</Button>}
        </div>
      </Card>
    </div>
  );
}
