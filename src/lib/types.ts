// Tipos de la base de datos de Oberlicht (espejo de supabase/migrations).

export type AppRole = 'direccion' | 'administracion' | 'recepcion' | 'coordinador' | 'coach' | 'ventas' | 'mantenimiento' | 'titular';

export type DeptCode =
  | 'direccion' | 'administracion' | 'recepcion'
  | 'natacion' | 'oberfit' | 'ballet' | 'gimnasia' | 'terapia' | 'nutricion' | 'cafeteria' | 'tienda' | 'mantenimiento';

export interface Department { code: DeptCode; name: string; is_area: boolean; color: string | null; sort_order: number }

export interface Profile {
  id: string; full_name: string; email: string | null; phone: string | null;
  role: AppRole; active: boolean; avatar_url: string | null; created_at: string;
}

export interface Family {
  id: string; number: number; name: string; titular_profile_id: string | null;
  email: string | null; phone: string | null; address: string | null;
  rfc: string | null; razon_social: string | null; regimen_fiscal: string | null; cp_fiscal: string | null;
  uso_cfdi: string | null; wants_invoice: boolean;
  card_last4: string | null; card_brand: string | null;
  status: 'activa' | 'inactiva' | 'bloqueada'; notes: string | null; created_at: string;
  member_since?: string | null; external_id?: string | null;
}

export interface Member {
  id: string; family_id: string; first_name: string; last_name: string; birthdate: string | null;
  gender: 'F' | 'M' | 'X' | null; is_titular: boolean; email: string | null; phone: string | null;
  allergies: string | null; medical_notes: string | null; emergency_name: string | null; emergency_phone: string | null;
  waiver_signed_at: string | null; waiver_signed_by: string | null; photo_url: string | null; active: boolean;
  member_since?: string | null; external_id?: string | null; created_at?: string;
}

export interface Plan {
  id: string; department: DeptCode; name: string; description: string | null;
  kind: 'curso' | 'membresia' | 'paquete'; price_monthly: number; enrollment_fee: number;
  sessions_per_month: number | null; classes_per_week: number | null; active: boolean;
}

export interface Level {
  id: string; department: DeptCode; name: string; description: string | null;
  sort_order: number; min_age: number; max_age: number; active: boolean;
}

export interface Cycle { id: string; department: DeptCode; name: string; starts_on: string; ends_on: string; is_current: boolean }

export interface Group {
  id: string; level_id: string; cycle_id: string | null; plan_id: string | null; name: string;
  coach_id: string | null; weekdays: number[]; start_time: string; end_time: string;
  capacity: number; location: string | null; active: boolean;
}

export interface GroupOccupancy {
  group_id: string; name: string; capacity: number; department: DeptCode; level_id: string; level_name: string;
  min_age: number; max_age: number; weekdays: number[]; start_time: string; end_time: string;
  location: string | null; coach_id: string | null; cycle_id: string | null; active: boolean;
  enrolled: number; waitlist: number; free_spots: number; plan_id: string | null;
}

export type EnrollmentStatus = 'activa' | 'lista_espera' | 'congelada' | 'baja';
export interface Enrollment {
  id: string; member_id: string; group_id: string; status: EnrollmentStatus;
  monthly_price: number; discount_pct: number; enrolled_at: string; ended_at: string | null; notes: string | null;
  freeze_until?: string | null; queue_at?: string | null;
}

export interface Membership {
  id: string; member_id: string; plan_id: string; status: 'activa' | 'congelada' | 'baja';
  starts_on: string; ends_on: string | null; monthly_price: number; discount_pct: number; sessions_remaining: number | null;
}

export interface Slot {
  id: string; department: DeptCode; title: string; kind: 'clase' | 'privada' | 'espacio';
  coach_id: string | null; starts_at: string; ends_at: string; capacity: number; price: number;
  location: string | null; cancelled: boolean;
}

export interface Booking {
  id: string; slot_id: string; member_id: string; status: 'reservada' | 'cancelada' | 'asistio' | 'no_asistio';
  used_session: boolean; created_at: string;
}

export interface Attendance {
  id: string; member_id: string; group_id: string | null; department: DeptCode; date: string;
  status: 'presente' | 'ausente' | 'retardo' | 'justificada'; recorded_at: string;
}

export interface Charge {
  id: string; family_id: string; period: string | null; concept: string; amount: number; due_date: string;
  status: 'pendiente' | 'pagado' | 'vencido' | 'cancelado'; paid_at: string | null; created_at: string;
}
export interface ChargeItem { id: string; charge_id: string; member_id: string | null; department: DeptCode | null; description: string; amount: number }

export interface Payment {
  id: string; family_id: string; charge_id: string | null; amount: number;
  method: 'efectivo' | 'tarjeta' | 'terminal' | 'transferencia' | 'liga';
  status: 'aprobado' | 'rechazado' | 'reembolsado' | 'pendiente'; reference: string | null; paid_at: string; notes: string | null;
}

export interface Invoice {
  id: string; family_id: string | null; payment_id: string | null; kind: 'individual' | 'global'; period: string | null;
  serie: string | null; folio: number | null; uuid_sat: string | null; total: number;
  receptor_rfc: string | null; receptor_nombre: string | null; uso_cfdi: string | null;
  status: 'pendiente' | 'timbrada' | 'cancelada' | 'error'; pdf_url: string | null; xml_url: string | null;
  error_message: string | null; cancel_reason: string | null; issued_at: string | null; created_at: string;
}

export interface Announcement {
  id: string; title: string; body: string; department: DeptCode | null;
  audience: 'todos' | 'personal' | 'familias'; starts_on: string; ends_on: string | null; created_at: string;
}

export interface Kpis {
  familias_activas: number; alumnos_activos: number; inscripciones_mes: number; lista_espera: number;
  asistencias_hoy: number; reservas_hoy: number; cobrado_hoy: number; cobrado_mes: number;
  por_cobrar: number; vencido: number; familias_adeudo: number; ocupacion_pct: number; facturas_pendientes: number;
}

export interface AgendaItem {
  kind: 'grupo' | 'reserva'; ref_id: string; title: string; department: DeptCode;
  starts: string; ends: string; location: string | null; people: number; capacity: number;
}

export interface FamilyBalance { family_id: string; balance: number; oldest_due: string | null; days_overdue: number }
