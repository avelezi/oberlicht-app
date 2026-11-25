import { supabase, must } from './supabase';
import { useAsync } from './hooks';
import type { Cycle, GroupOccupancy, Level, Plan, Profile } from './types';

/** Catálogo del club (niveles, planes, ciclos, grupos con cupo, personal). Se usa en casi todas las pantallas. */
export function useCatalog() {
  return useAsync(async () => {
    const [levels, plans, cycles, groups, staff] = await Promise.all([
      must(supabase.from('levels').select('*').order('department').order('sort_order')),
      must(supabase.from('plans').select('*').order('department').order('price_monthly')),
      must(supabase.from('cycles').select('*').order('starts_on', { ascending: false })),
      must(supabase.from('group_occupancy').select('*').order('start_time')),
      must(supabase.from('profiles').select('id, full_name, role, email, phone, active, avatar_url, created_at').neq('role', 'titular').order('full_name')),
    ]);
    return {
      levels: levels as Level[],
      plans: plans as Plan[],
      cycles: cycles as Cycle[],
      groups: groups as GroupOccupancy[],
      staff: staff as Profile[],
    };
  }, []);
}
export type Catalog = NonNullable<ReturnType<typeof useCatalog>['data']>;

export const staffName = (cat: Catalog | undefined, id: string | null | undefined) =>
  (id && cat?.staff.find((s) => s.id === id)?.full_name) || 'Sin asignar';
