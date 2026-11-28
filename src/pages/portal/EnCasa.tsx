import { useState } from 'react';
import { CalendarHeart, Check, House } from 'lucide-react';
import { Alert, Badge, Button, Card, CardHeader, EmptyState, Field, Modal, PageHeader, Select, Tabs } from '@/design-system';
import { useAction, useAsync } from '@/lib/hooks';
import { supabase, must } from '@/lib/supabase';
import { useMyFamily } from '@/lib/portal';
import { ageYears, dateTime, money } from '@/lib/format';
import { MEDALLA, TIPO_EVENTO, edadTexto, type Ejercicio, type Evento, type Inscripcion } from '@/lib/academia';
import { Area, ErrorBox, Loading } from '@/components/common';
import { VideoMarcado } from '@/components/VideoTecnica';

/** Portal de familias: ejercicios para practicar en casa (versión para niños + video bien hecho) y eventos del club. */
export default function EnCasa() {
  const [tab, setTab] = useState('casa');
  return (
    <>
      <PageHeader title="En casa y eventos" description="Juegos y ejercicios sencillos para practicar en casa lo que vemos en clase, y los festivales y torneos del club para inscribir a tus hijos." />
      <Tabs className="mb-4" value={tab} onChange={setTab} items={[{ id: 'casa', label: 'Practicar en casa' }, { id: 'eventos', label: 'Eventos' }]} />
      {tab === 'casa' ? <PracticarEnCasa /> : <EventosFamilia />}
    </>
  );
}

function PracticarEnCasa() {
  const { data, error, reload } = useAsync(async () => (await must(supabase.from('exercises').select('*, exercise_videos(*)').eq('for_families', true).eq('status', 'aprobado').order('department'))) as Ejercicio[], []);
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return <Loading />;
  if (!data.length) return <EmptyState icon={<House className="h-8 w-8" />} title="Pronto habrá ejercicios para casa" />;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {data.map((e) => {
        const bien = e.exercise_videos?.find((v) => v.kind === 'bien' && v.url);
        return (
          <Card key={e.id}>
            {bien && <div className="mb-3"><VideoMarcado video={bien} lento={false} compact /></div>}
            <div className="mb-1 flex items-center justify-between gap-2"><h3 className="font-semibold">{e.title}</h3><Area code={e.department} /></div>
            <p className="text-sm text-fg-muted">{edadTexto(e.min_age, e.max_age)}</p>
            {e.kid_version && <p className="mt-2 text-base">{e.kid_version}</p>}
            {e.key_points?.length > 0 && <ul className="mt-2 space-y-1 text-sm">{e.key_points.slice(0, 3).map((k) => <li key={k} className="flex gap-1.5"><Check className="mt-0.5 h-4 w-4 shrink-0 text-success-600" />{k}</li>)}</ul>}
            {e.safety_note && <p className="mt-2 text-sm text-warning-700 dark:text-warning-300">⚠️ {e.safety_note}</p>}
          </Card>
        );
      })}
    </div>
  );
}

function EventosFamilia() {
  const { data: mine } = useMyFamily();
  const [inscribir, setInscribir] = useState<Evento | null>(null);
  const { data, error, reload } = useAsync(async () => {
    const eventos = (await must(supabase.from('events').select('*').in('status', ['abierto', 'cerrado', 'terminado']).order('starts_at'))) as Evento[];
    const mias = (await must(supabase.from('event_entries').select('*, members(first_name,last_name,birthdate)'))) as Inscripcion[];
    return { eventos, mias };
  }, []);
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data || !mine) return <Loading />;
  const hoy = new Date().toISOString();
  const proximos = data.eventos.filter((e) => e.starts_at >= hoy);
  const resultados = data.mias.filter((m) => m.result || m.medal);
  return (
    <div className="space-y-4">
      {proximos.length === 0 && <EmptyState icon={<CalendarHeart className="h-8 w-8" />} title="No hay eventos próximos" />}
      {proximos.map((e) => {
        const inscritos = data.mias.filter((m) => m.event_id === e.id);
        const abierto = e.status === 'abierto' && (!e.registration_until || e.registration_until >= hoy.slice(0, 10));
        return (
          <Card key={e.id}>
            <CardHeader title={e.title} description={`${TIPO_EVENTO[e.kind]} · ${dateTime(e.starts_at)}${e.location ? ` · ${e.location}` : ''}`}
              actions={abierto ? <Button onClick={() => setInscribir(e)}>Inscribir</Button> : <Badge tone="warning">Inscripciones cerradas</Badge>} />
            {e.description && <p className="mb-2 text-fg-muted">{e.description}</p>}
            <p className="text-sm text-fg-subtle">{Number(e.fee) > 0 ? `Cuota ${money(e.fee)} por alumno, se paga en recepción` : 'Sin costo'}{e.registration_until ? ` · Inscripción hasta ${e.registration_until.split('-').reverse().join('/')}` : ''}</p>
            {inscritos.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{inscritos.map((m) => <Badge key={m.id} tone="success" icon={<Check className="h-3 w-3" />}>{m.members?.first_name} · {m.category ?? 'inscrito'}</Badge>)}</div>}
          </Card>
        );
      })}
      {resultados.length > 0 && (
        <Card>
          <CardHeader title="Resultados de mi familia" />
          <ul className="divide-y divide-border">
            {resultados.map((r) => {
              const ev = data.eventos.find((e) => e.id === r.event_id);
              return <li key={r.id} className="flex items-center justify-between gap-2 py-2"><span><b>{r.members?.first_name}</b> · {ev?.title} · {r.category}</span><span className="text-sm">{r.result}{r.place ? ` · ${r.place}.º lugar` : ''} {r.medal ? MEDALLA[r.medal] : ''}</span></li>;
            })}
          </ul>
        </Card>
      )}
      {inscribir && <Inscribir ev={inscribir} miembros={mine.members} onClose={() => setInscribir(null)} onSaved={() => { setInscribir(null); reload(); }} />}
    </div>
  );
}

function Inscribir({ ev, miembros, onClose, onSaved }: { ev: Evento; miembros: { id: string; first_name: string; birthdate: string | null }[]; onClose: () => void; onSaved: () => void }) {
  const { run, busy } = useAction();
  const [m, setM] = useState(miembros[0]?.id ?? '');
  const [cat, setCat] = useState(ev.categories?.[0] ?? '');
  async function save() {
    if (!m) return;
    const ok = await run(async () => { await must(supabase.from('event_entries').insert({ event_id: ev.id, member_id: m, category: cat || null })); return true; }, '¡Listo! Quedó inscrito');
    if (ok) onSaved();
  }
  return (
    <Modal open onClose={onClose} title={`Inscribir · ${ev.title}`} footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button loading={busy} onClick={save}>Inscribir</Button></>}>
      <div className="space-y-4">
        <Field label="¿Quién participa?">{(p) => <Select {...p} value={m} onChange={(e) => setM(e.target.value)}>{miembros.map((x) => <option key={x.id} value={x.id}>{x.first_name}{ageYears(x.birthdate) != null ? ` · ${ageYears(x.birthdate)} años` : ''}</option>)}</Select>}</Field>
        {(ev.categories ?? []).length > 0 && <Field label="Categoría o prueba">{(p) => <Select {...p} value={cat} onChange={(e) => setCat(e.target.value)}>{ev.categories.map((c) => <option key={c} value={c}>{c}</option>)}</Select>}</Field>}
        {Number(ev.fee) > 0 && <Alert tone="info" title={`Cuota: ${money(ev.fee)}`}>Se paga en recepción antes del evento.</Alert>}
      </div>
    </Modal>
  );
}
