import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle, ClipboardList, Droplets, Package, Plus, Receipt, Wrench } from 'lucide-react';
import { Alert, Button, Card, CardHeader, PageHeader, Select, StatCard, Tabs } from '@/design-system';
import { useAuth } from '@/lib/auth';
import { useAsync } from '@/lib/hooks';
import { supabase, must } from '@/lib/supabase';
import { useCatalog } from '@/lib/catalog';
import { money0 } from '@/lib/format';
import { ErrorBox, Loading } from '@/components/common';
import { Bars, HBars } from '@/components/charts';
import { areaName, inRange, type MaintArea, type PoolLog, type Ranges } from './mant/shared';
import { Alberca } from './mant/Alberca';
import { Ordenes, NewOrderModal } from './mant/Ordenes';
import { Preventivo } from './mant/Preventivo';
import { Materiales } from './mant/Materiales';
import { Compras } from './mant/Compras';
import { Proveedores } from './mant/Proveedores';
import { Equipos } from './mant/Equipos';

export interface MantCtx { areas: MaintArea[]; area: string; ranges: Ranges; pools: string[]; staff: { id: string; full_name: string }[]; isMaint: boolean; reloadAll: () => void }

/** Mantenimiento por especialidad: alberca, equipos, instalaciones. Para que los encargados planeen, compren mejor y no se les pase nada. */
export default function Mantenimiento() {
  const { isManager, profile, hasDept } = useAuth();
  const isMaint = isManager || profile?.role === 'mantenimiento' || hasDept('mantenimiento');
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? (isMaint ? 'resumen' : 'alberca');
  const [area, setArea] = useState('');
  const [reporting, setReporting] = useState(false);
  const { data: cat } = useCatalog();

  const { data, error, reload } = useAsync(async () => {
    const [areas, settings, resumen, gasto] = await Promise.all([
      must(supabase.from('maint_areas').select('*').eq('active', true).order('sort_order')),
      must(supabase.from('settings').select('key, value').in('key', ['alberca_rangos', 'alberca_cuerpos'])),
      isMaint ? must(supabase.rpc('mantenimiento_resumen', { p_area: area || null })) : null,
      isMaint ? must(supabase.rpc('mantenimiento_gasto')) : [],
    ]);
    const s = Object.fromEntries((settings as { key: string; value: unknown }[]).map((x) => [x.key, x.value]));
    return {
      areas: areas as MaintArea[], ranges: (s.alberca_rangos ?? {}) as Ranges, pools: (s.alberca_cuerpos ?? ['Alberca principal']) as string[],
      resumen: resumen as Resumen | null, gasto: gasto as { mes: string; area: string; compras: number; mano_obra: number }[],
    };
  }, [area, isMaint]);

  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return <Loading />;

  const ctx: MantCtx = { areas: data.areas, area, ranges: data.ranges, pools: data.pools, staff: (cat?.staff ?? []).filter((s) => s.active), isMaint, reloadAll: reload };
  const tabs = isMaint
    ? [{ id: 'resumen', label: 'Resumen' }, { id: 'alberca', label: 'Alberca' }, { id: 'ordenes', label: 'Órdenes de trabajo', count: data.resumen?.ordenes_abiertas || undefined },
       { id: 'preventivo', label: 'Plan preventivo', count: data.resumen?.tareas_vencidas || undefined }, { id: 'materiales', label: 'Materiales', count: data.resumen?.por_reordenar || undefined },
       { id: 'compras', label: 'Compras y facturas' }, { id: 'proveedores', label: 'Proveedores' }, { id: 'equipos', label: 'Equipos' }]
    : [{ id: 'alberca', label: 'Bitácora de alberca' }, { id: 'ordenes', label: 'Reportar falla' }];

  return (
    <>
      <PageHeader title="Mantenimiento" description="Alberca, equipos e instalaciones: bitácoras, plan preventivo, materiales, compras y proveedores."
        actions={<div className="flex flex-wrap gap-2">
          {isMaint && <Select value={area} onChange={(e) => setArea(e.target.value)} aria-label="Especialidad" className="w-56">
            <option value="">Todas las especialidades</option>
            {data.areas.map((a) => <option key={a.code} value={a.code}>{a.name}</option>)}
          </Select>}
          <Button icon={<Plus className="h-5 w-5" />} onClick={() => setReporting(true)}>Reportar falla</Button>
        </div>} />
      <Tabs className="mb-6" items={tabs} value={tab} onChange={(t) => setParams({ tab: t })} />

      {tab === 'resumen' && isMaint && data.resumen && <ResumenView r={data.resumen} gasto={data.gasto} ctx={ctx} go={(t) => setParams({ tab: t })} />}
      {tab === 'alberca' && <Alberca ctx={ctx} />}
      {tab === 'ordenes' && <Ordenes ctx={ctx} />}
      {tab === 'preventivo' && isMaint && <Preventivo ctx={ctx} />}
      {tab === 'materiales' && isMaint && <Materiales ctx={ctx} />}
      {tab === 'compras' && isMaint && <Compras ctx={ctx} />}
      {tab === 'proveedores' && isMaint && <Proveedores ctx={ctx} />}
      {tab === 'equipos' && isMaint && <Equipos ctx={ctx} />}

      <NewOrderModal open={reporting} onClose={() => setReporting(false)} ctx={ctx} onSaved={() => { reload(); if (isMaint) setParams({ tab: 'ordenes' }); }} />
    </>
  );
}

