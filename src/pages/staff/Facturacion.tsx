import { useState } from 'react';
import { Download } from 'lucide-react';
import { Alert, Button, ConfirmFooter, Field, Input, Modal, PageHeader, Select, StatCard, Table, Tabs } from '@/design-system';
import { useAction, useAsync } from '@/lib/hooks';
import { supabase, must } from '@/lib/supabase';
import { dateShort, downloadCsv, money, money0, periodNow } from '@/lib/format';
import type { Invoice } from '@/lib/types';
import { ErrorBox, InvoiceBadge, Loading } from '@/components/common';

type Inv = Invoice & { families: { name: string; number: number } | null };
const MOTIVOS: [string, string][] = [
  ['01', '01 Comprobante emitido con errores con relación'],
  ['02', '02 Comprobante emitido con errores sin relación'],
  ['03', '03 No se llevó a cabo la operación'],
  ['04', '04 Operación nominativa relacionada en una factura global'],
];

/** Facturación CFDI 4.0: facturas individuales y global mensual a público en general. El timbrado se conecta al PAC. */
export default function Facturacion() {
  const [tab, setTab] = useState('individual');
  const [period, setPeriod] = useState(periodNow());
  const [cancel, setCancel] = useState<Inv | null>(null);

  const { data, error, loading, reload } = useAsync(async () => {
    const [rows, fiscal] = await Promise.all([
      must(supabase.from('invoices').select('*, families(name, number)').eq('period', period).order('created_at', { ascending: false })),
      must(supabase.from('settings').select('value').eq('key', 'fiscal').maybeSingle()),
    ]);
    return { rows: rows as Inv[], fiscal: (fiscal as { value: { rfc?: string; pac?: string; serie?: string } } | null)?.value ?? {} };
  }, [period]);

  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (loading && !data) return <Loading />;
  const { rows, fiscal } = data!;
  const ind = rows.filter((r) => r.kind === 'individual');
  const glob = rows.filter((r) => r.kind === 'global' && r.status !== 'cancelada');
  const pacReady = fiscal.pac && fiscal.pac !== 'pendiente' && fiscal.rfc;
  const globalTotal = glob.reduce((s, r) => s + Number(r.total), 0);

  return (
    <>
      <PageHeader title="Facturación (CFDI 4.0)" description="Cada pago de una familia que pidió factura genera su CFDI. El resto se junta en la factura global del mes a público en general."
        actions={<div className="w-44"><Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="Mes" /></div>} />
      {!pacReady && (
        <div className="mb-6">
          <Alert tone="warning" title="Falta conectar el PAC (proveedor de timbrado)">
            Las facturas quedan listas «Por timbrar». En cuanto Dirección capture el RFC emisor y elija PAC en Configuración, se timbran desde aquí con un clic.
          </Alert>
        </div>
      )}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Individuales por timbrar" value={ind.filter((r) => r.status === 'pendiente').length} />
        <StatCard label="Timbradas este mes" value={rows.filter((r) => r.status === 'timbrada').length} />
        <StatCard label="Global a público en general" value={money0(globalTotal)} hint={`${glob.length} pagos sin factura`} />
      </div>
      <Tabs className="mb-4" value={tab} onChange={setTab} items={[{ id: 'individual', label: 'Individuales', count: ind.length }, { id: 'global', label: 'Global del mes', count: glob.length }]} />
      <div className="mb-3 flex justify-end">
        <Button variant="secondary" icon={<Download className="h-5 w-5" />} disabled={!rows.length}
          onClick={() => downloadCsv(`facturas-${period}`, rows.map((r) => ({ tipo: r.kind, folio: r.folio ? `${r.serie ?? ''}${r.folio}` : '', familia: r.families?.name, rfc: r.receptor_rfc, nombre: r.receptor_nombre, uso: r.uso_cfdi, total: r.total, estado: r.status, uuid: r.uuid_sat })))}>
          Descargar para el contador
        </Button>
      </div>
      {tab === 'individual' ? (
        <Table rows={ind} rowKey={(r) => r.id} empty="Sin facturas individuales este mes." columns={[
          { key: 'f', header: 'Folio', cell: (r) => r.folio ? `${r.serie ?? ''}${r.folio}` : <span className="text-fg-muted">Por asignar</span> },
          { key: 'n', header: 'Receptor', cell: (r) => <div><p className="font-semibold">{r.receptor_nombre}</p><p className="text-sm text-fg-muted">{r.receptor_rfc} · {r.uso_cfdi} · {r.families?.name}</p></div> },
          { key: 'd', header: 'Fecha', hideOnMobile: true, cell: (r) => dateShort(r.issued_at ?? r.created_at) },
          { key: 't', header: 'Total', align: 'right', cell: (r) => <span className="font-semibold ob-num">{money(r.total)}</span> },
          { key: 's', header: 'Estado', cell: (r) => <div><InvoiceBadge i={r} />{r.error_message && <p className="mt-1 text-sm text-danger-700">{r.error_message}</p>}</div> },
          { key: 'x', header: '', align: 'right', cell: (r) => (
            <div className="flex justify-end gap-1">
              {r.status === 'pendiente' && <Button size="sm" disabled={!pacReady} title={pacReady ? undefined : 'Falta conectar el PAC'}>Timbrar</Button>}
              {r.pdf_url && <a className="inline-flex h-control-sm items-center px-3 text-sm font-semibold text-primary" href={r.pdf_url} target="_blank" rel="noreferrer">PDF</a>}
              {r.status !== 'cancelada' && <Button size="sm" variant="ghost" onClick={() => setCancel(r)}>Cancelar</Button>}
            </div>
          ) },
        ]} />
      ) : (
        <>
          <div className="mb-4">
            <Alert tone="info" title={`Factura global ${period}: ${money(globalTotal)}`}
              action={<Button disabled={!pacReady || !glob.length}>Timbrar global</Button>}>
              RFC XAXX010101000, uso S01, periodicidad mensual. Se emite una sola vez al cierre del mes con todos estos pagos.
            </Alert>
          </div>
          <Table rows={glob} rowKey={(r) => r.id} empty="Sin pagos para la global." columns={[
            { key: 'd', header: 'Fecha', cell: (r) => dateShort(r.created_at) },
            { key: 'f', header: 'Familia', cell: (r) => r.families ? `${r.families.name} #${r.families.number}` : '—' },
            { key: 't', header: 'Importe', align: 'right', cell: (r) => money(r.total) },
            { key: 's', header: 'Estado', cell: (r) => <InvoiceBadge i={r} /> },
          ]} />
        </>
      )}
      <CancelModal inv={cancel} onClose={() => setCancel(null)} onDone={reload} />
    </>
  );
}

