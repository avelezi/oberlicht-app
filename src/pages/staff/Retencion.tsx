import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, MessageCircle, Phone, X } from 'lucide-react';
import { Badge, Button, Card, ConfirmFooter, EmptyState, Field, Modal, PageHeader, Select, StatCard, Tabs, Textarea } from '@/design-system';
import { useAuth, deptName } from '@/lib/auth';
import { useAction, useAsync, useToast } from '@/lib/hooks';
import { supabase, must } from '@/lib/supabase';
import { useCatalog } from '@/lib/catalog';
import { dateShort } from '@/lib/format';
import { Area, ErrorBox, Loading } from '@/components/common';
import { waPhone } from './Recordatorios';
import { ACTION_LABEL, type ChurnAction, type RiskFactor, type RiskRow } from '@/lib/escuela';
import type { DeptCode } from '@/lib/types';

interface Resumen {
  solicitudes: number; retenidos: number; por_opcion: Record<string, number>;
  por_motivo: { motivo: string; n: number; retenidos: number }[]; acciones_pendientes: number; acciones_hechas: number;
}
interface Caso { id: string; member_id: string; family_id: string; reason: string; detail: string | null; choice: string; outcome: string; channel: string; created_at: string; members: { first_name: string; last_name: string } }

const CHOICE: Record<string, string> = { congelar: 'Congeló', descuento: 'Aceptó descuento', cambio_grupo: 'Cambió de horario', baja: 'Se dio de baja' };
const LEVEL_TONE = { alto: 'danger', medio: 'warning', bajo: 'neutral' } as const;

function Factores({ fs }: { fs: RiskFactor[] }) {
  return <div className="mt-2 flex flex-wrap gap-1.5">{fs.map((f) => <span key={f.k} className="rounded-full bg-surface-sunken px-2.5 py-0.5 text-sm">{f.t}</span>)}</div>;
}

function Score({ n }: { n: number }) {
  const color = n >= 50 ? 'bg-danger-600' : n >= 30 ? 'bg-warning-600' : 'bg-neutral-400';
  return (
    <div className="flex w-28 items-center gap-2" title={`Riesgo ${n} de 100`}>
      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-sunken"><div className={`h-full ${color}`} style={{ width: `${n}%` }} /></div>
      <span className="text-sm font-bold ob-num">{n}</span>
    </div>
  );
}

