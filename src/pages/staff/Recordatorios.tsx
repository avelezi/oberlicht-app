import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Mail, MessageCircle, Pencil } from 'lucide-react';
import { Alert, Button, Card, ConfirmFooter, Field, Modal, PageHeader, Select, Table, Tabs, Textarea } from '@/design-system';
import { useAuth } from '@/lib/auth';
import { useAction, useAsync } from '@/lib/hooks';
import { supabase, must } from '@/lib/supabase';
import { dateShort, downloadCsv, money } from '@/lib/format';
import { ErrorBox, Loading } from '@/components/common';

const CLUB = 'Oberlicht';

export const TIPOS = [
  { key: 'pago_por_vencer', label: 'Pagos por vencer', front: true, empty: 'Nadie tiene pagos por vencer en los próximos días.' },
  { key: 'pago_vencido', label: 'Pagos vencidos', front: true, empty: 'No hay pagos vencidos. ¡Excelente!' },
  { key: 'clase_manana', label: 'Clases de mañana', front: false, empty: 'No hay clases mañana para esta área.' },
  { key: 'te_extranamos', label: 'Dejaron de venir', front: false, empty: 'Todos los alumnos activos han venido recientemente.' },
  { key: 'casillero_vence', label: 'Casilleros por vencer', front: true, empty: 'Ninguna renta de casillero vence pronto.' },
] as const;
type Tipo = (typeof TIPOS)[number]['key'];

export interface Recordatorio {
  family_id: string; member_id: string | null; nombre: string; familia: string; telefono: string | null; correo: string | null;
  detalle: string | null; monto: number | null; fecha: string | null; hora: string | null; dias: number | null; ultimo_envio: string | null;
}
interface Template { key: string; name: string; body: string }

/** Rellena la plantilla con los datos de la persona. */
export function renderTemplate(body: string, r: Recordatorio) {
  const vals: Record<string, string> = {
    nombre: r.nombre.split(' ')[0] ?? r.nombre, club: CLUB, detalle: r.detalle ?? '', monto: r.monto != null ? money(r.monto) : '',
    fecha: r.fecha ? dateShort(r.fecha) : '', hora: r.hora ?? '', dias: r.dias != null ? String(r.dias) : '',
  };
  return body.replace(/\{(\w+)\}/g, (_, k: string) => vals[k] ?? '');
}

/** Número a formato internacional de México para wa.me (52 + 10 dígitos). */
export function waPhone(tel: string | null): string | null {
  if (!tel) return null;
  let d = tel.replace(/\D/g, '');
  if (d.startsWith('521') && d.length === 13) d = '52' + d.slice(3);
  if (d.length === 10) d = '52' + d;
  return d.length >= 11 ? d : null;
}