function CancelModal({ inv, onClose, onDone }: { inv: Inv | null; onClose: () => void; onDone: () => void }) {
  const [motivo, setMotivo] = useState('02');
  const { busy, run } = useAction();
  async function go() {
    const r = await run(() => must(supabase.from('invoices').update({ status: 'cancelada', cancel_reason: motivo, cancelled_at: new Date().toISOString() }).eq('id', inv!.id).select()),
      inv?.status === 'timbrada' ? 'Cancelación registrada. Se enviará al SAT al conectar el PAC.' : 'Factura descartada');
    if (r) { onDone(); onClose(); }
  }
  return (
    <Modal open={!!inv} onClose={onClose} title="Cancelar factura"
      footer={<ConfirmFooter onCancel={onClose} onConfirm={go} loading={busy} danger confirmLabel="Cancelar factura" />}>
      <div className="space-y-4">
        <p className="text-base">Total {money(inv?.total)} a {inv?.receptor_nombre}.</p>
        <Field label="Motivo de cancelación (SAT)">{(p) => <Select {...p} value={motivo} onChange={(e) => setMotivo(e.target.value)}>{MOTIVOS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>}</Field>
        {motivo === '01' && <Alert tone="info" title="Motivo 01">Primero emite la factura que la sustituye y después cancela esta.</Alert>}
      </div>
    </Modal>
  );
}
