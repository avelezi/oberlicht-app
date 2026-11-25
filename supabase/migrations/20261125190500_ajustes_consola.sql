-- Ajustes tras construir la interfaz:
-- 1) group_occupancy expone plan_id (para mostrar precio al inscribir).
-- 2) kpis_consola solo entrega cifras de dinero a Recepción, Administración y Dirección.

create or replace view public.group_occupancy with (security_invoker = true) as
select g.id as group_id, g.name, g.capacity, l.department, l.id as level_id, l.name as level_name,
       l.min_age, l.max_age, g.weekdays, g.start_time, g.end_time, g.location, g.coach_id, g.cycle_id, g.active,
       count(e.id) filter (where e.status = 'activa')        as enrolled,
       count(e.id) filter (where e.status = 'lista_espera')  as waitlist,
       greatest(g.capacity - count(e.id) filter (where e.status = 'activa'), 0) as free_spots,
       g.plan_id
from public.groups g
join public.levels l on l.id = g.level_id
left join public.enrollments e on e.group_id = g.id
group by g.id, l.id;

create or replace function public.kpis_consola()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v jsonb; d date := public.today_mx(); money boolean := public.is_front_office();
begin
  if not public.is_staff() then raise exception 'Solo personal'; end if;
  select jsonb_build_object(
    'familias_activas', (select count(*) from public.families where status <> 'inactiva'),
    'alumnos_activos',  (select count(distinct member_id) from public.enrollments where status = 'activa')
                      + (select count(distinct member_id) from public.memberships where status = 'activa'
                           and member_id not in (select member_id from public.enrollments where status = 'activa')),
    'inscripciones_mes', (select count(*) from public.enrollments where enrolled_at >= date_trunc('month', d)),
    'lista_espera',     (select count(*) from public.enrollments where status = 'lista_espera'),
    'asistencias_hoy',  (select count(*) from public.attendance where date = d and status in ('presente','retardo')),
    'reservas_hoy',     (select count(*) from public.bookings b join public.slots s on s.id = b.slot_id
                          where (s.starts_at at time zone 'America/Mexico_City')::date = d and b.status <> 'cancelada'),
    'cobrado_hoy',      case when money then (select coalesce(sum(amount),0) from public.payments where status = 'aprobado' and (paid_at at time zone 'America/Mexico_City')::date = d) else 0 end,
    'cobrado_mes',      case when money then (select coalesce(sum(amount),0) from public.payments where status = 'aprobado' and paid_at >= date_trunc('month', d)) else 0 end,
    'por_cobrar',       case when money then (select coalesce(sum(amount),0) from public.charges where status in ('pendiente','vencido')) else 0 end,
    'vencido',          case when money then (select coalesce(sum(amount),0) from public.charges where status = 'vencido') else 0 end,
    'familias_adeudo',  case when money then (select count(distinct family_id) from public.charges where status = 'vencido') else 0 end,
    'ocupacion_pct',    (select case when sum(capacity) = 0 then 0 else round(100.0 * sum(enrolled) / sum(capacity)) end
                           from public.group_occupancy where active),
    'facturas_pendientes', case when money then (select count(*) from public.invoices where status = 'pendiente' and kind = 'individual') else 0 end
  ) into v;
  return v;
end $$;
