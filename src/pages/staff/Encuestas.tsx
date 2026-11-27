import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, MessageCircle, Plus, Smile } from 'lucide-react';
import { AREA_LABEL, Badge, Button, Card, CardHeader, ConfirmFooter, EmptyState, Field, Input, Modal, PageHeader, Select, StatCard, Switch, Table, Tabs, Textarea, type AreaKey } from '@/design-system';
import { useAuth } from '@/lib/auth';
import { useAction, useAsync } from '@/lib/hooks';
import { supabase, must } from '@/lib/supabase';
import { dateShort, downloadCsv, todayMx } from '@/lib/format';
import { ErrorBox, Loading, Pill } from '@/components/common';
import { Bars } from '@/components/charts';
import { FamilyPicker, type PickedFamily } from '@/components/FamilyPicker';
import { AREAS_ENCUESTA, NPS_LABEL, NPS_TONE, ScorePicker, npsTipo } from '@/components/Encuesta';
import { waPhone } from './Recordatorios';

interface Survey { id: string; title: string; question: string; starts_on: string; ends_on: string | null; active: boolean; created_at: string }
interface Respuesta {
  id: string; survey_id: string; family_id: string; department: string | null; score: number; comment: string | null; created_at: string;
  follow_status: 'pendiente' | 'atendida' | 'no_aplica' | null; follow_note: string | null; followed_at: string | null;
  families: { name: string; number: number; phone: string | null } | null; surveys: { title: string } | null;
}
interface Resumen {
  respuestas: number; promedio: number | null; promotores: number; neutrales: number; detractores: number; nps: number | null;
  familias_activas: number; pendientes: number; distribucion: { score: number; n: number }[];
  por_mes: { mes: string; n: number; nps: number; promedio: number }[]; por_area: { area: string; n: number; nps: number; promedio: number }[];
}

