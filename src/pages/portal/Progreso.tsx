import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Flame, Lock, Settings2, Trophy, Users } from 'lucide-react';
import { Alert, Button, Card, CardHeader, Checkbox, ConfirmFooter, EmptyState, Field, Modal, PageHeader, Segmented, Select, StatCard, Switch, Tabs } from '@/design-system';
import { useAction, useAsync } from '@/lib/hooks';
import { supabase, must } from '@/lib/supabase';
import { useMyFamily } from '@/lib/portal';
import { todayMx } from '@/lib/format';
import type { Member } from '@/lib/types';
import { ErrorBox, Loading } from '@/components/common';
import { Bars } from '@/components/charts';
import { Medallas, RetoCard, Tabla, TiraSemanas } from '@/components/Progreso';
import { CATEGORIA_CORTA, KUDOS, dias, semanas, type Categoria, type FilaConstancia, type FilaReto, type Kudo, type MiProgreso, type RetoClub } from '@/lib/progreso';

const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** Portal: progreso personal (privado) y retos del club (público), por cada miembro de la familia. */
export default function Progreso() {
  const nav = useNavigate();
  const { data: mine, error } = useMyFamily();
  const [sel, setSel] = useState<string | null>(null);

  if (error) return <ErrorBox error={error} />;
  if (!mine) return <Loading />;
  if (!mine.fam) { nav('/'); return null; }
  if (!mine.members.length) return <EmptyState title="Primero agrega a tu familia" action={<Button onClick={() => nav('/mi-cuenta')}>Ir a Mi familia</Button>} />;
  const member = mine.members.find((m) => m.id === sel) ?? mine.members[0];

  return (
    <>
      <PageHeader title="Mi progreso y retos" description="Tu constancia en el club: días que entrenas, semanas seguidas, medallas y retos. Tú decides si lo ves solo tú o si compites con otros socios." />
      {mine.members.length > 1 && (
        <div className="mb-4 overflow-x-auto">
          <Segmented value={member.id} onChange={setSel} options={mine.members.map((m) => ({ id: m.id, label: m.first_name }))} />
        </div>
      )}
      <ProgresoMiembro key={member.id} member={member} />
    </>
  );
}

