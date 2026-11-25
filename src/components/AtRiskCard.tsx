import { useNavigate } from 'react-router-dom';
import { Button, Card, CardHeader } from '@/design-system';
import { useAuth } from '@/lib/auth';
import { useAsync } from '@/lib/hooks';
import { supabase, must } from '@/lib/supabase';
import type { Recordatorio } from '@/pages/staff/Recordatorios';

/** Alumnos activos que dejaron de venir: aviso temprano para evitar bajas. */
export function AtRiskCard({ className }: { className?: string }) {
  const nav = useNavigate();
  const { isFrontOffice, myAreas } = useAuth();
  const { data } = useAsync(async () => {
    const areas: (string | null)[] = isFrontOffice ? [null] : myAreas;
    const lists = await Promise.all(areas.map((a) => must(supabase.rpc('recordatorios', { p_tipo: 'te_extranamos', p_area: a })).catch(() => [])));
    const seen = new Set<string>();
    return (lists.flat() as Recordatorio[]).filter((r) => { const k = `${r.member_id}`; if (seen.has(k)) return false; seen.add(k); return true; })
      .sort((a, b) => (b.dias ?? 0) - (a.dias ?? 0));
  }, [isFrontOffice, myAreas.join()]);
  if (!data || data.length === 0) return null;
  return (
    <Card className={className}>
      <CardHeader title={`Dejaron de venir (${data.length})`} description="Alumnos inscritos que no han registrado entrada recientemente. Un mensaje a tiempo evita bajas."
        actions={<Button size="sm" variant="ghost" onClick={() => nav('/recordatorios?tipo=te_extranamos')}>Ver todos y avisar</Button>} />
      <ul className="divide-y divide-border">
        {data.slice(0, 5).map((r) => (
          <li key={`${r.member_id}-${r.detalle}`}>
            <button type="button" onClick={() => nav(`/familias/${r.family_id}`)} className="flex min-h-control w-full items-center justify-between gap-3 py-2 text-left hover:bg-primary-soft">
              <span><span className="font-semibold">{r.nombre}</span> <span className="text-sm text-fg-muted">{r.familia}</span></span>
              <span className="whitespace-nowrap text-sm font-semibold text-warning-700">{r.dias} días</span>
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
