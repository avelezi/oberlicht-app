import { useRef, useState } from 'react';
import { CheckCircle2, Download, FileSpreadsheet, Upload } from 'lucide-react';
import { Alert, Button, Modal, Select, Table } from '@/design-system';
import { supabase } from '@/lib/supabase';
import { friendlyError } from '@/lib/supabase';
import { downloadCsv } from '@/lib/format';
import { autoMap, buildRows, downloadTemplate, readFile, type ImportField, type Sheet } from '@/lib/importer';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  intro: string;
  fields: ImportField[];
  rpc: string;
  templateName: string;
  sample: Record<string, string>[];
  /** Totales a mostrar al terminar: clave del resultado → etiqueta */
  totals: Record<string, string>;
  chunk?: number;
  onDone?: () => void;
}

/** Importador en 3 pasos: elegir archivo → revisar columnas → importar. Acepta Excel, CSV y PDF con tabla. */
export function ImportModal({ open, onClose, title, intro, fields, rpc, templateName, sample, totals, chunk = 300, onDone }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [map, setMap] = useState<Record<string, number>>({});
  const [step, setStep] = useState<'file' | 'map' | 'run' | 'done'>('file');
  const [err, setErr] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ n: Record<string, number>; errores: { fila: number; dato: string; motivo: string }[] } | null>(null);
  const [reading, setReading] = useState(false);

  function reset() {
    setFile(null); setSheet(null); setMap({}); setStep('file'); setErr(null); setProgress(0); setResult(null);
  }
  function close() { reset(); onClose(); }

  async function pick(f: File) {
    setErr(null); setReading(true); setFile(f);
    try {
      const s = await readFile(f);
      if (!s.rows.length) throw new Error('No encontramos renglones con datos. Revisa que el archivo tenga una fila de títulos y debajo los datos.');
      setSheet(s); setMap(autoMap(s.headers, fields)); setStep('map');
    } catch (e) {
      setErr(/password|encrypt/i.test(String(e)) ? 'El PDF está protegido con contraseña.' : friendlyError(e));
    } finally { setReading(false); }
  }

  const rows = sheet ? buildRows(sheet, map, fields) : [];
  const missing = fields.filter((f) => f.required && map[f.key] === undefined);

  async function runImport() {
    setStep('run'); setErr(null);
    const acc: Record<string, number> = {}; const errores: { fila: number; dato: string; motivo: string }[] = [];
    try {
      for (let i = 0; i < rows.length; i += chunk) {
        const part = rows.slice(i, i + chunk);
        const { data, error } = await supabase.rpc(rpc, { p_rows: part, p_file: file?.name ?? null });
        if (error) throw error;
        const r = data as Record<string, unknown>;
        for (const k of Object.keys(totals)) acc[k] = (acc[k] ?? 0) + Number(r[k] ?? 0);
        for (const e of (r.errores as typeof errores) ?? []) errores.push({ ...e, fila: e.fila + i });
        setProgress(Math.min(rows.length, i + chunk));
      }
      setResult({ n: acc, errores }); setStep('done'); onDone?.();
    } catch (e) {
      setErr(friendlyError(e)); setStep('map');
    }
  }

  return (
    <Modal open={open} onClose={close} size="lg" title={title}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          {step === 'map' && <Button variant="secondary" onClick={reset}>Elegir otro archivo</Button>}
          {step === 'map' && <Button icon={<Upload className="h-5 w-5" />} disabled={!!missing.length || !rows.length} onClick={runImport}>Importar {rows.length} renglones</Button>}
          {(step === 'file' || step === 'done') && <Button variant={step === 'done' ? 'primary' : 'secondary'} onClick={close}>{step === 'done' ? 'Listo' : 'Cancelar'}</Button>}
        </div>
      }>
      {err && <div className="mb-4"><Alert tone="danger" title="No se pudo importar">{err}</Alert></div>}

      {step === 'file' && (
        <div className="space-y-4">
          <p className="text-base text-fg-muted">{intro}</p>
          <button type="button" onClick={() => input.current?.click()}
            onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) pick(f); }}
            className="flex min-h-[160px] w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border-strong p-6 text-center hover:bg-primary-soft">
            <FileSpreadsheet className="h-10 w-10 text-primary" />
            <span className="text-lg font-semibold">{reading ? 'Leyendo archivo…' : 'Toca para elegir el archivo o arrástralo aquí'}</span>
            <span className="text-sm text-fg-muted">Excel (.xlsx, .xls), CSV o PDF con una tabla</span>
          </button>
          <input ref={input} type="file" className="hidden" accept=".xlsx,.xls,.csv,.pdf,.ods" onChange={(e) => { const f = e.target.files?.[0]; if (f) pick(f); e.target.value = ''; }} />
          <Button variant="ghost" icon={<Download className="h-5 w-5" />} onClick={() => downloadTemplate(templateName, fields, sample)}>Descargar plantilla de Excel</Button>
        </div>
      )}

      {step === 'map' && sheet && (
        <div className="space-y-4">
          <p className="text-base">Encontramos <b>{sheet.rows.length}</b> renglones en <b>{file?.name}</b>. Revisa que cada dato esté en la columna correcta.</p>
          {missing.length > 0 && <Alert tone="warning" title="Faltan columnas obligatorias">Indica de qué columna sale: {missing.map((f) => f.label).join(', ')}.</Alert>}
          <div className="grid gap-3 sm:grid-cols-2">
            {fields.map((f) => (
              <label key={f.key} className="block">
                <span className="mb-1 block text-sm font-semibold">{f.label}{f.required && <span className="text-danger-600"> *</span>}</span>
                <Select value={map[f.key] ?? -1} onChange={(e) => setMap((m) => { const n = { ...m }; const v = Number(e.target.value); if (v < 0) delete n[f.key]; else n[f.key] = v; return n; })}>
                  <option value={-1}>— No viene en el archivo —</option>
                  {sheet.headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                </Select>
                {f.hint && <span className="mt-1 block text-xs text-fg-muted">{f.hint}</span>}
              </label>
            ))}
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold">Vista previa</p>
            <div className="overflow-x-auto">
              <Table dense rows={rows.slice(0, 5).map((r, i) => ({ ...r, __i: String(i) }))} rowKey={(r) => r.__i}
                columns={fields.filter((f) => map[f.key] !== undefined).map((f) => ({ key: f.key, header: f.label, cell: (r: Record<string, string>) => r[f.key] }))} />
            </div>
          </div>
        </div>
      )}

      {step === 'run' && (
        <div className="py-8 text-center">
          <p className="text-lg font-semibold">Importando… {progress} de {rows.length}</p>
          <div className="mx-auto mt-4 h-3 max-w-md overflow-hidden rounded-full bg-surface-sunken">
            <div className="h-full bg-primary transition-all" style={{ width: `${rows.length ? (100 * progress) / rows.length : 0}%` }} />
          </div>
          <p className="mt-3 text-sm text-fg-muted">No cierres esta ventana.</p>
        </div>
      )}

      {step === 'done' && result && (
        <div className="space-y-4">
          <div className="flex items-center gap-3"><CheckCircle2 className="h-8 w-8 text-success-600" /><p className="text-lg font-semibold">Importación terminada</p></div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Object.entries(totals).map(([k, l]) => (
              <div key={k} className="rounded-lg border border-border p-3"><p className="text-2xl font-bold ob-num">{result.n[k] ?? 0}</p><p className="text-sm text-fg-muted">{l}</p></div>
            ))}
          </div>
          {result.errores.length > 0 && (
            <Alert tone="warning" title={`${result.errores.length} renglones no se importaron`}
              action={<Button size="sm" variant="secondary" icon={<Download className="h-4 w-4" />} onClick={() => downloadCsv('renglones-con-error.csv', result.errores.map((e) => ({ Renglón: e.fila, Dato: e.dato, Motivo: e.motivo })))}>Descargar lista</Button>}>
              {result.errores.slice(0, 3).map((e) => `Renglón ${e.fila}: ${e.motivo}`).join(' · ')}
            </Alert>
          )}
        </div>
      )}
    </Modal>
  );
}