const areaLabel = (a: string | null) => (a && a in AREA_LABEL ? AREA_LABEL[a as AreaKey] : 'Club en general');
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const mesLabel = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`;
const surveyOpen = (s: Survey) => s.active && s.starts_on <= todayMx() && (!s.ends_on || s.ends_on >= todayMx());

function npsTone(n: number | null) { return n == null ? 'neutral' : n >= 50 ? 'good' : n >= 0 ? 'warn' : 'bad'; }

/** Satisfacción de las familias: NPS, comentarios y seguimiento de calificaciones bajas. */
export default function Encuestas() {
  const { isManager, isFrontOffice } = useAuth();
  const [survey, setSurvey] = useState('');
  const [tab, setTab] = useState('atender');
  const [edit, setEdit] = useState<Partial<Survey> | null>(null);
  const [capture, setCapture] = useState(false);
  const { data, error, reload } = useAsync(async () => {
    const [surveys, resumen, resp] = await Promise.all([
      must(supabase.from('surveys').select('*').order('starts_on', { ascending: false })),
      must(supabase.rpc('encuestas_resumen', { p_survey: survey || null, p_area: null })),
      (() => { let q = supabase.from('survey_responses').select('*, families(name, number, phone), surveys(title)').order('created_at', { ascending: false }).limit(500);
        if (survey) q = q.eq('survey_id', survey); return must(q); })(),
    ]);
    return { surveys: surveys as Survey[], resumen: resumen as Resumen, resp: resp as Respuesta[] };
  }, [survey]);
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return <Loading />;
  const { surveys, resumen: r, resp } = data;
  const abierta = surveys.find(surveyOpen);
  const pend = resp.filter((x) => x.follow_status === 'pendiente');

  return (
    <>
      <PageHeader title="Satisfacción de las familias" description="Una pregunta del 0 al 10: ¿qué tan probable es que nos recomienden? Las familias la contestan desde su app y ganan puntos. Las calificaciones bajas suben el riesgo de baja y quedan aquí para darles seguimiento."
        actions={<>
          {isFrontOffice && abierta && <Button variant="secondary" onClick={() => setCapture(true)}>Capturar respuesta</Button>}
          {isManager && <Button icon={<Plus className="h-5 w-5" />} onClick={() => setEdit({ active: true, starts_on: todayMx(), title: `Satisfacción · ${new Date().toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })}` })}>Nueva encuesta</Button>}
        </>} />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="text-sm font-semibold">Encuesta
          <Select className="mt-1 min-w-[260px]" value={survey} onChange={(e) => setSurvey(e.target.value)}>
            <option value="">Todas</option>
            {surveys.map((s) => <option key={s.id} value={s.id}>{s.title}{surveyOpen(s) ? ' (abierta)' : ''}</option>)}
          </Select>
        </label>
        {abierta ? <Badge tone="success">Abierta: {abierta.title}{abierta.ends_on ? ` · hasta el ${dateShort(abierta.ends_on)}` : ''}</Badge>
          : <Badge tone="neutral">No hay encuesta abierta para las familias</Badge>}
      </div>

      {r.respuestas === 0 ? (
        <Card><EmptyState icon={<Smile className="h-8 w-8" />} title="Aún no hay respuestas" description={abierta ? 'Las familias verán la encuesta al entrar a su app.' : 'Crea una encuesta para que las familias la contesten desde su app.'} /></Card>
      ) : (
        <>
          <div className="ob-stats mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="NPS (de −100 a 100)" value={<Pill tone={npsTone(r.nps)}>{r.nps ?? '—'}</Pill>} hint="% que recomiendan menos % inconformes" />
            <StatCard label="Calificación promedio" value={`${r.promedio ?? '—'} / 10`} />
            <StatCard label="Respuestas" value={String(r.respuestas)} hint={survey && r.familias_activas ? `${Math.round((100 * r.respuestas) / r.familias_activas)}% de las familias activas` : undefined} />
            <StatCard label="Por atender" value={String(r.pendientes)} hint="Calificaciones de 0 a 6 sin seguimiento" />
          </div>
          <div className="mb-6 grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title="¿Quiénes nos recomiendan?" />
              <div className="flex h-5 overflow-hidden rounded-full" aria-hidden>
                {[['bg-success-600', r.promotores], ['bg-warning-600', r.neutrales], ['bg-danger-600', r.detractores]].map(([c, n], i) =>
                  <div key={i} className={String(c)} style={{ width: `${(100 * Number(n)) / r.respuestas}%` }} />)}
              </div>
              <ul className="mt-3 grid grid-cols-3 gap-2 text-sm">
                <li><span className="font-bold text-success-700">{Math.round((100 * r.promotores) / r.respuestas)}%</span> recomiendan (9-10)</li>
                <li><span className="font-bold text-warning-700">{Math.round((100 * r.neutrales) / r.respuestas)}%</span> neutrales (7-8)</li>
                <li><span className="font-bold text-danger-700">{Math.round((100 * r.detractores) / r.respuestas)}%</span> inconformes (0-6)</li>
              </ul>
              <div className="mt-4"><Bars height={160} data={r.distribucion.map((d) => ({ label: String(d.score), value: d.n, detail: `Calificación ${d.score}` }))}
                format={(n) => String(Math.round(n))} labelEvery={1} /></div>
            </Card>
            <Card>
              <CardHeader title="Por área" description="Promedio y NPS de cada área que mencionaron." />
              <ul className="divide-y divide-border">
                {r.por_area.map((a) => (
                  <li key={a.area} className="flex items-center justify-between gap-3 py-2">
                    <span className="text-base">{areaLabel(a.area === 'general' ? null : a.area)} <span className="text-sm text-fg-muted">· {a.n}</span></span>
                    <span className="flex items-center gap-2"><span className="text-sm text-fg-muted ob-num">{a.promedio}/10</span><Pill tone={npsTone(a.nps)}>NPS {a.nps}</Pill></span>
                  </li>
                ))}
              </ul>
              {r.por_mes.length > 1 && (
                <>
                  <p className="mb-1 mt-4 text-sm font-semibold">Mes a mes</p>
                  <ul className="flex flex-wrap gap-2">{r.por_mes.map((m) => <li key={m.mes} className="rounded-md border border-border px-2.5 py-1 text-sm"><span className="font-semibold">{mesLabel(m.mes)}</span> · NPS {m.nps} · {m.n} resp.</li>)}</ul>
                </>
              )}
            </Card>
          </div>
        </>
      )}

      <Tabs className="mb-4" value={tab} onChange={setTab} items={[
        { id: 'atender', label: 'Por atender', count: pend.length }, { id: 'todas', label: 'Respuestas y comentarios' }, { id: 'encuestas', label: 'Encuestas' },
      ]} />
      {tab === 'atender' && <Atender rows={pend} onChanged={reload} />}
      {tab === 'todas' && <Todas rows={resp} onChanged={reload} />}
      {tab === 'encuestas' && <Lista surveys={surveys} canEdit={isManager} onEdit={setEdit} />}

      {edit && <EditSurvey value={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
      {capture && abierta && <Capturar survey={abierta} onClose={() => setCapture(false)} onSaved={() => { setCapture(false); reload(); }} />}
    </>
  );
}

function Atender({ rows, onChanged }: { rows: Respuesta[]; onChanged: () => void }) {
  const [sel, setSel] = useState<Respuesta | null>(null);
  if (rows.length === 0) return <Card><EmptyState icon={<Check className="h-8 w-8" />} title="Nada pendiente" description="Todas las calificaciones bajas ya tienen seguimiento." /></Card>;
  return (
    <>
      <div className="grid gap-3 md:grid-cols-2">
        {rows.map((x) => (
          <Card key={x.id}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <Link to={`/familias/${x.family_id}`} className="text-base font-semibold hover:underline">{x.families?.name} <span className="text-fg-muted">#{x.families?.number}</span></Link>
                <p className="text-sm text-fg-muted">{areaLabel(x.department)} · {dateShort(x.created_at)}</p>
              </div>
              <Pill tone="bad">{x.score}/10</Pill>
            </div>
            {x.comment && <p className="mt-2 rounded-md bg-surface-sunken px-3 py-2 text-base">«{x.comment}»</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" onClick={() => setSel(x)}>Registrar seguimiento</Button>
              {waPhone(x.families?.phone ?? null) && <Button size="sm" variant="secondary" icon={<MessageCircle className="h-4 w-4" />}
                onClick={() => window.open(`https://wa.me/${waPhone(x.families!.phone)}?text=${encodeURIComponent(`Hola, somos de Oberlicht. Gracias por contestar nuestra encuesta. Nos gustaría saber más de tu experiencia para mejorar${x.department ? ` en ${areaLabel(x.department)}` : ''}. ¿Tienes unos minutos?`)}`, '_blank', 'noopener')}>WhatsApp</Button>}
            </div>
          </Card>
        ))}
      </div>
      {sel && <Seguimiento r={sel} onClose={() => setSel(null)} onSaved={() => { setSel(null); onChanged(); }} />}
    </>
  );
}

