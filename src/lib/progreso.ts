// Progreso y retos (tipo Strava): constancia, rachas semanales, medallas, retos del club y aplausos.
// Todo se calcula en Supabase con los datos que ya existen (entradas, asistencia, reposiciones, habilidades).

export type Categoria = 'infantil' | 'juvenil' | 'adultos';
export const CATEGORIA_LABEL: Record<Categoria, string> = { infantil: 'Infantil (hasta 12)', juvenil: 'Juvenil (13 a 17)', adultos: 'Adultos' };
export const CATEGORIA_CORTA: Record<Categoria, string> = { infantil: 'Infantil', juvenil: 'Juvenil', adultos: 'Adultos' };

export type EstadoSemana = 'cumplida' | 'en_curso' | 'protegida' | 'sin_meta';
export interface Semana { semana: string; dias: number; estado: EstadoSemana }

export interface Medalla {
  k: string; tipo: 'visitas' | 'racha' | 'antiguedad' | 'habilidades' | 'nivel'; titulo: string; desc: string;
  meta: number; progreso: number; logrado: boolean; fecha: string | null;
}

export type RetoTipo = 'dias' | 'semanas' | 'habilidades';
export const RETO_TIPO: Record<RetoTipo, { label: string; unidad: (n: number) => string }> = {
  dias: { label: 'Días con actividad', unidad: (n) => (n === 1 ? 'día' : 'días') },
  semanas: { label: 'Semanas cumpliendo la meta', unidad: (n) => (n === 1 ? 'semana' : 'semanas') },
  habilidades: { label: 'Habilidades logradas', unidad: (n) => (n === 1 ? 'habilidad' : 'habilidades') },
};

export interface MiReto { id: string; titulo: string; tipo: RetoTipo; meta: number; termina: string; avance: number; colectivo: boolean }

export interface MiProgreso {
  member_id: string; nombre: string; nombre_publico: string; categoria: Categoria; menor: boolean;
  inscrito: boolean; privado: boolean; publico: boolean; permiso_tutor: string | null; meta_semanal: number;
  racha: number; racha_mejor: number; semana_dias: number; semanas: Semana[];
  dias_total: number; dias_mes: number; dias_mes_anterior: number; meses: { mes: string; dias: number }[];
  habilidades: number; certificados: number; medallas: Medalla[]; aplausos: Partial<Record<Kudo, number>>; retos: MiReto[];
}

export interface RetoClub {
  id: string; titulo: string; descripcion: string | null; tipo: RetoTipo; meta: number; area: string | null; colectivo: boolean;
  inicia: string; termina: string; premio: string | null; participantes: number; completados: number;
  avance_club: number | null; inscrito: boolean; avance: number | null;
}

export interface Challenge {
  id: string; title: string; description: string | null; kind: RetoTipo; target: number; department: string | null; collective: boolean;
  starts_on: string; ends_on: string; reward: string | null; active: boolean; created_by: string | null; created_at: string;
}

export interface FilaReto { pos: number; member_id: string; nombre: string; categoria: Categoria; avance: number; meta: number; completado: boolean; mia: boolean }
export interface FilaConstancia { pos: number; member_id: string; nombre: string; categoria: Categoria; dias: number; racha: number; mia: boolean }

export type Kudo = 'aplauso' | 'fuego' | 'fuerza' | 'estrella';
export const KUDOS: { k: Kudo; emoji: string; label: string }[] = [
  { k: 'aplauso', emoji: '👏', label: 'Aplauso' },
  { k: 'fuego', emoji: '🔥', label: 'Fuego' },
  { k: 'fuerza', emoji: '💪', label: 'Fuerza' },
  { k: 'estrella', emoji: '⭐', label: 'Estrella' },
];

export interface PanelProgreso {
  participantes: number; publico: number; solo_privado: number; activos_totales: number; dias_mes_participantes: number | null;
  rachas_en_riesgo: { member_id: string; family_id: string; nombre: string; telefono: string | null; racha: number; semana_dias: number; meta: number }[];
  por_medalla: { member_id: string; family_id: string; nombre: string; medalla: string; faltan: number }[];
  mejores_rachas: { member_id: string; family_id: string; nombre: string; racha: number; mes: number }[];
  retos: RetoClub[];
}

/** Estado de un reto según hoy (CDMX). */
export function retoEstado(r: { inicia: string; termina: string }, hoy: string): 'proximo' | 'activo' | 'terminado' {
  if (hoy < r.inicia) return 'proximo';
  if (hoy > r.termina) return 'terminado';
  return 'activo';
}

export function semanas(n: number) { return `${n} ${n === 1 ? 'semana' : 'semanas'}`; }
export function dias(n: number) { return `${n} ${n === 1 ? 'día' : 'días'}`; }
