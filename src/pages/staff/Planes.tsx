import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Alert, Button, ConfirmFooter, Field, Input, Modal, PageHeader, Select, StatusBadge, Switch, Table, Textarea } from '@/design-system';
import { useAuth, deptName } from '@/lib/auth';
import { useAction } from '@/lib/hooks';
import { supabase, must } from '@/lib/supabase';
import { useCatalog } from '@/lib/catalog';
import { money } from '@/lib/format';
import type { DeptCode, Plan } from '@/lib/types';
import { Area, ErrorBox, Loading } from '@/components/common';

const KIND = { curso: 'Curso por nivel (escuela)', membresia: 'Membresía (acceso)', paquete: 'Paquete de sesiones' } as const;

/** Planes y precios. Los cambios de precio quedan en la bitácora y aplican a inscripciones nuevas. */
export default function Planes() {
  const { allDepartments } = useAuth();
  const { data: cat, error, reload } = useCatalog();
  const [edit, setEdit] = useState<Partial<Plan> | null>(null);
  const { busy, run } = useAction();
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!cat) return <Loading />;

  async function save() {
    const r = await run(async () => {
      const p = edit!;
      if (!p.name?.trim()) throw new Error('Escribe el nombre del plan.');
      const payload = {
        department: p.department, name: p.name.trim(), description: p.description || null, kind: p.kind,
        price_monthly: Number(p.price_monthly) || 0, enrollment_fee: Number(p.enrollment_fee) || 0,
        sessions_per_month: p.sessions_per_month ? Number(p.sessions_per_month) : null,
        classes_per_week: p.classes_per_week ? Number(p.classes_per_week) : null, active: p.active ?? true,
      };
      return p.id ? must(supabase.from('plans').update(payload).eq('id', p.id).select()) : must(supabase.from('plans').insert(payload).select());
    }, 'Plan guardado');
    if (r) { setEdit(null); reload(); }
  }
  const set = (k: keyof Plan, v: unknown) => setEdit((x) => ({ ...x, [k]: v }));

  return (
    <>
      <PageHeader title="Planes y precios" description="Lo que el club vende: cursos por nivel, membresías y paquetes de sesiones."
        actions={<Button icon={<Plus className="h-5 w-5" />} onClick={() => setEdit({ department: 'natacion', kind: 'curso', active: true, price_monthly: 0, enrollment_fee: 0 })}>Nuevo plan</Button>} />
      <div className="mb-4"><Alert tone="warning" title="Precios de ejemplo">Son supuestos para arrancar. Cámbialos por los precios reales del club antes del piloto.</Alert></div>
      <Table rows={cat.plans} rowKey={(p) => p.id} onRowClick={(p) => setEdit(p)} columns={[
        { key: 'a', header: 'Área', cell: (p) => <Area code={p.department} /> },
        { key: 'n', header: 'Plan', cell: (p) => <div><p className="font-semibold">{p.name}</p><p className="text-sm text-fg-muted">{KIND[p.kind]}{p.sessions_per_month ? ` · ${p.sessions_per_month} sesiones/mes` : ''}{p.classes_per_week ? ` · ${p.classes_per_week} clases/semana` : ''}</p></div> },
        { key: 'm', header: 'Mensualidad', align: 'right', cell: (p) => <span className="font-semibold ob-num">{money(p.price_monthly)}</span> },
        { key: 'i', header: 'Inscripción', align: 'right', hideOnMobile: true, cell: (p) => money(p.enrollment_fee) },
        { key: 's', header: 'Estado', cell: (p) => <StatusBadge status={p.active ? 'activo' : 'inactivo'} label={p.active ? 'A la venta' : 'Pausado'} /> },
      ]} />
      <Modal open={!!edit} onClose={() => setEdit(null)} size="lg" title={edit?.id ? 'Editar plan' : 'Nuevo plan'}
        footer={<ConfirmFooter onCancel={() => setEdit(null)} onConfirm={save} loading={busy} confirmLabel="Guardar" />}>
        {edit && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Área">{(p) => <Select {...p} value={edit.department} onChange={(e) => set('department', e.target.value as DeptCode)}>
              {allDepartments.filter((d) => d.is_area).map((d) => <option key={d.code} value={d.code}>{deptName(allDepartments, d.code)}</option>)}</Select>}</Field>
            <Field label="Tipo">{(p) => <Select {...p} value={edit.kind} onChange={(e) => set('kind', e.target.value)}>
              {Object.entries(KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>}</Field>
            <Field label="Nombre" className="sm:col-span-2">{(p) => <Input {...p} value={edit.name ?? ''} onChange={(e) => set('name', e.target.value)} placeholder="Natación infantil 2 clases por semana" />}</Field>
            <Field label="Mensualidad (MXN, IVA incluido)">{(p) => <Input {...p} type="number" min={0} value={edit.price_monthly ?? 0} onChange={(e) => set('price_monthly', e.target.value)} />}</Field>
            <Field label="Inscripción (MXN)">{(p) => <Input {...p} type="number" min={0} value={edit.enrollment_fee ?? 0} onChange={(e) => set('enrollment_fee', e.target.value)} />}</Field>
            <Field label="Clases por semana" hint="Para cursos">{(p) => <Input {...p} type="number" min={0} value={edit.classes_per_week ?? ''} onChange={(e) => set('classes_per_week', e.target.value)} />}</Field>
            <Field label="Sesiones al mes" hint="Para paquetes; vacío = ilimitado">{(p) => <Input {...p} type="number" min={0} value={edit.sessions_per_month ?? ''} onChange={(e) => set('sessions_per_month', e.target.value)} />}</Field>
            <Field label="Descripción" className="sm:col-span-2">{(p) => <Textarea {...p} rows={2} value={edit.description ?? ''} onChange={(e) => set('description', e.target.value)} />}</Field>
            <div className="sm:col-span-2"><Switch checked={edit.active ?? true} onChange={(v) => set('active', v)} label="A la venta" /></div>
            {edit.id && <p className="text-sm text-fg-muted sm:col-span-2">Cambiar el precio no modifica a quienes ya están inscritos; aplica a inscripciones nuevas. El cambio queda registrado en la bitácora.</p>}
          </div>
        )}
      </Modal>
    </>
  );
}
