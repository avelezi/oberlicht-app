import { useNavigate } from 'react-router-dom';
import { AlertTriangle, CalendarCheck, ClipboardCheck, FileText, ScanLine, TrendingUp, UserPlus, Users, Wallet, BellRing, KeyRound, ShoppingCart, Wrench } from 'lucide-react';
import { AtRiskCard } from '@/components/AtRiskCard';
import { Alert, Button, Card, CardHeader, PageHeader, StatCard } from '@/design-system';
import { useAuth, deptName } from '@/lib/auth';
import { useAsync } from '@/lib/hooks';
import { supabase, must } from '@/lib/supabase';
import { money0, todayMx, weekdayLong, periodNow } from '@/lib/format';
import type { DeptCode, GroupOccupancy, Kpis } from '@/lib/types';
import { CapacityBar, ErrorBox, Loading, Area } from '@/components/common';

/** Consola central (Dirección/Administración) y tablero de inicio para Recepción y Coordinación. */
export default function Consola() {
  const { profile, isFrontOffice, isManager, myAreas, allDepartments } = useAuth();
  const nav = useNavigate();
  const today = todayMx();
  const monthStart = periodNow() + '-01';

  const { data, error, loading, reload } = useAsync(async () => {
    const [kpis, occ, income, daily] = await Promise.all([
      must(supabase.rpc('kpis_consola')),
      must(supabase.from('group_occupancy').select('*').eq('active', true)),
      isFrontOffice ? must(supabase.rpc('ingresos_por_area', { p_from: monthStart, p_to: today })) : Promise.resolve([]),
      isFrontOffice ? must(supabase.rpc('cobros_diarios', { p_days: 14 })) : Promise.resolve([]),
    ]);
    return {
      kpis: kpis as Kpis,
      occ: (occ as GroupOccupancy[]).filter((g) => myAreas.includes(g.department)),
      income: income as { department: DeptCode; total: number }[],
      daily: daily as { day: string; total: number }[],
    };
  }, [isFrontOffice, myAreas.join(',')]);

  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  const { kpis, occ, income, daily } = data!;

  const byArea = myAreas
    .map((a) => {
      const gs = occ.filter((g) => g.department === a);
      const cap = gs.reduce((s, g) => s + g.capacity, 0);
      const used = gs.reduce((s, g) => s + Number(g.enrolled), 0);
      const wait = gs.reduce((s, g) => s + Number(g.waitlist), 0);
      return { a, cap, used, wait, groups: gs.length };
    })
    .filter((x) => x.groups > 0);

  const incomeTotal = income.reduce((s, x) => s + Number(x.total), 0);
  const maxDaily = Math.max(1, ...daily.map((d) => Number(d.total)));
  const title = isManager ? 'Consola central' : profile?.role === 'recepcion' ? 'Resumen del día' : `Tablero de ${myAreas.map((a) => deptName(allDepartments, a)).join(' y ')}`;

  return (
    <>
      <PageHeader
        title={title}
        description={<span className="capitalize">{weekdayLong()}</span>}
        actions={
          isFrontOffice ? (
            <>
              <Button variant="secondary" icon={<ScanLine className="h-5 w-5" />} onClick={() => nav('/entrada')}>Registrar entrada</Button>
              <Button icon={<UserPlus className="h-5 w-5" />} onClick={() => nav('/socios?nueva=1')}>Nueva familia</Button>
            </>
          ) : (
            <Button icon={<ClipboardCheck className="h-5 w-5" />} onClick={() => nav('/asistencia')}>Pasar lista</Button>
          )
        }
      />

      {/* Alertas que requieren acción */}
      <div className="mb-6 grid gap-3">
        {isFrontOffice && kpis.familias_adeudo > 0 && (
          <Alert tone="danger" title={`${kpis.familias_adeudo} ${kpis.familias_adeudo === 1 ? 'familia tiene' : 'familias tienen'} pagos vencidos por ${money0(kpis.vencido)}`}
            action={<Button variant="secondary" size="sm" onClick={() => nav('/cobros?filtro=vencido')}>Ver adeudos</Button>}>
            Llámales o cóbrales cuando vengan; después de los días de gracia no podrán reservar.
          </Alert>
        )}
        {kpis.lista_espera > 0 && (
          <Alert tone="info" title={`${kpis.lista_espera} ${kpis.lista_espera === 1 ? 'alumno espera' : 'alumnos esperan'} lugar`}
            action={<Button variant="secondary" size="sm" onClick={() => nav('/niveles')}>Ver grupos</Button>}>
            Cuando alguien se da de baja, el primero de la lista entra solo y se le avisa.
          </Alert>
        )}
        {isFrontOffice && kpis.facturas_pendientes > 0 && (
          <Alert tone="warning" title={`${kpis.facturas_pendientes} ${kpis.facturas_pendientes === 1 ? 'factura' : 'facturas'} por timbrar`}
            action={<Button variant="secondary" size="sm" onClick={() => nav('/facturacion')}>Ir a facturación</Button>}>
            Se timbran en cuanto el club conecte su PAC.
          </Alert>
        )}
      </div>

      <div className="ob-stats grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {isFrontOffice ? (
          <>
            <StatCard label="Cobrado este mes" value={money0(kpis.cobrado_mes)} hint={`Hoy: ${money0(kpis.cobrado_hoy)}`} icon={<Wallet className="h-5 w-5" />} />
            <StatCard label="Por cobrar" value={money0(kpis.por_cobrar)} hint={kpis.vencido > 0 ? `${money0(kpis.vencido)} vencido` : 'Nada vencido'} icon={<AlertTriangle className="h-5 w-5" />} />
          </>
        ) : (
          <>
            <StatCard label="Asistencias hoy" value={kpis.asistencias_hoy} icon={<ClipboardCheck className="h-5 w-5" />} />
            <StatCard label="En lista de espera" value={kpis.lista_espera} icon={<Users className="h-5 w-5" />} />
          </>
        )}
        <StatCard label="Alumnos y socios activos" value={kpis.alumnos_activos} hint={`${kpis.inscripciones_mes} inscripciones este mes`} icon={<Users className="h-5 w-5" />} />
        <StatCard label="Ocupación de grupos" value={`${kpis.ocupacion_pct}%`} hint={`${kpis.reservas_hoy} reservas hoy`} icon={<CalendarCheck className="h-5 w-5" />} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {isFrontOffice && (
          <Card>
            <CardHeader title="Ingresos por área" description={`Del 1 de este mes a hoy · Total ${money0(incomeTotal)}`}
              actions={<Button variant="ghost" size="sm" icon={<TrendingUp className="h-4 w-4" />} onClick={() => nav('/reportes')}>Reportes</Button>} />
            {income.length === 0 ? (
              <p className="py-8 text-center text-base text-fg-muted">Aún no hay cobros este mes.</p>
            ) : (
              <ul className="space-y-3">
                {income.map((x) => (
                  <li key={x.department}>
                    <div className="mb-1 flex items-center justify-between"><Area code={x.department} /><span className="font-semibold ob-num">{money0(x.total)}</span></div>
                    <div className="h-3 overflow-hidden rounded-full bg-surface-sunken">
                      <div className="h-full rounded-full" style={{ width: `${(Number(x.total) / incomeTotal) * 100}%`, background: `var(--ob-area-${x.department}, var(--ob-primary))` }} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        {isFrontOffice && (
          <Card>
            <CardHeader title="Cobros de los últimos 14 días" description="Todo lo registrado en recepción y en línea." />
            <div className="flex h-40 items-end gap-1.5" role="img" aria-label="Gráfica de cobros diarios">
              {daily.map((d) => (
                <div key={d.day} className="group relative flex flex-1 flex-col items-center justify-end">
                  <div className="w-full rounded-t bg-primary opacity-80 transition group-hover:opacity-100 group-hover:bg-primary" style={{ height: `${Math.max(2, (Number(d.total) / maxDaily) * 100)}%` }} />
                  <span className="pointer-events-none absolute -top-8 hidden whitespace-nowrap rounded bg-neutral-900 px-2 py-1 text-xs text-white group-hover:block">
                    {d.day.slice(8)}/{d.day.slice(5, 7)} · {money0(d.total)}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-1 flex justify-between text-xs text-fg-muted"><span>hace 14 días</span><span>hoy</span></div>
          </Card>
        )}

        <Card className={isFrontOffice ? 'lg:col-span-2' : 'lg:col-span-2'}>
          <CardHeader title="Ocupación por área" description="Lugares ocupados en los grupos del ciclo vigente."
            actions={<Button variant="ghost" size="sm" onClick={() => nav('/niveles')}>Ver niveles y grupos</Button>} />
          {byArea.length === 0 ? (
            <p className="py-8 text-center text-base text-fg-muted">No hay grupos activos en tus áreas.</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {byArea.map((x) => (
                <div key={x.a} className="rounded-lg border border-border p-4">
                  <div className="mb-2 flex items-center justify-between"><Area code={x.a} /><span className="text-sm text-fg-muted">{x.groups} grupos</span></div>
                  <CapacityBar used={x.used} total={x.cap} />
                  {x.wait > 0 && <p className="mt-2 text-sm font-semibold text-info-700">{x.wait} en lista de espera</p>}
                </div>
              ))}
            </div>
          )}
        </Card>

        <AtRiskCard className="lg:col-span-2" />

        {isFrontOffice && (
          <Card className="lg:col-span-2">
            <CardHeader title="Accesos rápidos" />
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {[
                { l: 'Cobrar', i: Wallet, h: '/cobros' },
                { l: 'Buscar familia', i: Users, h: '/socios' },
                { l: 'Reservas de hoy', i: CalendarCheck, h: '/reservas' },
                { l: 'Facturas', i: FileText, h: '/facturacion' },
                { l: 'Punto de venta', i: ShoppingCart, h: '/venta' },
                { l: 'Recordatorios', i: BellRing, h: '/recordatorios' },
                { l: 'Casilleros', i: KeyRound, h: '/casilleros' },
                { l: 'Reportar falla', i: Wrench, h: '/mantenimiento?tab=ordenes' },
              ].map((q) => (
                <button key={q.l} onClick={() => nav(q.h)} className="flex min-h-[88px] flex-col items-center justify-center gap-2 rounded-lg border border-border bg-surface text-base font-semibold hover:bg-primary-soft">
                  <q.i className="h-6 w-6 text-primary" /> {q.l}
                </button>
              ))}
            </div>
          </Card>
        )}
      </div>
    </>
  );
}
