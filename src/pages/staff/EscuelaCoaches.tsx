import { useState } from 'react';
import { AlertTriangle, BookOpen, CheckCircle2, ClipboardList, Film, GraduationCap, HelpCircle, Plus, Star } from 'lucide-react';
import { Alert, Badge, Button, Card, CardHeader, EmptyState, Field, Input, Modal, PageHeader, Select, StatCard, Tabs, Textarea, cn } from '@/design-system';
import { useAuth, deptName, ROLE_NAME } from '@/lib/auth';
import { useAction, useAsync } from '@/lib/hooks';
import { supabase, must } from '@/lib/supabase';
import { dateShort, todayMx } from '@/lib/format';
import { CRITERIOS_OBS, ESCALA_OBS, NIVEL_COACH, parrafos, type Curso, type Ejercicio, type Leccion, type PanelFormacion } from '@/lib/academia';
import type { AppRole } from '@/lib/types';
import { Area, ErrorBox, Loading } from '@/components/common';
import { CompararTecnica } from '@/components/VideoTecnica';

const ICONO: Record<Leccion['kind'], typeof BookOpen> = { lectura: BookOpen, video: Film, quiz: HelpCircle, que_esta_mal: AlertTriangle };
const TIPO: Record<Leccion['kind'], string> = { lectura: 'Lectura', video: 'Video', quiz: 'Examen', que_esta_mal: '¿Qué está mal?' };

/** Escuela de coaches: ruta de formación por niveles, lecciones con videos y exámenes, observación de clase y certificados. */
export default function EscuelaCoaches() {
  const { isManager, profile } = useAuth();
  const forma = isManager || profile?.role === 'coordinador';
  const [tab, setTab] = useState('ruta');
  return (
    <>
      <PageHeader title="Escuela de coaches" description="Tu ruta de formación: de inducción a mentor. Lecciones cortas, videos «así no / así sí», exámenes y observación de clase. Lo que apruebas queda en tu expediente." />
      {forma && <Tabs className="mb-4" value={tab} onChange={setTab} items={[{ id: 'ruta', label: 'Mi ruta' }, { id: 'panel', label: 'Panel de formación' }, { id: 'cursos', label: 'Cursos' }]} />}
      {tab === 'ruta' && <MiRuta />}
      {tab === 'panel' && forma && <Panel />}
      {tab === 'cursos' && forma && <Cursos />}
    </>
  );
}

function useCursos() {
  return useAsync(async () => {
    const cursos = (await must(supabase.from('courses').select('*, lessons(*)').eq('active', true).order('tier').order('sort_order'))) as Curso[];
    cursos.forEach((c) => c.lessons?.sort((a, b) => a.sort_order - b.sort_order));
    return cursos;
  }, []);
}

