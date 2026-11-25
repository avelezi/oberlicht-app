import { useState } from 'react';
import { Droplets, Download } from 'lucide-react';
import { Button, Card, CardHeader, Checkbox, Field, Input, Segmented, Select, Table, Textarea } from '@/design-system';
import { useAction, useAsync } from '@/lib/hooks';
import { supabase, must } from '@/lib/supabase';
import { dateTime, downloadCsv } from '@/lib/format';
import { Bars } from '@/components/charts';
import { ErrorBox, Loading } from '@/components/common';
import { inRange, Reading, type PoolLog } from './shared';
import type { MantCtx } from '../Mantenimiento';

const KEYS = [
  { k: 'ph', step: '0.1', ph: '7.4' }, { k: 'free_chlorine', step: '0.1', ph: '1.5' }, { k: 'combined_chlorine', step: '0.1', ph: '0.1' },
  { k: 'temperature', step: '0.5', ph: '28' }, { k: 'alkalinity', step: '1', ph: '100' }, { k: 'hardness', step: '1', ph: '250' }, { k: 'cya', step: '1', ph: '30' },
] as const;
type K = typeof KEYS[number]['k'];

/** Bitácora del agua: captura rápida desde el celular, semáforo por rango y tendencia. */
export function Alberca({ ctx }: { ctx: MantCtx }) {
  const [pool, setPool] = useState(ctx.pools[0] ?? 'Alberca principal');
  const [f, setF] = useState<Partial<Record<K, string>> & { clarity?: string; chemicals_added?: string; notes?: string; backwash?: boolean }>({ clarity: 'cristalina' });
  const [metric, setMetric] = useState<K>('ph');
  const { busy, run } = useAction();

  const { data, error, reload } = useAsync(async () =>
    (await must(supabase.from('pool_logs').select('*').eq('pool', pool).order('taken_at', { ascending: false }).limit(120))) as PoolLog[], [pool]);

  async function save() {
    const payload: Record<string, unknown> = { pool, clarity: f.clarity || null, chemicals_added: f.chemicals_added || null, notes: f.notes || null, backwash: !!f.backwash };
    for (const { k } of KEYS) payload[k] = f[k] === undefined || f[k] === '' ? null : Number(f[k]);
    if (KEYS.every(({ k }) => payload[k] == null)) throw new Error('Captura al menos una medición.');
    const { data: u } = await supabase.auth.getUser();
    payload.taken_by = u.user?.id;
    await must(supabase.from('pool_logs').insert(payload));
  }

  const out = KEYS.filter(({ k }) => { const s = inRange(ctx.ranges, k, f[k] ? Number(f[k]) : null); return s && s !== 'ok'; });

  if (error) return <ErrorBox error={error} onRetry={reload} />;
  const chart = (data ?? []).filter((l) => l[metric] != null).slice(0, 40).reverse();
  const r = ctx.ranges[metric];

  return (
    <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
      <Card>
        <CardHeader title={<span className="inline-flex items-center gap-2"><Droplets className="h-5 w-5 text-primary" /> Nueva lectura</span>} />
        <div className="space-y-3">
          {ctx.pools.length > 1 && <Segmented value={pool} onChange={setPool} options={ctx.pools.map((p) => ({ id: p, label: p }))} />}
          <div className="grid grid-cols-2 gap-3">
            {KEYS.map(({ k, step, ph }) => {
              const s = inRange(ctx.ranges, k, f[k] ? Number(f[k]) : null);
              return (
                <Field key={k} label={ctx.ranges[k]?.label ?? k} hint={ctx.ranges[k] ? `Ideal ${ctx.ranges[k].min}–${ctx.ranges[k].max}` : undefined} error={s && s !== 'ok' ? (s === 'low' ? 'Bajo' : 'Alto') : undefined}>
                  {(p) => <Input {...p} type="number" inputMode="decimal" step={step} placeholder={ph} value={f[k] ?? ''} onChange={(e) => setF((x) => ({ ...x, [k]: e.target.value }))} />}
                </Field>
              );
            })}
            <Field label="Claridad">{(p) => <Select {...p} value={f.clarity} onChange={(e) => setF((x) => ({ ...x, clarity: e.target.value }))}>
              <option value="cristalina">Cristalina</option><option value="ligeramente_turbia">Ligeramente turbia</option><option value="turbia">Turbia</option></Select>}</Field>
          </div>
          <Field label="Químicos agregados">{(p) => <Input {...p} placeholder="Ej. 2 kg cloro granulado, 1 L ácido muriático" value={f.chemicals_added ?? ''} onChange={(e) => setF((x) => ({ ...x, chemicals_added: e.target.value }))} />}</Field>
          <Checkbox label="Se hizo retrolavado" checked={!!f.backwash} onChange={(e) => setF((x) => ({ ...x, backwash: e.target.checked }))} />
          <Field label="Notas">{(p) => <Textarea {...p} rows={2} value={f.notes ?? ''} onChange={(e) => setF((x) => ({ ...x, notes: e.target.value }))} />}</Field>
          {out.length > 0 && <p className="rounded-md bg-danger-50 p-3 text-sm font-semibold text-danger-700">! Fuera de rango: {out.map(({ k }) => ctx.ranges[k]?.label).join(', ')}. Anota qué químico agregaste y vuelve a medir en 1–2 horas.</p>}
          <Button size="lg" className="w-full" loading={busy} onClick={async () => { const ok = await run(async () => { await save(); return true; }, 'Lectura guardada'); if (ok) { setF({ clarity: 'cristalina' }); reload(); ctx.reloadAll(); } }}>Guardar lectura</Button>
        </div>
      </Card>

      <div className="space-y-6">
        <Card>
          <CardHeader title="Tendencia" actions={<Select value={metric} onChange={(e) => setMetric(e.target.value as K)} className="w-52">{KEYS.map(({ k }) => <option key={k} value={k}>{ctx.ranges[k]?.label ?? k}</option>)}</Select>} />
          {!data ? <Loading /> : <Bars data={chart.map((l) => ({ label: new Date(l.taken_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'numeric' }), value: Number(l[metric]), detail: dateTime(l.taken_at) }))}
            format={(n) => (Math.round(n * 10) / 10).toString()} />}
          {r && <p className="mt-2 text-sm text-fg-muted">Rango ideal: {r.min} a {r.max}. Las lecturas fuera de rango aparecen en rojo en la tabla.</p>}
        </Card>
        <Card padded={false}>
          <div className="flex items-center justify-between p-4"><h3 className="text-lg font-semibold">Bitácora · {pool}</h3>
            <Button size="sm" variant="ghost" icon={<Download className="h-4 w-4" />} onClick={() => downloadCsv(`bitacora-${pool}.csv`, (data ?? []).map((l) => ({ Fecha: dateTime(l.taken_at), pH: l.ph, 'Cloro libre': l.free_chlorine, 'Cloro combinado': l.combined_chlorine, Temperatura: l.temperature, Alcalinidad: l.alkalinity, Dureza: l.hardness, CYA: l.cya, Claridad: l.clarity, Químicos: l.chemicals_added, Retrolavado: l.backwash ? 'Sí' : '', Notas: l.notes })))}>Descargar</Button></div>
          <Table dense rows={(data ?? []).slice(0, 50)} rowKey={(l) => l.id} empty="Aún no hay lecturas." columns={[
            { key: 't', header: 'Fecha', cell: (l) => <span className="whitespace-nowrap">{dateTime(l.taken_at)}</span> },
            { key: 'ph', header: 'pH', align: 'right', cell: (l) => <Reading value={l.ph} state={inRange(ctx.ranges, 'ph', l.ph)} /> },
            { key: 'cl', header: 'Cloro', align: 'right', cell: (l) => <Reading value={l.free_chlorine} state={inRange(ctx.ranges, 'free_chlorine', l.free_chlorine)} /> },
            { key: 'cc', header: 'Comb.', align: 'right', hideOnMobile: true, cell: (l) => <Reading value={l.combined_chlorine} state={inRange(ctx.ranges, 'combined_chlorine', l.combined_chlorine)} /> },
            { key: 'te', header: '°C', align: 'right', cell: (l) => <Reading value={l.temperature} state={inRange(ctx.ranges, 'temperature', l.temperature)} /> },
            { key: 'al', header: 'Alcal.', align: 'right', hideOnMobile: true, cell: (l) => <Reading value={l.alkalinity} state={inRange(ctx.ranges, 'alkalinity', l.alkalinity)} /> },
            { key: 'q', header: 'Químicos / notas', hideOnMobile: true, cell: (l) => <span className="text-sm">{[l.chemicals_added, l.backwash ? 'Retrolavado' : '', l.notes].filter(Boolean).join(' · ')}</span> },
          ]} />
        </Card>
      </div>
    </div>
  );
}
