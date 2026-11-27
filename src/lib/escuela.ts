import { supabase } from './supabase';
import { todayMx } from './format';

// Tipos y utilidades de escuela y retención (habilidades, reposiciones, lista de espera, bajas, prospectos y riesgo).

export type SkillStatus = 'sin_iniciar' | 'en_proceso' | 'lograda';
export interface Skill { id: string; level_id: string; name: string; description: string | null; sort_order: number; active: boolean; is_example: boolean }
export interface SkillProgress { member_id: string; skill_id: string; status: SkillStatus; note: string | null; evaluated_at: string; achieved_at: string | null }
export interface ReportCard {
  id: string; member_id: string; level_id: string; department: string; group_id: string | null; title: string; comment: string | null;
  skills: { name: string; status: SkillStatus; note: string | null }[]; achieved: number; total: number; attendance_pct: number | null;
  created_by: string | null; created_at: string;
}
export interface Certificate { id: string; folio: number; member_id: string; level_id: string; department: string; next_level_id: string | null; notes: string | null; issued_by: string | null; issued_at: string }

export const SKILL_LABEL: Record<SkillStatus, string> = { sin_iniciar: 'Sin iniciar', en_proceso: 'En proceso', lograda: 'Lograda' };
export const SKILL_NEXT: Record<SkillStatus, SkillStatus> = { sin_iniciar: 'en_proceso', en_proceso: 'lograda', lograda: 'sin_iniciar' };

export interface MakeupCredit {
  id: string; member_id: string; enrollment_id: string | null; level_id: string; department: string; missed_group_id: string | null;
  missed_date: string; reason: string | null; expires_on: string; status: 'disponible' | 'agendada' | 'usada' | 'vencida' | 'cancelada';
  used_group_id: string | null; used_date: string | null; created_at: string;
}
export interface MakeupOption { group_id: string; fecha: string; hora_inicio: string; hora_fin: string; ubicacion: string | null; nivel: string; grupo: string; libres: number }

export interface WaitlistOffer { id: string; enrollment_id: string; group_id: string; member_id: string; status: 'pendiente' | 'aceptada' | 'rechazada' | 'vencida'; offered_at: string; expires_at: string }

export type LeadStatus = 'nuevo' | 'contactado' | 'prueba_agendada' | 'prueba_hecha' | 'inscrito' | 'perdido';
export interface Lead {
  id: string; name: string; phone: string | null; email: string | null; child_name: string | null; child_birthdate: string | null;
  department: string | null; source: string; status: LeadStatus; trial_group_id: string | null; trial_date: string | null;
  trial_attended: boolean | null; next_follow_up: string | null; attempts: number; assigned_to: string | null; family_id: string | null;
  lost_reason: string | null; notes: string | null; created_at: string; updated_at: string;
}
export interface LeadActivity { id: string; lead_id: string; kind: string; body: string | null; created_by: string | null; created_at: string }
export const LEAD_STATUS: Record<LeadStatus, { label: string; tone: 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info' }> = {
  nuevo: { label: 'Nuevo', tone: 'info' },
  contactado: { label: 'Contactado', tone: 'neutral' },
  prueba_agendada: { label: 'Prueba agendada', tone: 'brand' },
  prueba_hecha: { label: 'Ya hizo prueba', tone: 'warning' },
  inscrito: { label: 'Inscrito', tone: 'success' },
  perdido: { label: 'Perdido', tone: 'danger' },
};
export const LEAD_SOURCES: Record<string, string> = {
  visita: 'Visita al club', whatsapp: 'WhatsApp', telefono: 'Teléfono', redes: 'Redes sociales', referido: 'Recomendación', web: 'Formulario web', otro: 'Otro',
};

export interface RiskFactor { k: string; p: number; t: string }
export interface RiskRow {
  member_id: string; family_id: string; nombre: string; familia: string; telefono: string | null; area: string | null; edad: number | null;
  ultima_visita: string | null; puntaje: number; nivel: 'alto' | 'medio' | 'bajo'; factores: RiskFactor[]; accion: string; coach_id: string | null;
}
export interface ChurnAction {
  id: string; member_id: string; family_id: string | null; department: string | null; score: number; factors: RiskFactor[];
  action: string; status: 'pendiente' | 'hecha' | 'descartada'; due_on: string; assigned_to: string | null; result: string | null;
  created_at: string; done_at: string | null;
}
export const ACTION_LABEL: Record<string, string> = {
  whatsapp: 'Mandar «te extrañamos»',
  llamada_cobranza: 'Llamar por el adeudo',
  llamada_bienvenida: 'Llamada de bienvenida',
  boleta_coach: 'Boleta o nota del coach',
  llamada_regreso: 'Invitar a regresar',
  oferta_retencion: 'Ofrecer plan para quedarse',
  llamada_satisfaccion: 'Llamar por su calificación baja',
};

export const BAJA_MOTIVOS = [
  'Horario', 'Precio', 'Cambio de casa o escuela', 'Salud o lesión', 'No avanza o no le gusta', 'Vacaciones o viaje', 'Otro',
];

/** Próximas fechas (AAAA-MM-DD) en que un grupo tiene clase, desde hoy. */
export function nextClassDates(weekdays: number[], count = 6, from = todayMx()): string[] {
  const out: string[] = [];
  const d = new Date(from + 'T12:00:00');
  for (let i = 0; i < 60 && out.length < count; i++) {
    const dow = ((d.getDay() + 6) % 7) + 1;
    if (weekdays.includes(dow)) out.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

/** Tiempo restante legible ("23 h", "2 días"). */
export function timeLeft(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 'vencido';
  const h = Math.floor(ms / 36e5);
  if (h < 1) return `${Math.max(1, Math.round(ms / 6e4))} min`;
  if (h < 48) return `${h} h`;
  return `${Math.round(h / 24)} días`;
}

/** Corre la rutina diaria (ofertas de lugar, vencimientos y acciones de riesgo) como máximo una vez por hora. */
export async function rutinaDiaria() {
  const key = 'ob-rutina-' + new Date().toISOString().slice(0, 13);
  try { if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, '1'); } catch { /* sin almacenamiento */ }
  await supabase.rpc('rutina_diaria');
}
