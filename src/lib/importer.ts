// Lectura de archivos para importar (Excel, CSV o PDF con tabla) y mapeo automático de columnas.
// Las librerías se cargan solo cuando alguien importa, para no hacer más pesada la app.

export interface ImportField {
  key: string;
  label: string;
  synonyms: string[];
  required?: boolean;
  hint?: string;
}

export interface Sheet { headers: string[]; rows: string[][] }

export const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

export async function readFile(file: File): Promise<Sheet> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.pdf')) return readPdf(file);
  const XLSX = await import('xlsx');
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
  // Toma la hoja con más filas
  let best: string[][] = [];
  for (const sn of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[sn], { header: 1, raw: false, dateNF: 'yyyy-mm-dd hh:mm', defval: '', blankrows: false });
    if (rows.length > best.length) best = rows;
  }
  return toSheet(best.map((r) => r.map((c) => String(c ?? '').trim())));
}

/** PDF con tabla: agrupa el texto por renglones y separa columnas por los espacios grandes. */
async function readPdf(file: File): Promise<Sheet> {
  const pdfjs = await import('pdfjs-dist');
  const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const lines: string[][] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    type It = { str: string; x: number; y: number; w: number };
    const items: It[] = (tc.items as { str?: string; transform?: number[]; width?: number }[])
      .filter((i) => i.str && i.str.trim() && i.transform)
      .map((i) => ({ str: i.str!.trim(), x: i.transform![4], y: Math.round(i.transform![5]), w: i.width ?? 0 }));
    const byY = new Map<number, It[]>();
    for (const it of items) {
      const key = [...byY.keys()].find((k) => Math.abs(k - it.y) <= 2) ?? it.y;
      byY.set(key, [...(byY.get(key) ?? []), it]);
    }
    for (const y of [...byY.keys()].sort((a, b) => b - a)) {
      const row = byY.get(y)!.sort((a, b) => a.x - b.x);
      const cells: string[] = [];
      let lastEnd = -Infinity;
      for (const it of row) {
        if (it.x - lastEnd > 8 || cells.length === 0) cells.push(it.str);
        else cells[cells.length - 1] += ' ' + it.str;
        lastEnd = it.x + it.w;
      }
      lines.push(cells);
    }
  }
  return toSheet(lines);
}

function toSheet(rows: string[][]): Sheet {
  const nonEmpty = rows.filter((r) => r.some((c) => c !== ''));
  // El encabezado es el primer renglón con al menos 2 celdas de texto (no números)
  const hi = Math.max(0, nonEmpty.findIndex((r) => r.filter((c) => c && !/^[\d\s/.:-]+$/.test(c)).length >= 2));
  const headers = (nonEmpty[hi] ?? []).map((h, i) => h || `Columna ${i + 1}`);
  const body = nonEmpty.slice(hi + 1).filter((r) => r.length >= Math.min(2, headers.length) && norm(r.join('')) !== norm(headers.join('')));
  return { headers, rows: body.map((r) => headers.map((_, i) => r[i] ?? '')) };
}

export function autoMap(headers: string[], fields: ImportField[]): Record<string, number> {
  const map: Record<string, number> = {};
  const nh = headers.map(norm);
  const used = new Set<number>();
  for (const f of fields) {
    const cands = [f.key, f.label, ...f.synonyms].map(norm);
    let idx = nh.findIndex((h, i) => !used.has(i) && cands.includes(h));
    if (idx < 0) idx = nh.findIndex((h, i) => !used.has(i) && cands.some((c) => c.length > 3 && (h.startsWith(c) || h.includes(` ${c}`) || h.includes(c))));
    if (idx >= 0) { map[f.key] = idx; used.add(idx); }
  }
  return map;
}

export function buildRows(sheet: Sheet, map: Record<string, number>, fields: ImportField[]) {
  return sheet.rows.map((r) => {
    const o: Record<string, string> = {};
    for (const f of fields) if (map[f.key] !== undefined && map[f.key] >= 0) o[f.key] = (r[map[f.key]] ?? '').trim();
    return o;
  }).filter((o) => Object.values(o).some((v) => v !== ''));
}

export async function downloadTemplate(name: string, fields: ImportField[], sample: Record<string, string>[]) {
  const XLSX = await import('xlsx');
  const ws = XLSX.utils.json_to_sheet(sample.map((s) => Object.fromEntries(fields.map((f) => [f.label, s[f.key] ?? '']))), { header: fields.map((f) => f.label) });
  ws['!cols'] = fields.map(() => ({ wch: 20 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Datos');
  XLSX.writeFile(wb, name);
}
