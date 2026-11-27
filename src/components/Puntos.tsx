import { useState } from 'react';
import { Coins, Gift } from 'lucide-react';
import { Badge, Button, Card, CardHeader, ConfirmFooter, Field, Input, Modal, StatCard, Switch, Table } from '@/design-system';
import { useAuth } from '@/lib/auth';
import { useAction, useAsync } from '@/lib/hooks';
import { supabase, must } from '@/lib/supabase';
import { dateShort, money, money0 } from '@/lib/format';
import { ErrorBox, Loading } from '@/components/common';
import { FamilyPicker, type PickedFamily } from '@/components/FamilyPicker';

export interface PuntosFamilia {
  activo: boolean; saldo: number; valor: number; pesos_por_punto: number; minimo_canje: number; ganados: number; canjeados: number;
  reglas: { racha: number | null; medalla: number | null; reto: number | null; referido: number | null; encuesta: number | null };
  movimientos: { id: number; puntos: number; tipo: string; desc: string; fecha: string }[];
}
export const TIPO_PUNTOS: Record<string, string> = {
  racha: 'Semana cumplida', medalla: 'Medalla', reto: 'Reto completado', referido: 'Recomendación', encuesta: 'Encuesta',
  canje: 'Canje', cancelacion: 'Devolución', ajuste: 'Ajuste',
};
export const pts = (n: number) => `${new Intl.NumberFormat('es-MX').format(n)} ${Math.abs(n) === 1 ? 'punto' : 'puntos'}`;

export async function cargarPuntos(familyId: string) {
  return (await must(supabase.rpc('puntos_familia', { p_family: familyId }))) as PuntosFamilia;
}

function Reglas({ r }: { r: PuntosFamilia['reglas'] }) {
  const items = [
    ['Cada semana que cumples tu meta', r.racha], ['Cada medalla nueva', r.medalla], ['Cada reto que completas', r.reto],
    ['Cada familia que recomiendas (al inscribirse)', r.referido], ['Cada encuesta que contestas', r.encuesta],
  ].filter(([, v]) => Number(v) > 0) as [string, number][];
  return <ul className="space-y-1.5">{items.map(([l, v]) => <li key={l} className="flex justify-between gap-3 text-base"><span>{l}</span><span className="font-semibold ob-num text-primary">+{v}</span></li>)}</ul>;
}

