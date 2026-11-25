import { useNavigate } from 'react-router-dom';
import { CreditCard } from 'lucide-react';
import { Alert, Button, Card, CardHeader, PageHeader, Table } from '@/design-system';
import { useAsync } from '@/lib/hooks';
import { supabase, must } from '@/lib/supabase';
import { useMyFamily } from '@/lib/portal';
import { dateShort, money, money0 } from '@/lib/format';
import type { Charge, Invoice, Payment } from '@/lib/types';
import { ChargeBadge, ErrorBox, InvoiceBadge, Loading } from '@/components/common';

/** Portal: estado de cuenta, pagos hechos y facturas descargables. */
export default function MisPagos() {
  const nav = useNavigate();
  const { data: mine, error } = useMyFamily();
  const { data } = useAsync(async () => {
    if (!mine?.fam) return null;
    const [charges, payments, invoices] = await Promise.all([
      must(supabase.from('charges').select('*').eq('family_id', mine.fam.id).neq('status', 'cancelado').order('due_date', { ascending: false }).limit(36)),
      must(supabase.from('payments').select('*').eq('family_id', mine.fam.id).order('paid_at', { ascending: false }).limit(36)),
      must(supabase.from('invoices').select('*').eq('family_id', mine.fam.id).eq('kind', 'individual').order('created_at', { ascending: false }).limit(36)),
    ]);
    return { charges: charges as Charge[], payments: payments as Payment[], invoices: invoices as Invoice[] };
  }, [mine?.fam?.id]);

  if (error) return <ErrorBox error={error} />;
  if (!mine || (mine.fam && !data)) return <Loading />;
  if (!mine.fam) { nav('/'); return null; }
  const due = data!.charges.filter((c) => c.status === 'pendiente' || c.status === 'vencido');
  const balance = due.reduce((s, c) => s + Number(c.amount), 0);

  return (
    <>
      <PageHeader title="Pagos y facturas" />
      <Card className="mb-6">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <p className="text-base text-fg-muted">Saldo por pagar</p>
            <p className={`text-4xl font-bold ob-num ${balance > 0 ? 'text-fg' : 'text-success-700'}`}>{balance > 0 ? money0(balance) : '✓ Al corriente'}</p>
          </div>
          {balance > 0 && <Button size="lg" icon={<CreditCard className="h-5 w-5" />} disabled title="Disponible cuando el club conecte su procesador de pagos">Pagar en línea</Button>}
        </div>
        {balance > 0 && <div className="mt-4"><Alert tone="info" title="Pago en línea muy pronto">Mientras tanto puedes pagar en recepción con efectivo, tarjeta o transferencia.</Alert></div>}
        {!mine.fam.wants_invoice && <p className="mt-4 text-sm text-fg-muted">¿Necesitas factura? Agrega tus datos fiscales en <button className="font-semibold text-primary underline" onClick={() => nav('/mi-cuenta')}>Mi familia</button>.</p>}
      </Card>
      <div className="grid gap-6">
        <Card>
          <CardHeader title="Estado de cuenta" />
          <Table rows={data!.charges} rowKey={(c) => c.id} empty="Sin cargos todavía." columns={[
            { key: 'c', header: 'Concepto', cell: (c) => <span className="font-semibold">{c.concept}</span> },
            { key: 'd', header: 'Vence', cell: (c) => dateShort(c.due_date), hideOnMobile: true },
            { key: 'a', header: 'Importe', align: 'right', cell: (c) => <span className="ob-num">{money(c.amount)}</span> },
            { key: 's', header: 'Estado', cell: (c) => <ChargeBadge c={c} /> },
          ]} />
        </Card>
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader title="Pagos realizados" />
            <Table rows={data!.payments} rowKey={(p) => p.id} empty="Sin pagos." columns={[
              { key: 'd', header: 'Fecha', cell: (p) => dateShort(p.paid_at) },
              { key: 'a', header: 'Importe', align: 'right', cell: (p) => <span className="ob-num font-semibold">{money(p.amount)}</span> },
            ]} />
          </Card>
          <Card>
            <CardHeader title="Facturas" />
            <Table rows={data!.invoices} rowKey={(i) => i.id} empty={mine.fam.wants_invoice ? 'Aparecerán aquí al timbrarse.' : 'No solicitas factura.'} columns={[
              { key: 'd', header: 'Fecha', cell: (i) => dateShort(i.issued_at ?? i.created_at) },
              { key: 't', header: 'Total', align: 'right', cell: (i) => money(i.total) },
              { key: 's', header: 'Estado', cell: (i) => <InvoiceBadge i={i} /> },
              { key: 'x', header: '', align: 'right', cell: (i) => <div className="flex justify-end gap-3 text-sm font-semibold">
                {i.pdf_url && <a className="text-primary" href={i.pdf_url} target="_blank" rel="noreferrer">PDF</a>}
                {i.xml_url && <a className="text-primary" href={i.xml_url} target="_blank" rel="noreferrer">XML</a>}</div> },
            ]} />
          </Card>
        </div>
      </div>
    </>
  );
}
