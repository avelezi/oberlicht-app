import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { Alert, Button, Card, CardHeader, ConfirmFooter, Field, Input, Modal, PageHeader, Select, Switch, Table, Tabs, Textarea } from '@/design-system';
import { useAuth, deptName } from '@/lib/auth';
import { useAction, useAsync } from '@/lib/hooks';
import { supabase, must } from '@/lib/supabase';
import { useCatalog } from '@/lib/catalog';
import { dateShort, rangeLabel } from '@/lib/format';
import type { Cycle, DeptCode, Level } from '@/lib/types';
import { Area, ErrorBox, Loading } from '@/components/common';
import { REGIMENES } from '@/components/FamilyForms';
import { APLICA } from './Cupones';

type Settings = Record<string, Record<string, unknown>>;

/** Configuración del club: datos generales, fiscales, reglas de cobro y reservas, niveles y ciclos. */
export default function Configuracion() {
  const [tab, setTab] = useState('club');
  return (
    <>
      <PageHeader title="Configuración" description="Ajustes que cambian poco. Todo cambio queda registrado." />
      <Tabs className="mb-6" value={tab} onChange={setTab} items={[
        { id: 'club', label: 'Club y reglas' }, { id: 'fiscal', label: 'Facturación y pagos' }, { id: 'modulos', label: 'Privadas, referidos y avisos' }, { id: 'niveles', label: 'Niveles' }, { id: 'ciclos', label: 'Ciclos' },
      ]} />
      {tab === 'club' && <SettingsForm keys={['club', 'cobranza', 'reservas']} />}
      {tab === 'fiscal' && <SettingsForm keys={['fiscal', 'procesador']} />}
      {tab === 'modulos' && <SettingsForm keys={['privadas', 'referidos', 'recordatorios']} />}
      {tab === 'niveles' && <Levels />}
      {tab === 'ciclos' && <Cycles />}
    </>
  );
}

const LABELS: Record<string, Record<string, [string, string?]>> = {
  club: { nombre: ['Nombre del club'], sitio: ['Sitio web'], telefono: ['Teléfono'], correo: ['Correo de contacto'], direccion: ['Dirección'] },
  cobranza: {
    dia_corte: ['Día del mes en que se genera la mensualidad'], dias_bloqueo_adeudo: ['Días de gracia antes de bloquear reservas'],
    descuento_hermano_pct: ['Descuento por hermano (%)', 'Se aplica del segundo hijo en adelante'], descuento_segundo_plan_pct: ['Descuento por segundo plan (%)'],
  },
  reservas: { horas_cancelacion: ['Horas mínimas para cancelar sin perder la sesión'], dias_anticipacion: ['Días de anticipación para reservar'] },
  fiscal: { rfc: ['RFC del club (emisor)'], razon_social: ['Razón social'], regimen_fiscal: ['Régimen fiscal'], cp: ['Código postal fiscal'], serie: ['Serie de facturas'], pac: ['PAC (proveedor de timbrado)', 'Ej. Facturama, SW Sapien, Finkok'] },
  privadas: { precio: ['Precio por clase privada (MXN)', 'Se puede fijar uno distinto por instructor'], comision_pct: ['Comisión del instructor (%)'], duracion_min: ['Duración (minutos)'], comision_no_asistio: ['¿Se paga comisión si el alumno no asiste?'] },
  referidos: { tipo: ['Tipo de recompensa'], valor: ['Valor de la recompensa', 'Monto en MXN o porcentaje'], aplica: ['Aplica a'], vigencia_dias: ['Días de vigencia del cupón'] },
  recordatorios: { dias_antes_pago: ['Avisar pagos que vencen en los próximos (días)'], dias_inactividad: ['Avisar cuando un alumno lleva sin venir (días)'], dias_aviso_casillero: ['Avisar casilleros que vencen en (días)'], whatsapp_proveedor: ['Proveedor de WhatsApp Business', 'Para envío automático, cuando se contrate'], correo_proveedor: ['Proveedor de correo masivo'] },
  procesador: { proveedor: ['Procesador de pagos', 'Openpay, Conekta, Stripe MX o Mercado Pago'], modo: ['Modo'] },
};
const TITLES: Record<string, string> = { club: 'Datos del club', cobranza: 'Reglas de cobro', reservas: 'Reglas de reservas', fiscal: 'Datos fiscales (CFDI 4.0)', procesador: 'Cobro con tarjeta', privadas: 'Clases privadas', referidos: 'Recompensa por recomendar', recordatorios: 'Recordatorios' };