/** Recordatorios a familias por WhatsApp o correo, con la lista de quién lo necesita hoy. */
export default function Recordatorios() {
  const { isFrontOffice, isManager, myAreas, allDepartments } = useAuth();
  const [params, setParams] = useSearchParams();
  const tipos = TIPOS.filter((t) => isFrontOffice || !t.front);
  const tipo = (tipos.find((t) => t.key === params.get('tipo'))?.key ?? tipos[0]?.key ?? 'te_extranamos') as Tipo;
  const def = TIPOS.find((t) => t.key === tipo)!;
  const [area, setArea] = useState<string>(isFrontOffice ? '' : myAreas[0] ?? '');
  const [editing, setEditing] = useState<Template | null>(null);
  const { busy, run } = useAction();

  const { data, error, reload } = useAsync(async () => {
    const [rows, tpl] = await Promise.all([
      must(supabase.rpc('recordatorios', { p_tipo: tipo, p_area: def.front ? null : area || null })),
      must(supabase.from('message_templates').select('key, name, body')),
    ]);
    return { rows: rows as Recordatorio[], tpl: tpl as Template[] };
  }, [tipo, area]);

  const template = data?.tpl.find((t) => t.key === tipo);

  async function log(r: Recordatorio, channel: 'whatsapp' | 'correo', body: string) {
    await run(() => must(supabase.rpc('registrar_recordatorio', { p_family: r.family_id, p_member: r.member_id, p_template: tipo, p_channel: channel, p_body: body })));
    reload();
  }
  function sendWa(r: Recordatorio) {
    const body = renderTemplate(template?.body ?? '', r);
    const ph = waPhone(r.telefono);
    if (!ph) return;
    window.open(`https://wa.me/${ph}?text=${encodeURIComponent(body)}`, '_blank', 'noopener');
    void log(r, 'whatsapp', body);
  }
  function sendMail(r: Recordatorio) {
    const body = renderTemplate(template?.body ?? '', r);
    if (!r.correo) return;
    window.location.href = `mailto:${r.correo}?subject=${encodeURIComponent(`${CLUB} · ${template?.name ?? 'Recordatorio'}`)}&body=${encodeURIComponent(body)}`;
    void log(r, 'correo', body);
  }

  const areas = allDepartments.filter((d) => d.is_area && myAreas.includes(d.code));

  return (
    <>
      <PageHeader title="Recordatorios" description="A quién escribirle hoy. Toca WhatsApp o correo: el mensaje ya va escrito y queda registrado." />
      <Tabs className="mb-4" value={tipo} onChange={(v) => setParams({ tipo: v })} items={tipos.map((t) => ({ id: t.key, label: t.label }))} />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        {!def.front && (
          <label className="text-sm font-semibold">Área
            <Select className="mt-1 w-56" value={area} onChange={(e) => setArea(e.target.value)}>
              {isFrontOffice && <option value="">Todas</option>}
              {areas.map((a) => <option key={a.code} value={a.code}>{a.name}</option>)}
            </Select>
          </label>
        )}
        <div className="ml-auto flex gap-2">
          {data && data.rows.length > 0 && <Button variant="secondary" onClick={() => downloadCsv(`recordatorios-${tipo}`, data.rows.map((r) => ({ Nombre: r.nombre, Familia: r.familia, Telefono: r.telefono ?? '', Correo: r.correo ?? '', Detalle: r.detalle ?? '', Monto: r.monto ?? '', Fecha: r.fecha ?? '', Dias: r.dias ?? '', Mensaje: renderTemplate(template?.body ?? '', r) })))}>Descargar lista</Button>}
          {isManager && template && <Button variant="secondary" icon={<Pencil className="h-4 w-4" />} onClick={() => setEditing(template)}>Editar mensaje</Button>}
        </div>
      </div>
      {template && <Card className="mb-4"><p className="text-sm font-semibold text-fg-muted">Mensaje que se enviará</p><p className="mt-1 text-base">{template.body}</p></Card>}
      {error ? <ErrorBox error={error} onRetry={reload} /> : !data ? <Loading /> : (
        <Table rows={data.rows} rowKey={(r) => `${r.family_id}-${r.member_id ?? ''}-${r.detalle ?? ''}`} empty={def.empty} columns={[
          { key: 'n', header: 'Persona', cell: (r) => <div><p className="font-semibold">{r.nombre}</p><p className="text-sm text-fg-muted">{r.familia}</p></div> },
          { key: 'd', header: 'Detalle', cell: (r) => <div className="text-sm"><p>{r.detalle ?? ''}{r.monto != null ? ` · ${money(r.monto)}` : ''}</p><p className="text-fg-muted">{[r.fecha && dateShort(r.fecha), r.hora, r.dias != null && `${r.dias} días sin venir`].filter(Boolean).join(' · ')}</p></div> },
          { key: 'u', header: 'Último aviso', hideOnMobile: true, cell: (r) => r.ultimo_envio ? <span className="text-sm text-fg-muted">{dateShort(r.ultimo_envio)}</span> : <span className="text-sm text-fg-subtle">Nunca</span> },
          { key: 'a', header: '', align: 'right', cell: (r) => (
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="success" disabled={!waPhone(r.telefono)} icon={<MessageCircle className="h-4 w-4" />} onClick={() => sendWa(r)}>WhatsApp</Button>
              <Button size="sm" variant="secondary" disabled={!r.correo} icon={<Mail className="h-4 w-4" />} onClick={() => sendMail(r)}>Correo</Button>
            </div>
          ) },
        ]} />
      )}
      <Alert tone="info" title="Envío automático" >Por ahora cada mensaje se manda desde tu WhatsApp o correo con un toque. Cuando el club contrate un proveedor de WhatsApp Business o correo masivo, estos mismos recordatorios pueden salir solos.</Alert>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={`Mensaje: ${editing?.name ?? ''}`}
        footer={<ConfirmFooter onCancel={() => setEditing(null)} confirmLabel="Guardar" loading={busy} onConfirm={async () => {
          const ok = await run(() => must(supabase.from('message_templates').update({ body: editing!.body, updated_at: new Date().toISOString() }).eq('key', editing!.key).select()), 'Mensaje guardado');
          if (ok) { setEditing(null); reload(); }
        }} />}>
        {editing && <>
          <Field label="Texto">{(p) => <Textarea {...p} rows={5} value={editing.body} onChange={(e) => setEditing({ ...editing, body: e.target.value })} />}</Field>
          <p className="mt-2 text-sm text-fg-muted">Puedes usar: {'{nombre}'} {'{club}'} {'{detalle}'} {'{monto}'} {'{fecha}'} {'{hora}'} {'{dias}'}</p>
        </>}
      </Modal>
    </>
  );
}
