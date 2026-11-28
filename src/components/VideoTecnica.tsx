import { useEffect, useRef, useState } from 'react';
import { Check, Pause, Play, RotateCcw, Snail, X } from 'lucide-react';
import { Badge, Button, cn } from '@/design-system';
import type { Ejercicio, Marca, VideoTecnica } from '@/lib/academia';

/**
 * Video de técnica con marcas encima: cruz roja donde está el error, palomita verde donde está bien.
 * Las marcas las dibuja la plataforma (no el video), así siempre caen donde deben y se pueden corregir sin regenerar.
 */
export function VideoMarcado({ video, lento, onTime, refVideo, compact }: {
  video: VideoTecnica; lento: boolean; onTime?: (t: number) => void; refVideo?: (v: HTMLVideoElement | null) => void; compact?: boolean;
}) {
  const ref = useRef<HTMLVideoElement | null>(null);
  const [t, setT] = useState(0);
  useEffect(() => { if (ref.current) ref.current.playbackRate = lento ? 0.5 : 1; }, [lento]);
  const marcas = (video.annotations ?? []).filter((m) => t >= m.desde && t <= m.hasta);
  const mal = video.kind === 'mal';
  if (!video.url) {
    return (
      <div className="flex aspect-video items-center justify-center rounded-lg border border-dashed border-border bg-surface-sunken p-4 text-center text-sm text-fg-muted">
        Video «{mal ? 'así no' : 'así sí'}» pendiente de generar
      </div>
    );
  }
  return (
    <figure className="relative overflow-hidden rounded-lg bg-black">
      <video
        ref={(v) => { ref.current = v; refVideo?.(v); }}
        src={video.url} muted playsInline loop autoPlay preload="metadata"
        className="block aspect-video w-full object-cover"
        onTimeUpdate={(e) => { const x = e.currentTarget.currentTime; setT(x); onTime?.(x); }}
        onLoadedMetadata={(e) => { e.currentTarget.playbackRate = lento ? 0.5 : 1; }}
      />
      <div className={cn('absolute left-2 top-2 flex items-center gap-1 rounded-full px-2.5 py-1 text-sm font-bold text-white shadow', mal ? 'bg-danger-600' : 'bg-success-600')}>
        {mal ? <X className="h-4 w-4" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />} {mal ? 'Así no' : 'Así sí'}
      </div>
      <span className="absolute right-2 top-2 rounded bg-black/55 px-1.5 py-0.5 text-[11px] text-white/90">Video generado con IA</span>
      {marcas.map((m, i) => <MarcaEnVideo key={i} m={m} compact={compact} />)}
    </figure>
  );
}

function MarcaEnVideo({ m, compact }: { m: Marca; compact?: boolean }) {
  const err = m.tipo === 'error';
  const izquierda = m.x > 0.55;
  return (
    <div className="pointer-events-none absolute" style={{ left: `${m.x * 100}%`, top: `${m.y * 100}%` }}>
      <span className={cn('absolute -translate-x-1/2 -translate-y-1/2 animate-pulse rounded-full border-[3px]', err ? 'border-danger-500 bg-danger-500/15' : 'border-success-500 bg-success-500/15', compact ? 'h-10 w-10' : 'h-14 w-14')} />
      <span className={cn('absolute -translate-y-1/2 flex items-center justify-center rounded-full text-white', err ? 'bg-danger-600' : 'bg-success-600', compact ? 'h-5 w-5 -translate-x-1/2' : 'h-6 w-6 -translate-x-1/2')}>
        {err ? <X className="h-3.5 w-3.5" aria-hidden /> : <Check className="h-3.5 w-3.5" aria-hidden />}
      </span>
      {!compact && (
        <span className={cn('absolute top-5 max-w-[13rem] whitespace-normal rounded-md px-2 py-1 text-xs font-semibold leading-snug text-white shadow-lg sm:text-sm',
          err ? 'bg-danger-700/90' : 'bg-success-700/90', izquierda ? 'right-2' : 'left-2')}>
          {m.texto}
        </span>
      )}
    </div>
  );
}

/** Comparación lado a lado: el error marcado contra la corrección, sincronizados y en cámara lenta. */
export function CompararTecnica({ ejercicio }: { ejercicio: Ejercicio }) {
  const vids = ejercicio.exercise_videos ?? [];
  const mal = vids.find((v) => v.kind === 'mal');
  const bien = vids.find((v) => v.kind === 'bien');
  const [lento, setLento] = useState(true);
  const [pausa, setPausa] = useState(false);
  const refs = useRef<(HTMLVideoElement | null)[]>([null, null]);
  const todos = () => refs.current.filter((v): v is HTMLVideoElement => !!v);
  function toggle() { const p = !pausa; setPausa(p); todos().forEach((v) => (p ? v.pause() : void v.play())); }
  function reiniciar() { todos().forEach((v) => { v.currentTime = 0; void v.play(); }); setPausa(false); }

  if (!mal && !bien) return null;
  const marcasMal = mal?.annotations ?? [];
  const marcasBien = bien?.annotations ?? [];
  const pares = ejercicio.errors.length ? ejercicio.errors : marcasMal.map((m, i) => ({ error: m.texto, correccion: marcasBien[i]?.texto ?? '' }));

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        {mal && <VideoMarcado video={mal} lento={lento} refVideo={(v) => (refs.current[0] = v)} />}
        {bien && <VideoMarcado video={bien} lento={lento} refVideo={(v) => (refs.current[1] = v)} />}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" icon={pausa ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />} onClick={toggle}>{pausa ? 'Reproducir' : 'Pausar'}</Button>
        <Button size="sm" variant="secondary" icon={<RotateCcw className="h-4 w-4" />} onClick={reiniciar}>Desde el inicio</Button>
        <Button size="sm" variant={lento ? 'primary' : 'secondary'} icon={<Snail className="h-4 w-4" />} onClick={() => setLento(!lento)}>Cámara lenta</Button>
        {(mal?.resolution || bien?.resolution) && <Badge size="sm">{(mal ?? bien)!.resolution}</Badge>}
      </div>
      {pares.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-border">
          <div className="grid grid-cols-2 bg-surface-sunken text-sm font-semibold">
            <div className="flex items-center gap-1.5 px-3 py-2 text-danger-700"><X className="h-4 w-4" aria-hidden /> Lo que está mal</div>
            <div className="flex items-center gap-1.5 px-3 py-2 text-success-700"><Check className="h-4 w-4" aria-hidden /> Cómo se corrige</div>
          </div>
          {pares.map((p, i) => (
            <div key={i} className="grid grid-cols-2 border-t border-border text-sm sm:text-base">
              <div className="px-3 py-2">{p.error}</div>
              <div className="px-3 py-2">{p.correccion}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
