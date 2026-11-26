import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, AlertTriangle, Clock, Download, FileUp, Lightbulb, RefreshCcw, TrendingUp, UserMinus, UserPlus, Users } from 'lucide-react';
import { Alert, Button, Card, CardHeader, Input, PageHeader, Segmented, Select, StatCard, Table } from '@/design-system';
import { useAuth, deptName } from '@/lib/auth';
import { useAsync } from '@/lib/hooks';
import { supabase, must } from '@/lib/supabase';
import { dateShort, downloadCsv, todayMx } from '@/lib/format';
import { ErrorBox, Loading } from '@/components/common';
import { Bars, GroupedBars, Heatmap, HBars } from '@/components/charts';
import { ImportModal } from '@/components/ImportModal';
import { VISITAS_FIELDS, VISITAS_SAMPLE, VISITAS_TOTALS } from '@/lib/importDefs';

interface Resumen {
  activos: number; activos_inicio: number; retencion_pct: number | null; altas_nuevas: number; reingresos: number; bajas: number;
  antiguedad_meses: number | null; permanencia_bajas_meses: number | null; visitas: number; visitantes: number;
  visitas_por_semana: number | null; estancia_min: number | null; asistencias_clase: number; asistencia_pct: number | null; sin_venir_14d: number;
}
type Ocup = { dow: number; hour: number; visitas: number };
type Diaria = { day: string; visitas: number; personas: number };
type Tend = { month: string; altas: number; reingresos: number; bajas: number; activos: number };
type Bucket = { rango: string; orden: number; socios: number };
type AreaRow = { department: string; activos: number; altas: number; bajas: number; asistencias: number; ocupacion_pct: number | null; estancia_min: number | null };
type Cohorte = { cohorte: string; inician: number; mes1: number | null; mes3: number | null; mes6: number | null };
type Riesgo = { member_id: string; family_id: string; nombre: string; familia: string; ultima_visita: string | null; dias: number; antiguedad_meses: number | null };

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DOW = ['', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
const addDays = (iso: string, n: number) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const monthLabel = (ym: string) => `${MESES[Number(ym.slice(5, 7)) - 1]} ${ym.slice(2, 4)}`;
const fmt1 = (n: number | null | undefined) => (n == null ? '—' : Number(n).toLocaleString('es-MX', { maximumFractionDigits: 1 }));

/** Analíticas del club: actividad, permanencia, retención, ocupación y señales de dónde ajustar. */
export default function Analiticas() {
  const nav = useNavigate();
  const { isManager, myAreas, allDepartments } = useAuth();
  const areas = allDepartments.filter((d) => d.is_area && (isManager || myAreas.includes(d.code)));
  const [area, setArea] = useState<string>(isManager ? '' : areas[0]?.code ?? '');
  const [range, setRange] = useState('30');
  const [from, setFrom] = useState(addDays(todayMx(), -29));
  const [to, setTo] = useState(todayMx());
  const [group, setGroup] = useState<'dia' | 'semana' | 'mes'>('dia');
  const [importing, setImporting] = useState(false);

  function pickRange(r: string) {
    setRange(r);
    if (r !== 'custom') { setTo(todayMx()); setFrom(addDays(todayMx(), -(Number(r) - 1))); setGroup(Number(r) > 120 ? 'mes' : Number(r) > 45 ? 'semana' : 'dia'); }
  }

  const p = area || null;
  const { data, error, loading, reload } = useAsync(async () => {
    const args = { p_from: from, p_to: to, p_area: p };
    const [res, ocup, diaria, tend, edades, recu, areasT, coh, riesgo] = await Promise.all([
      must(supabase.rpc('analitica_resumen', args)),
      must(supabase.rpc('analitica_ocupacion', args)),
      must(supabase.rpc('analitica_diaria', args)),
      must(supabase.rpc('analitica_tendencia', { p_area: p })),
      must(supabase.rpc('analitica_edades', { p_area: p })),
      must(supabase.rpc('analitica_recurrencia', args)),
      must(supabase.rpc('analitica_areas', { p_from: from, p_to: to })),
      must(supabase.rpc('analitica_cohortes', { p_area: p })),
      must(supabase.rpc('analitica_riesgo', { p_area: p })),
    ]);
    return {
      res: res as Resumen, ocup: ocup as Ocup[], diaria: diaria as Diaria[], tend: tend as Tend[], edades: edades as Bucket[],
      recu: recu as Bucket[], areas: areasT as AreaRow[], coh: coh as Cohorte[], riesgo: riesgo as Riesgo[],
    };
  }, [from, to, p]);

  const series = useMemo(() => {
    if (!data) return [];
    if (group === 'dia') return data.diaria.map((d) => ({ label: `${Number(d.day.slice(8))}/${Number(d.day.slice(5, 7))}`, value: d.visitas, detail: `${dateShort(d.day)} · ${d.personas} personas` }));
    const m = new Map<string, { v: number; first: string }>();
    for (const d of data.diaria) {
      let k: string;
      if (group === 'mes') k = d.day.slice(0, 7);
      else { const dt = new Date(d.day + 'T12:00:00'); const dow = (dt.getDay() + 6) % 7; k = addDays(d.day, -dow); }
      const cur = m.get(k) ?? { v: 0, first: d.day }; cur.v += d.visitas; m.set(k, cur);
    }
    return [...m.entries()].map(([k, x]) => ({ label: group === 'mes' ? monthLabel(k) : `${Number(k.slice(8))}/${Number(k.slice(5, 7))}`, value: x.v, detail: group === 'mes' ? monthLabel(k) : `Semana del ${dateShort(k)}` }));
  }, [data, group]);

  const insights = useMemo(() => data ? buildInsights(data, allDepartments) : [], [data, allDepartments]);

  if (!areas.length && !isManager) return <Alert tone="info" title="Sin áreas asignadas">Pide a Dirección que te asigne un departamento para ver sus analíticas.</Alert>;

  const r = data?.res;
  const delta = r ? r.activos - r.activos_inicio : 0;

  return (
    <>
      <PageHeader title="Analíticas" description="Qué está pasando en el club y dónde conviene hacer ajustes."
        actions={<Button variant="secondary" icon={<FileUp className="h-5 w-5" />} onClick={() => setImporting(true)}>Importar entradas y salidas</Button>} />
      <ImportModal open={importing} onClose={() => setImporting(false)} onDone={reload} title="Importar entradas y salidas" rpc="importar_visitas" chunk={500}
        intro="Sube el reporte del sistema de check-in actual (Excel, CSV o PDF). Con estos registros se calculan los tiempos de permanencia, la ocupación por hora y la recurrencia."
        fields={VISITAS_FIELDS} sample={VISITAS_SAMPLE} templateName="plantilla-entradas-oberlicht.xlsx" totals={VISITAS_TOTALS} />

      {/* Filtros en una fila */}
      <Card className="mb-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <div className="flex-1">
            <p className="mb-1 text-sm font-semibold">Periodo</p>
            <Segmented value={range} onChange={pickRange} options={[{ id: '7', label: '7 días' }, { id: '30', label: '30 días' }, { id: '90', label: '3 meses' }, { id: '365', label: '12 meses' }, { id: 'custom', label: 'Fechas' }]} />
          </div>
          {range === 'custom' && (
            <div className="flex gap-2">
              <label className="text-sm font-semibold">Desde<Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></label>
              <label className="text-sm font-semibold">Hasta<Input type="date" value={to} min={from} max={todayMx()} onChange={(e) => setTo(e.target.value)} /></label>
            </div>
          )}
          <label className="text-sm font-semibold lg:w-64">Área
            <Select value={area} onChange={(e) => setArea(e.target.value)}>
              {isManager && <option value="">Todo el club</option>}
              {areas.map((a) => <option key={a.code} value={a.code}>{a.name}</option>)}
            </Select>
          </label>
        </div>
      </Card>

      {error ? <ErrorBox error={error} onRetry={reload} /> : !data || !r ? <Loading /> : (
        <div className={loading ? 'opacity-60 transition-opacity' : ''}>
          {/* KPIs */}
          <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Socios activos" value={r.activos} icon={<Users className="h-5 w-5" />}
              trend={delta !== 0 ? { value: `${delta > 0 ? '+' : ''}${delta} en el periodo`, positive: delta > 0 } : undefined} hint={delta === 0 ? 'Sin cambio en el periodo' : undefined} />
            <StatCard label="Retención" value={r.retencion_pct == null ? '—' : `${r.retencion_pct}%`} icon={<RefreshCcw className="h-5 w-5" />} hint="De los activos al inicio, siguen hoy" />
            <StatCard label="Altas nuevas" value={r.altas_nuevas} icon={<UserPlus className="h-5 w-5" />} hint="Primera vez que se inscriben" />
            <StatCard label="Regresaron" value={r.reingresos} icon={<TrendingUp className="h-5 w-5" />} hint="Habían cancelado y volvieron" />
            <StatCard label="Bajas" value={r.bajas} icon={<UserMinus className="h-5 w-5" />} hint={r.permanencia_bajas_meses != null ? `Duraron ${fmt1(r.permanencia_bajas_meses)} meses en promedio` : undefined} />
            <StatCard label="Antigüedad promedio" value={r.antiguedad_meses == null ? '—' : `${fmt1(r.antiguedad_meses)} m`} icon={<Clock className="h-5 w-5" />} hint="Meses como socio (activos)" />
            <StatCard label="Visitas" value={Number(r.visitas ?? 0).toLocaleString('es-MX')} icon={<Activity className="h-5 w-5" />} hint={`${r.visitantes} personas · ${fmt1(r.visitas_por_semana)} por semana c/u`} />
            <StatCard label="Tiempo de permanencia" value={r.estancia_min == null ? '—' : `${r.estancia_min} min`} icon={<Clock className="h-5 w-5" />} hint="Promedio entre entrada y salida" />
          </div>

          <div className="mb-6 grid gap-3 md:grid-cols-2">
            <Card>
              <div className="flex items-center justify-between gap-3">
                <div><p className="text-sm font-medium text-fg-muted">Asistencia a clases</p><p className="font-heading text-3xl font-bold ob-num">{r.asistencia_pct == null ? '—' : `${r.asistencia_pct}%`}</p><p className="text-sm text-fg-muted">{r.asistencias_clase} asistencias registradas en lista</p></div>
              </div>
            </Card>
            <Card className={r.sin_venir_14d > 0 ? 'border-warning-100' : undefined}>
              <div className="flex items-center justify-between gap-3">
                <div><p className="text-sm font-medium text-fg-muted">Activos que dejaron de venir (14+ días)</p><p className="font-heading text-3xl font-bold ob-num">{r.sin_venir_14d}</p><p className="text-sm text-fg-muted">Riesgo de baja: conviene contactarlos</p></div>
                <Button variant="secondary" onClick={() => nav('/recordatorios?tipo=te_extranamos')}>Contactar</Button>
              </div>
            </Card>
          </div>

          {insights.length > 0 && (
            <Card className="mb-6">
              <CardHeader title={<span className="inline-flex items-center gap-2"><Lightbulb className="h-5 w-5 text-primary" /> Dónde ajustar</span>} description="Señales calculadas con los datos del periodo." />
              <ul className="space-y-2">{insights.map((t, i) => <li key={i} className="flex gap-2 text-base"><span aria-hidden className="text-primary">•</span><span>{t}</span></li>)}</ul>
            </Card>
          )}

          <div className="mb-6 grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader title="Ocupación por día y hora" description="Entradas y asistencias a clase. Lo oscuro es lo más lleno." />
              <Heatmap cells={data.ocup} />
            </Card>
            <Card>
              <CardHeader title="Visitas" actions={<Segmented value={group} onChange={(g) => setGroup(g as typeof group)} options={[{ id: 'dia', label: 'Día' }, { id: 'semana', label: 'Semana' }, { id: 'mes', label: 'Mes' }]} />} />
              <Bars data={series} format={(n) => Math.round(n).toLocaleString('es-MX')} />
            </Card>
          </div>

          <div className="mb-6 grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader title="Altas, regresos y bajas" description="Últimos 12 meses" />
              <GroupedBars series={[{ key: 'altas', label: 'Altas nuevas' }, { key: 'reingresos', label: 'Regresaron' }, { key: 'bajas', label: 'Bajas' }]}
                data={data.tend.map((t) => ({ label: monthLabel(t.month), values: { altas: t.altas, reingresos: t.reingresos, bajas: t.bajas } }))} />
            </Card>
            <Card>
              <CardHeader title="Socios activos al cierre de cada mes" description="Últimos 12 meses" />
              <Bars data={data.tend.map((t) => ({ label: monthLabel(t.month), value: t.activos }))} labelEvery={1} />
            </Card>
          </div>

          <div className="mb-6 grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader title="Edades de los socios activos" />
              <HBars data={data.edades.map((e) => ({ label: e.rango, value: e.socios }))} />
            </Card>
            <Card>
              <CardHeader title="Recurrencia" description="Cuántas veces por semana viene cada socio activo" />
              <HBars data={data.recu.map((e) => ({ label: e.rango, value: e.socios }))} />
            </Card>
          </div>

          {data.areas.length > 0 && (
            <Card className="mb-6">
              <CardHeader title="Comparativo por área" actions={<Button size="sm" variant="ghost" icon={<Download className="h-4 w-4" />} onClick={() => downloadCsv(`areas-${from}-${to}.csv`, data.areas.map((a) => ({ Área: deptName(allDepartments, a.department), Activos: a.activos, Altas: a.altas, Bajas: a.bajas, Asistencias: a.asistencias, 'Ocupación %': a.ocupacion_pct ?? '', 'Permanencia min': a.estancia_min ?? '' })))}>CSV</Button>} />
              <Table rows={data.areas} rowKey={(a) => a.department} columns={[
                { key: 'a', header: 'Área', cell: (a) => <span className="font-semibold">{deptName(allDepartments, a.department)}</span> },
                { key: 'ac', header: 'Activos', align: 'right', cell: (a) => <span className="ob-num">{a.activos}</span> },
                { key: 'al', header: 'Altas', align: 'right', cell: (a) => <span className="ob-num">{a.altas}</span> },
                { key: 'b', header: 'Bajas', align: 'right', cell: (a) => <span className="ob-num">{a.bajas}</span> },
                { key: 'as', header: 'Asistencias', align: 'right', hideOnMobile: true, cell: (a) => <span className="ob-num">{a.asistencias}</span> },
                { key: 'o', header: 'Ocupación de grupos', align: 'right', cell: (a) => a.ocupacion_pct == null ? '—' : <span className={a.ocupacion_pct < 50 ? 'font-semibold text-warning-700' : a.ocupacion_pct >= 90 ? 'font-semibold text-success-700' : ''}>{a.ocupacion_pct}%</span> },
                { key: 'e', header: 'Permanencia', align: 'right', hideOnMobile: true, cell: (a) => a.estancia_min == null ? '—' : `${a.estancia_min} min` },
              ]} />
            </Card>
          )}

          <Card className="mb-6">
            <CardHeader title="Retención por generación" description="De quienes se inscribieron por primera vez cada mes, qué porcentaje sigue activo al mes, a los 3 y a los 6 meses." />
            {data.coh.length === 0 ? <p className="text-base text-fg-muted">Aún no hay generaciones en los últimos 12 meses.</p> : (
              <Table dense rows={data.coh} rowKey={(c) => c.cohorte} columns={[
                { key: 'c', header: 'Mes de inicio', cell: (c) => monthLabel(c.cohorte) },
                { key: 'i', header: 'Empezaron', align: 'right', cell: (c) => <span className="ob-num">{c.inician}</span> },
                ...(['mes1', 'mes3', 'mes6'] as const).map((k) => ({ key: k, header: k === 'mes1' ? '1 mes' : k === 'mes3' ? '3 meses' : '6 meses', align: 'right' as const,
                  cell: (c: Cohorte) => c[k] == null ? <span className="text-fg-subtle">—</span> : <span className="inline-block min-w-[3.5rem] rounded px-2 py-0.5 text-right font-semibold ob-num" style={{ background: `var(--heat-${Math.min(6, Math.max(1, Math.round((c[k] ?? 0) / 17)))})`, color: (c[k] ?? 0) > 60 ? 'var(--ob-text-inverse, #fff)' : undefined }}>{c[k]}%</span> })),
              ]} />
            )}
          </Card>

          <Card>
            <CardHeader title={<span className="inline-flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-warning-600" /> Socios en riesgo</span>} description="Activos que no han venido en 14 días o más. Ordenados por más días sin venir."
              actions={data.riesgo.length > 0 && <Button size="sm" variant="secondary" onClick={() => nav('/recordatorios?tipo=te_extranamos')}>Enviar mensaje</Button>} />
            {data.riesgo.length === 0 ? <p className="text-base text-fg-muted">Nadie en riesgo por ahora.</p> : (
              <Table rows={data.riesgo.slice(0, 30)} rowKey={(x) => x.member_id} onRowClick={(x) => nav(`/familias/${x.family_id}`)} columns={[
                { key: 'n', header: 'Socio', cell: (x) => <div><p className="font-semibold">{x.nombre}</p><p className="text-sm text-fg-muted">{x.familia}</p></div> },
                { key: 'u', header: 'Última visita', cell: (x) => x.ultima_visita ? dateShort(x.ultima_visita) : 'Nunca registrada' },
                { key: 'd', header: 'Días sin venir', align: 'right', cell: (x) => <span className={x.dias > 30 ? 'font-semibold text-danger-700' : 'font-semibold text-warning-700'}>{x.dias}</span> },
                { key: 'a', header: 'Antigüedad', align: 'right', hideOnMobile: true, cell: (x) => x.antiguedad_meses == null ? '—' : `${fmt1(x.antiguedad_meses)} meses` },
              ]} />
            )}
          </Card>
        </div>
      )}
    </>
  );
}

function buildInsights(d: { res: Resumen; ocup: Ocup[]; areas: AreaRow[]; recu: Bucket[]; tend: Tend[] }, depts: { code: string; name: string }[]): string[] {
  const out: string[] = [];
  const r = d.res;
  if (d.ocup.length >= 5) {
    const byHour = new Map<string, number>();
    for (const c of d.ocup) byHour.set(`${c.dow}-${c.hour}`, c.visitas);
    const sorted = [...d.ocup].sort((a, b) => b.visitas - a.visitas);
    const top = sorted[0];
    out.push(`La hora más llena es el ${DOW[top.dow]} de ${top.hour}:00 a ${top.hour + 1}:00 (${top.visitas} visitas). Revisa que haya personal y cupo suficiente.`);
    const weekday = sorted.filter((c) => c.dow <= 5 && c.hour >= 9 && c.hour <= 16);
    const low = weekday[weekday.length - 1];
    if (low && low.visitas <= top.visitas * 0.2) out.push(`Entre semana a media mañana hay poca gente (p. ej. ${DOW[low.dow]} ${low.hour}:00). Es buen horario para promociones, clases para adultos mayores o mantenimiento.`);
  }
  for (const a of d.areas) {
    const n = depts.find((x) => x.code === a.department)?.name ?? a.department;
    if (a.ocupacion_pct != null && a.ocupacion_pct < 50 && a.activos > 0) out.push(`${n} tiene sus grupos al ${a.ocupacion_pct}% de cupo: conviene juntar grupos o promover esos horarios.`);
    if (a.ocupacion_pct != null && a.ocupacion_pct >= 90) out.push(`${n} está al ${a.ocupacion_pct}% de cupo: considera abrir otro grupo antes de que crezca la lista de espera.`);
    if (a.bajas > a.altas && a.bajas >= 3) out.push(`${n} tuvo más bajas (${a.bajas}) que altas (${a.altas}) en el periodo.`);
  }
  if (r.retencion_pct != null && r.retencion_pct < 85 && r.activos_inicio >= 10) out.push(`La retención del periodo es de ${r.retencion_pct}%. Llamar a quienes dejan de venir suele recuperar parte de las bajas.`);
  if (r.sin_venir_14d > 0) out.push(`${r.sin_venir_14d} socios activos llevan 14 días o más sin venir. Mandarles un mensaje hoy puede evitar que se den de baja.`);
  const once = d.recu.find((b) => b.rango.startsWith('Menos'))?.socios ?? 0;
  const total = d.recu.reduce((s, b) => s + b.socios, 0);
  if (total >= 10 && once / total > 0.3) out.push(`${Math.round((100 * once) / total)}% de los activos viene menos de una vez por semana: son los más propensos a cancelar.`);
  if (r.asistencia_pct != null && r.asistencia_pct < 75 && r.asistencias_clase > 20) out.push(`La asistencia a clases es de ${r.asistencia_pct}%. Un recordatorio el día anterior suele subirla.`);
  const last = d.tend[d.tend.length - 1], prev = d.tend[d.tend.length - 2];
  if (last && prev && prev.activos > 0) {
    const ch = Math.round((100 * (last.activos - prev.activos)) / prev.activos);
    if (Math.abs(ch) >= 5) out.push(`Los socios activos ${ch > 0 ? 'subieron' : 'bajaron'} ${Math.abs(ch)}% contra el mes anterior.`);
  }
  if (r.reingresos > 0) out.push(`${r.reingresos} socios regresaron después de cancelar. Vale la pena preguntarles qué los hizo volver.`);
  return out.slice(0, 7);
}

