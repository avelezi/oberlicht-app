import { useState } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/design-system';
import { useAsync, useDebounced } from '@/lib/hooks';
import { supabase, must } from '@/lib/supabase';
import { ageLabel, fullName } from '@/lib/format';
import type { Member } from '@/lib/types';

export type PickedMember = Member & { families: { number: number; name: string } | null };

/** Buscador de socio por nombre o número de familia, con resultados grandes para tocar. */
export function MemberPicker({ onPick, autoFocus }: { onPick: (m: PickedMember) => void; autoFocus?: boolean }) {
  const [q, setQ] = useState('');
  const dq = useDebounced(q.trim(), 250);
  const { data } = useAsync(async () => {
    if (dq.length < 2) return [] as PickedMember[];
    let query = supabase.from('members').select('*, families!inner(number, name)').eq('active', true).limit(8);
    query = /^\d+$/.test(dq) ? query.eq('families.number', Number(dq)) : query.or(`first_name.ilike.%${dq}%,last_name.ilike.%${dq}%`);
    return (await must(query)) as PickedMember[];
  }, [dq]);
  return (
    <div>
      <Input autoFocus={autoFocus} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre o número de familia" leading={<Search className="h-5 w-5" />} aria-label="Buscar socio" />
      {data && data.length > 0 && (
        <ul className="mt-2 divide-y divide-border rounded-md border border-border">
          {data.map((m) => (
            <li key={m.id}>
              <button type="button" onClick={() => { onPick(m); setQ(''); }} className="flex min-h-control w-full items-center justify-between px-3 py-2 text-left hover:bg-primary-soft">
                <span className="text-base font-semibold">{fullName(m)}</span>
                <span className="text-sm text-fg-muted">{m.families?.name} #{m.families?.number} · {ageLabel(m.birthdate)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {dq.length >= 2 && data && data.length === 0 && <p className="mt-2 text-sm text-fg-muted">Sin resultados.</p>}
    </div>
  );
}
