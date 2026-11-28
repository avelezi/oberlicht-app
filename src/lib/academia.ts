// Academia: biblioteca de ejercicios con videos pares (mal hecho / bien hecho), programas por ciclo,
// rutinas (a mano o con IA) revisadas por coordinación, eventos y escuela de coaches.
import type { DeptCode } from './types';

export const DISCIPLINAS: DeptCode[] = ['natacion', 'oberfit', 'ballet', 'gimnasia'];

export type Bloque = 'calentamiento' | 'principal' | 'juego' | 'calma';
export const BLOQUE_LABEL: Record<Bloque, string> = { calentamiento: 'Calentamiento', principal: 'Parte principal', juego: 'Juego', calma: 'Vuelta a la calma' };

export interface Marca { desde: number; hasta: number; x: number; y: number; tipo: 'error' | 'ok'; texto: string }
export interface VideoTecnica {
  id: string; exercise_id: string; kind: 'mal' | 'bien'; url: string | null; provider: string; job_id: string | null;
  resolution: string | null; annotations: Marca[]; status: 'pendiente' | 'revision' | 'aprobado' | 'retirado'; approved_at: string | null;
}
export interface Ejercicio {
  id: string; department: DeptCode; slug: string | null; title: string; block: Bloque; objective: string | null;
  steps: string[]; key_points: string[]; errors: { error: string; correccion: string }[];
  kid_version: string | null; easier: string | null; harder: string | null; equipment: string | null;
  min_age: number; max_age: number; level_ids: string[]; minutes: number; dose: string | null;
  for_families: boolean; safety_note: string | null; status: 'borrador' | 'revision' | 'aprobado' | 'retirado';
  approved_at: string | null; is_example: boolean; created_by: string | null;
  exercise_videos?: VideoTecnica[];
}

export interface ItemRutina { exercise_id: string | null; titulo: string; dosis?: string | null; nota?: string | null }
export interface BloqueRutina { nombre: string; minutos: number; items: ItemRutina[] }
export type EstadoRutina = 'borrador' | 'revision' | 'aprobada' | 'devuelta' | 'archivada';
export interface Rutina {
  id: string; department: DeptCode; level_id: string | null; group_id: string | null; title: string;
  age_min: number | null; age_max: number | null; minutes: number; objective: string | null; blocks: BloqueRutina[];
  family_summary: string | null; home_task: string | null; source: 'manual' | 'ia' | 'demo'; ai_request: string | null;
  status: EstadoRutina; review_note: string | null; reviewed_by: string | null; reviewed_at: string | null;
  is_template: boolean; used_on: string[]; created_by: string | null; created_at: string; updated_at: string;
  autor?: { full_name: string } | null; revisor?: { full_name: string } | null; levels?: { name: string } | null;
}
export const ESTADO_RUTINA: Record<EstadoRutina, { label: string; tone: 'neutral' | 'warning' | 'success' | 'danger' | 'info' }> = {
  borrador: { label: 'Borrador', tone: 'neutral' },
  revision: { label: 'En revisión', tone: 'warning' },
  aprobada: { label: 'Aprobada', tone: 'success' },
  devuelta: { label: 'Devuelta con comentarios', tone: 'danger' },
  archivada: { label: 'Archivada', tone: 'neutral' },
};

export interface SemanaPrograma { semana: number; enfoque: string; habilidades?: string[]; ejercicios?: string[]; nota?: string }
export interface Programa {
  id: string; department: DeptCode; level_id: string | null; title: string; weeks: SemanaPrograma[]; notes: string | null;
  status: 'borrador' | 'aprobado' | 'archivado'; is_example: boolean; levels?: { name: string } | null;
}

export type TipoEvento = 'festival' | 'exhibicion' | 'torneo' | 'evaluacion' | 'clinica';
export const TIPO_EVENTO: Record<TipoEvento, string> = { festival: 'Festival', exhibicion: 'Exhibición', torneo: 'Torneo', evaluacion: 'Evaluación', clinica: 'Clínica' };
export interface Evento {
  id: string; department: DeptCode | null; title: string; kind: TipoEvento; starts_at: string; location: string | null;
  description: string | null; registration_until: string | null; fee: number; capacity: number | null; categories: string[];
  status: 'borrador' | 'abierto' | 'cerrado' | 'terminado' | 'cancelado'; event_entries?: { count: number }[];
}
export interface Inscripcion {
  id: string; event_id: string; member_id: string; category: string | null; heat: number | null; lane: number | null;
  result: string | null; place: number | null; medal: 'oro' | 'plata' | 'bronce' | 'participacion' | null; paid: boolean;
  members?: { first_name: string; last_name: string; birthdate: string | null } | null;
}
export const MEDALLA: Record<string, string> = { oro: '🥇 Oro', plata: '🥈 Plata', bronce: '🥉 Bronce', participacion: '🎖️ Participación' };