function SettingsForm({ keys }: { keys: string[] }) {
  const { data, error, reload } = useAsync(async () => {
    const rows = (await must(supabase.from('settings').select('key, value').in('key', keys))) as { key: string; value: Record<string, unknown> }[];
    return Object.fromEntries(rows.map((r) => [r.key, r.value])) as Settings;
  }, [keys.join()]);
  const [s, setS] = useState<Settings>({});
  const { busy, run } = useAction();
  useEffect(() => { if (data) setS(data); }, [data]);
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return <Loading />;
  const set = (k: string, f: string, v: unknown) => setS((x) => ({ ...x, [k]: { ...x[k], [f]: v } }));

  async function save(k: string) {
    await run(() => must(supabase.from('settings').update({ value: s[k], updated_at: new Date().toISOString() }).eq('key', k).select()), 'Guardado');
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {keys.map((k) => (
        <Card key={k}>
          <CardHeader title={TITLES[k]} actions={<Button size="sm" loading={busy} onClick={() => save(k)}>Guardar</Button>} />
          {k === 'procesador' && <div className="mb-4"><Alert tone="warning" title="Pendiente de elegir">Cuando el club contrate su procesador, conectamos el cobro automático y la liga de pago. Las tarjetas nunca se guardan en Oberlicht, solo un token del procesador.</Alert></div>}
          <div className="grid gap-4 sm:grid-cols-2">
            {Object.entries(LABELS[k] ?? {}).map(([f, [label, hint]]) => {
              const v = s[k]?.[f];
              if (f === 'regimen_fiscal') return <Field key={f} label={label}>{(p) => <Select {...p} value={String(v ?? '')} onChange={(e) => set(k, f, e.target.value)}>{REGIMENES.map(([c, l]) => <option key={c} value={c}>{l}</option>)}</Select>}</Field>;
              if (typeof v === 'boolean') return <div key={f} className="sm:col-span-2"><Switch checked={v} onChange={(x) => set(k, f, x)} label={label} /></div>;
              if (k === 'referidos' && f === 'tipo') return <Field key={f} label={label}>{(p) => <Select {...p} value={String(v ?? 'monto')} onChange={(e) => set(k, f, e.target.value)}><option value="monto">Monto fijo</option><option value="porcentaje">Porcentaje</option></Select>}</Field>;
              if (k === 'referidos' && f === 'aplica') return <Field key={f} label={label}>{(p) => <Select {...p} value={String(v ?? 'mensualidad')} onChange={(e) => set(k, f, e.target.value)}>{Object.entries(APLICA).map(([c, l]) => <option key={c} value={c}>{l}</option>)}</Select>}</Field>;
              if (f === 'modo') return <Field key={f} label={label}>{(p) => <Select {...p} value={String(v ?? 'pruebas')} onChange={(e) => set(k, f, e.target.value)}><option value="pruebas">Pruebas</option><option value="produccion">Producción</option></Select>}</Field>;
              const num = typeof v === 'number';
              return <Field key={f} label={label} hint={hint}>{(p) => <Input {...p} type={num ? 'number' : 'text'} value={String(v ?? '')} onChange={(e) => set(k, f, num ? Number(e.target.value) : e.target.value)} />}</Field>;
            })}
          </div>
        </Card>
      ))}
    </div>
  );
}

function Levels() {
  const { allDepartments } = useAuth();
  const { data: cat, reload } = useCatalog();
  const [edit, setEdit] = useState<Partial<Level> | null>(null);
  const { busy, run } = useAction();
  if (!cat) return <Loading />;
  const set = (k: keyof Level, v: unknown) => setEdit((x) => ({ ...x, [k]: v }));
  async function save() {
    const r = await run(async () => {
      const l = edit!;
      if (!l.name?.trim()) throw new Error('Escribe el nombre del nivel.');
      if (Number(l.max_age) < Number(l.min_age)) throw new Error('La edad máxima debe ser mayor que la mínima.');
      const payload = { department: l.department, name: l.name.trim(), description: l.description || null, min_age: Number(l.min_age) || 0, max_age: Number(l.max_age) || 99, sort_order: Number(l.sort_order) || 0, active: l.active ?? true };
      return l.id ? must(supabase.from('levels').update(payload).eq('id', l.id).select()) : must(supabase.from('levels').insert(payload).select());
    }, 'Nivel guardado');
    if (r) { setEdit(null); reload(); }
  }
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Alert tone="warning" title="Niveles de ejemplo">Confirma con cada coordinación los nombres, edades y cupos reales.</Alert>
        <Button icon={<Plus className="h-5 w-5" />} onClick={() => setEdit({ department: 'natacion', min_age: 4, max_age: 6, sort_order: 10, active: true })}>Nuevo nivel</Button>
      </div>
      <Table rows={cat.levels} rowKey={(l) => l.id} onRowClick={(l) => setEdit(l)} columns={[
        { key: 'a', header: 'Área', cell: (l) => <Area code={l.department} /> },
        { key: 'n', header: 'Nivel', cell: (l) => <span className="font-semibold">{l.name}</span> },
        { key: 'e', header: 'Edades', cell: (l) => rangeLabel(Number(l.min_age), Number(l.max_age)) },
        { key: 'o', header: 'Orden', align: 'right', hideOnMobile: true, cell: (l) => l.sort_order },
        { key: 's', header: '', cell: (l) => l.active ? '' : <span className="text-fg-muted">Inactivo</span> },
      ]} />
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Editar nivel' : 'Nuevo nivel'}
        footer={<ConfirmFooter onCancel={() => setEdit(null)} onConfirm={save} loading={busy} confirmLabel="Guardar" />}>
        {edit && <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Área">{(p) => <Select {...p} value={edit.department} onChange={(e) => set('department', e.target.value as DeptCode)}>
            {allDepartments.filter((d) => d.is_area).map((d) => <option key={d.code} value={d.code}>{deptName(allDepartments, d.code)}</option>)}</Select>}</Field>
          <Field label="Nombre">{(p) => <Input {...p} value={edit.name ?? ''} onChange={(e) => set('name', e.target.value)} />}</Field>
          <Field label="Edad mínima (años)" hint="Usa decimales para meses: 0.5 = 6 meses">{(p) => <Input {...p} type="number" step="0.5" min={0} value={edit.min_age ?? ''} onChange={(e) => set('min_age', e.target.value)} />}</Field>
          <Field label="Edad máxima (años)">{(p) => <Input {...p} type="number" step="0.5" min={0} value={edit.max_age ?? ''} onChange={(e) => set('max_age', e.target.value)} />}</Field>
          <Field label="Orden" hint="Del más básico al más avanzado">{(p) => <Input {...p} type="number" value={edit.sort_order ?? 0} onChange={(e) => set('sort_order', e.target.value)} />}</Field>
          <div className="flex items-end"><Switch checked={edit.active ?? true} onChange={(v) => set('active', v)} label="Activo" /></div>
          <Field label="Qué aprende en este nivel" className="sm:col-span-2">{(p) => <Textarea {...p} rows={2} value={edit.description ?? ''} onChange={(e) => set('description', e.target.value)} />}</Field>
        </div>}
      </Modal>
    </>
  );
}

