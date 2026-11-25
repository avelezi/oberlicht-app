import type { ReactNode } from 'react';
import { Badge, type Tone } from '@/design-system';

export interface MaintArea { code: string; name: string; icon: string | null; responsible: string | null; sort_order: number; active: boolean }
export interface Asset { id: string; area: string; name: string; brand: string | null; model: string | null; serial: string | null; location: string | null; purchase_date: string | null; warranty_until: string | null; status: 'operando' | 'falla' | 'fuera_servicio' | 'baja'; notes: string | null }
export interface Supplier { id: string; name: string; rfc: string | null; contact: string | null; phone: string | null; email: string | null; areas: string[]; payment_terms: string | null; delivery_days: number | null; rating: number | null; notes: string | null; active: boolean }
export interface Supply { id: string; area: string; name: string; category: string | null; unit: string; stock: number; min_stock: number; reorder_qty: number | null; daily_use: number | null; purchase_every_days: number | null; last_purchase_on: string | null; preferred_supplier: string | null; notes: string | null; active: boolean }
export interface SupplyStatus extends Supply { preferred_supplier_name: string | null; last_price: number | null; best_price: number | null; next_purchase_on: string | null; days_left: number | null; needs_reorder: boolean }
export interface Task { id: string; area: string; asset_id: string | null; title: string; instructions: string | null; frequency_days: number; last_done_on: string | null; next_due_on: string; assigned_to: string | null; est_minutes: number | null; active: boolean }
export interface WorkOrder { id: string; folio: number; area: string; asset_id: string | null; task_id: string | null; kind: 'preventivo' | 'correctivo' | 'mejora'; title: string; description: string | null; priority: 'baja' | 'media' | 'alta' | 'urgente'; status: 'abierta' | 'en_proceso' | 'en_espera' | 'terminada' | 'cancelada'; reported_by: string | null; assigned_to: string | null; supplier_id: string | null; due_on: string | null; started_at: string | null; completed_at: string | null; labor_cost: number; materials_cost: number; resolution: string | null; created_at: string }
export interface Purchase { id: string; area: string; supplier_id: string | null; invoice_number: string | null; invoice_uuid: string | null; invoice_date: string; subtotal: number | null; tax: number | null; total: number; pdf_path: string | null; xml_path: string | null; work_order_id: string | null; status: 'por_pagar' | 'pagada' | 'cancelada'; paid_at: string | null; notes: string | null; created_at: string }
export interface PriceCompare { supply_id: string; supply_name: string; unit: string; area: string; supplier_id: string; supplier_name: string; delivery_days: number | null; rating: number | null; unit_price: number; quoted_on: string; source: 'cotizacion' | 'factura' }
export interface PoolLog { id: string; pool: string; taken_at: string; ph: number | null; free_chlorine: number | null; combined_chlorine: number | null; alkalinity: number | null; hardness: number | null; cya: number | null; temperature: number | null; clarity: string | null; chemicals_added: string | null; backwash: boolean; notes: string | null; taken_by: string | null }
export type Ranges = Record<string, { min: number; max: number; label: string }>;

export const PRIORITY: Record<WorkOrder['priority'], { label: string; tone: Tone }> = {
  baja: { label: 'Baja', tone: 'neutral' }, media: { label: 'Media', tone: 'info' }, alta: { label: 'Alta', tone: 'warning' }, urgente: { label: 'Urgente', tone: 'danger' },
};
export const WO_STATUS: Record<WorkOrder['status'], { label: string; tone: Tone; sym: string }> = {
  abierta: { label: 'Abierta', tone: 'warning', sym: '○' }, en_proceso: { label: 'En proceso', tone: 'info', sym: '◐' }, en_espera: { label: 'En espera', tone: 'brand', sym: '⋯' },
  terminada: { label: 'Terminada', tone: 'success', sym: '✓' }, cancelada: { label: 'Cancelada', tone: 'neutral', sym: '–' },
};
export const ASSET_STATUS: Record<Asset['status'], { label: string; tone: Tone }> = {
  operando: { label: 'Operando', tone: 'success' }, falla: { label: 'Con falla', tone: 'warning' }, fuera_servicio: { label: 'Fuera de servicio', tone: 'danger' }, baja: { label: 'Dado de baja', tone: 'neutral' },
};

export function Pri({ p }: { p: WorkOrder['priority'] }) {
  return <Badge tone={PRIORITY[p].tone} icon={<span aria-hidden>{p === 'urgente' ? '!' : p === 'alta' ? '▲' : '•'}</span>}>{PRIORITY[p].label}</Badge>;
}
export function WoStatus({ s }: { s: WorkOrder['status'] }) {
  return <Badge tone={WO_STATUS[s].tone} icon={<span aria-hidden>{WO_STATUS[s].sym}</span>}>{WO_STATUS[s].label}</Badge>;
}

export const areaName = (areas: MaintArea[], code: string | null | undefined) => areas.find((a) => a.code === code)?.name ?? code ?? '';

export function inRange(r: Ranges, key: string, v: number | null | undefined): 'ok' | 'low' | 'high' | null {
  if (v == null || !r[key]) return null;
  if (v < r[key].min) return 'low';
  if (v > r[key].max) return 'high';
  return 'ok';
}

export function Reading({ value, state, unit }: { value: number | null; state: ReturnType<typeof inRange>; unit?: string }): ReactNode {
  if (value == null) return <span className="text-fg-subtle">—</span>;
  const cls = state === 'ok' ? 'text-success-700' : state ? 'text-danger-700 font-bold' : '';
  return <span className={`ob-num ${cls}`}>{state && state !== 'ok' ? (state === 'low' ? '▼ ' : '▲ ') : ''}{value}{unit ?? ''}</span>;
}

/** Lee un XML de CFDI 4.0 y saca los datos de la factura y sus conceptos. */
export function parseCfdi(xml: string) {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const byLocal = (name: string) => Array.from(doc.getElementsByTagName('*')).filter((e) => e.localName === name);
  const comp = byLocal('Comprobante')[0];
  if (!comp) throw new Error('El archivo XML no parece una factura (CFDI).');
  const emisor = byLocal('Emisor')[0];
  const timbre = byLocal('TimbreFiscalDigital')[0];
  const imp = byLocal('Impuestos').find((e) => e.parentElement === comp);
  const a = (e: Element | undefined, k: string) => e?.getAttribute(k) ?? '';
  return {
    serieFolio: [a(comp, 'Serie'), a(comp, 'Folio')].filter(Boolean).join('-'),
    fecha: a(comp, 'Fecha').slice(0, 10),
    subtotal: Number(a(comp, 'SubTotal') || 0),
    total: Number(a(comp, 'Total') || 0),
    tax: Number(a(imp, 'TotalImpuestosTrasladados') || 0),
    rfc: a(emisor, 'Rfc'),
    nombre: a(emisor, 'Nombre'),
    uuid: a(timbre, 'UUID'),
    conceptos: byLocal('Concepto').map((c) => ({
      descripcion: a(c, 'Descripcion'), cantidad: Number(a(c, 'Cantidad') || 1), valorUnitario: Number(a(c, 'ValorUnitario') || 0), unidad: a(c, 'Unidad') || a(c, 'ClaveUnidad'),
    })),
  };
}
