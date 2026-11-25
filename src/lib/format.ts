// Formatos para México: MXN, fechas en español, zona America/Mexico_City.

const TZ = 'America/Mexico_City';

const mxn = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 });
const mxn0 = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });

export const money = (n: number | string | null | undefined) => mxn.format(Number(n ?? 0));
export const money0 = (n: number | string | null | undefined) => mxn0.format(Number(n ?? 0));

export function todayMx(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
}

export function periodNow(): string { return todayMx().slice(0, 7); }

export function dateLong(d: string | Date | null | undefined) {
  if (!d) return '—';
  const date = typeof d === 'string' && d.length === 10 ? new Date(d + 'T12:00:00') : new Date(d);
  return new Intl.DateTimeFormat('es-MX', { timeZone: TZ, day: 'numeric', month: 'long', year: 'numeric' }).format(date);
}

export function dateShort(d: string | Date | null | undefined) {
  if (!d) return '—';
  const date = typeof d === 'string' && d.length === 10 ? new Date(d + 'T12:00:00') : new Date(d);
  return new Intl.DateTimeFormat('es-MX', { timeZone: TZ, day: '2-digit', month: 'short' }).format(date);
}

export function dateTime(d: string | Date | null | undefined) {
  if (!d) return '—';
  return new Intl.DateTimeFormat('es-MX', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(d));
}

export function timeOnly(d: string | Date) {
  return new Intl.DateTimeFormat('es-MX', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(new Date(d));
}

export function weekdayLong(d: string | Date = new Date()) {
  return new Intl.DateTimeFormat('es-MX', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(d));
}

/** "16:00:00" → "4:00 p. m." */
export function hhmm(t: string | null | undefined) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const d = new Date(2000, 0, 1, h, m);
  return new Intl.DateTimeFormat('es-MX', { hour: 'numeric', minute: '2-digit' }).format(d);
}

export const WEEKDAYS = ['', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
export const WEEKDAYS_LONG = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
export const daysLabel = (days: number[]) => days.map((d) => WEEKDAYS[d]).join(' · ');

/** Día ISO (1 = lunes) de hoy en CDMX */
export function isoDowMx(): number {
  const wd = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' }).format(new Date());
  return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(wd) + 1;
}

export function ageYears(birth: string | null | undefined, at: string = todayMx()): number | null {
  if (!birth) return null;
  const b = new Date(birth + 'T12:00:00'), a = new Date(at + 'T12:00:00');
  let y = a.getFullYear() - b.getFullYear();
  let m = a.getMonth() - b.getMonth();
  if (a.getDate() < b.getDate()) m--;
  if (m < 0) { y--; m += 12; }
  return Math.round((y + m / 12) * 10) / 10;
}

export function ageLabel(birth: string | null | undefined) {
  const a = ageYears(birth);
  if (a === null) return 'Sin fecha de nacimiento';
  if (a < 1) return `${Math.round(a * 12)} meses`;
  const y = Math.floor(a);
  return `${y} ${y === 1 ? 'año' : 'años'}`;
}

export function rangeLabel(min: number, max: number) {
  const f = (n: number) => (n < 1 ? `${Math.round(n * 12)} meses` : `${Math.floor(n)}`);
  if (max >= 99) return `${f(min)} años o más`;
  return `${f(min)} a ${Math.floor(max)} años`;
}

export const fullName = (m: { first_name: string; last_name?: string | null }) => `${m.first_name} ${m.last_name ?? ''}`.trim();

export function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
}

export function downloadCsv(name: string, rows: Record<string, unknown>[]) {
  const blob = new Blob(['﻿' + toCsv(rows)], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name.endsWith('.csv') ? name : `${name}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}