/** Portal: saldo de puntos de la familia, cómo se ganan y movimientos. */
export function PuntosPortal({ familyId, compact }: { familyId: string; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const { data, error } = useAsync(() => cargarPuntos(familyId), [familyId]);
  if (error) return null;
  if (!data) return compact ? null : <Loading />;
  if (!data.activo) return null;
  if (compact) {
    return (
      <Card>
        <button type="button" className="flex w-full items-center gap-3 text-left" onClick={() => setOpen(true)}>
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-gold-50 text-gold-800"><Coins className="h-6 w-6" aria-hidden /></span>
          <span className="flex-1">
            <span className="block text-sm text-fg-muted">Puntos Oberlicht</span>
            <span className="block text-xl font-bold ob-num">{pts(data.saldo)}</span>
            <span className="block text-sm text-fg-muted">Valen {money0(data.valor)} en barra y tienda</span>
          </span>
        </button>
        <Modal open={open} onClose={() => setOpen(false)} title="Puntos Oberlicht"><DetallePuntos d={data} /></Modal>
      </Card>
    );
  }
  return <Card><CardHeader title="Puntos Oberlicht" description="Los ganan todos en la familia y se usan juntos." /><DetallePuntos d={data} /></Card>;
}

function DetallePuntos({ d }: { d: PuntosFamilia }) {
  return (
    <div className="grid gap-4">
      <div className="rounded-lg bg-gold-50 p-4 text-gold-800">
        <p className="text-3xl font-bold ob-num">{pts(d.saldo)}</p>
        <p className="text-base">= {money(d.valor)} para usar en la barra saludable y la tienda. Pídelo al pagar{d.minimo_canje ? ` (desde ${d.minimo_canje} puntos)` : ''}.</p>
      </div>
      <div><p className="mb-2 text-sm font-semibold uppercase tracking-wide text-fg-muted">Cómo se ganan</p><Reglas r={d.reglas} /></div>
      <div>
        <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-fg-muted">Últimos movimientos</p>
        {d.movimientos.length === 0 ? <p className="text-base text-fg-muted">Aún no hay movimientos. ¡Ven a entrenar y empieza a sumar!</p> : (
          <ul className="max-h-72 divide-y divide-border overflow-y-auto">
            {d.movimientos.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 py-2">
                <span><span className="block text-base">{m.desc}</span><span className="text-sm text-fg-muted">{dateShort(m.fecha)}</span></span>
                <span className={`font-semibold ob-num ${m.puntos > 0 ? 'text-success-700' : 'text-fg-muted'}`}>{m.puntos > 0 ? '+' : ''}{m.puntos}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

interface Resumen {
  emitidos: number; canjeados: number; en_circulacion: number; pesos_por_punto: number; familias_con_saldo: number; canjes_mes: number;
  por_tipo: Record<string, number>; top: { family_id: string; familia: string; numero: number; saldo: number }[];
  reglas: { activo: boolean; pesos_por_punto: number; minimo_canje: number; por_semana_racha: number; por_medalla: number; por_reto: number; por_referido: number; por_encuesta: number };
}

/** Personal: resumen del programa de puntos, reglas y ajustes. */
export function PuntosAdmin() {
  const { isManager } = useAuth();
  const [reglas, setReglas] = useState(false);
  const [ajuste, setAjuste] = useState(false);
  const [ver, setVer] = useState<{ id: string; name: string } | null>(null);
  const { data, error, reload } = useAsync(async () => (await must(supabase.rpc('puntos_resumen'))) as Resumen, []);
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return <Loading />;
  const v = data.pesos_por_punto;
  return (
    <>
      {!data.reglas.activo && <p className="mb-3 rounded-md bg-warning-50 px-3 py-2 text-base text-warning-700">El programa está pausado: no se ganan ni se canjean puntos.</p>}
      <div className="ob-stats mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Puntos por usar" value={new Intl.NumberFormat('es-MX').format(data.en_circulacion)} hint={`Equivalen a ${money0(data.en_circulacion * v)}`} />
        <StatCard label="Ganados en total" value={new Intl.NumberFormat('es-MX').format(data.emitidos)} />
        <StatCard label="Canjeados" value={new Intl.NumberFormat('es-MX').format(data.canjeados)} hint={`${data.canjes_mes} canjes este mes`} />
        <StatCard label="Familias con puntos" value={String(data.familias_con_saldo)} />
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader title="Reglas del programa" description="Valores de ejemplo; Dirección los ajusta." actions={isManager ? <Button size="sm" variant="secondary" onClick={() => setReglas(true)}>Cambiar reglas</Button> : undefined} />
          <p className="mb-3 text-base">1 punto = <strong>{money(v)}</strong> · se canjea desde <strong>{data.reglas.minimo_canje}</strong> puntos en barra y tienda.</p>
          <Reglas r={{ racha: data.reglas.por_semana_racha, medalla: data.reglas.por_medalla, reto: data.reglas.por_reto, referido: data.reglas.por_referido, encuesta: data.reglas.por_encuesta }} />
          <div className="mt-4 flex flex-wrap gap-2">
            {Object.entries(data.por_tipo).map(([t, n]) => <Badge key={t} tone="accent">{TIPO_PUNTOS[t] ?? t}: {new Intl.NumberFormat('es-MX').format(n)}</Badge>)}
          </div>
        </Card>
        <Card>
          <CardHeader title="Familias con más puntos" actions={isManager ? <Button size="sm" variant="secondary" icon={<Gift className="h-4 w-4" />} onClick={() => setAjuste(true)}>Ajustar puntos</Button> : undefined} />
          <Table dense rows={data.top} rowKey={(t) => t.family_id} onRowClick={(t) => setVer({ id: t.family_id, name: t.familia })} empty="Aún nadie tiene puntos." columns={[
            { key: 'f', header: 'Familia', cell: (t) => <span>{t.familia} <span className="text-fg-muted">#{t.numero}</span></span> },
            { key: 's', header: 'Puntos', align: 'right', cell: (t) => <span className="font-semibold ob-num">{new Intl.NumberFormat('es-MX').format(t.saldo)}</span> },
            { key: 'v', header: 'Valor', align: 'right', cell: (t) => <span className="ob-num text-fg-muted">{money0(t.saldo * v)}</span> },
          ]} />
        </Card>
      </div>
      {reglas && <ReglasModal r={data.reglas} onClose={() => setReglas(false)} onSaved={() => { setReglas(false); reload(); }} />}
      {ajuste && <AjusteModal onClose={() => setAjuste(false)} onSaved={() => { setAjuste(false); reload(); }} />}
      {ver && <Modal open onClose={() => setVer(null)} title={`Puntos · ${ver.name}`}><VerFamilia id={ver.id} /></Modal>}
    </>
  );
}

function VerFamilia({ id }: { id: string }) {
  const { data, error } = useAsync(() => cargarPuntos(id), [id]);
  if (error) return <ErrorBox error={error} />;
  if (!data) return <Loading />;
  return <DetallePuntos d={data} />;
}

function ReglasModal({ r, onClose, onSaved }: { r: Resumen['reglas']; onClose: () => void; onSaved: () => void }) {
  const [x, setX] = useState({ ...r });
  const { busy, run } = useAction();
  const num = (key: keyof typeof x, label: string, step = '1', hint?: string) => (
    <Field label={label} hint={hint}>{(p) => <Input {...p} type="number" min={0} step={step} value={String(x[key] ?? '')} onChange={(e) => setX((o) => ({ ...o, [key]: e.target.value === '' ? 0 : Number(e.target.value) }))} />}</Field>
  );
  return (
    <Modal open onClose={onClose} title="Reglas de los puntos" size="lg"
      footer={<ConfirmFooter onCancel={onClose} confirmLabel="Guardar" loading={busy} onConfirm={async () => {
        if (!(x.pesos_por_punto > 0)) return;
        const ok = await run(() => must(supabase.from('settings').update({ value: x, updated_at: new Date().toISOString() }).eq('key', 'puntos').select()), 'Reglas guardadas');
        if (ok) onSaved();
      }} />}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><Switch checked={x.activo} onChange={(v) => setX((o) => ({ ...o, activo: v }))} label="Programa activo" /></div>
        {num('pesos_por_punto', 'Cuánto vale 1 punto (pesos)', '0.01', 'Ej. 0.10 = 100 puntos son $10')}
        {num('minimo_canje', 'Mínimo de puntos para canjear')}
        {num('por_semana_racha', 'Por semana cumplida')}
        {num('por_medalla', 'Por medalla')}
        {num('por_reto', 'Por reto completado')}
        {num('por_referido', 'Por familia recomendada')}
        {num('por_encuesta', 'Por contestar la encuesta')}
      </div>
      <p className="mt-3 text-sm text-fg-muted">Los cambios aplican a lo que se gane de aquí en adelante; los puntos ya ganados no cambian.</p>
    </Modal>
  );
}

function AjusteModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [fam, setFam] = useState<PickedFamily | null>(null);
  const [n, setN] = useState('');
  const [motivo, setMotivo] = useState('');
  const { busy, run } = useAction();
  return (
    <Modal open onClose={onClose} title="Ajustar puntos"
      footer={<ConfirmFooter onCancel={onClose} confirmLabel="Guardar ajuste" loading={busy} onConfirm={async () => {
        if (!fam || !Number(n) || !motivo.trim()) return;
        const ok = await run(() => must(supabase.rpc('ajustar_puntos', { p_family: fam.id, p_points: Math.round(Number(n)), p_reason: motivo.trim() })), 'Puntos ajustados');
        if (ok) onSaved();
      }} />}>
      <div className="grid gap-3">
        <Field label="Familia" required>{() => <FamilyPicker value={fam} onChange={setFam} />}</Field>
        <Field label="Puntos" required hint="Positivo para regalar, negativo para quitar (ej. -200)">{(p) => <Input {...p} type="number" step="1" value={n} onChange={(e) => setN(e.target.value)} />}</Field>
        <Field label="Motivo" required>{(p) => <Input {...p} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej. Cortesía por clase cancelada" />}</Field>
      </div>
    </Modal>
  );
}