function ProgresoMiembro({ member }: { member: Member }) {
  const { busy, run } = useAction();
  const [config, setConfig] = useState(false);
  const [tabla, setTabla] = useState<string>('constancia');
  const [cat, setCat] = useState<Categoria | ''>('');

  const { data, error, reload } = useAsync(async () => {
    const [p, retos, sent] = await Promise.all([
      must(supabase.rpc('mi_progreso', { p_member: member.id })),
      must(supabase.rpc('retos_club', { p_member: member.id })),
      must(supabase.from('kudos').select('to_member, kind').eq('from_member', member.id).eq('day', todayMx())),
    ]);
    return { p: p as MiProgreso, retos: (retos ?? []) as RetoClub[], sent: Object.fromEntries((sent as { to_member: string; kind: Kudo }[]).map((k) => [k.to_member, k.kind])) as Record<string, Kudo> };
  }, [member.id]);

  const categoria = cat || data?.p.categoria || '';
  const { data: filas } = useAsync(async () => {
    if (!data?.p.publico) return null;
    if (tabla === 'constancia') return (await must(supabase.rpc('tabla_constancia', { p_categoria: categoria || null }))) as FilaConstancia[];
    return (await must(supabase.rpc('tabla_reto', { p_challenge: tabla, p_categoria: categoria || null }))) as FilaReto[];
  }, [data?.p.publico, tabla, categoria]);

  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return <Loading />;
  const { p, retos } = data;

  async function toggleReto(r: RetoClub, unirse: boolean) {
    const x = await run(() => must(supabase.rpc('unirse_reto', { p_challenge: r.id, p_member: member.id, p_unirse: unirse })), unirse ? '¡Te uniste al reto!' : 'Saliste del reto');
    if (x !== undefined) reload();
  }
  async function kudo(to: string, k: Kudo) {
    const x = await run(() => must(supabase.rpc('aplaudir', { p_from: member.id, p_to: to, p_kind: k })), `${KUDOS.find((q) => q.k === k)?.emoji} Aplauso enviado`);
    if (x !== undefined) reload();
  }

  if (!p.inscrito) return <Inscribirse p={p} onDone={reload} />;

  const delta = p.dias_mes - p.dias_mes_anterior;
  const activos = retos.filter((r) => r.termina >= todayMx());
  const retosTabla = retos.filter((r) => r.inscrito && !r.colectivo);
  const totalAplausos = Object.values(p.aplausos).reduce((s, n) => s + (n ?? 0), 0);

  return (
    <>
      <div className="ob-stats mb-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Racha" value={<span className="flex items-center gap-2"><Flame className="h-7 w-7 text-gold-600" aria-hidden />{p.racha}</span>} hint={`${p.racha === 1 ? 'semana seguida' : 'semanas seguidas'} cumpliendo tu meta`} />
        <StatCard label="Esta semana" value={`${p.semana_dias} de ${p.meta_semanal}`} hint={p.semana_dias >= p.meta_semanal ? '¡Meta de la semana cumplida!' : `Te ${p.meta_semanal - p.semana_dias === 1 ? 'falta' : 'faltan'} ${dias(p.meta_semanal - p.semana_dias)}`} />
        <StatCard label="Este mes" value={dias(p.dias_mes)} hint={delta === 0 ? 'Igual que el mes pasado' : delta > 0 ? `${delta} más que el mes pasado` : `${-delta} menos que el mes pasado`} />
        <StatCard label="Mejor racha" value={semanas(p.racha_mejor)} hint={`${dias(p.dias_total)} en total`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Semanas seguidas" description={`Tu meta: ${dias(p.meta_semanal)} por semana. Una falta justificada, una reposición o una membresía congelada no rompen la racha.`}
              actions={<Button size="sm" variant="ghost" icon={<Settings2 className="h-4 w-4" />} onClick={() => setConfig(true)}>Ajustes</Button>} />
            <TiraSemanas semanas={p.semanas} meta={p.meta_semanal} />
          </Card>
          <Card>
            <CardHeader title="Días por mes" description="Entradas al club, clases y reposiciones (un día cuenta una vez)." />
            <Bars height={200} data={p.meses.map((m) => ({ label: MES[Number(m.mes.slice(5)) - 1], value: m.dias, detail: `${m.dias} días` }))} labelEvery={1} />
          </Card>
          <Card>
            <CardHeader title="Medallas" description={`${p.medallas.filter((m) => m.logrado).length} de ${p.medallas.length} logradas`} />
            <Medallas medallas={p.medallas} />
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Retos del club" description="Únete a los que quieras. Puedes salirte cuando sea." />
            {activos.length === 0 ? <p className="text-base text-fg-muted">No hay retos abiertos por ahora.</p> : (
              <div className="space-y-3">
                {activos.map((r) => <RetoCard key={r.id} r={r} busy={busy} onToggle={(u) => toggleReto(r, u)} onTabla={p.publico && r.inscrito ? () => setTabla(r.id) : undefined} />)}
              </div>
            )}
          </Card>
          <Card>
            <CardHeader title="Aplausos recibidos" description="Últimos 30 días" />
            {totalAplausos === 0
              ? <p className="text-base text-fg-muted">{p.publico ? 'Cuando otros socios te aplaudan, aquí lo verás.' : 'Activa «Retos del club» para recibir aplausos.'}</p>
              : <div className="grid grid-cols-4 gap-2">{KUDOS.map((k) => (
                <div key={k.k} className="rounded-lg bg-surface-sunken py-2 text-center"><p className="text-2xl">{k.emoji}</p><p className="text-lg font-bold ob-num">{p.aplausos[k.k] ?? 0}</p></div>
              ))}</div>}
          </Card>
        </div>
      </div>

      <Card className="mt-6">
        <CardHeader title="Tablas del club" description={p.publico ? `Apareces como «${p.nombre_publico}», sin foto. Se compara por categoría de edad y gana la constancia.` : undefined} />
        {!p.publico ? (
          <Alert tone="info" title="Solo tú ves tu progreso" action={<Button size="sm" variant="secondary" icon={<Users className="h-4 w-4" />} onClick={() => setConfig(true)}>Activar retos del club</Button>}>
            Si quieres competir con otros socios y aparecer en las tablas, activa «Retos del club».
          </Alert>
        ) : (
          <>
            <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Tabs value={tabla} onChange={setTabla} items={[{ id: 'constancia', label: 'Constancia del mes' }, ...retosTabla.map((r) => ({ id: r.id, label: r.titulo }))]} />
              <div className="sm:w-48">
                <Select value={categoria} onChange={(e) => setCat(e.target.value as Categoria | '')} aria-label="Categoría">
                  <option value="">Todas las edades</option>
                  {(['infantil', 'juvenil', 'adultos'] as const).map((c) => <option key={c} value={c}>{CATEGORIA_CORTA[c]}</option>)}
                </Select>
              </div>
            </div>
            {!filas ? <Loading /> : <Tabla rows={filas} tipo={tabla === 'constancia' ? 'constancia' : 'reto'} meta={retos.find((r) => r.id === tabla)?.meta} onKudo={kudo} sent={data.sent} />}
          </>
        )}
      </Card>

      <Configurar open={config} p={p} onClose={() => setConfig(false)} onDone={reload} />
    </>
  );
}

/** Invitación a participar: privado (solo yo) o también público (tablas del club). */
function Inscribirse({ p, onDone }: { p: MiProgreso; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Card>
        <div className="mx-auto max-w-2xl py-4 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary-soft"><Trophy className="h-8 w-8 text-primary" aria-hidden /></div>
          <h2 className="mt-4 text-2xl font-bold">Mide tu constancia{p.nombre ? `, ${p.nombre}` : ''}</h2>
          <p className="mt-2 text-lg text-fg-muted">Lleva la cuenta de tus días en el club, junta semanas seguidas, gana medallas y únete a retos mensuales. Es voluntario y lo puedes apagar cuando quieras.</p>
          {p.dias_mes > 0 && <p className="mt-3 text-base">Este mes ya llevas <b>{dias(p.dias_mes)}</b> de actividad.</p>}
          <div className="mt-6 grid gap-3 text-left sm:grid-cols-2">
            <div className="rounded-lg border border-border p-4"><p className="flex items-center gap-2 font-semibold"><Lock className="h-5 w-5 text-primary" /> Mi progreso</p><p className="mt-1 text-sm text-fg-muted">Privado: solo tu familia lo ve.</p></div>
            <div className="rounded-lg border border-border p-4"><p className="flex items-center gap-2 font-semibold"><Users className="h-5 w-5 text-primary" /> Retos del club</p><p className="mt-1 text-sm text-fg-muted">Apareces en las tablas con tu nombre e inicial, sin foto, y puedes recibir aplausos.</p></div>
          </div>
          <Button size="lg" className="mt-6" onClick={() => setOpen(true)}>Empezar</Button>
        </div>
      </Card>
      <Configurar open={open} p={p} onClose={() => setOpen(false)} onDone={onDone} />
    </>
  );
}

function Configurar({ open, p, onClose, onDone }: { open: boolean; p: MiProgreso; onClose: () => void; onDone: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title={p.inscrito ? 'Cómo participo' : 'Empezar a medir mi progreso'}>
      {open && <ConfigForm p={p} onClose={onClose} onDone={onDone} />}
    </Modal>
  );
}

function ConfigForm({ p, onClose, onDone }: { p: MiProgreso; onClose: () => void; onDone: () => void }) {
  const { busy, run } = useAction();
  const [publico, setPublico] = useState(p.inscrito ? p.publico : false);
  const [meta, setMeta] = useState(p.meta_semanal);
  const [permiso, setPermiso] = useState(!!p.permiso_tutor);

  async function save(activo: boolean) {
    const x = await run(async () => {
      if (activo && publico && p.menor && !permiso) throw new Error('Marca el permiso de papá, mamá o tutor para aparecer en las tablas.');
      return must(supabase.rpc('configurar_progreso', { p_member: p.member_id, p_privado: activo, p_publico: activo && publico, p_meta: meta, p_permiso_tutor: permiso }));
    }, activo ? 'Listo, ya estás participando' : 'Dejaste de participar');
    if (x) { onDone(); onClose(); }
  }

  return (
    <>
      <div className="space-y-4">
        <Field label="Meta de días por semana" required hint="Cumplirla cada semana es lo que suma a tu racha.">
          {(f) => <Select {...f} value={meta} onChange={(e) => setMeta(Number(e.target.value))}>{[1, 2, 3, 4, 5, 6, 7].map((n) => <option key={n} value={n}>{dias(n)}</option>)}</Select>}
        </Field>
        <div className="rounded-lg border border-border p-3 [&_button[role=switch]]:text-left">
          <Switch checked={publico} onChange={setPublico} label="Participar en los retos del club (tablas públicas)" />
          <p className="mt-1 text-sm text-fg-muted">Otros socios verán «{p.nombre_publico}» y su categoría ({CATEGORIA_CORTA[p.categoria]}). Nunca se muestra foto, apellido completo ni datos de contacto.</p>
          {publico && p.menor && (
            <div className="mt-3"><Checkbox checked={permiso} onChange={(e) => setPermiso(e.target.checked)} label="Soy su papá, mamá o tutor y doy permiso" description="Como es menor de edad, se necesita tu permiso para que aparezca en las tablas." /></div>
          )}
        </div>
      </div>
      <div className="mt-6"><ConfirmFooter onCancel={onClose} onConfirm={() => save(true)} loading={busy} confirmLabel={p.inscrito ? 'Guardar' : 'Empezar'} /></div>
      {p.inscrito && <button type="button" className="mt-4 text-base font-semibold text-danger-600" onClick={() => save(false)} disabled={busy}>Dejar de participar</button>}
    </>
  );
}