function MiRuta() {
  const { profile, myAreas } = useAuth();
  const { data: cursos, error, reload } = useCursos();
  const { data: avance, reload: reloadAv } = useAsync(async () => (await must(supabase.from('lesson_progress').select('lesson_id,score').eq('profile_id', profile!.id))) as { lesson_id: string; score: number | null }[], [profile?.id]);
  const { data: extra } = useAsync(async () => {
    const [tiers, obs, certs] = await Promise.all([
      must(supabase.from('coach_tiers').select('*').eq('profile_id', profile!.id)),
      must(supabase.from('class_observations').select('*').eq('coach_id', profile!.id).order('observed_on', { ascending: false }).limit(5)),
      must(supabase.from('staff_certifications').select('*').eq('profile_id', profile!.id).order('expires_on')),
    ]);
    return { tiers: tiers as { department: string; tier: number }[], obs: obs as Obs[], certs: certs as Cert[] };
  }, [profile?.id]);
  const [leccion, setLeccion] = useState<Leccion | null>(null);

  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!cursos || !avance) return <Loading />;
  const hechas = new Map(avance.map((a) => [a.lesson_id, a.score]));
  const mios = cursos.filter((c) => !c.department || myAreas.includes(c.department));
  const nivel = Math.max(0, ...(extra?.tiers ?? []).map((t) => t.tier));
  const total = mios.reduce((s, c) => s + (c.lessons?.length ?? 0), 0);
  const completas = mios.reduce((s, c) => s + (c.lessons ?? []).filter((l) => hechas.has(l.id)).length, 0);
  const pendientesObl = mios.filter((c) => c.required).reduce((s, c) => s + (c.lessons ?? []).filter((l) => !hechas.has(l.id)).length, 0);

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Mi nivel" value={NIVEL_COACH[nivel]} icon={<GraduationCap className="h-5 w-5" />} />
        <StatCard label="Lecciones" value={`${completas} de ${total}`} />
        <StatCard label="Obligatorias pendientes" value={pendientesObl} />
        <StatCard label="Certificados" value={extra?.certs.length ?? 0} />
      </div>
      <ol className="mb-6 flex gap-1 overflow-x-auto" aria-label="Niveles de coach">
        {NIVEL_COACH.map((n, i) => (
          <li key={n} className={cn('min-w-[7rem] flex-1 rounded-md px-3 py-2 text-center text-sm font-medium', i <= nivel ? 'bg-brand-600 text-white' : 'bg-surface-sunken text-fg-muted')}>{i + 1}. {n}</li>
        ))}
      </ol>
      <div className="space-y-4">
        {mios.map((c) => {
          const ls = c.lessons ?? [];
          const ok = ls.filter((l) => hechas.has(l.id)).length;
          return (
            <Card key={c.id}>
              <CardHeader title={c.title} description={c.description ?? undefined}
                actions={<div className="flex flex-wrap items-center gap-1.5">{c.required && <Badge size="sm" tone="warning">Obligatorio</Badge>}<Badge size="sm">{NIVEL_COACH[c.tier]}</Badge>{c.department && <Area code={c.department} />}</div>} />
              <div className="mb-3 h-2 overflow-hidden rounded-full bg-surface-sunken"><div className="h-full bg-success-600" style={{ width: `${ls.length ? (ok / ls.length) * 100 : 0}%` }} /></div>
              <ul className="divide-y divide-border">
                {ls.map((l) => {
                  const Ico = ICONO[l.kind];
                  const done = hechas.has(l.id);
                  return (
                    <li key={l.id}>
                      <button className="flex w-full items-center gap-3 py-3 text-left hover:bg-surface-sunken/60" onClick={() => setLeccion(l)}>
                        {done ? <CheckCircle2 className="h-5 w-5 shrink-0 text-success-600" /> : <Ico className="h-5 w-5 shrink-0 text-fg-muted" />}
                        <span className="min-w-0 flex-1"><span className="block font-medium">{l.title}</span><span className="text-sm text-fg-subtle">{TIPO[l.kind]} · {l.minutes} min{done && hechas.get(l.id) != null ? ` · ${hechas.get(l.id)}%` : ''}</span></span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </Card>
          );
        })}
      </div>
      {extra && extra.obs.length > 0 && (
        <Card className="mt-6">
          <CardHeader title="Mis observaciones de clase" />
          <ul className="space-y-3">{extra.obs.map((o) => <ObsItem key={o.id} o={o} />)}</ul>
        </Card>
      )}
      {leccion && <VerLeccion l={leccion} hecha={hechas.has(leccion.id)} onClose={() => setLeccion(null)} onDone={() => { setLeccion(null); reloadAv(); }} />}
    </>
  );
}

function VerLeccion({ l, hecha, onClose, onDone }: { l: Leccion; hecha: boolean; onClose: () => void; onDone: () => void }) {
  const { profile } = useAuth();
  const { run, busy } = useAction();
  const [resp, setResp] = useState<Record<number, number>>({});
  const [calificada, setCalificada] = useState<number | null>(null);
  const { data: ej } = useAsync(async () => l.exercise_id ? (await must(supabase.from('exercises').select('*, exercise_videos(*)').eq('id', l.exercise_id).single())) as Ejercicio : null, [l.exercise_id]);
  const preguntas = l.questions ?? [];
  const conExamen = preguntas.length > 0;

  async function terminar(score: number | null) {
    const ok = await run(async () => { await must(supabase.from('lesson_progress').upsert({ profile_id: profile!.id, lesson_id: l.id, score, completed_at: new Date().toISOString() })); return true; }, 'Lección registrada');
    if (ok) onDone();
  }
  function calificar() {
    const bien = preguntas.filter((q, i) => resp[i] === q.correcta).length;
    setCalificada(Math.round((bien / preguntas.length) * 100));
  }
  return (
    <Modal open onClose={onClose} title={l.title} size="lg" footer={
      conExamen
        ? calificada == null
          ? <Button disabled={Object.keys(resp).length < preguntas.length} onClick={calificar}>Calificar</Button>
          : calificada >= 80 ? <Button loading={busy} onClick={() => terminar(calificada)}>Guardar {calificada}%</Button>
          : <><Button variant="secondary" onClick={() => { setResp({}); setCalificada(null); }}>Intentar de nuevo</Button></>
        : <Button loading={busy} onClick={() => terminar(null)}>{hecha ? 'Listo' : 'Marcar como vista'}</Button>
    }>
      {l.body && <div className="mb-4 whitespace-pre-line text-base leading-relaxed">{parrafos(l.body)}</div>}
      {ej && <div className="mb-5"><CompararTecnica ejercicio={l.kind === 'que_esta_mal' && calificada == null ? { ...ej, errors: [] , exercise_videos: (ej.exercise_videos ?? []).map((v) => (v.kind === 'mal' ? { ...v, annotations: [] } : v)) } : ej} /></div>}
      {l.kind === 'que_esta_mal' && calificada == null && <Alert tone="info" title="Mira el video «Así no» sin marcas">Identifica qué está mal antes de ver la corrección. Al calificar aparecen las marcas.</Alert>}
      {conExamen && (
        <ol className="mt-4 space-y-4">
          {preguntas.map((q, i) => (
            <li key={i}>
              <p className="mb-2 font-semibold">{i + 1}. {q.p}</p>
              <div className="space-y-1.5">
                {q.opciones.map((o, j) => {
                  const marcada = resp[i] === j;
                  const tono = calificada == null ? (marcada ? 'border-brand-600 bg-brand-50 dark:bg-brand-900/30' : 'border-border')
                    : j === q.correcta ? 'border-success-600 bg-success-50 dark:bg-success-900/30' : marcada ? 'border-danger-600 bg-danger-50 dark:bg-danger-900/30' : 'border-border';
                  return <button key={j} disabled={calificada != null} onClick={() => setResp({ ...resp, [i]: j })} className={cn('block w-full rounded-md border px-3 py-2 text-left', tono)}>{o}</button>;
                })}
              </div>
              {calificada != null && q.explica && <p className="mt-1.5 text-sm text-fg-muted">{q.explica}</p>}
            </li>
          ))}
        </ol>
      )}
      {calificada != null && <div className="mt-4"><Alert tone={calificada >= 80 ? 'success' : 'warning'} title={`Calificación: ${calificada}%`}>{calificada >= 80 ? 'Aprobada. Guarda tu resultado.' : 'Necesitas 80% para aprobar. Revisa las explicaciones e inténtalo otra vez.'}</Alert></div>}
    </Modal>
  );
}

interface Obs { id: string; coach_id: string; observed_on: string; scores: Record<string, number>; strengths: string | null; improve: string | null; department: string | null }
interface Cert { id: string; profile_id: string; name: string; kind: string; issued_on: string; expires_on: string | null }

function ObsItem({ o }: { o: Obs }) {
  const vals = Object.values(o.scores ?? {});
  const prom = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  return (
    <li className="rounded-lg border border-border p-3">
      <div className="mb-1 flex items-center justify-between"><span className="font-medium">{dateShort(o.observed_on)}</span><Badge size="sm" tone={prom >= 3.5 ? 'success' : prom >= 2.5 ? 'info' : 'warning'}>{prom.toFixed(1)} · {ESCALA_OBS[Math.round(prom)]}</Badge></div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-fg-muted">{CRITERIOS_OBS.map((c) => <span key={c.k}>{c.label}: <b>{o.scores?.[c.k] ?? '—'}</b></span>)}</div>
      {o.strengths && <p className="mt-1.5 text-sm"><b>Fortalezas:</b> {o.strengths}</p>}
      {o.improve && <p className="text-sm"><b>A mejorar:</b> {o.improve}</p>}
    </li>
  );
}

function Panel() {
  const { allDepartments } = useAuth();
  const { data, error, reload } = useAsync(async () => {
    const { data, error } = await supabase.rpc('panel_formacion');
    if (error) throw error;
    return data as PanelFormacion;
  }, []);
  const [observar, setObservar] = useState<{ id: string; nombre: string } | null>(null);
  const [certificar, setCertificar] = useState<{ id: string; nombre: string } | null>(null);
  const [nivel, setNivel] = useState<{ id: string; nombre: string; areas: string[] } | null>(null);

  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return <Loading />;
  const sinObs = data.coaches.filter((c) => !c.ultima_obs || c.ultima_obs < new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10)).length;
  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Coaches" value={data.coaches.length} />
        <StatCard label="Rutinas por revisar" value={data.rutinas_por_revisar} />
        <StatCard label="Sin observar en 90 días" value={sinObs} />
        <StatCard label="Certificados por vencer" value={data.vencimientos.length} />
      </div>
      {data.vencimientos.length > 0 && (
        <div className="mb-4"><Alert tone="warning" title="Certificados vencidos o por vencer">
          <ul className="mt-1 space-y-0.5">{data.vencimientos.map((v, i) => <li key={i}>{v.nombre}: {v.certificado} · {v.vence < todayMx() ? 'venció' : 'vence'} el {dateShort(v.vence)}</li>)}</ul>
        </Alert></div>
      )}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-surface-sunken text-left text-fg-muted"><tr>
            <th className="px-3 py-2">Coach</th><th className="px-3 py-2">Nivel</th><th className="px-3 py-2">Lecciones</th><th className="px-3 py-2">Obligatorias pendientes</th>
            <th className="px-3 py-2">Última observación</th><th className="px-3 py-2">Promedio</th><th />
          </tr></thead>
          <tbody>
            {data.coaches.map((c) => (
              <tr key={c.id} className="border-t border-border">
                <td className="px-3 py-2"><span className="font-medium">{c.nombre}</span><span className="block text-xs text-fg-subtle">{ROLE_NAME[c.rol as AppRole] ?? c.rol} · {c.areas.map((a) => deptName(allDepartments, a)).join(', ')}</span></td>
                <td className="px-3 py-2"><button className="underline decoration-dotted" onClick={() => setNivel({ id: c.id, nombre: c.nombre, areas: c.areas })}>{NIVEL_COACH[c.nivel ?? 0]}</button></td>
                <td className="px-3 py-2">{c.lecciones}</td>
                <td className="px-3 py-2">{c.obligatorias_pendientes > 0 ? <Badge size="sm" tone="warning">{c.obligatorias_pendientes}</Badge> : <Badge size="sm" tone="success">Al día</Badge>}</td>
                <td className="px-3 py-2">{c.ultima_obs ? dateShort(c.ultima_obs) : <span className="text-fg-subtle">Nunca</span>}</td>
                <td className="px-3 py-2">{c.promedio_obs != null ? <span className="inline-flex items-center gap-1"><Star className="h-4 w-4 text-accent-500" />{c.promedio_obs}</span> : '—'}{c.por_vencer > 0 && <Badge size="sm" tone="danger" className="ml-2">Cert.</Badge>}</td>
                <td className="px-3 py-2"><div className="flex justify-end gap-1">
                  <Button size="sm" variant="secondary" icon={<ClipboardList className="h-4 w-4" />} onClick={() => setObservar({ id: c.id, nombre: c.nombre })}>Observar</Button>
                  <Button size="sm" variant="ghost" icon={<Plus className="h-4 w-4" />} onClick={() => setCertificar({ id: c.id, nombre: c.nombre })}>Certificado</Button>
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {observar && <Observar coach={observar} onClose={() => setObservar(null)} onSaved={() => { setObservar(null); reload(); }} />}
      {certificar && <Certificar coach={certificar} onClose={() => setCertificar(null)} onSaved={() => { setCertificar(null); reload(); }} />}
      {nivel && <AsignarNivel coach={nivel} onClose={() => setNivel(null)} onSaved={() => { setNivel(null); reload(); }} />}
    </>
  );
}

function Observar({ coach, onClose, onSaved }: { coach: { id: string; nombre: string }; onClose: () => void; onSaved: () => void }) {
  const { run, busy } = useAction();
  const [scores, setScores] = useState<Record<string, number>>({});
  const [fuerte, setFuerte] = useState('');
  const [mejorar, setMejorar] = useState('');
  const { data: grupos } = useAsync(async () => (await must(supabase.from('groups').select('id,name').eq('coach_id', coach.id).eq('active', true))) as { id: string; name: string }[], [coach.id]);
  const [grupo, setGrupo] = useState('');
  async function save() {
    const ok = await run(async () => { await must(supabase.from('class_observations').insert({ coach_id: coach.id, group_id: grupo || null, scores, strengths: fuerte || null, improve: mejorar || null })); return true; }, 'Observación guardada');
    if (ok) onSaved();
  }
  return (
    <Modal open onClose={onClose} title={`Observar clase · ${coach.nombre}`} size="lg" footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button loading={busy} disabled={Object.keys(scores).length < CRITERIOS_OBS.length} onClick={save}>Guardar</Button></>}>
      <div className="space-y-4">
        {(grupos ?? []).length > 0 && <Field label="Grupo observado">{(p) => <Select {...p} value={grupo} onChange={(e) => setGrupo(e.target.value)}><option value="">—</option>{grupos!.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</Select>}</Field>}
        {CRITERIOS_OBS.map((c) => (
          <div key={c.k}>
            <p className="mb-1.5 font-medium">{c.label}</p>
            <div className="grid grid-cols-4 gap-1.5">
              {[1, 2, 3, 4].map((n) => <button key={n} onClick={() => setScores({ ...scores, [c.k]: n })} className={cn('rounded-md border px-2 py-2 text-sm', scores[c.k] === n ? 'border-brand-600 bg-brand-600 text-white' : 'border-border hover:bg-surface-sunken')}>{ESCALA_OBS[n]}</button>)}
            </div>
          </div>
        ))}
        <Field label="Fortalezas">{(p) => <Textarea {...p} rows={2} value={fuerte} onChange={(e) => setFuerte(e.target.value)} />}</Field>
        <Field label="A mejorar (una o dos cosas concretas)">{(p) => <Textarea {...p} rows={2} value={mejorar} onChange={(e) => setMejorar(e.target.value)} />}</Field>
      </div>
    </Modal>
  );
}

function Certificar({ coach, onClose, onSaved }: { coach: { id: string; nombre: string }; onClose: () => void; onSaved: () => void }) {
  const { run, busy } = useAction();
  const [f, setF] = useState({ name: '', kind: 'externo', issued_on: todayMx(), expires_on: '' });
  async function save() {
    if (!f.name.trim()) return;
    const ok = await run(async () => { await must(supabase.from('staff_certifications').insert({ profile_id: coach.id, name: f.name.trim(), kind: f.kind, issued_on: f.issued_on, expires_on: f.expires_on || null })); return true; }, 'Certificado registrado');
    if (ok) onSaved();
  }
  return (
    <Modal open onClose={onClose} title={`Certificado · ${coach.nombre}`} footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button loading={busy} onClick={save}>Guardar</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre" required className="sm:col-span-2">{(p) => <Input {...p} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="RCP y primeros auxilios" />}</Field>
        <Field label="Tipo">{(p) => <Select {...p} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}><option value="externo">Externo (Cruz Roja, federación…)</option><option value="interno">Interno del club</option></Select>}</Field>
        <Field label="Fecha">{(p) => <Input {...p} type="date" value={f.issued_on} onChange={(e) => setF({ ...f, issued_on: e.target.value })} />}</Field>
        <Field label="Vence" hint="Te avisamos 30 días antes">{(p) => <Input {...p} type="date" value={f.expires_on} onChange={(e) => setF({ ...f, expires_on: e.target.value })} />}</Field>
      </div>
    </Modal>
  );
}

function AsignarNivel({ coach, onClose, onSaved }: { coach: { id: string; nombre: string; areas: string[] }; onClose: () => void; onSaved: () => void }) {
  const { allDepartments } = useAuth();
  const { run, busy } = useAction();
  const [dep, setDep] = useState(coach.areas[0] ?? '');
  const [tier, setTier] = useState('0');
  async function save() {
    if (!dep) return;
    const ok = await run(async () => { await must(supabase.from('coach_tiers').upsert({ profile_id: coach.id, department: dep, tier: Number(tier), since: todayMx() })); return true; }, 'Nivel actualizado');
    if (ok) onSaved();
  }
  return (
    <Modal open onClose={onClose} title={`Nivel de ${coach.nombre}`} size="sm" footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button loading={busy} onClick={save}>Guardar</Button></>}>
      <div className="space-y-4">
        <Field label="Área">{(p) => <Select {...p} value={dep} onChange={(e) => setDep(e.target.value)}>{coach.areas.map((a) => <option key={a} value={a}>{deptName(allDepartments, a)}</option>)}</Select>}</Field>
        <Field label="Nivel">{(p) => <Select {...p} value={tier} onChange={(e) => setTier(e.target.value)}>{NIVEL_COACH.map((n, i) => <option key={n} value={i}>{i + 1}. {n}</option>)}</Select>}</Field>
      </div>
    </Modal>
  );
}

function Cursos() {
  const { data, error, reload } = useCursos();
  const { run, busy } = useAction();
  const [nuevo, setNuevo] = useState<{ title: string; tier: string; required: boolean } | null>(null);
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return <Loading />;
  async function crear() {
    if (!nuevo?.title.trim()) return;
    const ok = await run(async () => { await must(supabase.from('courses').insert({ title: nuevo.title.trim(), tier: Number(nuevo.tier), required: nuevo.required, sort_order: data!.length + 1 })); return true; }, 'Curso creado');
    if (ok) { setNuevo(null); reload(); }
  }
  return (
    <>
      <div className="mb-3 flex justify-end"><Button icon={<Plus className="h-5 w-5" />} onClick={() => setNuevo({ title: '', tier: '0', required: false })}>Nuevo curso</Button></div>
      {data.length === 0 ? <EmptyState title="Sin cursos" /> : (
        <div className="grid gap-3 md:grid-cols-2">
          {data.map((c) => (
            <Card key={c.id}>
              <div className="flex items-start justify-between gap-2">
                <div><h3 className="font-semibold">{c.title}</h3><p className="text-sm text-fg-muted">{c.lessons?.length ?? 0} lecciones · {c.minutes} min</p></div>
                <div className="flex flex-col items-end gap-1">{c.required && <Badge size="sm" tone="warning">Obligatorio</Badge>}<Badge size="sm">{NIVEL_COACH[c.tier]}</Badge>{c.is_example && <Badge size="sm">Ejemplo</Badge>}</div>
              </div>
              <ul className="mt-2 text-sm text-fg-muted">{(c.lessons ?? []).map((l) => <li key={l.id}>· {l.title} <span className="text-fg-subtle">({TIPO[l.kind]})</span></li>)}</ul>
            </Card>
          ))}
        </div>
      )}
      {nuevo && (
        <Modal open onClose={() => setNuevo(null)} title="Nuevo curso" footer={<><Button variant="secondary" onClick={() => setNuevo(null)}>Cancelar</Button><Button loading={busy} onClick={crear}>Crear</Button></>}>
          <div className="space-y-4">
            <Field label="Nombre" required>{(p) => <Input {...p} value={nuevo.title} onChange={(e) => setNuevo({ ...nuevo, title: e.target.value })} />}</Field>
            <Field label="Nivel">{(p) => <Select {...p} value={nuevo.tier} onChange={(e) => setNuevo({ ...nuevo, tier: e.target.value })}>{NIVEL_COACH.map((n, i) => <option key={n} value={i}>{i + 1}. {n}</option>)}</Select>}</Field>
            <label className="flex items-center gap-2"><input type="checkbox" className="h-5 w-5" checked={nuevo.required} onChange={(e) => setNuevo({ ...nuevo, required: e.target.checked })} /> Obligatorio</label>
            <p className="text-sm text-fg-muted">Las lecciones (lecturas, videos, exámenes y «¿qué está mal?») se agregan desde la base de datos por ahora; la edición desde aquí llega en la siguiente vuelta.</p>
          </div>
        </Modal>
      )}
    </>
  );
}
