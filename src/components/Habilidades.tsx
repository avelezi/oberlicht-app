import { useState } from 'react';
import { ArrowDown, ArrowUp, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { Alert, Button, ConfirmFooter, Field, Input, Modal, Select, Switch, Textarea } from '@/design-system';
import { useAuth, deptName } from '@/lib/auth';
import { useAction, useAsync } from '@/lib/hooks';
import { supabase, must } from '@/lib/supabase';
import type { DeptCode, Level } from '@/lib/types';
import type { Skill } from '@/lib/escuela';
import { Loading } from '@/components/common';

type Row = { key: string; id?: string; name: string; description: string; active: boolean; is_example?: boolean };

/** Editor de la lista de habilidades de un nivel: agregar, renombrar, ordenar y quitar. */
export function SkillsEditor({ level, onClose, onDone }: { level: Level | null; onClose: () => void; onDone?: () => void }) {
  return (
    <Modal open={!!level} onClose={onClose} title={level ? `Habilidades de ${level.name}` : ''} size="lg">
      {level && <SkillsEditorBody key={level.id} level={level} onClose={onClose} onDone={onDone} />}
    </Modal>
  );
}

function SkillsEditorBody({ level, onClose, onDone }: { level: Level; onClose: () => void; onDone?: () => void }) {
  const { busy, run } = useAction();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [showOff, setShowOff] = useState(false);
  const { data: skills, error } = useAsync(async () => {
    const sk = (await must(supabase.from('skills').select('*').eq('level_id', level.id).order('sort_order').order('name'))) as Skill[];
    setRows(sk.map((s) => ({ key: s.id, id: s.id, name: s.name, description: s.description ?? '', active: s.active, is_example: s.is_example })));
    return sk;
  }, [level.id]);

  if (error) return <Alert tone="danger" title="No se pudo cargar">{String(error)}</Alert>;
  if (!rows || !skills) return <Loading />;

  const on = rows.filter((r) => r.active);
  const off = rows.filter((r) => !r.active);
  const upd = (key: string, patch: Partial<Row>) => setRows((rs) => rs!.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const move = (key: string, dir: -1 | 1) => setRows((rs) => {
    const act = rs!.filter((r) => r.active);
    const i = act.findIndex((r) => r.key === key); const j = i + dir;
    if (j < 0 || j >= act.length) return rs;
    [act[i], act[j]] = [act[j], act[i]];
    return [...act, ...rs!.filter((r) => !r.active)];
  });
  const remove = (r: Row) => {
    if (!r.id) setRows((rs) => rs!.filter((x) => x.key !== r.key));
    else upd(r.key, { active: false });
  };
  const add = () => setRows((rs) => [...rs!.filter((r) => r.active), { key: 'n' + rs!.length + '-' + Math.random().toString(36).slice(2), name: '', description: '', active: true }, ...rs!.filter((r) => !r.active)]);
  const hasExamples = skills.some((s) => s.is_example && s.active);

  async function save() {
    const ordered = [...rows!.filter((r) => r.active), ...rows!.filter((r) => !r.active)];
    const r = await run(async () => {
      if (ordered.some((x) => x.active && !x.name.trim() && x.id)) throw new Error('Hay una habilidad sin nombre. Escríbelo o quítala.');
      for (const [i, row] of ordered.entries()) {
        const name = row.name.trim();
        if (!name) continue;
        const description = row.description.trim() || null;
        const orig = skills!.find((s) => s.id === row.id);
        if (!row.id) {
          await must(supabase.from('skills').insert({ level_id: level.id, name, description, sort_order: i + 1, active: true }).select());
        } else if (!orig || orig.name !== name || (orig.description ?? null) !== description || orig.active !== row.active || orig.sort_order !== i + 1) {
          const changed = !orig || orig.name !== name || (orig.description ?? null) !== description;
          await must(supabase.from('skills').update({ name, description, active: row.active, sort_order: i + 1, is_example: changed ? false : orig.is_example }).eq('id', row.id).select());
        }
      }
      return true;
    }, 'Habilidades guardadas');
    if (r) { onDone?.(); onClose(); }
  }

  return (
    <>
      <p className="mb-3 text-base text-fg-muted">Escríbelas en el orden en que se aprenden. Usa las flechas para moverlas. Lo que ya se evaluó se conserva aunque quites una habilidad.</p>
      {hasExamples && <div className="mb-3"><Alert tone="warning" title="Lista de ejemplo">Cámbiala por las habilidades reales del club: edita los nombres, agrega o quita las que hagan falta.</Alert></div>}
      {on.length === 0 && <p className="mb-3 text-base text-fg-muted">Este nivel aún no tiene habilidades.</p>}
      <ol className="space-y-3">
        {on.map((r, i) => (
          <li key={r.key} className="rounded-lg border border-border bg-surface p-3">
            <div className="flex items-start gap-2">
              <span className="mt-3 w-6 shrink-0 text-right text-sm font-semibold text-fg-muted ob-num">{i + 1}</span>
              <div className="min-w-0 flex-1 space-y-2">
                <Input value={r.name} onChange={(e) => upd(r.key, { name: e.target.value })} placeholder="Ej. Flota boca arriba 10 segundos" aria-label={`Habilidad ${i + 1}`} />
                <Input value={r.description} onChange={(e) => upd(r.key, { description: e.target.value })} placeholder="Cómo se evalúa (opcional)" aria-label={`Cómo se evalúa la habilidad ${i + 1}`} className="text-sm" />
              </div>
              <div className="flex shrink-0 flex-col gap-1">
                <Button size="sm" variant="ghost" icon={<ArrowUp className="h-4 w-4" />} aria-label="Subir" disabled={i === 0} onClick={() => move(r.key, -1)} />
                <Button size="sm" variant="ghost" icon={<ArrowDown className="h-4 w-4" />} aria-label="Bajar" disabled={i === on.length - 1} onClick={() => move(r.key, 1)} />
                <Button size="sm" variant="ghost" icon={<Trash2 className="h-4 w-4" />} aria-label="Quitar" onClick={() => remove(r)} />
              </div>
            </div>
          </li>
        ))}
      </ol>
      <Button className="mt-3" variant="secondary" icon={<Plus className="h-5 w-5" />} onClick={add} block>Agregar habilidad</Button>
      {off.length > 0 && (
        <div className="mt-5">
          <button type="button" className="text-base font-semibold text-primary" onClick={() => setShowOff((v) => !v)}>
            {showOff ? 'Ocultar' : 'Ver'} habilidades quitadas ({off.length})
          </button>
          {showOff && (
            <ul className="mt-2 space-y-2">
              {off.map((r) => (
                <li key={r.key} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2">
                  <span className="text-fg-muted line-through">{r.name}</span>
                  <Button size="sm" variant="ghost" icon={<RotateCcw className="h-4 w-4" />} onClick={() => setRows((rs) => [...rs!.filter((x) => x.active), { ...r, active: true }, ...rs!.filter((x) => !x.active && x.key !== r.key)])}>Regresar</Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="mt-6"><ConfirmFooter onCancel={onClose} onConfirm={save} loading={busy} confirmLabel="Guardar habilidades" /></div>
    </>
  );
}

/** Alta o edición de un nivel (nombre, edades, orden y descripción). */
export function LevelModal({ level, areas, onClose, onDone }: { level: Partial<Level> | null; areas: DeptCode[]; onClose: () => void; onDone: () => void }) {
  return (
    <Modal open={!!level} onClose={onClose} title={level?.id ? 'Editar nivel' : 'Nuevo nivel'}>
      {level && <LevelForm key={level.id ?? 'nuevo'} initial={level} areas={areas} onClose={onClose} onDone={onDone} />}
    </Modal>
  );
}

function LevelForm({ initial, areas, onClose, onDone }: { initial: Partial<Level>; areas: DeptCode[]; onClose: () => void; onDone: () => void }) {
  const { allDepartments } = useAuth();
  const [edit, setEdit] = useState<Partial<Level>>(initial);
  const { busy, run } = useAction();
  const set = (k: keyof Level, v: unknown) => setEdit((x) => ({ ...x, [k]: v }));
  async function save() {
    const r = await run(async () => {
      const l = edit;
      if (!l.name?.trim()) throw new Error('Escribe el nombre del nivel.');
      if (Number(l.max_age) < Number(l.min_age)) throw new Error('La edad máxima debe ser mayor que la mínima.');
      const payload = { department: l.department, name: l.name.trim(), description: l.description || null, min_age: Number(l.min_age) || 0, max_age: Number(l.max_age) || 99, sort_order: Number(l.sort_order) || 0, active: l.active ?? true };
      return l.id ? must(supabase.from('levels').update(payload).eq('id', l.id).select()) : must(supabase.from('levels').insert(payload).select());
    }, 'Nivel guardado');
    if (r) { onDone(); onClose(); }
  }
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Área">{(p) => <Select {...p} value={edit.department} onChange={(e) => set('department', e.target.value as DeptCode)} disabled={areas.length < 2}>
          {areas.map((d) => <option key={d} value={d}>{deptName(allDepartments, d)}</option>)}</Select>}</Field>
        <Field label="Nombre" required>{(p) => <Input {...p} value={edit.name ?? ''} onChange={(e) => set('name', e.target.value)} placeholder="Ej. Principiante" />}</Field>
        <Field label="Edad mínima (años)" hint="Usa decimales para meses: 0.5 = 6 meses">{(p) => <Input {...p} type="number" step="0.5" min={0} value={edit.min_age ?? ''} onChange={(e) => set('min_age', e.target.value)} />}</Field>
        <Field label="Edad máxima (años)">{(p) => <Input {...p} type="number" step="0.5" min={0} value={edit.max_age ?? ''} onChange={(e) => set('max_age', e.target.value)} />}</Field>
        <Field label="Orden" hint="1 es el más básico">{(p) => <Input {...p} type="number" value={edit.sort_order ?? 0} onChange={(e) => set('sort_order', e.target.value)} />}</Field>
        <div className="flex items-end"><Switch checked={edit.active ?? true} onChange={(v) => set('active', v)} label="Activo" /></div>
        <Field label="Qué aprende en este nivel" className="sm:col-span-2">{(p) => <Textarea {...p} rows={2} value={edit.description ?? ''} onChange={(e) => set('description', e.target.value)} />}</Field>
      </div>
      <div className="mt-6"><ConfirmFooter onCancel={onClose} onConfirm={save} loading={busy} confirmLabel="Guardar" /></div>
    </>
  );
}
