import { useMemo, useState, type ReactNode } from 'react';
import { ArrowLeft, CalendarHeart, Medal, Plus, Shuffle, Trash2, UserPlus } from 'lucide-react';
import { Alert, Badge, Button, Card, EmptyState, Field, Input, Modal, PageHeader, Select, StatCard, Tabs, Textarea } from '@/design-system';
import { useAuth, deptName } from '@/lib/auth';
import { useAction, useAsync } from '@/lib/hooks';
import { supabase, must } from '@/lib/supabase';
import { ageYears, dateLong, dateTime, money } from '@/lib/format';
import { DISCIPLINAS, MEDALLA, TIPO_EVENTO, type Evento, type Inscripcion, type TipoEvento } from '@/lib/academia';
import { Area, ErrorBox, Loading } from '@/components/common';

const ESTADO: Record<Evento['status'], { label: string; tone: 'neutral' | 'success' | 'warning' | 'danger' | 'info' }> = {
  borrador: { label: 'Borrador', tone: 'neutral' }, abierto: { label: 'Inscripciones abiertas', tone: 'success' },
  cerrado: { label: 'Inscripciones cerradas', tone: 'warning' }, terminado: { label: 'Terminado', tone: 'info' }, cancelado: { label: 'Cancelado', tone: 'danger' },
};

