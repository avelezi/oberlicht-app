import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from './cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'accent';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'xl';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Ícono a la izquierda. Acompaña siempre al texto; no lo reemplaza. */
  icon?: ReactNode;
  iconRight?: ReactNode;
  loading?: boolean;
  /** Ocupa todo el ancho (útil en móvil y en mostrador). */
  block?: boolean;
}

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-primary-fg hover:bg-primary-hover shadow-xs',
  secondary: 'bg-surface text-fg border border-border-strong hover:bg-surface-sunken',
  ghost: 'bg-transparent text-primary hover:bg-primary-soft',
  danger: 'bg-danger-600 text-white hover:bg-danger-700 shadow-xs',
  success: 'bg-success-600 text-white hover:bg-success-700 shadow-xs',
  accent: 'bg-accent text-accent-fg hover:bg-gold-500 shadow-xs',
};
const sizes: Record<ButtonSize, string> = {
  sm: 'h-control-sm px-3 text-sm gap-1.5 rounded-md',
  md: 'h-control px-4 text-base gap-2 rounded-md',
  lg: 'h-control-lg px-6 text-lg gap-2.5 rounded-lg',
  xl: 'h-control-xl px-8 text-xl gap-3 rounded-lg',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', icon, iconRight, loading, block, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex items-center justify-center font-semibold whitespace-nowrap select-none',
        'transition-colors duration-150 ease-ob focus-visible:outline-none focus-visible:shadow-focus',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        variants[variant], sizes[size], block && 'w-full', className,
      )}
      {...rest}
    >
      {loading ? <Spinner /> : icon}
      <span>{children}</span>
      {iconRight}
    </button>
  );
});

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cn('animate-spin h-[1.1em] w-[1.1em]', className)} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity=".25" strokeWidth="3" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
