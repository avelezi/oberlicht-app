import { useState, type ReactNode } from 'react';

// Gráficas ligeras en SVG con la paleta del club (ver variables --chart-* en index.css).
// Marcas delgadas, extremos redondeados, ejes discretos y tooltip al pasar el dedo o el mouse.

export const SERIES_COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)'];

function Tip({ x, y, children }: { x: number; y: number; children: ReactNode }) {
  return (
    <div className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm shadow-lg"
      style={{ left: `${x}%`, top: `${y}%` }}>{children}</div>
  );
}

function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

export interface BarDatum { label: string; value: number; detail?: string }

/** Columnas verticales de una sola serie (p. ej. visitas por día). */
export function Bars({ data, format = (n) => String(n), height = 220, color = 'var(--chart-1)', labelEvery }: {
  data: BarDatum[]; format?: (n: number) => string; height?: number; color?: string; labelEvery?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640, H = height, L = 36, B = 28, T = 10;
  const max = niceMax(Math.max(0, ...data.map((d) => d.value)));
  const bw = (W - L) / Math.max(1, data.length);
  const every = labelEvery ?? Math.max(1, Math.ceil(data.length / 10));
  const y = (v: number) => T + (H - T - B) * (1 - v / max);
  if (!data.length) return <p className="py-8 text-center text-base text-fg-muted">Sin datos en este periodo.</p>;
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Gráfica de columnas">
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={L} x2={W} y1={y(max * f)} y2={y(max * f)} stroke="var(--chart-grid)" strokeWidth={1} />
            <text x={L - 6} y={y(max * f) + 4} textAnchor="end" fontSize={11} fill="var(--chart-axis)">{format(max * f)}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = L + i * bw, w = Math.max(2, Math.min(28, bw - 2)), cx = x + bw / 2, top = y(d.value), h = Math.max(0, H - B - top);
          return (
            <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onTouchStart={() => setHover(i)}>
              <rect x={x} y={T} width={bw} height={H - T - B} fill="transparent" />
              {h > 0 && <path d={`M${cx - w / 2},${H - B} v${-(h - Math.min(4, h))} q0,-${Math.min(4, h)} ${Math.min(4, w / 2)},-${Math.min(4, h)} h${w - 2 * Math.min(4, w / 2)} q${Math.min(4, w / 2)},0 ${Math.min(4, w / 2)},${Math.min(4, h)} v${h - Math.min(4, h)} z`}
                fill={color} opacity={hover === null || hover === i ? 1 : 0.45} />}
              {i % every === 0 && <text x={cx} y={H - 9} textAnchor="middle" fontSize={11} fill="var(--chart-axis)">{d.label}</text>}
            </g>
          );
        })}
        <line x1={L} x2={W} y1={H - B} y2={H - B} stroke="var(--chart-axis)" strokeWidth={1} opacity={0.5} />
      </svg>
      {hover !== null && data[hover] && (
        <Tip x={((L + (hover + 0.5) * bw) / W) * 100} y={(y(data[hover].value) / H) * 100}>
          <p className="font-semibold">{data[hover].detail ?? data[hover].label}</p><p className="ob-num">{format(data[hover].value)}</p>
        </Tip>
      )}
    </div>
  );
}

export interface Series { key: string; label: string }

/** Columnas agrupadas (hasta 3 series) con leyenda: p. ej. altas, reingresos y bajas por mes. */
export function GroupedBars({ data, series, height = 240, format = (n) => String(n) }: {
  data: { label: string; values: Record<string, number> }[]; series: Series[]; height?: number; format?: (n: number) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640, H = height, L = 36, B = 28, T = 10;
  const max = niceMax(Math.max(0, ...data.flatMap((d) => series.map((s) => d.values[s.key] ?? 0))));
  const gw = (W - L) / Math.max(1, data.length);
  const bw = Math.max(2, Math.min(14, (gw - 6) / series.length - 2));
  const y = (v: number) => T + (H - T - B) * (1 - v / max);
  return (
    <div>
      <Legend series={series} />
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Gráfica de columnas agrupadas">
          {[0, 0.5, 1].map((f) => (
            <g key={f}>
              <line x1={L} x2={W} y1={y(max * f)} y2={y(max * f)} stroke="var(--chart-grid)" />
              <text x={L - 6} y={y(max * f) + 4} textAnchor="end" fontSize={11} fill="var(--chart-axis)">{format(max * f)}</text>
            </g>
          ))}
          {data.map((d, i) => {
            const gx = L + i * gw + (gw - series.length * (bw + 2)) / 2;
            return (
              <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onTouchStart={() => setHover(i)}>
                <rect x={L + i * gw} y={T} width={gw} height={H - T - B} fill="transparent" />
                {series.map((s, j) => {
                  const v = d.values[s.key] ?? 0, top = y(v), h = H - B - top, r = Math.min(3, h, bw / 2);
                  return h > 0 ? <path key={s.key} d={`M${gx + j * (bw + 2)},${H - B} v${-(h - r)} q0,-${r} ${r},-${r} h${bw - 2 * r} q${r},0 ${r},${r} v${h - r} z`}
                    fill={SERIES_COLORS[j]} opacity={hover === null || hover === i ? 1 : 0.45} /> : null;
                })}
                <text x={L + i * gw + gw / 2} y={H - 9} textAnchor="middle" fontSize={11} fill="var(--chart-axis)">{d.label}</text>
              </g>
            );
          })}
          <line x1={L} x2={W} y1={H - B} y2={H - B} stroke="var(--chart-axis)" opacity={0.5} />
        </svg>
        {hover !== null && data[hover] && (
          <Tip x={((L + (hover + 0.5) * gw) / W) * 100} y={10}>
            <p className="mb-1 font-semibold">{data[hover].label}</p>
            {series.map((s, j) => (
              <p key={s.key} className="flex items-center gap-2"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: SERIES_COLORS[j] }} />{s.label}: <b className="ob-num">{format(data[hover].values[s.key] ?? 0)}</b></p>
            ))}
          </Tip>
        )}
      </div>
    </div>
  );
}