export const NIVEL_COACH = ['Inducción', 'Asistente', 'Coach titular', 'Coach senior', 'Mentor'];
export interface Curso {
  id: string; department: DeptCode | null; tier: number; title: string; description: string | null; minutes: number;
  required: boolean; validity_months: number | null; sort_order: number; active: boolean; is_example: boolean;
  lessons?: Leccion[];
}
export interface Pregunta { p: string; opciones: string[]; correcta: number; explica?: string }
export interface Leccion {
  id: string; course_id: string; title: string; kind: 'lectura' | 'video' | 'quiz' | 'que_esta_mal'; body: string | null;
  exercise_id: string | null; questions: Pregunta[]; minutes: number; sort_order: number;
}
export const CRITERIOS_OBS: { k: string; label: string }[] = [
  { k: 'puntualidad', label: 'Puntualidad y preparación' },
  { k: 'seguridad', label: 'Seguridad del grupo' },
  { k: 'tecnica', label: 'Corrección técnica' },
  { k: 'energia', label: 'Energía y motivación' },
  { k: 'grupo', label: 'Manejo de grupo' },
];
export const ESCALA_OBS = ['', 'Por mejorar', 'En desarrollo', 'Bien', 'Excelente'];

export interface PanelFormacion {
  coaches: { id: string; nombre: string; rol: string; areas: DeptCode[]; nivel: number | null; lecciones: number; obligatorias_pendientes: number;
    ultima_obs: string | null; promedio_obs: number | null; por_vencer: number }[];
  vencimientos: { nombre: string; certificado: string; vence: string }[];
  rutinas_por_revisar: number;
}

/** Texto guardado con saltos «\n» literales → saltos reales. */
export const parrafos = (s: string | null | undefined) => (s ?? '').replace(/\\n/g, '\n');

/**
 * Arma una rutina sin IA (modo de reserva y demostración): toma ejercicios aprobados de la biblioteca
 * que encajen con edad y área, reparte el tiempo por bloques y respeta el límite de carga por edad.
 */
export function rutinaPorReglas(opts: { ejercicios: Ejercicio[]; minutos: number; edadMin: number; edadMax: number; pedido: string; sinCargaMenoresDe: number }): {
  titulo: string; objetivo: string; bloques: BloqueRutina[]; resumen_familias: string; tarea_casa: string;
} {
  const { ejercicios, minutos, edadMin, edadMax, pedido } = opts;
  const aptos = ejercicios.filter((e) => e.status === 'aprobado' && e.min_age <= edadMax && e.max_age >= edadMin);
  const palabras = pedido.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9ñ]+/).filter((w) => w.length > 3);
  const score = (e: Ejercicio) => {
    const t = `${e.title} ${e.objective ?? ''} ${(e.key_points ?? []).join(' ')}`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    return palabras.reduce((n, w) => n + (t.includes(w) ? 1 : 0), 0);
  };
  const de = (b: Bloque) => aptos.filter((e) => e.block === b).sort((a, b2) => score(b2) - score(a));
  const quiereJuego = /juego|jugar|divert/.test(pedido.toLowerCase()) || edadMax <= 10;
  const reparto: [Bloque, number][] = [
    ['calentamiento', Math.round(minutos * 0.18)],
    ['principal', Math.round(minutos * (quiereJuego ? 0.55 : 0.67))],
    ...(quiereJuego ? [['juego', Math.round(minutos * 0.15)] as [Bloque, number]] : []),
    ['calma', 0],
  ];
  reparto[reparto.length - 1][1] = Math.max(3, minutos - reparto.slice(0, -1).reduce((s, [, m]) => s + m, 0));
  const bloques: BloqueRutina[] = reparto.map(([b, m]) => {
    const lista = de(b);
    const items: ItemRutina[] = [];
    let usado = 0;
    for (const e of lista) {
      if (usado >= m && items.length) break;
      items.push({ exercise_id: e.id, titulo: e.title, dosis: e.dose, nota: null });
      usado += e.minutes;
      if (b !== 'principal' && items.length >= 2) break;
      if (items.length >= 4) break;
    }
    return { nombre: BLOQUE_LABEL[b], minutos: m, items };
  });
  const principal = bloques[1]?.items[0]?.titulo ?? 'técnica';
  const fam = aptos.find((e) => e.for_families && e.block !== 'juego');
  return {
    titulo: pedido.trim() ? pedido.trim().slice(0, 70) : `Clase de ${principal.toLowerCase()}`,
    objetivo: `Trabajar ${principal.toLowerCase()} con buena técnica`,
    bloques,
    resumen_familias: `Esta semana trabajamos ${principal.toLowerCase()}. Pregúntale a tu hijo qué aprendió y celebra su esfuerzo.`,
    tarea_casa: fam ? `${fam.title}: ${fam.kid_version ?? fam.objective ?? ''}` : 'Platicar en casa qué fue lo más divertido de la clase.',
  };
}

export const edadTexto = (a: number | null, b: number | null) => (a == null ? '' : b == null || b >= 99 ? `${a}+ años` : `${a} a ${b} años`);
