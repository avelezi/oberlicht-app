import { useState } from 'react';
import { Megaphone, Plus, Trash2 } from 'lucide-react';
import { Button, Card, ConfirmFooter, EmptyState, Field, Input, Modal, PageHeader, Select, Textarea } from '@/design-system';
import { useAuth, deptName } from '@/lib/auth';
import { useAction, useAsync } from '@/lib/hooks';
import { supabase, must } from '@/lib/supabase';
import { dateLong, todayMx } from '@/lib/format';
import type { Announcement } from '@/lib/types';
import { Area, ErrorBox, Loading } from '@/components/common';

const AUD = { todos: 'Todos (familias y personal)', familias: 'Solo familias', personal: 'Solo personal' } as const;

/** Avisos del club: se muestran en el portal de las familias y en el inicio del personal. */
export default function Avisos() {
  const { isManager, profile, departments, allDepartments } = useAuth();
  const canPublish = isManager || profile?.role === 'coordinador';
  const myDepts = isManager ? allDepartments.filter((d) => d.is_area).map((d) => d.code) : departments;
  const [edit, setEdit] = useState<Partial<Announcement> | null>(null);
  const { busy, run } = useAction();

  const { data, error, loading, reload } = useAsync(async () =>
    (await must(supabase.from('announcements').select('*').or(`ends_on.is.null,ends_on.gte.${todayMx()}`).order('starts_on', { ascending: false }))) as Announcement[], []);

  async function save() {
    const r = await run(async () => {
      const a = edit!;
      if (!a.title?.trim() || !a.body?.trim()) throw new Error('Escribe título y mensaje.');
      const payload = { title: a.title.trim(), body: a.body.trim(), department: a.department || null, audience: a.audience ?? 'todos', starts_on: a.starts_on || todayMx(), ends_on: a.ends_on || null };
      return a.id ? must(supabase.from('announcements').update(payload).eq('id', a.id).select()) : must(supabase.from('announcements').insert(payload).select());
    }, 'Aviso publicado');
    if (r) { setEdit(null); reload(); }
  }
  async function remove(a: Announcement) {
    const r = await run(() => must(supabase.from('announcements').delete().eq('id', a.id).select()), 'Aviso retirado');
    if (r) reload();
  }
  const set = (k: keyof Announcement, v: string) => setEdit((x) => ({ ...x, [k]: v }));

  return (
    <>
      <PageHeader title="Avisos" description="Cierres de alberca, cambios de horario, eventos. Las familias los ven al entrar a su portal."
        actions={canPublish && <Button icon={<Plus className="h-5 w-5" />} onClick={() => setEdit({ audience: 'todos', department: isManager ? null : myDepts[0] })}>Nuevo aviso</Button>} />
      {error ? <ErrorBox error={error} onRetry={reload} /> : loading && !data ? <Loading /> : !data?.length ? (
        <EmptyState icon={<Megaphone className="h-8 w-8" />} title="No hay avisos vigentes" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {data.map((a) => (
            <Card key={a.id}>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                {a.department ? <Area code={a.department} /> : <span className="text-sm font-semibold text-primary">Todo el club</span>}
                <span className="text-sm text-fg-muted">· {AUD[a.audience]} · desde {dateLong(a.starts_on)}{a.ends_on ? ` hasta ${dateLong(a.ends_on)}` : ''}</span>
              </div>
              <h2 className="text-lg font-bold">{a.title}</h2>
              <p className="mt-1 whitespace-pre-line text-base">{a.body}</p>
              {canPublish && (isManager || (a.department && departments.includes(a.department))) && (
                <div className="mt-3 flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setEdit(a)}>Editar</Button>
                  <Button size="sm" variant="ghost" icon={<Trash2 className="h-4 w-4" />} loading={busy} onClick={() => remove(a)}>Retirar</Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
      <Modal open={!!edit} onClose={() => setEdit(null)} size="lg" title={edit?.id ? 'Editar aviso' : 'Nuevo aviso'}
        footer={<ConfirmFooter onCancel={() => setEdit(null)} onConfirm={save} loading={busy} confirmLabel="Publicar" />}>
        {edit && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Título" className="sm:col-span-2">{(p) => <Input {...p} value={edit.title ?? ''} onChange={(e) => set('title', e.target.value)} placeholder="Alberca cerrada el lunes por mantenimiento" />}</Field>
            <Field label="Mensaje" className="sm:col-span-2">{(p) => <Textarea {...p} rows={4} value={edit.body ?? ''} onChange={(e) => set('body', e.target.value)} />}</Field>
            <Field label="Área">{(p) => <Select {...p} value={edit.department ?? ''} onChange={(e) => set('department', e.target.value)}>
              {isManager && <option value="">Todo el club</option>}
              {myDepts.filter((d) => allDepartments.find((x) => x.code === d)?.is_area).map((d) => <option key={d} value={d}>{deptName(allDepartments, d)}</option>)}</Select>}</Field>
            <Field label="¿Quién lo ve?">{(p) => <Select {...p} value={edit.audience} onChange={(e) => set('audience', e.target.value)}>
              {Object.entries(AUD).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>}</Field>
            <Field label="Desde">{(p) => <Input {...p} type="date" value={edit.starts_on ?? todayMx()} onChange={(e) => set('starts_on', e.target.value)} />}</Field>
            <Field label="Hasta (opcional)">{(p) => <Input {...p} type="date" value={edit.ends_on ?? ''} onChange={(e) => set('ends_on', e.target.value)} />}</Field>
          </div>
        )}
      </Modal>
    </>
  );
}
