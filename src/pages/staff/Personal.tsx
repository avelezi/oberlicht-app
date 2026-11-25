import { useState } from 'react';
import { UserPlus } from 'lucide-react';
import { Alert, Avatar, Button, Checkbox, ConfirmFooter, Field, Input, Modal, PageHeader, Select, StatusBadge, Switch, Table } from '@/design-system';
import { useAuth, ROLE_NAME, deptName } from '@/lib/auth';
import { useAction, useAsync } from '@/lib/hooks';
import { supabase, must } from '@/lib/supabase';
import type { AppRole, DeptCode, Profile } from '@/lib/types';
import { ErrorBox, Loading } from '@/components/common';

type Row = Profile & { profile_departments: { department: DeptCode }[] };
const STAFF_ROLES: AppRole[] = ['direccion', 'administracion', 'recepcion', 'coordinador', 'coach', 'ventas'];
const ROLE_HELP: Record<string, string> = {
  direccion: 'Ve y configura todo, incluido dinero y permisos.',
  administracion: 'Cobranza, facturación, precios y reportes.',
  recepcion: 'Entradas, alta de familias, cobros en mostrador y reservas.',
  coordinador: 'Niveles, grupos y horarios de su departamento; ve a sus alumnos, no el dinero.',
  coach: 'Su agenda, pasar lista, notas de avance y pase de nivel de sus alumnos.',
  ventas: 'Punto de venta de barra y tienda.',
};

/** Personal y permisos: rol y departamentos de cada persona del equipo. */
export default function Personal() {
  const { profile: me, allDepartments } = useAuth();
  const [edit, setEdit] = useState<Row | null>(null);
  const [adding, setAdding] = useState(false);
  const { data, error, loading, reload } = useAsync(async () =>
    (await must(supabase.from('profiles').select('*, profile_departments(department)').neq('role', 'titular').order('full_name'))) as Row[], []);

  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (loading && !data) return <Loading />;

  return (
    <>
      <PageHeader title="Personal y permisos" description="Cada persona ve solo las ventanas de su trabajo. Los permisos se aplican también en la base de datos."
        actions={<Button icon={<UserPlus className="h-5 w-5" />} onClick={() => setAdding(true)}>Dar acceso a alguien</Button>} />
      <Table rows={data ?? []} rowKey={(r) => r.id} onRowClick={(r) => setEdit(r)} columns={[
        { key: 'n', header: 'Persona', cell: (r) => <div className="flex items-center gap-3"><Avatar name={r.full_name || r.email || '?'} size={36} /><div><p className="font-semibold">{r.full_name || 'Sin nombre'}</p><p className="text-sm text-fg-muted">{r.email}</p></div></div> },
        { key: 'r', header: 'Rol', cell: (r) => ROLE_NAME[r.role] },
        { key: 'd', header: 'Departamentos', hideOnMobile: true, cell: (r) => r.profile_departments.map((d) => deptName(allDepartments, d.department)).join(', ') || '—' },
        { key: 's', header: 'Acceso', cell: (r) => <StatusBadge status={r.active ? 'activo' : 'inactivo'} label={r.active ? 'Activo' : 'Desactivado'} /> },
      ]} />
      <EditModal row={edit} onClose={() => setEdit(null)} onDone={reload} canGrantTop={me?.role === 'direccion'} isSelf={edit?.id === me?.id} />
      <AddModal open={adding} onClose={() => setAdding(false)} onFound={(r) => { setAdding(false); setEdit(r); }} />
    </>
  );
}

