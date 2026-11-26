import { useEffect, useRef, type ReactNode } from 'react';
import { cn } from './cn';
import { Button } from './Button';

type AlertTone = 'info' | 'success' | 'warning' | 'danger';
const alertTone: Record<AlertTone, { box: string; sym: string }> = {
  info: { box: 'bg-info-50 border-info-100 text-info-700', sym: 'ℹ' },
  success: { box: 'bg-success-50 border-success-100 text-success-700', sym: '✓' },
  warning: { box: 'bg-warning-50 border-warning-100 text-warning-700', sym: '!' },
  danger: { box: 'bg-danger-50 border-danger-100 text-danger-700', sym: '✕' },
};

/** Mensaje en línea. Di qué pasó y qué hacer después, en lenguaje simple. */
export function Alert({ tone = 'info', title, children, action }: { tone?: AlertTone; title: string; children?: ReactNode; action?: ReactNode }) {
  const t = alertTone[tone];
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={cn('flex gap-3 rounded-lg border p-3.5 sm:p-4', t.box)}>
      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white/70 font-bold" aria-hidden>{t.sym}</span>
      <div className="flex-1">
        <p className="font-semibold">{title}</p>
        {children && <div className="mt-1 text-sm text-fg">{children}</div>}
        {action && <div className="mt-3">{action}</div>}
      </div>
    </div>
  );
}

/** Estado vacío: siempre con instrucción y una acción clara. */
export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      {icon && <div className="grid h-14 w-14 place-items-center rounded-full bg-primary-soft text-primary">{icon}</div>}
      <h3 className="text-lg font-bold">{title}</h3>
      {description && <p className="max-w-md text-base text-fg-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/** Notificación temporal (abajo, centrada en móvil). El control de visibilidad lo lleva la app. */
export function Toast({ tone = 'success', message, onClose }: { tone?: AlertTone; message: string; onClose?: () => void }) {
  const t = alertTone[tone];
  return (
    <div role="status" aria-live="polite" className="pointer-events-auto flex min-h-control items-center gap-3 rounded-lg bg-neutral-900 px-4 py-3 text-white shadow-lg">
      <span className={cn('grid h-6 w-6 place-items-center rounded-full text-sm font-bold', t.box)} aria-hidden>{t.sym}</span>
      <span className="flex-1 text-base">{message}</span>
      {onClose && <button onClick={onClose} className="min-h-control min-w-control text-neutral-300 hover:text-white" aria-label="Cerrar">✕</button>}
    </div>
  );
}

/** Diálogo modal. Para confirmar acciones destructivas, usa `tone="danger"` y nombra la acción en el botón ("Cancelar membresía"). */
export function Modal({ open, onClose, title, children, footer, size = 'md' }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg' }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  const w = size === 'sm' ? 'max-w-md' : size === 'lg' ? 'max-w-3xl' : 'max-w-xl';
  return (
    <dialog ref={ref} onClose={onClose} onCancel={onClose}
      className={cn('ob-modal w-[calc(100%-32px)] rounded-xl border border-border bg-surface p-0 text-fg shadow-lg backdrop:bg-neutral-900/50', w)}>
      <div className="ob-modal-inner flex max-h-[inherit] flex-col">
        <div className="sticky top-0 z-10 shrink-0 border-b border-border bg-surface px-4 pb-3 pt-2 sm:px-6 sm:py-4">
          <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-border-strong sm:hidden" aria-hidden />
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold sm:text-xl">{title}</h2>
            <button onClick={onClose} className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-sunken text-fg-muted hover:bg-surface-sunken sm:h-control sm:w-control sm:rounded-md sm:bg-transparent" aria-label="Cerrar">✕</button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">{children}</div>
        {footer && <div className="ob-safe-bottom shrink-0 border-t border-border bg-surface px-4 pt-3 sm:px-6 sm:py-4"><div className="flex flex-col-reverse gap-2 pb-3 sm:flex-row sm:justify-end sm:gap-3 sm:pb-0 [&>*]:w-full sm:[&>*]:w-auto">{footer}</div></div>}
      </div>
    </dialog>
  );
}

export function ConfirmFooter({ onCancel, onConfirm, confirmLabel, danger, loading }: { onCancel: () => void; onConfirm: () => void; confirmLabel: string; danger?: boolean; loading?: boolean }) {
  return (
    <>
      <Button variant="secondary" onClick={onCancel}>Regresar</Button>
      <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>{confirmLabel}</Button>
    </>
  );
}
