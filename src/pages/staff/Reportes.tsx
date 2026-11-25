import { useState } from 'react';
import { Download } from 'lucide-react';
import { Button, Card, CardHeader, Field, Input, PageHeader, Table } from '@/design-system';
import { useAuth, deptName } from '@/lib/auth';
import { useAsync } from '@/lib/hooks';
import { supabase, must } from '@/lib/supabase';
import { useCatalog, staffName } from '@/lib/catalog';
import { daysLabel, downloadCsv, hhmm, money, money0, todayMx } from '@/lib/format';
import type { DeptCode, GroupOccupancy } from '@/lib/types';
import { Area, CapacityBar, ErrorBox, Loading } from '@/components/common';

/** Reportes básicos: ingresos, asistencia, ocupación y lista de espera. Todo se descarga a Excel (CSV). */
export default function Reportes() {
  const { isFrontOffice, myAreas, allDepartments } = useAuth();
  const { data: cat } = useCatalog();
  const [from, setFrom] = useState(todayMx().slice(0, 8) + '01');
  const [to, setTo] = useState(todayMx());

  const { data, error, loading, reload } = useAsync(async () => {
    const [income, att] = await Promise.all([
      isFrontOffice ? must(supabase.rpc('ingresos_por_area', { p_from: from, p_to: to })) : Promise.resolve([]),
      must(supabase.from('attendance').select('department, status, group_id').gte('date', from).lte('date', to).limit(20000)),
    ]);
    return { income: income as { department: DeptCode; total: number }[], att: att as { department: DeptCode; status: string; group_id: string | null }[] };
  }, [from, to, isFrontOffice]);

  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if ((loading && !data) || !cat) return <Loading />;
  const { income, att } = data!;
  const totalIncome = income.reduce((s, x) => s + Number(x.total), 0);
  const attByArea = myAreas.map((a) => {
    const xs = att.filter((x) => x.department === a);
    const came = xs.filter((x) => x.status === 'presente' || x.status === 'retardo').length;
    return { a, total: xs.length, came, pct: xs.length ? Math.round((100 * came) / xs.length) : 0, entradas: xs.filter((x) => !x.group_id).length };
  }).filter((x) => x.total > 0);
  const groups = cat.groups.filter((g) => g.active && myAreas.includes(g.department)).sort((a, b) => Number(b.enrolled) / b.capacity - Number(a.enrolled) / a.capacity);

  return (
    <>
      <PageHeader title="Reportes" description="Elige el periodo; cada tabla se puede descargar para abrirla en Excel." />
      <Card className="mb-6">
        <div className="flex flex-wrap items-end gap-4">
          <Field label="Desde">{(p) => <Input {...p} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />}</Field>
          <Field label="Hasta">{(p) => <Input {...p} type="date" value={to} max={todayMx()} onChange={(e) => setTo(e.target.value)} />}</Field>
        </div>
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        {isFrontOffice && (
          <Card>
            <CardHeader title={`Ingresos por área · ${money0(totalIncome)}`} description="Cobros pagados en el periodo, por área del servicio."
              actions={<Button size="sm" variant="ghost" icon={<Download className="h-4 w-4" />} onClick={() => downloadCsv(`ingresos-${from}-${to}`, income.map((x) => ({ area: deptName(allDepartments, x.department), total: x.total })))}>CSV</Button>} />
            <Table rows={income} rowKey={(x) => x.department ?? 'general'} empty="Sin ingresos en el periodo." columns={[
              { key: 'a', header: 'Área', cell: (x) => <Area code={x.department} /> },
              { key: 'p', header: '% del total', align: 'right', cell: (x) => `${totalIncome ? Math.round((100 * Number(x.total)) / totalIncome) : 0}%` },
              { key: 't', header: 'Total', align: 'right', cell: (x) => <span className="font-semibold ob-num">{money(x.total)}</span> },
            ]} />
          </Card>
        )}
        <Card>
          <CardHeader title="Asistencia por área" description="Clases de grupo y entradas registradas en recepción."
            actions={<Button size="sm" variant="ghost" icon={<Download className="h-4 w-4" />} onClick={() => downloadCsv(`asistencia-${from}-${to}`, attByArea.map((x) => ({ area: deptName(allDepartments, x.a), registros: x.total, asistieron: x.came, porcentaje: x.pct, entradas_recepcion: x.entradas })))}>CSV</Button>} />
          <Table rows={attByArea} rowKey={(x) => x.a} empty="Sin registros de asistencia." columns={[
            { key: 'a', header: 'Área', cell: (x) => <Area code={x.a} /> },
            { key: 'c', header: 'Asistencias', align: 'right', cell: (x) => <span className="ob-num">{x.came}</span> },
            { key: 'p', header: '% asistencia', align: 'right', cell: (x) => <span className={x.pct < 75 ? 'font-semibold text-warning-700' : 'font-semibold text-success-700'}>{x.pct}%</span> },
            { key: 'e', header: 'Entradas libres', align: 'right', hideOnMobile: true, cell: (x) => x.entradas },
          ]} />
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="Ocupación de grupos" description="Del más lleno al más vacío. Útil para abrir o cerrar horarios."
            actions={<Button size="sm" variant="ghost" icon={<Download className="h-4 w-4" />} onClick={() => downloadCsv('ocupacion-grupos', groups.map((g: GroupOccupancy) => ({ area: deptName(allDepartments, g.department), nivel: g.level_name, dias: daysLabel(g.weekdays), hora: hhmm(g.start_time), instructor: staffName(cat, g.coach_id), inscritos: g.enrolled, cupo: g.capacity, espera: g.waitlist })))}>CSV</Button>} />
          <Table rows={groups} rowKey={(g) => g.group_id} empty="Sin grupos." columns={[
            { key: 'a', header: 'Área', cell: (g) => <Area code={g.department} />, hideOnMobile: true },
            { key: 'n', header: 'Grupo', cell: (g) => <div><p className="font-semibold">{g.level_name}</p><p className="text-sm text-fg-muted">{daysLabel(g.weekdays)} {hhmm(g.start_time)} · {staffName(cat, g.coach_id)}</p></div> },
            { key: 'c', header: 'Cupo', cell: (g) => <div className="w-40"><CapacityBar used={Number(g.enrolled)} total={g.capacity} /></div> },
            { key: 'w', header: 'En espera', align: 'right', cell: (g) => Number(g.waitlist) > 0 ? <span className="font-semibold text-info-700">{g.waitlist}</span> : '—' },
          ]} />
        </Card>
      </div>
    </>
  );
}
