import { useState } from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '@/design-system';
import { useAsync, useDebounced } from '@/lib/hooks';
import { supabase, must } from '@/lib/supabase';

export interface PickedFamily { id: string; number: number; name: string }

/** Buscador de familia por nombre o número. Muestra la elegida con opción a quitarla. */
export function FamilyPicker({ value, onChange, placeholder = 'Nombre o número de familia' }: { value: PickedFamily | null; onChange: (f: PickedFamily | null) => void; placeholder?: string }) {
  const [q, setQ] = useState('');
  const dq = useDebounced(q.trim(), 250);
  const { data } = useAsync(async () => {
    if (dq.length < 1 || value) return [] as PickedFamily[];
    let query = supabase.from('families').select('id, number, name').limit(8);
    query = /^\d+$/.test(dq) ? query.eq('number', Number(dq)) : query.ilike('name', `%${dq}%`);
    return (await must(query)) as PickedFamily[];
  }, [dq, value]);
  if (value) {
    return (
      <div className="flex min-h-control items-center justify-between rounded-md border border-border px-3">
        <span className="text-base"><span className="font-semibold">{value.name}</span> <span className="text-fg-muted">#{value.number}</span></span>
        <button type="button" aria-label="Quitar familia" onClick={() => onChange(null)}><X className="h-4 w-4" /></button>
      </div>
    );
  }
  return (
    <div>
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} leading={<Search className="h-5 w-5" />} aria-label="Buscar familia" />
      {data && data.length > 0 && (
        <ul className="mt-2 divide-y divide-border rounded-md border border-border">
          {data.map((f) => (
            <li key={f.id}>
              <button type="button" onClick={() => { onChange(f); setQ(''); }} className="flex min-h-control w-full items-center justify-between px-3 py-2 text-left hover:bg-primary-soft">
                <span className="text-base font-semibold">{f.name}</span><span className="text-sm text-fg-muted">#{f.number}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
