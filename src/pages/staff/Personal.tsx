import { useState } from 'react';
import { UserPlus } from 'lucide-react';
import { Alert, Avatar, Button, Checkbox, ConfirmFooter, Field, Input, Modal, PageHeader, Select, StatusBadge, Switch, Table } from '@/design-system';
import { useAuth, ROLE_NAME, deptName } from '@/lib/auth';
import { useAction, useAsync } from '@/lib/hooks';
import { supabase, must } from '@/lib/supabase';
import type { AppRole, DeptCode, Profile } from '@/lib/types';
import { ErrorBox, Loading } from '@/components/common';

type Row = Profile & { profile_departments: { department: DeptCode }[] };
const STAFF_ROLES: AppRole[] = ['direccion', 'administracion', 'recepcion', 'coordinador', 'coach', 'ventas', 'mantenimiento'];
const ROLE_HELP: Record<string, string> = {
  direccion: 'Ve y configura todo, incluido dinero y permisos.',
  administracion: 'Cobranza, facturación, precios y reportes.',
  recepcion: 'Entradas, alta de familias, cobros en mostrador y reservas.',
  coordinador: 'Niveles, grupos y horarios de su departamento; ve a sus alumnos, no el dinero.',
  coach: 'Su agenda, pasar lista, notas de avance y pase de nivel de sus alumnos.',
  ventas: 'Punto de venta de barra y tienda.',
  mantenimiento: 'Mantenimiento: bitácora de alberca, órdenes de trabajo, preventivo, materiales, compras y proveedores.',
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
      <AddModal open={adding} canGrantTop={me?.role === 'direccion'} onClose={() => setAdding(false)} onFound={(r) => { setAdding(false); setEdit(r); }} />
    </>
  );
}

interface Invite { email: string; role: AppRole; departments: DeptCode[]; created_at: string }

function AddModal({ open, onClose, onFound, canGrantTop }: { open: boolean; onClose: () => void; onFound: (r: Row) => void; canGrantTop: boolean }) {
  const { allDepartments } = useAuth();
  const [email, setEmail] = useState('');
  const [invite, setInvite] = useState<{ role: AppRole; depts: DeptCode[] } | null>(null);
  const { busy, run } = useAction();
  const { data: invites, reload } = useAsync(async () => (open ? (await must(supabase.from('staff_invites').select('*').order('created_at', { ascending: false }))) as Invite[] : []), [open]);
  const roles = STAFF_ROLES.filter((r) => canGrantTop || (r !== 'direccion' && r !== 'administracion'));
  const close = () => { setEmail(''); setInvite(null); onClose(); };
  async function find() {
    const clean = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) return run(async () => { throw new Error('Escribe un correo válido.'); });
    if (invite) {
      const needsDept = ['coordinador', 'coach', 'ventas'].includes(invite.role);
      const ok = await run(async () => {
        if (needsDept && invite.depts.length === 0) throw new Error('Elige al menos un departamento.');
        return must(supabase.from('staff_invites').upsert({ email: clean, role: invite.role, departments: invite.depts }).select());
      }, 'Invitación guardada. Cuando cree su cuenta con ese correo entrará con este rol.');
      if (ok) { setEmail(''); setInvite(null); reload(); }
      return;
    }
    const r = await run(async () => (await must(supabase.from('profiles').select('*, profile_departments(department)').ilike('email', clean).maybeSingle())) as Row | null);
    if (r) { setEmail(''); onFound(r); } else if (r === null) setInvite({ role: 'coach', depts: [] });
  }
  return (
    <Modal open={open} onClose={close} size="lg" title="Dar acceso a una persona del equipo"
      footer={<ConfirmFooter onCancel={close} onConfirm={find} loading={busy} confirmLabel={invite ? 'Guardar invitación' : 'Buscar cuenta'} />}>
      <div className="space-y-4">
        <Field label="Correo de la persona">{(p) => <Input {...p} type="email" value={email} onChange={(e) => { setEmail(e.target.value); setInvite(null); }} placeholder="nombre@oberlicht.com.mx" />}</Field>
        {!invite ? (
          <Alert tone="info" title="Cómo funciona">Si la persona ya tiene cuenta, le asignas su rol al momento. Si aún no, dejas una invitación: cuando se registre con ese correo entrará directo con su rol.</Alert>
        ) : (
          <>
            <Alert tone="warning" title="Aún no tiene cuenta">Deja la invitación con su rol. Pídele que entre a la plataforma y elija «Crear cuenta» con este mismo correo.</Alert>
            <Field label="Rol" hint={ROLE_HELP[invite.role]}>{(p) => <Select {...p} value={invite.role} onChange={(e) => setInvite({ ...invite, role: e.target.value as AppRole })}>{roles.map((r) => <option key={r} value={r}>{ROLE_NAME[r]}</option>)}</Select>}</Field>
            {['coordinador', 'coach', 'ventas', 'recepcion'].includes(invite.role) && (
              <div className="grid gap-2 sm:grid-cols-2">
                {allDepartments.filter((d) => d.is_area).map((d) => <Checkbox key={d.code} label={d.name} checked={invite.depts.includes(d.code)}
                  onChange={(e) => setInvite({ ...invite, depts: e.target.checked ? [...invite.depts, d.code] : invite.depts.filter((x) => x !== d.code) })} />)}
              </div>
            )}
          </>
        )}
        {invites && invites.length > 0 && (
          <div>
            <p className="mb-1 text-sm font-semibold">Invitaciones pendientes</p>
            <ul className="divide-y divide-border rounded-md border border-border">
              {invites.map((i) => (
                <li key={i.email} className="flex items-center justify-between gap-2 px-3 py-2 text-base">
                  <span><span className="font-semibold">{i.email}</span> <span className="text-sm text-fg-muted">· {ROLE_NAME[i.role]}{i.departments.length ? ` · ${i.departments.map((d) => deptName(allDepartments, d)).join(', ')}` : ''}</span></span>
                  <Button size="sm" variant="ghost" onClick={async () => { const ok = await run(() => must(supabase.from('staff_invites').delete().eq('email', i.email).select()), 'Invitación eliminada'); if (ok) reload(); }}>Quitar</Button>
                </li>
              ))}
            </ul>
          </div>
        )}
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
