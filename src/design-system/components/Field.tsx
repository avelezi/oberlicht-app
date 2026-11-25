import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from './cn';

/** Envuelve un control con etiqueta visible, ayuda y error. La etiqueta es obligatoria: nunca usar solo placeholder. */
export interface FieldProps {
  label: string;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  children: (props: { id: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }) => ReactNode;
  className?: string;
}
export function Field({ label, hint, error, required, children, className }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-err` : undefined;
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-sm font-semibold text-fg">
        {label} {required && <span className="text-danger-600" aria-hidden>*</span>}
        {!required && <span className="font-normal text-fg-subtle"> (opcional)</span>}
      </label>
      {children({ id, 'aria-describedby': [hintId, errId].filter(Boolean).join(' ') || undefined, 'aria-invalid': error ? true : undefined })}
      {hint && !error && <p id={hintId} className="text-sm text-fg-muted">{hint}</p>}
      {error && <p id={errId} className="text-sm font-medium text-danger-600" role="alert">⚠ {error}</p>}
    </div>
  );
}

const control =
  'w-full h-control rounded-md border border-border-strong bg-surface px-3.5 text-base text-fg placeholder:text-fg-subtle ' +
  'transition-shadow duration-150 focus:outline-none focus:border-primary focus:shadow-focus ' +
  'aria-[invalid=true]:border-danger-600 disabled:bg-surface-sunken disabled:text-fg-subtle';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { leading?: ReactNode }>(
  function Input({ className, leading, ...rest }, ref) {
    if (!leading) return <input ref={ref} className={cn(control, className)} {...rest} />;
    return (
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle">{leading}</span>
        <input ref={ref} className={cn(control, 'pl-10', className)} {...rest} />
      </div>
    );
  },
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...rest }, ref) {
  return (
    <div className="relative">
      <select ref={ref} className={cn(control, 'appearance-none pr-10 cursor-pointer', className)} {...rest}>{children}</select>
      <svg className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-fg-muted" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
        <path d="M5.3 7.3a1 1 0 0 1 1.4 0L10 10.6l3.3-3.3a1 1 0 1 1 1.4 1.4l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 0 1 0-1.4z" />
      </svg>
    </div>
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cn(control, 'h-auto min-h-[96px] py-2.5', className)} {...rest} />;
});

export function Checkbox({ label, description, className, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: string; description?: string }) {
  return (
    <label className={cn('flex items-start gap-3 min-h-control py-2 cursor-pointer', className)}>
      <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 rounded border-border-strong accent-[var(--ob-primary)]" {...rest} />
      <span>
        <span className="block text-base text-fg">{label}</span>
        {description && <span className="block text-sm text-fg-muted">{description}</span>}
      </span>
    </label>
  );
}

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)}
      className="inline-flex items-center gap-3 min-h-control text-base text-fg disabled:opacity-50"
    >
      <span className={cn('relative h-7 w-12 rounded-full transition-colors duration-150', checked ? 'bg-primary' : 'bg-neutral-300')}>
        <span className={cn('absolute top-0.5 h-6 w-6 rounded-full bg-white shadow-sm transition-transform duration-150', checked ? 'translate-x-[22px]' : 'translate-x-0.5')} />
      </span>
      <span>{label}</span>
      <span className="sr-only">{checked ? 'activado' : 'desactivado'}</span>
    </button>
  );
}
