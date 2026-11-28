import { useState } from 'react';
import { Smile } from 'lucide-react';
import { AREA_LABEL, Button, Card, Field, Select, Textarea } from '@/design-system';
import { useAction, useAsync } from '@/lib/hooks';
import { supabase, must } from '@/lib/supabase';

export type NpsTipo = 'promotor' | 'neutral' | 'detractor';
export const npsTipo = (s: number): NpsTipo => (s >= 9 ? 'promotor' : s >= 7 ? 'neutral' : 'detractor');
export const NPS_LABEL: Record<NpsTipo, string> = { promotor: 'Promotor', neutral: 'Neutral', detractor: 'Inconforme' };
export const NPS_TONE = { promotor: 'success', neutral: 'warning', detractor: 'danger' } as const;
export const AREAS_ENCUESTA = Object.entries(AREA_LABEL).filter(([k]) => k !== 'tienda');

/** Botones del 0 al 10, en rojo, amarillo o verde según la calificación. */
export function ScorePicker({ value, onChange }: { value: number | null; onChange: (n: number) => void }) {
  return (
    <div>
      <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-11" role="radiogroup" aria-label="Calificación del 0 al 10">
        {Array.from({ length: 11 }, (_, n) => {
          const t = npsTipo(n);
          const on = value === n;
          const tone = t === 'promotor' ? 'border-success-600 bg-success-600' : t === 'neutral' ? 'border-warning-600 bg-warning-600' : 'border-danger-600 bg-danger-600';
          return (
            <button key={n} type="button" role="radio" aria-checked={on} onClick={() => onChange(n)}
              className={`ob-num h-12 rounded-md border text-lg font-bold transition ${on ? `${tone} text-white` : 'border-border bg-surface hover:bg-primary-soft'}`}>{n}</button>
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-sm text-fg-muted"><span>Nada probable</span><span>Muy probable</span></div>
    </div>
  );
}

interface Pendiente { id: string; titulo: string; pregunta: string; puntos: number; family_id: string }

/** Tarjeta del portal: la familia contesta en 20 segundos y gana puntos. */
export function EncuestaPortal({ onDone }: { onDone?: () => void }) {
  const [score, setScore] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [area, setArea] = useState('');
  const [sent, setSent] = useState(false);
  const { busy, run } = useAction();
  const { data } = useAsync(async () => (await must(supabase.rpc('encuesta_pendiente'))) as Pendiente | null, []);
  if (sent) {
    return (
      <Card className="border-success-100 bg-success-50">
        <p className="flex items-center gap-2 text-lg font-bold text-success-700"><Smile className="h-6 w-6" aria-hidden /> ¡Gracias por tu opinión!</p>
        <p className="mt-1 text-base">Nos ayuda a mejorar.{data?.puntos ? ` Ganaste ${data.puntos} puntos para la barra y la tienda.` : ''}</p>
      </Card>
    );
  }
  if (!data) return null;
  return (
    <Card className="border-primary">
      <p className="text-sm font-semibold uppercase tracking-wide text-primary">{data.titulo}{data.puntos ? ` · gana ${data.puntos} puntos` : ''}</p>
      <h2 className="mt-1 text-lg font-bold">{data.pregunta}</h2>
      <div className="mt-3"><ScorePicker value={score} onChange={setScore} /></div>
      {score !== null && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label={score <= 6 ? '¿Qué podemos mejorar?' : score <= 8 ? '¿Qué nos faltó para un 10?' : '¿Qué es lo que más te gusta?'}>
            {(p) => <Textarea {...p} rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Opcional" />}
          </Field>
          <Field label="¿Sobre qué área?">
            {(p) => <Select {...p} value={area} onChange={(e) => setArea(e.target.value)}>
              <option value="">El club en general</option>
              {AREAS_ENCUESTA.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </Select>}
          </Field>
          <div className="sm:col-span-2">
            <Button loading={busy} onClick={async () => {
              const ok = await run(() => must(supabase.rpc('responder_encuesta', { p_survey: data.id, p_family: data.family_id, p_score: score, p_comment: comment || null, p_department: area || null })));
              if (ok) { setSent(true); onDone?.(); }
            }}>Enviar</Button>
          </div>
        </div>
      )}
    </Card>
  );
}
