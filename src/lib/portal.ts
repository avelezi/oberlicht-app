import { useAuth } from './auth';
import { useAsync } from './hooks';
import { supabase, must } from './supabase';
import type { Family, Member } from './types';

/** Familia del titular con sesión y sus miembros (portal de familias). */
export function useMyFamily() {
  const { profile } = useAuth();
  return useAsync(async () => {
    const fam = (await must(supabase.from('families').select('*').eq('titular_profile_id', profile!.id).maybeSingle())) as Family | null;
    if (!fam) return { fam: null, members: [] as Member[] };
    const members = (await must(supabase.from('members').select('*').eq('family_id', fam.id).eq('active', true).order('is_titular', { ascending: false }).order('birthdate'))) as Member[];
    return { fam, members };
  }, [profile?.id]);
}