function AddModal({ open, onClose, onFound }: { open: boolean; onClose: () => void; onFound: (r: Row) => void }) {
  const [email, setEmail] = useState('');
  const { busy, run } = useAction();
  async function find() {
    const r = await run(async () => {
      const row = (await must(supabase.from('profiles').select('*, profile_departments(department)').ilike('email', email.trim()).maybeSingle())) as Row | null;
      if (!row) throw new Error('No hay ninguna cuenta con ese correo. Pide a la persona que primero cree su cuenta en la página de entrada (opción «Crear cuenta»).');
      return row;
    });
    if (r) { setEmail(''); onFound(r); }
  }
  return (
    <Modal open={open} onClose={onClose} title="Dar acceso a una persona del equipo"
      footer={<ConfirmFooter onCancel={onClose} onConfirm={find} loading={busy} confirmLabel="Buscar cuenta" />}>
      <div className="space-y-4">
        <Alert tone="info" title="Cómo funciona">
          1) La persona entra a la plataforma y crea su cuenta con su correo. 2) Aquí escribes ese correo y le asignas su rol y departamentos. Al volver a entrar verá sus ventanas.
        </Alert>
        <Field label="Correo de la persona">{(p) => <Input {...p} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nombre@oberlicht.com.mx" />}</Field>
      </div>
    </Modal>
  );
}

function EditModal({ row, onClose, onDone, canGrantTop, isSelf }: { row: Row | null; onClose: () => void; onDone: () => void; canGrantTop: boolean; isSelf: boolean }) {
  const { allDepartments } = useAuth();
  const [role, setRole] = useState<AppRole>('coach');
  const [depts, setDepts] = useState<DeptCode[]>([]);
  const [name, setName] = useState('');
  const [active, setActive] = useState(true);
  const [last, setLast] = useState<string | null>(null);
  const { busy, run } = useAction();
  if (row && last !== row.id) {
    setLast(row.id); setRole(row.role === 'titular' ? 'recepcion' : row.role); setDepts(row.profile_departments.map((d) => d.department));
    setName(row.full_name ?? ''); setActive(row.active);
  }
  if (!row && last) setLast(null);
  const needsDept = role === 'coordinador' || role === 'coach' || role === 'ventas';
  const roles = STAFF_ROLES.filter((r) => canGrantTop || (r !== 'direccion' && r !== 'administracion') || r === row?.role);

  async function save() {
    const r = await run(async () => {
      if (needsDept && depts.length === 0) throw new Error('Elige al menos un departamento.');
      if (isSelf && (!active || role !== row!.role)) throw new Error('No puedes quitarte tu propio acceso o cambiar tu rol.');
      await must(supabase.from('profiles').update({ role, active, full_name: name.trim() || row!.full_name }).eq('id', row!.id).select());
      await must(supabase.from('profile_departments').delete().eq('profile_id', row!.id).select());
      if (depts.length) await must(supabase.from('profile_departments').insert(depts.map((d) => ({ profile_id: row!.id, department: d }))).select());
      return true;
    }, 'Permisos guardados');
    if (r) { onDone(); onClose(); }
  }

  return (
    <Modal open={!!row} onClose={onClose} size="lg" title={`Permisos de ${row?.full_name || row?.email || ''}`}
      footer={<ConfirmFooter onCancel={onClose} onConfirm={save} loading={busy} confirmLabel="Guardar permisos" />}>
      <div className="space-y-5">
        <Field label="Nombre completo">{(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
        <Field label="Rol" hint={ROLE_HELP[role]}>{(p) => <Select {...p} value={role} onChange={(e) => setRole(e.target.value as AppRole)}>
          {roles.map((r) => <option key={r} value={r}>{ROLE_NAME[r]}</option>)}</Select>}</Field>
        {(needsDept || role === 'recepcion') && (
          <fieldset>
            <legend className="mb-2 text-base font-medium">Departamentos {needsDept && <span className="text-danger-600">*</span>}</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {allDepartments.filter((d) => d.is_area).map((d) => (
                <Checkbox key={d.code} label={d.name} checked={depts.includes(d.code)}
                  onChange={(e) => setDepts((xs) => e.target.checked ? [...xs, d.code] : xs.filter((x) => x !== d.code))} />
              ))}
            </div>
          </fieldset>
        )}
        <Switch checked={active} onChange={setActive} label="Acceso activo" disabled={isSelf} />
      </div>
    </Modal>
  );
}