function Seguimiento({ r, onClose, onSaved }: { r: Respuesta; onClose: () => void; onSaved: () => void }) {
  const [note, setNote] = useState(r.follow_note ?? '');
  const { busy, run } = useAction();
  const save = async (status: string) => {
    if (status === 'atendida' && !note.trim()) return;
    const ok = await run(() => must(supabase.rpc('atender_respuesta', { p_response: r.id, p_status: status, p_note: note.trim() || null })), 'Seguimiento guardado');
    if (ok) onSaved();
  };
  return (
    <Modal open onClose={onClose} title={`Seguimiento · ${r.families?.name ?? ''}`}
      footer={<div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={() => save('no_aplica')} loading={busy}>No requiere</Button>
        <Button onClick={() => save('atendida')} loading={busy} disabled={!note.trim()}>Marcar como atendida</Button>
      </div>}>
      <p className="mb-3 text-base">Calificó con <strong>{r.score}/10</strong>{r.comment ? <> y comentó: «{r.comment}»</> : ''}.</p>
      <Field label="¿Qué se hizo?" required hint="Ej. Se llamó y se ofreció cambio de horario.">{(p) => <Textarea {...p} rows={3} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
    </Modal>
  );
}

function Todas({ rows, onChanged }: { rows: Respuesta[]; onChanged: () => void }) {
  const [f, setF] = useState<'todas' | 'promotor' | 'neutral' | 'detractor'>('todas');
  const [sel, setSel] = useState<Respuesta | null>(null);
  const shown = rows.filter((x) => f === 'todas' || npsTipo(x.score) === f);
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {(['todas', 'promotor', 'neutral', 'detractor'] as const).map((k) => (
          <button key={k} type="button" onClick={() => setF(k)} className={`min-h-[40px] rounded-full border px-3 text-sm font-semibold ${f === k ? 'border-primary bg-primary-soft text-primary' : 'border-border'}`}>
            {k === 'todas' ? 'Todas' : NPS_LABEL[k] + 's'} ({k === 'todas' ? rows.length : rows.filter((x) => npsTipo(x.score) === k).length})
          </button>
        ))}
        <Button variant="secondary" className="ml-auto" disabled={!rows.length} onClick={() => downloadCsv('encuestas', rows.map((x) => ({
          Fecha: dateShort(x.created_at), Encuesta: x.surveys?.title ?? '', Familia: x.families?.name ?? '', Numero: x.families?.number ?? '', Area: areaLabel(x.department),
          Calificacion: x.score, Tipo: NPS_LABEL[npsTipo(x.score)], Comentario: x.comment ?? '', Seguimiento: x.follow_status ?? '', Nota: x.follow_note ?? '' })))}>Descargar</Button>
      </div>
      <Table rows={shown} rowKey={(x) => x.id} empty="Sin respuestas." onRowClick={(x) => x.score <= 6 ? setSel(x) : undefined} columns={[
        { key: 'f', header: 'Familia', cell: (x) => <div><p className="font-semibold">{x.families?.name} <span className="text-fg-muted">#{x.families?.number}</span></p><p className="text-sm text-fg-muted">{dateShort(x.created_at)} · {areaLabel(x.department)}</p></div> },
        { key: 's', header: 'Calif.', cell: (x) => <Badge tone={NPS_TONE[npsTipo(x.score)]}>{x.score}/10</Badge> },
        { key: 'c', header: 'Comentario', cell: (x) => <span className="text-sm">{x.comment ?? <span className="text-fg-subtle">—</span>}</span> },
        { key: 'u', header: 'Seguimiento', hideOnMobile: true, cell: (x) => x.follow_status === 'pendiente' ? <Badge tone="danger">Por atender</Badge>
          : x.follow_status === 'atendida' ? <span className="text-sm" title={x.follow_note ?? ''}><Badge tone="success">Atendida</Badge></span>
          : x.follow_status === 'no_aplica' ? <Badge tone="neutral">No requiere</Badge> : <span className="text-fg-subtle">—</span> },
      ]} />
      {sel && <Seguimiento r={sel} onClose={() => setSel(null)} onSaved={() => { setSel(null); onChanged(); }} />}
    </>
  );
}

function Lista({ surveys, canEdit, onEdit }: { surveys: Survey[]; canEdit: boolean; onEdit: (s: Survey) => void }) {
  return (
    <Table rows={surveys} rowKey={(s) => s.id} onRowClick={canEdit ? onEdit : undefined} empty="Aún no hay encuestas." columns={[
      { key: 't', header: 'Encuesta', cell: (s) => <div><p className="font-semibold">{s.title}</p><p className="text-sm text-fg-muted">{s.question}</p></div> },
      { key: 'v', header: 'Vigencia', cell: (s) => <span className="text-sm">{dateShort(s.starts_on)} – {s.ends_on ? dateShort(s.ends_on) : 'sin fin'}</span> },
      { key: 'e', header: 'Estado', cell: (s) => surveyOpen(s) ? <Badge tone="success">Abierta</Badge> : !s.active ? <Badge tone="neutral">Pausada</Badge>
        : s.starts_on > todayMx() ? <Badge tone="info">Programada</Badge> : <Badge tone="neutral">Cerrada</Badge> },
    ]} />
  );
}

function EditSurvey({ value, onClose, onSaved }: { value: Partial<Survey>; onClose: () => void; onSaved: () => void }) {
  const [s, setS] = useState(value);
  const { busy, run } = useAction();
  const set = (k: keyof Survey, v: unknown) => setS((x) => ({ ...x, [k]: v }));
  async function save() {
    if (!s.title?.trim()) throw new Error('Escribe un nombre para la encuesta.');
    const payload = { title: s.title.trim(), question: s.question?.trim() || undefined, starts_on: s.starts_on || todayMx(), ends_on: s.ends_on || null, active: s.active ?? true };
    if (s.id) await must(supabase.from('surveys').update(payload).eq('id', s.id).select()); else await must(supabase.from('surveys').insert(payload).select());
  }
  return (
    <Modal open onClose={onClose} title={s.id ? 'Editar encuesta' : 'Nueva encuesta'}
      footer={<ConfirmFooter onCancel={onClose} confirmLabel="Guardar" loading={busy} onConfirm={async () => { if (await run(async () => { await save(); return true; }, 'Encuesta guardada')) onSaved(); }} />}>
      <div className="grid gap-3">
        <Field label="Nombre" required>{(p) => <Input {...p} value={s.title ?? ''} onChange={(e) => set('title', e.target.value)} />}</Field>
        <Field label="Pregunta" hint="Si la dejas vacía se usa: ¿Qué tan probable es que recomiendes Oberlicht a un amigo o familiar?">
          {(p) => <Textarea {...p} rows={2} value={s.question ?? ''} onChange={(e) => set('question', e.target.value)} />}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Desde">{(p) => <Input {...p} type="date" value={s.starts_on ?? ''} onChange={(e) => set('starts_on', e.target.value)} />}</Field>
          <Field label="Hasta" hint="Sugerido: 2 a 4 semanas">{(p) => <Input {...p} type="date" value={s.ends_on ?? ''} onChange={(e) => set('ends_on', e.target.value)} />}</Field>
        </div>
        <Switch checked={s.active ?? true} onChange={(v) => set('active', v)} label="Activa (las familias la ven en su app mientras esté vigente)" />
      </div>
    </Modal>
  );
}

/** Recepción captura la respuesta de una familia que contestó en persona o por teléfono. */
function Capturar({ survey, onClose, onSaved }: { survey: Survey; onClose: () => void; onSaved: () => void }) {
  const [fam, setFam] = useState<PickedFamily | null>(null);
  const [score, setScore] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [area, setArea] = useState('');
  const { busy, run } = useAction();
  return (
    <Modal open onClose={onClose} title={`Capturar respuesta · ${survey.title}`} size="lg"
      footer={<ConfirmFooter onCancel={onClose} confirmLabel="Guardar respuesta" loading={busy} onConfirm={async () => {
        if (!fam || score === null) return;
        const ok = await run(() => must(supabase.rpc('responder_encuesta', { p_survey: survey.id, p_family: fam.id, p_score: score, p_comment: comment || null, p_department: area || null })), 'Respuesta guardada');
        if (ok) onSaved();
      }} />}>
      <div className="grid gap-4">
        <Field label="Familia" required>{() => <FamilyPicker value={fam} onChange={setFam} />}</Field>
        <div><p className="mb-1 text-sm font-semibold">{survey.question}</p><ScorePicker value={score} onChange={setScore} /></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Comentario">{(p) => <Textarea {...p} rows={2} value={comment} onChange={(e) => setComment(e.target.value)} />}</Field>
          <Field label="Área">{(p) => <Select {...p} value={area} onChange={(e) => setArea(e.target.value)}>
            <option value="">El club en general</option>{AREAS_ENCUESTA.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>}</Field>
        </div>
      </div>
    </Modal>
  );
}