/** Festivales, torneos internos, exhibiciones y evaluaciones: inscripción por categoría, series y carriles, resultados y medallas. */
export default function Eventos() {
  const [tab, setTab] = useState('proximos');
  const [abierto, setAbierto] = useState<Evento | null>(null);
  const [edit, setEdit] = useState<Partial<Evento> | null>(null);
  const { data, error, reload } = useAsync(async () =>
    (await must(supabase.from('events').select('*, event_entries(count)').order('starts_at', { ascending: false }))) as Evento[], []);

  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return <Loading />;
  if (abierto) {
    const ev = data.find((e) => e.id === abierto.id) ?? abierto;
    return <DetalleEvento ev={ev} onBack={() => { setAbierto(null); reload(); }} onEdit={() => setEdit(ev)} editModal={edit && <EditarEvento ev={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />} />;
  }
  const hoy = new Date().toISOString();
  const proximos = data.filter((e) => e.starts_at >= hoy && e.status !== 'cancelado').reverse();
  const pasados = data.filter((e) => e.starts_at < hoy || e.status === 'cancelado');
  const lista = tab === 'proximos' ? proximos : pasados;

  return (
    <>
      <PageHeader title="Eventos y competencias" description="Festivales, torneos internos, exhibiciones y días de evaluación. Las familias inscriben a sus hijos desde su celular; aquí armas series, capturas resultados y entregas medallas."
        actions={<Button icon={<Plus className="h-5 w-5" />} onClick={() => setEdit({ kind: 'festival', status: 'abierto', fee: 0, categories: [], department: 'natacion' })}>Nuevo evento</Button>} />
      <Tabs className="mb-4" value={tab} onChange={setTab} items={[{ id: 'proximos', label: 'Próximos', count: proximos.length }, { id: 'pasados', label: 'Pasados', count: pasados.length }]} />
      {lista.length === 0 ? <EmptyState icon={<CalendarHeart className="h-8 w-8" />} title="No hay eventos aquí" description="Crea un festival o un torneo interno para motivar a los alumnos." /> : (
        <div className="grid gap-3 md:grid-cols-2">
          {lista.map((e) => {
            const n = e.event_entries?.[0]?.count ?? 0;
            return (
              <Card key={e.id} interactive onClick={() => setAbierto(e)}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-brand-700 dark:text-brand-300">{TIPO_EVENTO[e.kind]}</p>
                    <h3 className="font-semibold">{e.title}</h3>
                    <p className="text-sm text-fg-muted">{dateTime(e.starts_at)}{e.location ? ` · ${e.location}` : ''}</p>
                    <p className="mt-1 text-sm text-fg-subtle">{n} inscritos{e.capacity ? ` de ${e.capacity}` : ''}{Number(e.fee) > 0 ? ` · ${money(e.fee)}` : ' · Sin costo'}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5"><Badge size="sm" tone={ESTADO[e.status].tone}>{ESTADO[e.status].label}</Badge><Area code={e.department} /></div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
      {edit && <EditarEvento ev={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
    </>
  );
}

function EditarEvento({ ev, onClose, onSaved }: { ev: Partial<Evento>; onClose: () => void; onSaved: () => void }) {
  const { allDepartments } = useAuth();
  const { run, busy } = useAction();
  const [f, setF] = useState({
    title: ev.title ?? '', kind: ev.kind ?? 'festival', department: ev.department ?? '', location: ev.location ?? '', description: ev.description ?? '',
    starts_at: ev.starts_at ? new Date(ev.starts_at).toLocaleString('sv-SE', { timeZone: 'America/Mexico_City' }).slice(0, 16).replace(' ', 'T') : '',
    registration_until: ev.registration_until ?? '', fee: String(ev.fee ?? 0), capacity: ev.capacity ? String(ev.capacity) : '',
    categories: (ev.categories ?? []).join('\n'), status: ev.status ?? 'abierto',
  });
  const set = (k: keyof typeof f, v: string) => setF({ ...f, [k]: v });
  async function save() {
    if (!f.title.trim() || !f.starts_at) return;
    const row = {
      title: f.title.trim(), kind: f.kind, department: f.department || null, location: f.location || null, description: f.description || null,
      starts_at: new Date(`${f.starts_at}:00-06:00`).toISOString(), registration_until: f.registration_until || null, fee: Number(f.fee || 0),
      capacity: f.capacity ? Number(f.capacity) : null, categories: f.categories.split('\n').map((s) => s.trim()).filter(Boolean), status: f.status,
    };
    const ok = await run(async () => { if (ev.id) await must(supabase.from('events').update(row).eq('id', ev.id)); else await must(supabase.from('events').insert(row)); return true; }, 'Evento guardado');
    if (ok) onSaved();
  }
  return (
    <Modal open onClose={onClose} title={ev.id ? 'Editar evento' : 'Nuevo evento'} size="lg" footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button loading={busy} onClick={save}>Guardar</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre" required className="sm:col-span-2">{(p) => <Input {...p} value={f.title} onChange={(e) => set('title', e.target.value)} placeholder="Festival de Invierno" />}</Field>
        <Field label="Tipo">{(p) => <Select {...p} value={f.kind} onChange={(e) => set('kind', e.target.value)}>{(Object.keys(TIPO_EVENTO) as TipoEvento[]).map((k) => <option key={k} value={k}>{TIPO_EVENTO[k]}</option>)}</Select>}</Field>
        <Field label="Área">{(p) => <Select {...p} value={f.department} onChange={(e) => set('department', e.target.value)}><option value="">Todo el club</option>{DISCIPLINAS.map((d) => <option key={d} value={d}>{deptName(allDepartments, d)}</option>)}</Select>}</Field>
        <Field label="Fecha y hora" required>{(p) => <Input {...p} type="datetime-local" value={f.starts_at} onChange={(e) => set('starts_at', e.target.value)} />}</Field>
        <Field label="Lugar">{(p) => <Input {...p} value={f.location} onChange={(e) => set('location', e.target.value)} placeholder="Alberca semiolímpica" />}</Field>
        <Field label="Inscripción hasta">{(p) => <Input {...p} type="date" value={f.registration_until} onChange={(e) => set('registration_until', e.target.value)} />}</Field>
        <Field label="Estado">{(p) => <Select {...p} value={f.status} onChange={(e) => set('status', e.target.value)}>{Object.entries(ESTADO).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select>}</Field>
        <Field label="Cuota (MXN)">{(p) => <Input {...p} type="number" min={0} value={f.fee} onChange={(e) => set('fee', e.target.value)} />}</Field>
        <Field label="Cupo total">{(p) => <Input {...p} type="number" min={0} value={f.capacity} onChange={(e) => set('capacity', e.target.value)} placeholder="Sin límite" />}</Field>
        <Field label="Categorías o pruebas" hint="Una por renglón, por ejemplo «25 m crol · 6 a 8 años»" className="sm:col-span-2">{(p) => <Textarea {...p} rows={4} value={f.categories} onChange={(e) => set('categories', e.target.value)} />}</Field>
        <Field label="Descripción para las familias" className="sm:col-span-2">{(p) => <Textarea {...p} rows={3} value={f.description} onChange={(e) => set('description', e.target.value)} />}</Field>
      </div>
    </Modal>
  );
}

interface MiembroBusqueda { id: string; first_name: string; last_name: string; birthdate: string | null }

function DetalleEvento({ ev, onBack, onEdit, editModal }: { ev: Evento; onBack: () => void; onEdit: () => void; editModal: ReactNode }) {
  const { run, busy } = useAction();
  const [cat, setCat] = useState('');
  const [agregar, setAgregar] = useState(false);
  const { data, error, reload } = useAsync(async () =>
    (await must(supabase.from('event_entries').select('*, members(first_name,last_name,birthdate)').eq('event_id', ev.id).order('category').order('heat').order('lane'))) as Inscripcion[], [ev.id]);
  const cats = useMemo(() => Array.from(new Set([...(ev.categories ?? []), ...(data ?? []).map((d) => d.category ?? 'Sin categoría')])), [ev.categories, data]);

  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return <Loading />;
  const lista = cat ? data.filter((d) => (d.category ?? 'Sin categoría') === cat) : data;
  const pagados = data.filter((d) => d.paid).length;
  const medallas = data.filter((d) => d.medal && d.medal !== 'participacion').length;

  async function patch(id: string, row: Partial<Inscripcion>) {
    await run(async () => { await must(supabase.from('event_entries').update(row).eq('id', id)); reload(); });
  }
  async function quitar(id: string) { await run(async () => { await must(supabase.from('event_entries').delete().eq('id', id)); reload(); }, 'Inscripción quitada'); }
  /** Reparte cada categoría en series de 6 carriles, de menor a mayor edad. */
  async function asignarSeries() {
    await run(async () => {
      const porCat = new Map<string, Inscripcion[]>();
      data!.forEach((d) => { const k = d.category ?? ''; porCat.set(k, [...(porCat.get(k) ?? []), d]); });
      for (const lista of porCat.values()) {
        const orden = [...lista].sort((a, b) => (b.members?.birthdate ?? '').localeCompare(a.members?.birthdate ?? ''));
        for (let i = 0; i < orden.length; i++) await must(supabase.from('event_entries').update({ heat: Math.floor(i / 6) + 1, lane: (i % 6) + 1 }).eq('id', orden[i].id));
      }
      reload();
    }, 'Series y carriles asignados');
  }
  /** Ordena por tiempo dentro de cada categoría y pone lugar y medalla. */
  async function premiar() {
    await run(async () => {
      const porCat = new Map<string, Inscripcion[]>();
      data!.filter((d) => d.result).forEach((d) => { const k = d.category ?? ''; porCat.set(k, [...(porCat.get(k) ?? []), d]); });
      const t = (s: string) => { const [m, x] = s.includes(':') ? s.split(':') : ['0', s]; return Number(m) * 60 + Number(x); };
      for (const lista of porCat.values()) {
        const orden = [...lista].sort((a, b) => t(a.result!) - t(b.result!));
        for (let i = 0; i < orden.length; i++) {
          const medal = ev.kind === 'torneo' ? (['oro', 'plata', 'bronce'][i] ?? 'participacion') : 'participacion';
          await must(supabase.from('event_entries').update({ place: i + 1, medal }).eq('id', orden[i].id));
        }
      }
      reload();
    }, 'Lugares y medallas calculados');
  }

  return (
    <>
      <Button variant="ghost" icon={<ArrowLeft className="h-4 w-4" />} onClick={onBack} className="mb-2">Eventos</Button>
      <PageHeader title={ev.title} description={`${TIPO_EVENTO[ev.kind]} · ${dateLong(ev.starts_at)}${ev.location ? ` · ${ev.location}` : ''}`}
        actions={<div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={onEdit}>Editar</Button><Button icon={<UserPlus className="h-5 w-5" />} onClick={() => setAgregar(true)}>Inscribir</Button></div>} />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Inscritos" value={`${data.length}${ev.capacity ? ` / ${ev.capacity}` : ''}`} />
        <StatCard label="Pagados" value={Number(ev.fee) > 0 ? `${pagados} de ${data.length}` : 'Sin costo'} />
        <StatCard label="Categorías" value={cats.length} />
        <StatCard label="Medallas" value={medallas} icon={<Medal className="h-5 w-5" />} />
      </div>
      {ev.description && <div className="mb-4"><Alert tone="info" title="Para las familias">{ev.description}</Alert></div>}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Select value={cat} onChange={(e) => setCat(e.target.value)} className="max-w-xs"><option value="">Todas las categorías</option>{cats.map((c) => <option key={c} value={c}>{c}</option>)}</Select>
        <Button variant="secondary" size="sm" icon={<Shuffle className="h-4 w-4" />} loading={busy} onClick={asignarSeries}>Asignar series y carriles</Button>
        <Button variant="secondary" size="sm" icon={<Medal className="h-4 w-4" />} loading={busy} onClick={premiar}>Calcular lugares y medallas</Button>
      </div>
      {lista.length === 0 ? <EmptyState title="Sin inscritos todavía" description="Las familias pueden inscribirse desde su portal, o inscríbelos tú." /> : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-surface-sunken text-left text-fg-muted"><tr>
              <th className="px-3 py-2">Alumno</th><th className="px-3 py-2">Categoría</th><th className="px-3 py-2">Serie</th><th className="px-3 py-2">Carril</th>
              <th className="px-3 py-2">Resultado</th><th className="px-3 py-2">Lugar</th><th className="px-3 py-2">Medalla</th><th className="px-3 py-2">Pagado</th><th />
            </tr></thead>
            <tbody>
              {lista.map((d) => (
                <tr key={d.id} className="border-t border-border">
                  <td className="px-3 py-2 font-medium">{d.members ? `${d.members.first_name} ${d.members.last_name}` : '—'}<span className="block text-xs text-fg-subtle">{ageYears(d.members?.birthdate) ?? '—'} años</span></td>
                  <td className="px-3 py-2">{d.category ?? '—'}</td>
                  <td className="px-3 py-2"><Input className="w-16" type="number" defaultValue={d.heat ?? ''} onBlur={(e) => e.target.value !== String(d.heat ?? '') && patch(d.id, { heat: e.target.value ? Number(e.target.value) : null })} aria-label="Serie" /></td>
                  <td className="px-3 py-2"><Input className="w-16" type="number" defaultValue={d.lane ?? ''} onBlur={(e) => e.target.value !== String(d.lane ?? '') && patch(d.id, { lane: e.target.value ? Number(e.target.value) : null })} aria-label="Carril" /></td>
                  <td className="px-3 py-2"><Input className="w-24" defaultValue={d.result ?? ''} placeholder="0:28.4" onBlur={(e) => e.target.value !== (d.result ?? '') && patch(d.id, { result: e.target.value || null })} aria-label="Resultado" /></td>
                  <td className="px-3 py-2">{d.place ?? '—'}</td>
                  <td className="px-3 py-2"><Select value={d.medal ?? ''} onChange={(e) => patch(d.id, { medal: (e.target.value || null) as Inscripcion['medal'] })} aria-label="Medalla"><option value="">—</option>{Object.entries(MEDALLA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></td>
                  <td className="px-3 py-2"><input type="checkbox" className="h-5 w-5" checked={d.paid} onChange={(e) => patch(d.id, { paid: e.target.checked })} aria-label="Pagado" /></td>
                  <td className="px-3 py-2"><Button size="sm" variant="ghost" icon={<Trash2 className="h-4 w-4" />} onClick={() => quitar(d.id)} aria-label="Quitar" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {agregar && <InscribirAlumno ev={ev} onClose={() => setAgregar(false)} onSaved={() => { setAgregar(false); reload(); }} />}
      {editModal}
    </>
  );
}

function InscribirAlumno({ ev, onClose, onSaved }: { ev: Evento; onClose: () => void; onSaved: () => void }) {
  const { run, busy } = useAction();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState(ev.categories?.[0] ?? '');
  const [sel, setSel] = useState<MiembroBusqueda | null>(null);
  const { data } = useAsync(async () => q.trim().length < 2 ? [] : (await must(supabase.from('members').select('id,first_name,last_name,birthdate').eq('active', true)
    .or(`first_name.ilike.%${q.trim()}%,last_name.ilike.%${q.trim()}%`).limit(8))) as MiembroBusqueda[], [q]);
  async function save() {
    if (!sel) return;
    const ok = await run(async () => { await must(supabase.from('event_entries').insert({ event_id: ev.id, member_id: sel.id, category: cat || null })); return true; }, 'Alumno inscrito');
    if (ok) onSaved();
  }
  return (
    <Modal open onClose={onClose} title="Inscribir alumno" footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button loading={busy} disabled={!sel} onClick={save}>Inscribir</Button></>}>
      <div className="space-y-4">
        <Field label="Buscar alumno">{(p) => <Input {...p} value={q} onChange={(e) => { setQ(e.target.value); setSel(null); }} placeholder="Nombre o apellido" autoFocus />}</Field>
        {!sel && (data ?? []).length > 0 && (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {data!.map((m) => <li key={m.id}><button className="w-full px-3 py-2 text-left hover:bg-surface-sunken" onClick={() => setSel(m)}>{m.first_name} {m.last_name} <span className="text-fg-subtle">· {ageYears(m.birthdate) ?? '—'} años</span></button></li>)}
          </ul>
        )}
        {sel && <Alert tone="success" title={`${sel.first_name} ${sel.last_name}`}>{ageYears(sel.birthdate) ?? '—'} años</Alert>}
        {(ev.categories ?? []).length > 0 && <Field label="Categoría">{(p) => <Select {...p} value={cat} onChange={(e) => setCat(e.target.value)}>{ev.categories.map((c) => <option key={c} value={c}>{c}</option>)}</Select>}</Field>}
      </div>
    </Modal>
  );
}
