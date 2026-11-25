import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FileUp, Search, UserPlus } from 'lucide-react';
import { Button, Card, Input, PageHeader, Segmented, StatusBadge, Table, type Column } from '@/design-system';
import { useAuth } from '@/lib/auth';
import { useAsync, useDebounced } from '@/lib/hooks';
import { supabase, must } from '@/lib/supabase';
import { money0 } from '@/lib/format';
import type { Family, FamilyBalance } from '@/lib/types';
import { ErrorBox, Loading } from '@/components/common';
import { FamilyFormModal } from '@/components/FamilyForms';
import { ImportModal } from '@/components/ImportModal';
import { SOCIOS_FIELDS, SOCIOS_SAMPLE, SOCIOS_TOTALS } from '@/lib/importDefs';

type Row = Family & { members: { id: string; first_name: string; last_name: string; active: boolean }[]; balance?: FamilyBalance };

/** Directorio de familias y socios: búsqueda, alta y acceso al expediente. */
export default function Socios() {
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const { isFrontOffice } = useAuth();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('activas');
  const dq = useDebounced(q.trim(), 250);
  const creating = params.get('nueva') === '1';
  const [importing, setImporting] = useState(false);

  const { data, error, loading, reload } = useAsync(async () => {
    let query = supabase.from('families').select('*, members(id, first_name, last_name, active)').order('name').limit(200);
    if (filter === 'activas') query = query.neq('status', 'inactiva');
    if (filter === 'bloqueadas') query = query.eq('status', 'bloqueada');
    if (filter === 'inactivas') query = query.eq('status', 'inactiva');
    if (dq) {
      if (/^\d+$/.test(dq)) query = query.eq('number', Number(dq));
      else {
        // Busca por apellido/nombre de familia o por cualquier miembro.
        const ms = (await must(supabase.from('members').select('family_id').or(`first_name.ilike.%${dq}%,last_name.ilike.%${dq}%`).limit(100))) as { family_id: string }[];
        const ids = [...new Set(ms.map((m) => m.family_id))];
        query = ids.length ? query.or(`name.ilike.%${dq}%,phone.ilike.%${dq}%,id.in.(${ids.join(',')})`) : query.or(`name.ilike.%${dq}%,phone.ilike.%${dq}%`);
      }
    }
    const rows = (await must(query)) as Row[];
    if (isFrontOffice && rows.length) {
      const bs = (await must(supabase.from('family_balances').select('*').in('family_id', rows.map((r) => r.id)))) as FamilyBalance[];
      rows.forEach((r) => { r.balance = bs.find((b) => b.family_id === r.id); });
    }
    return rows;
  }, [dq, filter, isFrontOffice]);

  const columns: Column<Row>[] = [
    { key: 'num', header: 'No.', cell: (r) => <span className="ob-num text-fg-muted">#{r.number}</span>, width: '80px' },
    { key: 'name', header: 'Familia', cell: (r) => (
      <div>
        <p className="font-semibold">{r.name}</p>
        <p className="text-sm text-fg-muted">{r.members.filter((m) => m.active).map((m) => m.first_name).join(', ') || 'Sin miembros'}</p>
      </div>
    ) },
    { key: 'phone', header: 'Celular', cell: (r) => r.phone ?? '—', hideOnMobile: true },
    ...(isFrontOffice ? [{
      key: 'bal', header: 'Saldo', align: 'right' as const, cell: (r: Row) => {
        const b = Number(r.balance?.balance ?? 0);
        if (b <= 0) return <span className="text-success-700">✓ Al corriente</span>;
        return <span className={(r.balance?.days_overdue ?? 0) > 0 ? 'font-semibold text-danger-700' : 'font-semibold text-warning-700'}>{money0(b)}</span>;
      },
    }] : []),
    { key: 'status', header: 'Estado', cell: (r) => <StatusBadge status={r.status === 'activa' ? 'activo' : r.status === 'bloqueada' ? 'adeudo' : 'inactivo'} label={r.status === 'bloqueada' ? 'Bloqueada' : undefined} />, hideOnMobile: true },
  ];

  return (
    <>
      <PageHeader title="Socios y familias" description="Cada familia tiene un titular que paga y sus miembros (hijos, pareja)."
        actions={isFrontOffice && <div className="flex flex-wrap gap-2">
          <Button variant="secondary" icon={<FileUp className="h-5 w-5" />} onClick={() => setImporting(true)}>Importar Excel o PDF</Button>
          <Button icon={<UserPlus className="h-5 w-5" />} onClick={() => setParams({ nueva: '1' })}>Nueva familia</Button>
        </div>} />
      <ImportModal open={importing} onClose={() => setImporting(false)} onDone={reload} title="Importar socios y familias" rpc="importar_socios"
        intro="Sube el listado del sistema anterior (Excel, CSV o PDF con tabla). Agrupamos a los socios por número de familia, o por nombre de familia si no hay número, y guardamos su fecha de alta para calcular la antigüedad. Si vuelves a importar el mismo archivo no se duplica: se actualizan los datos que falten."
        fields={SOCIOS_FIELDS} sample={SOCIOS_SAMPLE} templateName="plantilla-socios-oberlicht.xlsx" totals={SOCIOS_TOTALS} />
      <Card className="mb-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="flex-1">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre, apellido, celular o número de familia"
              leading={<Search className="h-5 w-5" />} aria-label="Buscar familia" />
          </div>
          <Segmented value={filter} onChange={setFilter} options={[
            { id: 'activas', label: 'Activas' }, { id: 'bloqueadas', label: 'Bloqueadas' }, { id: 'inactivas', label: 'Inactivas' }, { id: 'todas', label: 'Todas' },
          ]} />
        </div>
      </Card>
      {error ? <ErrorBox error={error} onRetry={reload} /> : loading && !data ? <Loading /> : (
        <Table columns={columns} rows={data ?? []} rowKey={(r) => r.id} onRowClick={(r) => nav(`/familias/${r.id}`)}
          caption="Familias" empty={dq ? 'No hay familias que coincidan con la búsqueda.' : 'Aún no hay familias registradas.'} />
      )}
      <FamilyFormModal open={creating} onClose={() => setParams({})} onSaved={(f) => nav(`/familias/${f.id}`)} />
    </>
  );
}