/** Retención: quién podría darse de baja, por qué, qué hacer hoy y cuántas bajas se han salvado. */
export default function Retencion() {
  const nav = useNavigate();
  const toast = useToast();
  const { isFrontOffice, myAreas, allDepartments, profile } = useAuth();
  const { data: cat } = useCatalog();
  const [tab, setTab] = useState('acciones');
  const [area, setArea] = useState<string>(isFrontOffice || profile?.role === 'direccion' ? '' : myAreas[0] ?? '');
  const [done, setDone] = useState<ChurnAction | null>(null);
  const { busy, run } = useAction();

  const { data, error, reload } = useAsync(async () => {
    await supabase.rpc('generar_acciones_riesgo');
    const [risk, actions, resumen, casos, tpl] = await Promise.all([
      must(supabase.rpc('riesgo_bajas', { p_area: area || null })),
      must(supabase.from('churn_actions').select('*').eq('status', 'pendiente').order('score', { ascending: false }).limit(200)),
      must(supabase.rpc('retencion_resumen', { p_dias: 90 })),
      must(supabase.from('retention_cases').select('*, members(first_name, last_name)').order('created_at', { ascending: false }).limit(50)),
      must(supabase.from('message_templates').select('key, body').in('key', ['riesgo_te_extranamos', 'riesgo_bienvenida', 'pago_vencido'])),
    ]);
    return { risk: risk as RiskRow[], actions: actions as ChurnAction[], resumen: resumen as Resumen | null, casos: casos as Caso[], tpl: tpl as { key: string; body: string }[] };
  }, [area]);

  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data || !cat) return <Loading />;
  const byMember = new Map(data.risk.map((r) => [r.member_id, r]));
  const actions = data.actions.filter((a) => !area || a.department === area);
  const r = data.resumen;
  const saved = r && r.solicitudes ? Math.round((100 * r.retenidos) / r.solicitudes) : null;

  function whatsapp(row: RiskRow | undefined, a: ChurnAction | null) {
    const phone = waPhone(row?.telefono ?? null);
    if (!row || !phone) { toast('No hay un celular válido para esta familia', 'warning'); return; }
    const key = a?.action === 'llamada_bienvenida' ? 'riesgo_bienvenida' : a?.action === 'llamada_cobranza' ? 'pago_vencido' : 'riesgo_te_extranamos';
    const first = row.familia.replace(/^Familia\s+/i, '');
    const body = (data!.tpl.find((t) => t.key === key)?.body ?? 'Hola {nombre}')
      .replace(/\{(\w+)\}/g, (_, k: string) => ({ nombre: first, club: 'Oberlicht', detalle: row.nombre.split(' ')[0], dias: String(row.ultima_visita ? Math.round((Date.now() - new Date(row.ultima_visita).getTime()) / 864e5) : ''), monto: '' } as Record<string, string>)[k] ?? '');
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(body)}`, '_blank');
  }

  const areas = (isFrontOffice ? ['natacion', 'ballet', 'gimnasia', 'oberfit', 'terapia', 'nutricion'] : myAreas) as DeptCode[];

  return (
    <>
      <PageHeader title="Retención" description="La app revisa asistencia, pagos, avance y antigüedad de cada socio, calcula su riesgo de baja y te dice a quién contactar hoy." />
      <div className="ob-stats mb-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Por atender" value={actions.length} hint="Acciones pendientes" />
        <StatCard label="En riesgo alto" value={data.risk.filter((x) => x.nivel === 'alto').length} hint={`${data.risk.filter((x) => x.nivel === 'medio').length} en riesgo medio`} />
        <StatCard label="Bajas salvadas" value={saved != null ? `${saved}%` : '—'} hint={`${r?.retenidos ?? 0} de ${r?.solicitudes ?? 0} solicitudes (90 días)`} />
        <StatCard label="Acciones hechas" value={r?.acciones_hechas ?? 0} hint="Últimos 90 días" />
      </div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={tab} onChange={setTab} items={[
          { id: 'acciones', label: 'Qué hacer hoy', count: actions.length },
          { id: 'riesgo', label: 'En riesgo', count: data.risk.length },
          { id: 'bajas', label: 'Bajas y salvadas' },
        ]} />
        <div className="sm:w-56">
          <Select value={area} onChange={(e) => setArea(e.target.value)} aria-label="Área">
            {(isFrontOffice || profile?.role === 'direccion') && <option value="">Todas las áreas</option>}
            {areas.map((a) => <option key={a} value={a}>{deptName(allDepartments, a)}</option>)}
          </Select>
        </div>
      </div>

      {tab === 'acciones' && (actions.length === 0
        ? <EmptyState title="No hay acciones pendientes" description="Cuando un socio entra en riesgo alto, aquí aparece qué hacer con él." />
        : (
          <div className="grid gap-3 lg:grid-cols-2">
            {actions.map((a) => {
              const row = byMember.get(a.member_id);
              return (
                <Card key={a.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-lg font-semibold">{row?.nombre ?? 'Socio'}</p>
                      <p className="text-sm text-fg-muted">{row?.familia}{a.department ? <> · <Area code={a.department as DeptCode} /></> : null}</p>
                    </div>
                    <Score n={row?.puntaje ?? a.score} />
                  </div>
                  <p className="mt-2 font-semibold text-primary">{ACTION_LABEL[a.action] ?? a.action}</p>
                  <Factores fs={row?.factores ?? a.factors} />
                  <div className="mt-3 flex flex-wrap gap-2">
                    {a.action === 'boleta_coach'
                      ? <Button size="sm" onClick={() => nav('/evaluar')}>Ir a evaluar</Button>
                      : <Button size="sm" icon={<MessageCircle className="h-4 w-4" />} onClick={() => whatsapp(row, a)}>WhatsApp</Button>}
                    {row?.telefono && <Button size="sm" variant="secondary" icon={<Phone className="h-4 w-4" />} onClick={() => { location.href = `tel:${row.telefono}`; }}>Llamar</Button>}
                    <Button size="sm" variant="secondary" icon={<Check className="h-4 w-4" />} onClick={() => setDone(a)}>Listo</Button>
                    {a.family_id && isFrontOffice && <Button size="sm" variant="ghost" onClick={() => nav(`/familias/${a.family_id}`)}>Expediente</Button>}
                    <Button size="sm" variant="ghost" icon={<X className="h-4 w-4" />} loading={busy} onClick={async () => {
                      const x = await run(() => must(supabase.rpc('completar_accion', { p_action: a.id, p_status: 'descartada' })), 'Acción descartada');
                      if (x) reload();
                    }}>Descartar</Button>
                  </div>
                </Card>
              );
            })}
          </div>
        ))}

      {tab === 'riesgo' && (data.risk.length === 0
        ? <EmptyState title="Nadie en riesgo" description="Todos los socios activos vienen seguido y están al corriente." />
        : (
          <ul className="grid gap-3 lg:grid-cols-2">
            {data.risk.map((x) => (
              <li key={x.member_id}>
                <Card interactive={isFrontOffice} onClick={() => isFrontOffice && nav(`/familias/${x.family_id}`)}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold">{x.nombre}</p>
                      <p className="text-sm text-fg-muted">{x.familia}{x.ultima_visita ? ` · vino por última vez el ${dateShort(x.ultima_visita)}` : ''}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1"><Badge tone={LEVEL_TONE[x.nivel]} size="sm">Riesgo {x.nivel}</Badge><Score n={x.puntaje} /></div>
                  </div>
                  <Factores fs={x.factores} />
                  <p className="mt-2 text-sm text-fg-muted">Sugerido: {ACTION_LABEL[x.accion]}</p>
                </Card>
              </li>
            ))}
          </ul>
        ))}

      {tab === 'bajas' && (
        <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
          <Card>
            <p className="mb-3 text-lg font-bold">Motivos (90 días)</p>
            {!r?.por_motivo?.length ? <p className="text-fg-muted">Aún no hay solicitudes de baja.</p> : (
              <ul className="space-y-3">
                {r.por_motivo.map((m) => (
                  <li key={m.motivo}>
                    <div className="flex justify-between text-base"><span className="font-semibold">{m.motivo}</span><span className="ob-num">{m.n} · {m.retenidos} se quedaron</span></div>
                    <div className="mt-1 flex h-2.5 overflow-hidden rounded-full bg-surface-sunken">
                      <div className="h-full bg-success-600" style={{ width: `${(100 * m.retenidos) / Math.max(...r.por_motivo.map((y) => y.n))}%` }} />
                      <div className="h-full bg-danger-600" style={{ width: `${(100 * (m.n - m.retenidos)) / Math.max(...r.por_motivo.map((y) => y.n))}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {r && Object.keys(r.por_opcion).length > 0 && (
              <div className="mt-5 flex flex-wrap gap-2">{Object.entries(r.por_opcion).map(([k, n]) => <Badge key={k} tone={k === 'baja' ? 'danger' : 'success'} size="sm">{CHOICE[k] ?? k}: {n}</Badge>)}</div>
            )}
          </Card>
          <Card>
            <p className="mb-3 text-lg font-bold">Últimas solicitudes</p>
            {!data.casos.length ? <p className="text-fg-muted">Cuando alguien pida la baja (en recepción o en el portal) aparecerá aquí con lo que decidió.</p> : (
              <ul className="divide-y divide-border">
                {data.casos.map((c) => (
                  <li key={c.id} className="flex items-start justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="font-semibold">{c.members.first_name} {c.members.last_name}</p>
                      <p className="text-sm text-fg-muted">{c.reason}{c.detail ? ` · ${c.detail}` : ''} · {dateShort(c.created_at)} · {c.channel === 'portal' ? 'desde el portal' : 'en recepción'}</p>
                    </div>
                    <Badge tone={c.outcome === 'baja' ? 'danger' : 'success'} size="sm">{CHOICE[c.choice]}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}

      <DoneModal action={done} onClose={() => setDone(null)} onDone={reload} />
    </>
  );
}

function DoneModal({ action, onClose, onDone }: { action: ChurnAction | null; onClose: () => void; onDone: () => void }) {
  const [result, setResult] = useState('');
  const [preset, setPreset] = useState('');
  const { busy, run } = useAction();
  const opts = ['Va a regresar', 'Pagó o va a pagar', 'Cambió de horario', 'No contestó', 'Se va a dar de baja'];
  return (
    <Modal open={!!action} onClose={onClose} title="¿Cómo te fue?" size="sm"
      footer={<ConfirmFooter onCancel={onClose} loading={busy} confirmLabel="Guardar" onConfirm={async () => {
        const x = await run(() => must(supabase.rpc('completar_accion', { p_action: action!.id, p_status: 'hecha', p_result: [preset, result].filter(Boolean).join('. ') || null })), 'Acción registrada');
        if (x) { setResult(''); setPreset(''); onDone(); onClose(); }
      }} />}>
      <div className="mb-3 flex flex-wrap gap-2">
        {opts.map((o) => <button key={o} type="button" onClick={() => setPreset(o)} className={`rounded-full border-2 px-3 py-1.5 text-sm font-semibold ${preset === o ? 'border-primary bg-primary-soft text-primary' : 'border-border'}`}>{o}</button>)}
      </div>
      <Field label="Nota">{(p) => <Textarea {...p} rows={2} value={result} onChange={(e) => setResult(e.target.value)} />}</Field>
    </Modal>
  );
}
