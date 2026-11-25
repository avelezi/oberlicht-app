import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, CheckCircle2, FileUp, LogOut, Wallet } from 'lucide-react';
import { Alert, Avatar, Button, Card, EmptyState, Input, PageHeader, Select } from '@/design-system';
import { useAuth } from '@/lib/auth';
import { useAction, useAsync, useDebounced } from '@/lib/hooks';
import { supabase, must } from '@/lib/supabase';
import { ageLabel, fullName, money0 } from '@/lib/format';
import type { DeptCode, FamilyBalance, Member } from '@/lib/types';
import { Area, HealthFlag, Loading } from '@/components/common';
import { ImportModal } from '@/components/ImportModal';
import { VISITAS_FIELDS, VISITAS_SAMPLE, VISITAS_TOTALS } from '@/lib/importDefs';

type Row = Member & { families: { id: string; number: number; name: string; status: string } | null };

/** Recepción: buscar a la persona que llega, ver si puede pasar y registrar su entrada. */
export default function Entrada() {
  const nav = useNavigate();
  const { myAreas, allDepartments } = useAuth();
  const [q, setQ] = useState('');
  const dq = useDebounced(q.trim(), 250);
  const [area, setArea] = useState<DeptCode>('oberfit');
  const [done, setDone] = useState<Record<string, boolean>>({});
  const { busy, run } = useAction();
  const [importing, setImporting] = useState(false);
  const [out, setOut] = useState<Record<string, boolean>>({});

  const { data, loading } = useAsync(async () => {
    if (dq.length < 2) return { rows: [] as Row[], balances: [] as FamilyBalance[] };
    const num = Number(dq);
    let query = supabase.from('members').select('*, families(id, number, name, status)').eq('active', true).limit(12);
    query = Number.isFinite(num) && dq.match(/^\d+$/)
      ? query.eq('families.number', num).not('families', 'is', null)
      : query.or(`first_name.ilike.%${dq}%,last_name.ilike.%${dq}%`);
    const rows = (await must(query.order('first_name'))) as Row[];
    const famIds = [...new Set(rows.map((r) => r.family_id))];
    const balances = famIds.length ? ((await must(supabase.from('family_balances').select('*').in('family_id', famIds))) as FamilyBalance[]) : [];
    return { rows, balances };
  }, [dq]);

  async function checkIn(m: Row) {
    const r = await run(() => must(supabase.rpc('registrar_entrada', { p_member: m.id, p_department: area })), `Entrada registrada: ${m.first_name}`);
    if (r) setDone((d) => ({ ...d, [m.id]: true }));
  }

  async function checkOut(m: Row) {
    const r = await run(() => must(supabase.rpc('registrar_salida', { p_member: m.id })), `Salida registrada: ${m.first_name}`);
    if (r) setOut((d) => ({ ...d, [m.id]: true }));
  }

  const areas = allDepartments.filter((d) => d.is_area && myAreas.includes(d.code));

  return (
    <>
      <PageHeader title="Registrar entrada" description="Escribe el nombre o el número de familia de quien llega o se va."
        actions={<Button variant="secondary" icon={<FileUp className="h-5 w-5" />} onClick={() => setImporting(true)}>Importar entradas y salidas</Button>} />
      <ImportModal open={importing} onClose={() => setImporting(false)} title="Importar entradas y salidas" rpc="importar_visitas" chunk={500}
        intro="Sube el reporte de accesos del sistema de check-in actual (Excel, CSV o PDF). Buscamos a cada persona por su ID del sistema anterior, por número de familia y nombre, o por nombre completo. Los registros repetidos se ignoran, así que puedes subir el mismo periodo más de una vez. Cuando sepamos si ese sistema tiene API, lo conectamos para que llegue solo."
        fields={VISITAS_FIELDS} sample={VISITAS_SAMPLE} templateName="plantilla-entradas-oberlicht.xlsx" totals={VISITAS_TOTALS} />
      <Card className="mb-6">
        <div className="grid gap-3 md:grid-cols-[1fr_240px]">
          <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ej. Sofía, López o 1024"
            leading={<Search className="h-5 w-5" />} className="h-control-lg text-lg" aria-label="Buscar socio" />
          <Select value={area} onChange={(e) => setArea(e.target.value as DeptCode)} aria-label="Área a la que entra" className="h-control-lg">
            {areas.map((a) => <option key={a.code} value={a.code}>Entra a: {a.name}</option>)}
          </Select>
        </div>
      </Card>

      {dq.length < 2 ? (
        <EmptyState icon={<Search className="h-8 w-8" />} title="Busca a la persona que llega" description="Con dos letras basta. También puedes escribir el número de familia." />
      ) : loading && !data ? <Loading /> : !data?.rows.length ? (
        <EmptyState title="No encontramos a nadie con ese nombre" description="Revisa cómo se escribe o registra a la familia nueva."
          action={<Button onClick={() => nav('/socios?nueva=1')}>Nueva familia</Button>} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {data.rows.map((m) => {
            const bal = data.balances.find((b) => b.family_id === m.family_id);
            const blocked = m.families?.status === 'bloqueada' || (bal && bal.days_overdue > 10);
            const owes = bal && Number(bal.balance) > 0;
            return (
              <Card key={m.id} className={blocked ? 'border-danger-200' : undefined}>
                <div className="flex items-start gap-4">
                  <Avatar name={fullName(m)} src={m.photo_url ?? undefined} size={56} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xl font-bold">{fullName(m)}</p>
                    <p className="text-base text-fg-muted">
                      {m.families?.name} · Familia #{m.families?.number} · {ageLabel(m.birthdate)}
                    </p>
                    <div className="mt-2 space-y-2">
                      <HealthFlag allergies={m.allergies} medical={m.medical_notes} />
                      {blocked ? (
                        <Alert tone="danger" title={`Adeudo de ${money0(bal?.balance)} con ${bal?.days_overdue} días de atraso`}>Cobra antes de dejar pasar o pide autorización.</Alert>
                      ) : owes ? (
                        <p className="text-sm font-semibold text-warning-700">◷ Tiene {money0(bal?.balance)} por pagar</p>
                      ) : (
                        <p className="text-sm font-semibold text-success-700">✓ Al corriente</p>
                      )}
                    </div>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {done[m.id] ? (
                    <Button variant="success" size="lg" icon={<CheckCircle2 className="h-5 w-5" />} disabled>Entrada registrada</Button>
                  ) : (
                    <Button size="lg" loading={busy} onClick={() => checkIn(m)} disabled={!!blocked}>Registrar entrada</Button>
                  )}
                  {out[m.id]
                    ? <Button variant="ghost" size="lg" disabled>Salida registrada</Button>
                    : <Button variant="secondary" size="lg" icon={<LogOut className="h-5 w-5" />} loading={busy} onClick={() => checkOut(m)}>Registrar salida</Button>}
                  {owes && <Button variant="secondary" size="lg" icon={<Wallet className="h-5 w-5" />} onClick={() => nav(`/familias/${m.family_id}?cobrar=1`)}>Cobrar</Button>}
                  <Button variant="ghost" size="lg" onClick={() => nav(`/familias/${m.family_id}`)}>Ver expediente</Button>
                </div>
                <div className="mt-2"><Area code={area} /></div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
