import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Flame, MessageCircle, Plus } from 'lucide-react';
import { Button, Card, CardHeader, ConfirmFooter, EmptyState, Field, Input, Modal, PageHeader, Select, StatCard, Switch, Tabs, Textarea } from '@/design-system';
import { useAuth, deptName } from '@/lib/auth';
import { useAction, useAsync, useToast } from '@/lib/hooks';
import { supabase, must } from '@/lib/supabase';
import { todayMx } from '@/lib/format';
import type { DeptCode } from '@/lib/types';
import { ErrorBox, Loading } from '@/components/common';
import { RetoCard, Tabla } from '@/components/Progreso';
import { waPhone } from './Recordatorios';
import { CATEGORIA_CORTA, RETO_TIPO, dias, semanas, type Categoria, type Challenge, type FilaConstancia, type FilaReto, type PanelProgreso, type RetoTipo } from '@/lib/progreso';

/** Progreso y retos del club: quién participa, rachas por cuidar, medallas cerca, retos y tablas. */
export default function ProgresoClub() {
  const nav = useNavigate();
  const toast = useToast();
  const { isFrontOffice, myAreas, allDepartments, profile } = useAuth();
  const canEdit = isFrontOffice || profile?.role === 'coordinador';
  const seeAll = isFrontOffice || profile?.role === 'direccion';
  const [area, setArea] = useState<string>(seeAll ? '' : myAreas[0] ?? '');
  const [tab, setTab] = useState('cuidar');
  const [edit, setEdit] = useState<Partial<Challenge> | null>(null);
  const [tabla, setTabla] = useState('constancia');
  const [cat, setCat] = useState<Categoria | ''>('');

  const { data, error, reload } = useAsync(async () => (await must(supabase.rpc('panel_progreso', { p_area: area || null }))) as PanelProgreso, [area]);
  const { data: filas } = useAsync(async () => {
    if (tab !== 'tablas') return null;
    if (tabla === 'constancia') return (await must(supabase.rpc('tabla_constancia', { p_categoria: cat || null }))) as FilaConstancia[];
    return (await must(supabase.rpc('tabla_reto', { p_challenge: tabla, p_categoria: cat || null }))) as FilaReto[];
  }, [tab, tabla, cat]);

  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return <Loading />;
  const d = data;
  const pct = d.activos_totales ? Math.round((100 * d.participantes) / d.activos_totales) : 0;
  const hoy = todayMx();
  const retos = [...d.retos].sort((a, b) => Number(b.termina >= hoy) - Number(a.termina >= hoy) || a.termina.localeCompare(b.termina));
  const areas = (isFrontOffice ? ['natacion', 'ballet', 'gimnasia', 'oberfit', 'terapia', 'nutricion'] : myAreas) as DeptCode[];

  function whatsapp(r: PanelProgreso['rachas_en_riesgo'][number]) {
    const phone = waPhone(r.telefono);
    if (!phone) { toast('No hay un celular válido para esta familia', 'warning'); return; }
    const first = r.nombre.split(' ')[0];
    const falta = r.meta - r.semana_dias;
    const body = `¡Hola! ${first} lleva ${semanas(r.racha)} seguidas entrenando en Oberlicht 🔥. Esta semana ${falta === 1 ? 'le falta 1 día' : `le faltan ${falta} días`} para no perder su racha. ¡Te esperamos!`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(body)}`, '_blank');
  }

  async function openEdit(id: string) {
    const c = (await must(supabase.from('challenges').select('*').eq('id', id).single())) as Challenge;
    setEdit(c);
  }

  return (
    <>
      <PageHeader title="Progreso y retos" description="Los socios que se inscriben voluntariamente ven su constancia, rachas y medallas en su app. Aquí ves todo concentrado y organizas los retos del club."
        actions={canEdit ? <Button icon={<Plus className="h-5 w-5" />} onClick={() => setEdit({ kind: 'dias', target: 12, collective: false, active: true, starts_on: hoy, ends_on: hoy })}>Nuevo reto</Button> : undefined} />
      <div className="ob-stats mb-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Participan" value={d.participantes} hint={`${pct}% de los socios activos`} />
        <StatCard label="En tablas del club" value={d.publico} hint={`${d.solo_privado} solo en modo privado`} />
        <StatCard label="Días promedio este mes" value={d.dias_mes_participantes ?? '—'} hint="Entre quienes participan" />
        <StatCard label="Rachas por cuidar" value={d.rachas_en_riesgo.length} hint="Les falta poco esta semana" />
      </div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={tab} onChange={setTab} items={[
          { id: 'cuidar', label: 'Qué hacer', count: d.rachas_en_riesgo.length + d.por_medalla.length },
          { id: 'retos', label: 'Retos', count: d.retos.filter((r) => r.termina >= hoy).length },
          { id: 'tablas', label: 'Tablas' },
          { id: 'rachas', label: 'Mejores rachas' },
        ]} />
        {tab !== 'tablas' && tab !== 'retos' && (
          <div className="sm:w-56">
            <Select value={area} onChange={(e) => setArea(e.target.value)} aria-label="Área">
              {seeAll && <option value="">Todas las áreas</option>}
              {areas.map((a) => <option key={a} value={a}>{deptName(allDepartments, a)}</option>)}
            </Select>
          </div>
        )}
      </div>

      {tab === 'cuidar' && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader title="Rachas en riesgo" description="Llevan 2 semanas o más seguidas y aún no cumplen su meta de esta semana. Un mensaje a tiempo ayuda a que no la pierdan." />
            {d.rachas_en_riesgo.length === 0 ? <p className="text-base text-fg-muted">Nadie en riesgo esta semana. El aviso aparece a partir del jueves.</p> : (
              <ul className="divide-y divide-border">
                {d.rachas_en_riesgo.map((r) => (
                  <li key={r.member_id} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="font-semibold">{r.nombre}</p>
                      <p className="text-sm text-fg-muted"><Flame className="inline h-4 w-4 text-gold-600" aria-hidden /> {semanas(r.racha)} · esta semana {r.semana_dias} de {r.meta}</p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button size="sm" icon={<MessageCircle className="h-4 w-4" />} onClick={() => whatsapp(r)}>WhatsApp</Button>
                      {isFrontOffice && <Button size="sm" variant="ghost" onClick={() => nav(`/familias/${r.family_id}`)}>Ver</Button>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <CardHeader title="Cerca de una medalla" description="Les faltan 1 a 3 días. Felicítalos cuando la logren." />
            {d.por_medalla.length === 0 ? <p className="text-base text-fg-muted">Nadie está a punto de una medalla.</p> : (
              <ul className="divide-y divide-border">
                {d.por_medalla.map((r) => (
                  <li key={r.member_id} className="flex items-center justify-between gap-3 py-3">
                    <div><p className="font-semibold">{r.nombre}</p><p className="text-sm text-fg-muted">{r.medalla}</p></div>
                    <span className="shrink-0 text-base font-semibold">Faltan {dias(r.faltan)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}

      {tab === 'retos' && (retos.length === 0
        ? <EmptyState title="Aún no hay retos" description="Crea un reto mensual: por ejemplo, 12 días de actividad en diciembre." action={canEdit ? <Button onClick={() => setEdit({ kind: 'dias', target: 12, collective: false, active: true, starts_on: hoy, ends_on: hoy })}>Nuevo reto</Button> : undefined} />
        : (
          <div className="grid gap-3 lg:grid-cols-2">
            {retos.map((r) => (
              <RetoCard key={r.id} r={r} staff onTabla={() => { setTabla(r.id); setTab('tablas'); }} onEdit={canEdit ? () => openEdit(r.id) : undefined} />
            ))}
          </div>
        ))}

      {tab === 'tablas' && (
        <Card>
          <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Select value={tabla} onChange={(e) => setTabla(e.target.value)} aria-label="Tabla" className="sm:w-72">
              <option value="constancia">Constancia del mes</option>
              {d.retos.filter((r) => !r.colectivo).map((r) => <option key={r.id} value={r.id}>{r.titulo}</option>)}
            </Select>
            <Select value={cat} onChange={(e) => setCat(e.target.value as Categoria | '')} aria-label="Categoría" className="sm:w-48">
              <option value="">Todas las edades</option>
              {(['infantil', 'juvenil', 'adultos'] as const).map((c) => <option key={c} value={c}>{CATEGORIA_CORTA[c]}</option>)}
            </Select>
          </div>
          <p className="mb-2 text-sm text-fg-muted">Así la ven los socios: nombre e inicial, sin foto. Solo aparecen quienes activaron «Retos del club»; los menores, con permiso de su tutor.</p>
          {!filas ? <Loading /> : <Tabla rows={filas} tipo={tabla === 'constancia' ? 'constancia' : 'reto'} meta={d.retos.find((r) => r.id === tabla)?.meta} />}
        </Card>
      )}

      {tab === 'rachas' && (
        <Card>
          <CardHeader title="Mejores rachas activas" description="Semanas seguidas cumpliendo su meta, con los días de este mes." />
          {d.mejores_rachas.length === 0 ? <p className="text-base text-fg-muted">Aún no hay rachas.</p> : (
            <ol className="divide-y divide-border">
              {d.mejores_rachas.map((r, i) => (
                <li key={r.member_id} className="flex items-center gap-3 py-3">
                  <span className="w-6 text-right font-bold text-fg-muted ob-num">{i + 1}</span>
                  <p className="min-w-0 flex-1 truncate font-semibold">{r.nombre}</p>
                  <span className="text-sm text-fg-muted">{dias(r.mes)} este mes</span>
                  <span className="flex w-24 items-center justify-end gap-1 font-bold ob-num"><Flame className="h-4 w-4 text-gold-600" aria-hidden />{semanas(r.racha)}</span>
                </li>
              ))}
            </ol>
          )}
        </Card>
      )}

      <RetoModal reto={edit} areas={areas} seeAll={seeAll} onClose={() => setEdit(null)} onDone={reload} />
    </>
  );
}

function RetoModal({ reto, areas, seeAll, onClose, onDone }: { reto: Partial<Challenge> | null; areas: DeptCode[]; seeAll: boolean; onClose: () => void; onDone: () => void }) {
  return (
    <Modal open={!!reto} onClose={onClose} title={reto?.id ? 'Editar reto' : 'Nuevo reto'} size="lg">
      {reto && <RetoForm key={reto.id ?? 'nuevo'} initial={reto} areas={areas} seeAll={seeAll} onClose={onClose} onDone={onDone} />}
    </Modal>
  );
}

function RetoForm({ initial, areas, seeAll, onClose, onDone }: { initial: Partial<Challenge>; areas: DeptCode[]; seeAll: boolean; onClose: () => void; onDone: () => void }) {
  const { allDepartments, profile } = useAuth();
  const { busy, run } = useAction();
  const [r, setR] = useState<Partial<Challenge>>({ department: seeAll ? null : areas[0] ?? null, ...initial });
  const set = <K extends keyof Challenge>(k: K, v: Challenge[K]) => setR((x) => ({ ...x, [k]: v }));

  async function save() {
    const x = await run(async () => {
      if (!r.title?.trim()) throw new Error('Escribe el nombre del reto.');
      if (!r.target || r.target < 1) throw new Error('La meta debe ser 1 o más.');
      if (!r.starts_on || !r.ends_on || r.ends_on < r.starts_on) throw new Error('Revisa las fechas: el fin debe ser después del inicio.');
      const payload = {
        title: r.title.trim(), description: r.description?.trim() || null, kind: r.kind ?? 'dias', target: Number(r.target),
        department: r.department || null, collective: !!r.collective, starts_on: r.starts_on, ends_on: r.ends_on,
        reward: r.reward?.trim() || null, active: r.active ?? true,
      };
      return r.id
        ? must(supabase.from('challenges').update(payload).eq('id', r.id).select())
        : must(supabase.from('challenges').insert({ ...payload, created_by: profile?.id }).select());
    }, 'Reto guardado');
    if (x) { onDone(); onClose(); }
  }

  const tipo = (r.kind ?? 'dias') as RetoTipo;
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre del reto" required className="sm:col-span-2">{(p) => <Input {...p} value={r.title ?? ''} onChange={(e) => set('title', e.target.value)} placeholder="Ej. Reto de diciembre" />}</Field>
        <Field label="Qué se cuenta">{(p) => <Select {...p} value={tipo} onChange={(e) => set('kind', e.target.value as RetoTipo)}>
          {(Object.keys(RETO_TIPO) as RetoTipo[]).map((k) => <option key={k} value={k}>{RETO_TIPO[k].label}</option>)}</Select>}</Field>
        <Field label="Meta" hint={r.collective ? 'Suma de todos los participantes' : 'Por persona'}>{(p) => <Input {...p} type="number" min={1} value={r.target ?? ''} onChange={(e) => set('target', Number(e.target.value))} />}</Field>
        <Field label="Inicia">{(p) => <Input {...p} type="date" value={r.starts_on ?? ''} onChange={(e) => set('starts_on', e.target.value)} />}</Field>
        <Field label="Termina">{(p) => <Input {...p} type="date" value={r.ends_on ?? ''} onChange={(e) => set('ends_on', e.target.value)} />}</Field>
        <Field label="Área que cuenta" hint="Vacío: cuenta toda la actividad en el club">{(p) => <Select {...p} value={r.department ?? ''} onChange={(e) => set('department', e.target.value || null)}>
          {seeAll && <option value="">Todo el club</option>}
          {areas.map((a) => <option key={a} value={a}>{deptName(allDepartments, a)}</option>)}</Select>}</Field>
        <Field label="Premio o reconocimiento">{(p) => <Input {...p} value={r.reward ?? ''} onChange={(e) => set('reward', e.target.value)} placeholder="Ej. Medalla digital y mención en avisos" />}</Field>
        <Field label="Descripción" className="sm:col-span-2">{(p) => <Textarea {...p} rows={2} value={r.description ?? ''} onChange={(e) => set('description', e.target.value)} placeholder="Lo que verán los socios en su app" />}</Field>
        <Switch checked={!!r.collective} onChange={(v) => set('collective', v)} label="Meta del club (todos suman juntos)" />
        <Switch checked={r.active ?? true} onChange={(v) => set('active', v)} label="Visible para los socios" />
      </div>
      <div className="mt-6"><ConfirmFooter onCancel={onClose} onConfirm={save} loading={busy} confirmLabel="Guardar reto" /></div>
    </>
  );
}
