import { createContext, useCallback, useContext, useEffect, useRef, useState, type DependencyList, type ReactNode } from 'react';
import { Toast } from '@/design-system';
import { friendlyError } from './supabase';

/** Carga datos asíncronos con estado de carga, error y recarga. */
export function useAsync<T>(fn: () => Promise<T>, deps: DependencyList) {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);
  const run = useCallback(async () => {
    const my = ++seq.current;
    setLoading(true);
    try {
      const r = await fn();
      if (my === seq.current) { setData(r); setError(null); }
    } catch (e) {
      if (my === seq.current) setError(friendlyError(e));
    } finally {
      if (my === seq.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { run(); }, [run]);
  return { data, error, loading, reload: run, setData };
}

type ToastMsg = { id: number; tone: 'success' | 'danger' | 'info' | 'warning'; message: string };
const ToastCtx = createContext<(message: string, tone?: ToastMsg['tone']) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastMsg[]>([]);
  const push = useCallback((message: string, tone: ToastMsg['tone'] = 'success') => {
    const id = Date.now() + Math.random();
    setItems((xs) => [...xs, { id, tone, message }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), tone === 'danger' ? 7000 : 4000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4">
        {items.map((t) => (
          <Toast key={t.id} tone={t.tone} message={t.message} onClose={() => setItems((xs) => xs.filter((x) => x.id !== t.id))} />
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);

/** Envuelve una acción: muestra carga, éxito o error en lenguaje claro. */
export function useAction() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const run = useCallback(async <T,>(fn: () => Promise<T>, okMsg?: string): Promise<T | undefined> => {
    setBusy(true);
    try {
      const r = await fn();
      if (okMsg) toast(okMsg, 'success');
      return r;
    } catch (e) {
      toast(friendlyError(e), 'danger');
      return undefined;
    } finally {
      setBusy(false);
    }
  }, [toast]);
  return { busy, run };
}

export function useDebounced<T>(value: T, ms = 250) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}
