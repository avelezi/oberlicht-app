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
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface">
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
  );
}
