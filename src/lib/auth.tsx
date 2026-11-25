import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, isConfigured } from './supabase';
import type { AppRole, DeptCode, Department, Profile } from './types';

interface AuthState {
  loading: boolean;
  session: Session | null;
  profile: Profile | null;
  departments: DeptCode[];
  allDepartments: Department[];
  isStaff: boolean;
  isManager: boolean;
  isFrontOffice: boolean;
  /** Departamentos de área (natación, ballet…) que el usuario puede operar. */
  myAreas: DeptCode[];
  hasDept: (d: DeptCode) => boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [departments, setDepartments] = useState<DeptCode[]>([]);
  const [allDepartments, setAll] = useState<Department[]>([]);

  const load = useCallback(async (s: Session | null) => {
    setSession(s);
    if (!s) { setProfile(null); setDepartments([]); setLoading(false); return; }
    const [p, d, all] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', s.user.id).maybeSingle(),
      supabase.from('profile_departments').select('department').eq('profile_id', s.user.id),
      supabase.from('departments').select('*').order('sort_order'),
    ]);
    setProfile((p.data as Profile) ?? null);
    setDepartments(((d.data ?? []) as { department: DeptCode }[]).map((x) => x.department));
    setAll((all.data ?? []) as Department[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!isConfigured) { setLoading(false); return; }
    supabase.auth.getSession().then(({ data }) => load(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => { load(s); });
    return () => sub.subscription.unsubscribe();
  }, [load]);

  const value = useMemo<AuthState>(() => {
    const role: AppRole | undefined = profile?.role;
    const isManager = role === 'direccion' || role === 'administracion';
    const isFrontOffice = isManager || role === 'recepcion';
    const isStaff = !!role && role !== 'titular';
    const areaCodes = allDepartments.filter((d) => d.is_area).map((d) => d.code);
    const myAreas = isFrontOffice ? areaCodes : departments.filter((d) => areaCodes.includes(d));
    return {
      loading, session, profile, departments, allDepartments, isStaff, isManager, isFrontOffice, myAreas,
      hasDept: (d) => isManager || departments.includes(d),
      refresh: () => load(session),
      signOut: async () => { await supabase.auth.signOut(); },
    };
  }, [loading, session, profile, departments, allDepartments, load]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth fuera de AuthProvider');
  return v;
}

export const ROLE_NAME: Record<AppRole, string> = {
  direccion: 'Dirección',
  administracion: 'Administración y finanzas',
  recepcion: 'Recepción',
  coordinador: 'Coordinación',
  coach: 'Instructor / coach',
  ventas: 'Barra y tienda',
  mantenimiento: 'Mantenimiento',
  titular: 'Socio / familia',
};

export function deptName(all: Department[], code: string | null | undefined) {
  if (!code) return 'Todo el club';
  return all.find((d) => d.code === code)?.name ?? code;
}
