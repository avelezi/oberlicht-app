import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isConfigured = Boolean(url && key);

export const supabase: SupabaseClient = createClient(url || 'http://localhost', key || 'sin-configurar', {
  auth: { persistSession: true, autoRefreshToken: true },
});

/** Convierte errores de Supabase/Postgres en un mensaje en español para el personal. */
export function friendlyError(e: unknown): string {
  const msg = (e as { message?: string })?.message ?? String(e);
  if (/Invalid login credentials/i.test(msg)) return 'Correo o contraseña incorrectos.';
  if (/Email not confirmed/i.test(msg)) return 'Falta confirmar el correo. Revisa tu bandeja de entrada.';
  if (/User already registered/i.test(msg)) return 'Ya existe una cuenta con ese correo. Inicia sesión o recupera tu contraseña.';
  if (/row-level security|permission denied/i.test(msg)) return 'No tienes permiso para hacer esto. Pide ayuda a Dirección.';
  if (/duplicate key/i.test(msg)) return 'Ese registro ya existe.';
  if (/Failed to fetch|NetworkError/i.test(msg)) return 'Sin conexión. Revisa el internet e inténtalo de nuevo.';
  return msg;
}

/** Ejecuta una consulta y lanza el error si lo hay (para usar con useAsync). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function must<T = any>(p: PromiseLike<{ data: unknown; error: unknown }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw error;
  return data as T;
}
