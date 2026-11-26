import type { ReactNode } from 'react';
import { cn } from './cn';

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  align?: 'left' | 'right' | 'center';
  /** Ocultar en pantallas chicas (la fila sigue siendo usable). */
  hideOnMobile?: boolean;
  width?: string;
}

export interface TableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  empty?: ReactNode;
  caption?: string;
  dense?: boolean;
}

/** Tabla de datos. Filas de 56px (o 44px en `dense`), encabezado fijo y fila completa clicable. */
export function Table<T>({ columns, rows, rowKey, onRowClick, empty, caption, dense }: TableProps<T>) {
  const align = (a?: string) => (a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : 'text-left');
  const [head, ...rest] = columns;
  const shown = rest.filter((c) => !c.hideOnMobile);
  const isEmptyHeader = (c: Column<T>) => c.header === '' || c.header === null || c.header === undefined;
  return (
    <>
    {/* Celular: cada fila es una tarjeta (sin desplazamiento horizontal). */}
    <ul className="flex flex-col gap-2 md:hidden" aria-label={caption}>
      {rows.length === 0 && <li className="rounded-lg border border-border bg-surface px-4 py-6 text-center text-muted">{empty}</li>}
      {rows.map((r) => (
        <li key={rowKey(r)}>
          <div role={onRowClick ? 'button' : undefined} tabIndex={onRowClick ? 0 : undefined}
            onClick={onRowClick ? () => onRowClick(r) : undefined}
            onKeyDown={onRowClick ? (e) => { if (e.key === 'Enter') onRowClick(r); } : undefined}
            className={cn('rounded-lg border border-border bg-surface px-4 py-3 shadow-xs', onRowClick && 'ob-press cursor-pointer active:bg-primary-soft')}>
            {head && (
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1 text-base font-semibold text-fg [overflow-wrap:anywhere]">{head.cell(r)}</div>
                {onRowClick && <svg className="mt-1 h-4 w-4 shrink-0 text-fg-subtle" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden><path d="M9 6l6 6-6 6" /></svg>}
              </div>
            )}
            {shown.some((c) => !isEmptyHeader(c)) && (
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                {shown.filter((c) => !isEmptyHeader(c)).map((c) => (
                  <div key={c.key} className="contents">
                    <dt className="text-fg-muted">{c.header}</dt>
                    <dd className={cn('min-w-0 text-right text-fg [overflow-wrap:anywhere]', c.align === 'right' && 'ob-num font-semibold')}>{c.cell(r)}</dd>
                  </div>
                ))}
              </dl>
            )}
            {shown.filter(isEmptyHeader).map((c) => (
              <div key={c.key} className="mt-3 flex flex-wrap justify-end gap-2 border-t border-border pt-3" onClick={(e) => e.stopPropagation()}>{c.cell(r)}</div>
            ))}
          </div>
        </li>
      ))}
    </ul>
    <div className="hidden overflow-x-auto rounded-lg border border-border bg-surface md:block">
      <table className="w-full border-collapse text-base">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead className="sticky top-0 bg-surface-muted">
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" style={{ width: c.width }}
                className={cn('border-b border-border px-4 py-3 text-sm font-semibold text-fg-muted', align(c.align), c.hideOnMobile && 'hidden md:table-cell')}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={columns.length} className="p-0">{empty}</td></tr>
          )}
          {rows.map((r) => (
            <tr key={rowKey(r)} onClick={onRowClick ? () => onRowClick(r) : undefined}
              tabIndex={onRowClick ? 0 : undefined}
              onKeyDown={onRowClick ? (e) => { if (e.key === 'Enter') onRowClick(r); } : undefined}
              className={cn('border-b border-border last:border-0', onRowClick && 'cursor-pointer hover:bg-primary-soft focus:bg-primary-soft focus:outline-none')}>
              {columns.map((c) => (
                <td key={c.key} className={cn('px-4 text-fg', dense ? 'h-11' : 'h-14', align(c.align), c.align === 'right' && 'ob-num', c.hideOnMobile && 'hidden md:table-cell')}>
                  {c.cell(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    </>
  );
}