export function Legend({ series }: { series: Series[] }) {
  return (
    <div className="mb-2 flex flex-wrap gap-4 text-sm">
      {series.map((s, j) => <span key={s.key} className="inline-flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-sm" style={{ background: SERIES_COLORS[j] }} />{s.label}</span>)}
    </div>
  );
}

/** Barras horizontales con valor al final (rangos de edad, frecuencia de visitas). */
export function HBars({ data, format = (n) => String(n), color = 'var(--chart-1)' }: { data: BarDatum[]; format?: (n: number) => string; color?: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const total = data.reduce((s, d) => s + d.value, 0);
  if (!data.length || total === 0) return <p className="py-6 text-center text-base text-fg-muted">Sin datos.</p>;
  return (
    <ul className="space-y-2.5">
      {data.map((d) => (
        <li key={d.label} className="grid grid-cols-[112px_1fr_64px] items-center gap-3 text-sm">
          <span className="truncate text-fg-muted">{d.label}</span>
          <span className="h-3 overflow-hidden rounded-r bg-transparent">
            <span className="block h-full rounded-r" style={{ width: `${(100 * d.value) / max}%`, background: color, minWidth: d.value ? 3 : 0 }} />
          </span>
          <span className="text-right font-semibold ob-num">{format(d.value)} <span className="font-normal text-fg-muted">{Math.round((100 * d.value) / total)}%</span></span>
        </li>
      ))}
    </ul>
  );
}

const DOW = ['', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

/** Mapa de calor día × hora: dónde se concentra la gente. */
export function Heatmap({ cells }: { cells: { dow: number; hour: number; visitas: number }[] }) {
  const [hover, setHover] = useState<{ dow: number; hour: number; v: number } | null>(null);
  if (!cells.length) return <p className="py-8 text-center text-base text-fg-muted">Aún no hay entradas registradas en este periodo.</p>;
  const hours = cells.map((c) => c.hour);
  const h0 = Math.min(6, ...hours), h1 = Math.max(21, ...hours);
  const max = Math.max(...cells.map((c) => c.visitas));
  const get = (d: number, h: number) => cells.find((c) => c.dow === d && c.hour === h)?.visitas ?? 0;
  const step = (v: number) => (v === 0 ? 0 : Math.min(6, 1 + Math.floor((5 * v) / max)));
  const hrs = Array.from({ length: h1 - h0 + 1 }, (_, i) => h0 + i);
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-separate" style={{ borderSpacing: 2 }}>
          <thead><tr><th />{hrs.map((h) => <th key={h} className="text-center text-[11px] font-normal text-fg-muted">{h}</th>)}</tr></thead>
          <tbody>
            {[1, 2, 3, 4, 5, 6, 7].map((d) => (
              <tr key={d}>
                <th className="pr-2 text-left text-xs font-semibold text-fg-muted">{DOW[d]}</th>
                {hrs.map((h) => {
                  const v = get(d, h);
                  return <td key={h} className="h-7 rounded-sm" style={{ background: `var(--heat-${step(v)})` }}
                    onMouseEnter={() => setHover({ dow: d, hour: h, v })} onMouseLeave={() => setHover(null)} onTouchStart={() => setHover({ dow: d, hour: h, v })}
                    aria-label={`${DOW[d]} ${h}:00, ${v} visitas`} />;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm">
        <p className="min-h-[1.5rem] font-semibold">{hover ? `${DOW[hover.dow]} de ${hover.hour}:00 a ${hover.hour + 1}:00 · ${hover.v} ${hover.v === 1 ? 'visita' : 'visitas'}` : <span className="font-normal text-fg-muted">Toca un cuadro para ver el detalle</span>}</p>
        <div className="flex items-center gap-1 text-xs text-fg-muted">Menos {[0, 1, 2, 3, 4, 5, 6].map((s) => <span key={s} className="inline-block h-3 w-4 rounded-sm" style={{ background: `var(--heat-${s})` }} />)} Más</div>
      </div>
    </div>
  );
}
