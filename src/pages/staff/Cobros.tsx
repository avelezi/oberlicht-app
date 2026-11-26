import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CalendarPlus, Download, Wallet } from 'lucide-react';
import { Alert, Button, Card, ConfirmFooter, Field, Input, Modal, PageHeader, StatCard, Table, Tabs } from '@/design-system';
import { useAuth } from '@/lib/auth';
import { useAction, useAsync, useToast } from '@/lib/hooks';
import { supabase, must } from '@/lib/supabase';
import { dateShort, dateTime, downloadCsv, money, money0, periodNow, todayMx } from '@/lib/format';
import type { Family, FamilyBalance, Payment } from '@/lib/types';
import { ErrorBox, Loading } from '@/components/common';
import { CobrarModal } from '@/components/FamilyForms';

type Debtor = FamilyBalance & { family: Family };
type Pay = Payment & { families: { name: string; number: number } | null };
const METHOD = { efectivo: 'Efectivo', tarjeta: 'Tarjeta guardada', terminal: 'Terminal', transferencia: 'Transferencia', liga: 'Liga de pago' } as const;

/** Cobranza: quién debe, cobrar en mostrador, corte de caja y generar mensualidades. */
export default function Cobros() {
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const { isManager } = useAuth();
  const [tab, setTab] = useState(params.get('filtro') === 'vencido' ? 'vencido' : 'pendiente');
  const [cobrar, setCobrar] = useState<Family | null>(null);
  const [gen, setGen] = useState(false);
  const [day, setDay] = useState(todayMx());

  const { data, error, loading, reload } = useAsync(async () => {
    const bal = (await must(supabase.from('family_balances').select('*').gt('balance', 0).order('days_overdue', { ascending: false }))) as FamilyBalance[];
    const fams = bal.length ? ((await must(supabase.from('families').select('*').in('id', bal.map((b) => b.family_id)))) as Family[]) : [];
    const debtors: Debtor[] = bal.map((b) => ({ ...b, family: fams.find((f) => f.id === b.family_id)! })).filter((d) => d.family);
    const pays = (await must(supabase.from('payments').select('*, families(name, number)')
      .gte('paid_at', `${day}T00:00:00-06:00`).lt('paid_at', `${day}T23:59:59.999-06:00`).order('paid_at', { ascending: false }))) as Pay[];
    return { debtors, pays };
  }, [day]);

  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (loading && !data) return <Loading />;
  const { debtors, pays } = data!;
  const overdue = debtors.filter((d) => d.days_overdue > 0);
  const list = tab === 'vencido' ? overdue : debtors;
  const totalDue = debtors.reduce((s, d) => s + Number(d.balance), 0);
  const totalOver = overdue.reduce((s, d) => s + Number(d.balance), 0);
  const approved = pays.filter((p) => p.status === 'aprobado');
  const byMethod = Object.entries(METHOD).map(([k, l]) => ({ k, l, t: approved.filter((p) => p.method === k).reduce((s, p) => s + Number(p.amount), 0) })).filter((x) => x.t > 0);

  return (
    <>
      <PageHeader title="Cobros" description="Cobra en mostrador, revisa adeudos y haz el corte de caja del día."
        actions={isManager && <Button variant="secondary" icon={<CalendarPlus className="h-5 w-5" />} onClick={() => setGen(true)}>Generar mensualidades</Button>} />
      <div className="ob-stats mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        <StatCard label="Por cobrar" value={money0(totalDue)} hint={`${debtors.length} familias`} />
        <StatCard label="Vencido" value={money0(totalOver)} hint={`${overdue.length} familias con atraso`} />
        <StatCard label={day === todayMx() ? 'Cobrado hoy' : `Cobrado el ${dateShort(day)}`} value={money0(approved.reduce((s, p) => s + Number(p.amount), 0))} hint={`${approved.length} pagos`} />
      </div>
      <Tabs className="mb-4" value={tab} onChange={(t) => { setTab(t); setParams(t === 'vencido' ? { filtro: 'vencido' } : {}); }} items={[
        { id: 'pendiente', label: 'Por cobrar', count: debtors.length },
        { id: 'vencido', label: 'Vencidos', count: overdue.length },
        { id: 'corte', label: 'Corte de caja' },
      ]} />

      {tab !== 'corte' ? (
        <Table rows={list} rowKey={(d) => d.family_id} onRowClick={(d) => nav(`/familias/${d.family_id}`)}
          empty={tab === 'vencido' ? '✓ Nadie tiene pagos vencidos.' : '✓ No hay nada por cobrar.'}
          columns={[
            { key: 'f', header: 'Familia', cell: (d) => <div><p className="font-semibold">{d.family.name}</p><p className="text-sm text-fg-muted">#{d.family.number} · {d.family.phone ?? 'sin celular'}</p></div> },
            { key: 'o', header: 'Desde', hideOnMobile: true, cell: (d) => d.oldest_due ? dateShort(d.oldest_due) : '—' },
            { key: 'a', header: 'Atraso', cell: (d) => d.days_overdue > 0 ? <span className="font-semibold text-danger-700">! {d.days_overdue} días</span> : <span className="text-warning-700">◷ Al día</span> },
            { key: 'b', header: 'Saldo', align: 'right', cell: (d) => <span className="font-semibold ob-num">{money(d.balance)}</span> },
            { key: 'x', header: '', align: 'right', cell: (d) => <Button size="sm" icon={<Wallet className="h-4 w-4" />} onClick={(e) => { e.stopPropagation(); setCobrar(d.family); }}>Cobrar</Button> },
          ]} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <Card>
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <Field label="Día">{(p) => <Input {...p} type="date" value={day} max={todayMx()} onChange={(e) => setDay(e.target.value)} />}</Field>
              <Button variant="secondary" icon={<Download className="h-5 w-5" />} disabled={!pays.length}
                onClick={() => downloadCsv(`corte-${day}`, pays.map((p) => ({ hora: dateTime(p.paid_at), familia: p.families?.name, numero: p.families?.number, forma: METHOD[p.method], referencia: p.reference, importe: p.amount, estado: p.status })))}>
                Descargar Excel (CSV)
              </Button>
            </div>
            <Table rows={pays} rowKey={(p) => p.id} empty="Sin pagos este día." columns={[
              { key: 'h', header: 'Hora', cell: (p) => dateTime(p.paid_at).split(' ').slice(-1)[0] },
              { key: 'f', header: 'Familia', cell: (p) => `${p.families?.name ?? ''} #${p.families?.number ?? ''}` },
              { key: 'm', header: 'Forma', cell: (p) => METHOD[p.method] },
              { key: 'a', header: 'Importe', align: 'right', cell: (p) => <span className="ob-num font-semibold">{money(p.amount)}</span> },
            ]} />
          </Card>
          <Card>
            <h2 className="mb-3 text-lg font-bold">Resumen por forma de pago</h2>
            {byMethod.length === 0 ? <p className="text-base text-fg-muted">Sin cobros.</p> : (
              <dl className="space-y-2">
                {byMethod.map((x) => <div key={x.k} className="flex justify-between text-base"><dt>{x.l}</dt><dd className="font-semibold ob-num">{money(x.t)}</dd></div>)}
                <div className="flex justify-between border-t border-border pt-2 text-lg font-bold"><dt>Total</dt><dd className="ob-num">{money(approved.reduce((s, p) => s + Number(p.amount), 0))}</dd></div>
              </dl>
            )}
            <p className="mt-4 text-sm text-fg-muted">El efectivo en caja debe coincidir con la línea «Efectivo».</p>
          </Card>
        </div>
      )}

      {cobrar && <CobrarModal open onClose={() => setCobrar(null)} family={cobrar} onDone={reload} />}
      <GenerarModal open={gen} onClose={() => setGen(false)} onDone={reload} />
    </>
  );
}

function GenerarModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [period, setPeriod] = useState(periodNow());
  const { busy, run } = useAction();
  const toast = useToast();
  async function go() {
    const n = await run(() => must(supabase.rpc('generar_mensualidades', { p_period: period })));
    if (typeof n === 'number') {
      toast(n === 0 ? 'Ya estaban generadas: no se duplicó nada.' : `Se generaron ${n} mensualidades.`, 'success');
      onDone(); onClose();
    }
  }
  return (
    <Modal open={open} onClose={onClose} title="Generar mensualidades"
      footer={<ConfirmFooter onCancel={onClose} onConfirm={go} loading={busy} confirmLabel={`Generar ${period}`} />}>
      <div className="space-y-4">
        <p className="text-base">Crea un cargo por familia con todas sus clases y membresías activas, aplica descuentos por hermanos y renueva las sesiones de los paquetes. Si ya se generó ese mes, no se duplica.</p>
        <Field label="Mes">{(p) => <Input {...p} type="month" value={period} onChange={(e) => setPeriod(e.target.value)} />}</Field>
        <Alert tone="info" title="Cobro automático con tarjeta">Se activará cuando el club elija su procesador de pagos. Mientras tanto se cobra en recepción o por transferencia.</Alert>
      </div>
    </Modal>
  );
}