function Cycles() {
  const { allDepartments } = useAuth();
  const { data: cat, reload } = useCatalog();
  const [edit, setEdit] = useState<Partial<Cycle> | null>(null);
  const { busy, run } = useAction();
  if (!cat) return <Loading />;
  const set = (k: keyof Cycle, v: unknown) => setEdit((x) => ({ ...x, [k]: v }));
  async function save() {
    const r = await run(async () => {
      const c = edit!;
      if (!c.name?.trim() || !c.starts_on || !c.ends_on) throw new Error('Completa nombre y fechas.');
      const payload = { department: c.department, name: c.name.trim(), starts_on: c.starts_on, ends_on: c.ends_on, is_current: c.is_current ?? false };
      if (payload.is_current) await must(supabase.from('cycles').update({ is_current: false }).eq('department', payload.department!).select());
      return c.id ? must(supabase.from('cycles').update(payload).eq('id', c.id).select()) : must(supabase.from('cycles').insert(payload).select());
    }, 'Ciclo guardado');
    if (r) { setEdit(null); reload(); }
  }
  return (
    <>
      <div className="mb-4 flex justify-end"><Button icon={<Plus className="h-5 w-5" />} onClick={() => setEdit({ department: 'natacion', is_current: false })}>Nuevo ciclo</Button></div>
      <Table rows={cat.cycles} rowKey={(c) => c.id} onRowClick={(c) => setEdit(c)} empty="Sin ciclos." columns={[
        { key: 'a', header: 'Área', cell: (c) => <Area code={c.department} /> },
        { key: 'n', header: 'Ciclo', cell: (c) => <span className="font-semibold">{c.name}</span> },
        { key: 'd', header: 'Fechas', cell: (c) => `${dateShort(c.starts_on)} – ${dateShort(c.ends_on)}` },
        { key: 's', header: '', cell: (c) => c.is_current ? <span className="font-semibold text-success-700">● Vigente</span> : '' },
      ]} />
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Editar ciclo' : 'Nuevo ciclo'}
        footer={<ConfirmFooter onCancel={() => setEdit(null)} onConfirm={save} loading={busy} confirmLabel="Guardar" />}>
        {edit && <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Área">{(p) => <Select {...p} value={edit.department} onChange={(e) => set('department', e.target.value as DeptCode)}>
            {allDepartments.filter((d) => d.is_area).map((d) => <option key={d.code} value={d.code}>{d.name}</option>)}</Select>}</Field>
          <Field label="Nombre">{(p) => <Input {...p} value={edit.name ?? ''} onChange={(e) => set('name', e.target.value)} placeholder="Ciclo enero–junio 2027" />}</Field>
          <Field label="Inicia">{(p) => <Input {...p} type="date" value={edit.starts_on ?? ''} onChange={(e) => set('starts_on', e.target.value)} />}</Field>
          <Field label="Termina">{(p) => <Input {...p} type="date" value={edit.ends_on ?? ''} onChange={(e) => set('ends_on', e.target.value)} />}</Field>
          <div className="sm:col-span-2"><Switch checked={edit.is_current ?? false} onChange={(v) => set('is_current', v)} label="Es el ciclo vigente (las edades se calculan al inicio del ciclo)" /></div>
        </div>}
      </Modal>
    </>
  );
}