interface Resumen {
  ordenes_abiertas: number; urgentes: number; tareas_vencidas: number; tareas_hoy: number; por_reordenar: number;
  facturas_por_pagar: number; gasto_mes: number; gasto_mes_anterior: number; equipos_falla: number;
  ultima_lectura: PoolLog | null; horas_sin_lectura: number | null;
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function ResumenView({ r, gasto, ctx, go }: { r: Resumen; gasto: { mes: string; area: string; compras: number; mano_obra: number }[]; ctx: MantCtx; go: (t: string) => void }) {
  const l = r.ultima_lectura;
  const bad = l ? (['ph', 'free_chlorine', 'combined_chlorine', 'alkalinity', 'temperature'] as const).filter((k) => { const s = inRange(ctx.ranges, k, l[k]); return s && s !== 'ok'; }) : [];
  const filt = gasto.filter((g) => !ctx.area || g.area === ctx.area);
  const byMonth = new Map<string, number>();
  for (const g of filt) byMonth.set(g.mes, (byMonth.get(g.mes) ?? 0) + Number(g.compras) + Number(g.mano_obra));
  const byArea = new Map<string, number>();
  for (const g of filt.filter((g) => g.mes >= [...byMonth.keys()].slice(-3)[0])) byArea.set(g.area, (byArea.get(g.area) ?? 0) + Number(g.compras) + Number(g.mano_obra));
  const trend = r.gasto_mes_anterior > 0 ? Math.round((100 * (r.gasto_mes - r.gasto_mes_anterior)) / r.gasto_mes_anterior) : null;

  return (
    <div className="space-y-6">
      <div className="grid gap-3">
        {(r.horas_sin_lectura == null || r.horas_sin_lectura > 24) && <Alert tone="warning" title={r.horas_sin_lectura == null ? 'Aún no hay lecturas de la alberca' : `Llevan ${r.horas_sin_lectura} horas sin medir el agua`} action={<Button size="sm" variant="secondary" onClick={() => go('alberca')}>Capturar lectura</Button>}>La norma recomienda medir pH y cloro al menos 2 veces al día cuando la alberca está en uso.</Alert>}
        {bad.length > 0 && <Alert tone="danger" title="La última lectura salió fuera de rango" action={<Button size="sm" variant="secondary" onClick={() => go('alberca')}>Ver bitácora</Button>}>{bad.map((k) => ctx.ranges[k]?.label ?? k).join(', ')}. Ajusta químicos y vuelve a medir.</Alert>}
        {r.urgentes > 0 && <Alert tone="danger" title={`${r.urgentes} órdenes urgentes o de prioridad alta`} action={<Button size="sm" variant="secondary" onClick={() => go('ordenes')}>Ver órdenes</Button>} />}
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Órdenes abiertas" value={r.ordenes_abiertas} icon={<Wrench className="h-5 w-5" />} hint={r.equipos_falla ? `${r.equipos_falla} equipos con falla` : 'Sin equipos con falla'} />
        <StatCard label="Tareas preventivas" value={r.tareas_vencidas} icon={<ClipboardList className="h-5 w-5" />} hint={`vencidas · ${r.tareas_hoy} para hoy`} />
        <StatCard label="Materiales por comprar" value={r.por_reordenar} icon={<Package className="h-5 w-5" />} hint="Bajo mínimo o toca comprar" />
        <StatCard label="Gasto del mes" value={money0(r.gasto_mes)} icon={<Receipt className="h-5 w-5" />}
          trend={trend != null ? { value: `${Math.abs(trend)}% vs mes anterior`, positive: trend <= 0 } : undefined} hint={`${money0(r.facturas_por_pagar)} por pagar`} />
      </div>
      <div className="grid gap-6 xl:grid-cols-[3fr_2fr]">
        <Card>
          <CardHeader title="Gasto de mantenimiento por mes" description="Compras con factura más mano de obra de órdenes terminadas" />
          <Bars data={[...byMonth.entries()].map(([m, v]) => ({ label: `${MESES[Number(m.slice(5)) - 1]}`, value: v, detail: `${MESES[Number(m.slice(5)) - 1]} ${m.slice(0, 4)}` }))} format={(n) => money0(n)} labelEvery={1} />
        </Card>
        <Card>
          <CardHeader title="¿En qué se va? (últimos 3 meses)" />
          <HBars data={[...byArea.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([a, v]) => ({ label: areaName(ctx.areas, a), value: v }))} format={(n) => money0(n)} />
        </Card>
      </div>
      {l && (
        <Card>
          <CardHeader title={<span className="inline-flex items-center gap-2"><Droplets className="h-5 w-5 text-primary" /> Última lectura · {l.pool}</span>} actions={<Button size="sm" variant="ghost" onClick={() => go('alberca')}>Bitácora</Button>} />
          <div className="flex flex-wrap gap-6 text-base">
            {(['ph', 'free_chlorine', 'combined_chlorine', 'alkalinity', 'temperature'] as const).map((k) => l[k] != null && (
              <div key={k}><p className="text-sm text-fg-muted">{ctx.ranges[k]?.label ?? k}</p>
                <p className={`text-xl font-bold ob-num ${inRange(ctx.ranges, k, l[k]) === 'ok' ? 'text-success-700' : 'text-danger-700'}`}>{inRange(ctx.ranges, k, l[k]) !== 'ok' && <AlertTriangle className="mr-1 inline h-4 w-4" />}{l[k]}</p></div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
