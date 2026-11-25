-- Oberlicht · Reglas de negocio (funciones RPC llamadas desde la app)

-- Edad en años (con decimales) a una fecha dada
create or replace function public.age_at(b date, d date default current_date)
returns numeric language sql immutable as $$
  select case when b is null then null
              else round((extract(year from age(d, b)) + extract(month from age(d, b)) / 12.0)::numeric, 1) end
$$;

create or replace function public.today_mx()
returns date language sql stable as $$ select (now() at time zone 'America/Mexico_City')::date $$;

create or replace function public.setting(k text)
returns jsonb language sql stable security definer set search_path = public as $$
  select value from public.settings where key = k
$$;

-- ¿El usuario actual puede operar sobre este miembro? (recepción/dirección o titular de su familia)
create or replace function public.can_act_for_member(m uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_front_office()
      or exists (select 1 from public.members x join public.families f on f.id = x.family_id
                 where x.id = m and f.titular_profile_id = auth.uid())
$$;

-- Saldo pendiente de una familia y días de adeudo más antiguo
create or replace view public.family_balances with (security_invoker = true) as
select f.id as family_id,
       coalesce(sum(c.amount) filter (where c.status in ('pendiente','vencido')), 0)::numeric(10,2) as balance,
       min(c.due_date) filter (where c.status in ('pendiente','vencido')) as oldest_due,
       coalesce(public.today_mx() - min(c.due_date) filter (where c.status in ('pendiente','vencido')), 0) as days_overdue
from public.families f
left join public.charges c on c.family_id = f.id
group by f.id;

create or replace function public.family_is_blocked(fam uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select public.today_mx() - min(c.due_date) > coalesce((public.setting('cobranza')->>'dias_bloqueo_adeudo')::int, 10)
    from public.charges c where c.family_id = fam and c.status in ('pendiente','vencido')
  ), false)
$$;

-- Ocupación de grupos
create or replace view public.group_occupancy with (security_invoker = true) as
select g.id as group_id, g.name, g.capacity, l.department, l.id as level_id, l.name as level_name,
       l.min_age, l.max_age, g.weekdays, g.start_time, g.end_time, g.location, g.coach_id, g.cycle_id, g.active,
       count(e.id) filter (where e.status = 'activa')        as enrolled,
       count(e.id) filter (where e.status = 'lista_espera')  as waitlist,
       greatest(g.capacity - count(e.id) filter (where e.status = 'activa'), 0) as free_spots
from public.groups g
join public.levels l on l.id = g.level_id
left join public.enrollments e on e.group_id = g.id
group by g.id, l.id;

-- ─────────────────────────────────────────────────────────────
-- Inscripción por nivel y edad, con cupo y lista de espera
-- ─────────────────────────────────────────────────────────────
create or replace function public.inscribir(p_member uuid, p_group uuid, p_force boolean default false)
returns public.enrollments
language plpgsql security definer set search_path = public as $$
declare
  v_member  public.members;
  v_group   public.groups;
  v_level   public.levels;
  v_plan    public.plans;
  v_cycle   public.cycles;
  v_ref     date;
  v_age     numeric;
  v_active  int;
  v_status  text;
  v_disc    numeric := 0;
  v_sibling boolean;
  v_row     public.enrollments;
begin
  if not public.can_act_for_member(p_member) then
    raise exception 'No tienes permiso para inscribir a este alumno';
  end if;

  select * into v_member from public.members where id = p_member and active;
  if not found then raise exception 'Alumno no encontrado'; end if;

  select * into v_group from public.groups where id = p_group and active for update;
  if not found then raise exception 'Grupo no disponible'; end if;
  select * into v_level from public.levels where id = v_group.level_id;
  select * into v_plan  from public.plans  where id = v_group.plan_id;
  select * into v_cycle from public.cycles where id = v_group.cycle_id;

  -- La edad se calcula al inicio del ciclo (o hoy si el ciclo ya empezó)
  v_ref := greatest(coalesce(v_cycle.starts_on, public.today_mx()), public.today_mx());
  v_age := public.age_at(v_member.birthdate, v_ref);

  if v_member.birthdate is null then
    raise exception 'Falta la fecha de nacimiento del alumno';
  end if;
  if (v_age < v_level.min_age or v_age > v_level.max_age) and not (p_force and public.is_dept_coordinator(v_level.department)) then
    raise exception 'La edad del alumno (% años) no corresponde al nivel % (de % a % años)',
      v_age, v_level.name, v_level.min_age, v_level.max_age;
  end if;

  if v_level.department in ('natacion','ballet','gimnasia') and v_member.waiver_signed_at is null and v_member.is_titular = false then
    raise exception 'Falta firmar el deslinde de responsabilidad del menor';
  end if;

  if exists (select 1 from public.enrollments where member_id = p_member and group_id = p_group and status in ('activa','lista_espera','congelada')) then
    raise exception 'El alumno ya está inscrito o en lista de espera en este grupo';
  end if;

  select count(*) into v_active from public.enrollments where group_id = p_group and status = 'activa';
  v_status := case when v_active < v_group.capacity then 'activa' else 'lista_espera' end;

  -- Descuento por hermano: otro miembro de la familia con inscripción activa
  select exists (
    select 1 from public.enrollments e join public.members m on m.id = e.member_id
    where m.family_id = v_member.family_id and m.id <> v_member.id and e.status = 'activa'
  ) into v_sibling;
  if v_sibling then
    v_disc := coalesce((public.setting('cobranza')->>'descuento_hermano_pct')::numeric, 0);
  end if;

  insert into public.enrollments (member_id, group_id, status, monthly_price, discount_pct, created_by)
  values (p_member, p_group, v_status, coalesce(v_plan.price_monthly, 0), v_disc, auth.uid())
  returning * into v_row;

  -- Cargo de inscripción (solo si hay lugar)
  if v_status = 'activa' and coalesce(v_plan.enrollment_fee, 0) > 0 then
    with c as (
      insert into public.charges (family_id, concept, amount, due_date, created_by)
      values (v_member.family_id, 'Inscripción ' || v_level.name || ' · ' || v_member.first_name, v_plan.enrollment_fee, public.today_mx(), auth.uid())
      returning id
    )
    insert into public.charge_items (charge_id, member_id, department, description, amount)
    select c.id, v_member.id, v_level.department, 'Inscripción ' || v_level.name, v_plan.enrollment_fee from c;
  end if;

  insert into public.notifications (family_id, channel, template, subject, body)
  values (v_member.family_id, 'correo',
          case when v_status = 'activa' then 'inscripcion_confirmada' else 'lista_espera' end,
          case when v_status = 'activa' then 'Inscripción confirmada' else 'Lista de espera' end,
          v_member.first_name || ' · ' || v_level.name || ' · ' || v_group.name);

  return v_row;
end $$;

-- Baja, congelamiento y reactivación; libera lugar y avisa a lista de espera
create or replace function public.cambiar_estado_inscripcion(p_enrollment uuid, p_status text, p_notes text default null)
returns public.enrollments
language plpgsql security definer set search_path = public as $$
declare
  v_row  public.enrollments;
  v_next public.enrollments;
  v_cap  int;
  v_act  int;
begin
  if p_status not in ('activa','congelada','baja') then raise exception 'Estado no válido'; end if;
  select * into v_row from public.enrollments where id = p_enrollment for update;
  if not found then raise exception 'Inscripción no encontrada'; end if;
  if not (public.can_act_for_member(v_row.member_id) or public.is_dept_coordinator(public.group_department(v_row.group_id))) then
    raise exception 'No tienes permiso para cambiar esta inscripción';
  end if;

  update public.enrollments
     set status = p_status,
         ended_at = case when p_status = 'baja' then now() else null end,
         notes = coalesce(p_notes, notes)
   where id = p_enrollment returning * into v_row;

  -- Si se liberó lugar, promover al primero de la lista de espera
  if p_status in ('baja','congelada') then
    select capacity into v_cap from public.groups where id = v_row.group_id;
    select count(*) into v_act from public.enrollments where group_id = v_row.group_id and status = 'activa';
    if v_act < v_cap then
      select * into v_next from public.enrollments
       where group_id = v_row.group_id and status = 'lista_espera'
       order by enrolled_at limit 1 for update;
      if found then
        update public.enrollments set status = 'activa' where id = v_next.id;
        insert into public.notifications (family_id, channel, template, subject, body)
        select m.family_id, 'correo', 'lugar_liberado', '¡Se liberó un lugar!', m.first_name || ' ya tiene lugar en el grupo ' || g.name
        from public.members m, public.groups g where m.id = v_next.member_id and g.id = v_next.group_id;
      end if;
    end if;
  end if;
  return v_row;
end $$;

-- Cambio de grupo (mantiene reglas de edad y cupo)
create or replace function public.cambiar_grupo(p_enrollment uuid, p_new_group uuid)
returns public.enrollments
language plpgsql security definer set search_path = public as $$
declare v_old public.enrollments; v_new public.enrollments;
begin
  select * into v_old from public.enrollments where id = p_enrollment;
  if not found then raise exception 'Inscripción no encontrada'; end if;
  perform public.cambiar_estado_inscripcion(p_enrollment, 'baja', 'Cambio de grupo');
  v_new := public.inscribir(v_old.member_id, p_new_group, true);
  return v_new;
end $$;

-- Pase de nivel (coach o coordinación del departamento)
create or replace function public.subir_nivel(p_member uuid, p_level uuid, p_notes text default null)
returns public.level_history
language plpgsql security definer set search_path = public as $$
declare v_level public.levels; v_row public.level_history; v_fam uuid; v_name text;
begin
  select * into v_level from public.levels where id = p_level;
  if not found then raise exception 'Nivel no encontrado'; end if;
  if not (public.is_staff() and public.has_department(v_level.department)) then
    raise exception 'Solo el personal de % puede asignar niveles', v_level.department;
  end if;
  insert into public.level_history (member_id, department, level_id, decided_by, notes)
  values (p_member, v_level.department, p_level, auth.uid(), p_notes) returning * into v_row;

  select family_id, first_name into v_fam, v_name from public.members where id = p_member;
  insert into public.notifications (family_id, channel, template, subject, body)
  values (v_fam, 'correo', 'nuevo_nivel', '¡Nuevo nivel!', v_name || ' pasa a ' || v_level.name || '. Ya puedes reinscribirlo para el próximo ciclo.');
  return v_row;
end $$;

-- Nivel actual de un alumno en un departamento
create or replace function public.nivel_actual(p_member uuid, p_department text)
returns uuid language sql stable security definer set search_path = public as $$
  select level_id from public.level_history
   where member_id = p_member and department = p_department
   order by created_at desc limit 1
$$;

-- ─────────────────────────────────────────────────────────────
-- Asistencia por lista (un solo envío por grupo y día)
-- p_items: [{"member_id": "...", "status": "presente"}, ...]
-- ─────────────────────────────────────────────────────────────
create or replace function public.pasar_asistencia(p_group uuid, p_date date, p_items jsonb)
returns int
language plpgsql security definer set search_path = public as $$
declare v_dep text; v_n int := 0; it jsonb;
begin
  v_dep := public.group_department(p_group);
  if not (public.is_front_office() or public.has_department(v_dep)) then
    raise exception 'No tienes permiso para pasar asistencia en este grupo';
  end if;
  for it in select * from jsonb_array_elements(p_items) loop
    insert into public.attendance (member_id, group_id, department, date, status, recorded_by)
    values ((it->>'member_id')::uuid, p_group, v_dep, p_date, coalesce(it->>'status','presente'), auth.uid())
    on conflict (member_id, coalesce(group_id, '00000000-0000-0000-0000-000000000000'::uuid), date)
    do update set status = excluded.status, recorded_by = excluded.recorded_by, recorded_at = now();
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- Registro rápido de entrada en recepción (sin grupo)
create or replace function public.registrar_entrada(p_member uuid, p_department text)
returns public.attendance
language plpgsql security definer set search_path = public as $$
declare v_row public.attendance; v_fam uuid;
begin
  if not public.is_front_office() and not public.has_department(p_department) then
    raise exception 'No tienes permiso para registrar entradas';
  end if;
  select family_id into v_fam from public.members where id = p_member;
  insert into public.attendance (member_id, group_id, department, date, status, recorded_by)
  values (p_member, null, p_department, public.today_mx(), 'presente', auth.uid())
  on conflict (member_id, coalesce(group_id, '00000000-0000-0000-0000-000000000000'::uuid), date)
  do update set recorded_at = now()
  returning * into v_row;
  return v_row;
end $$;

-- ─────────────────────────────────────────────────────────────
-- Reservas
-- ─────────────────────────────────────────────────────────────
create or replace function public.reservar(p_slot uuid, p_member uuid)
returns public.bookings
language plpgsql security definer set search_path = public as $$
declare
  v_slot public.slots; v_taken int; v_fam uuid; v_ms public.memberships; v_row public.bookings; v_used boolean := false;
begin
  if not public.can_act_for_member(p_member) then raise exception 'No tienes permiso para reservar por este socio'; end if;
  select * into v_slot from public.slots where id = p_slot for update;
  if not found or v_slot.cancelled then raise exception 'Horario no disponible'; end if;
  if v_slot.starts_at < now() then raise exception 'Este horario ya pasó'; end if;

  select family_id into v_fam from public.members where id = p_member;
  if public.family_is_blocked(v_fam) and not public.is_front_office() then
    raise exception 'Hay un adeudo pendiente. Pasa a recepción o paga en línea para reservar.';
  end if;

  select count(*) into v_taken from public.bookings where slot_id = p_slot and status <> 'cancelada';
  if v_taken >= v_slot.capacity then raise exception 'Ya no hay lugares en este horario'; end if;

  -- Descontar de la bolsa de sesiones si tiene membresía del área con sesiones
  select ms.* into v_ms from public.memberships ms join public.plans p on p.id = ms.plan_id
   where ms.member_id = p_member and ms.status = 'activa' and p.department = v_slot.department
     and ms.sessions_remaining is not null and ms.sessions_remaining > 0
   order by ms.created_at limit 1 for update of ms;
  if found then
    update public.memberships set sessions_remaining = sessions_remaining - 1 where id = v_ms.id;
    v_used := true;
  end if;

  insert into public.bookings (slot_id, member_id, used_session, membership_id, created_by)
  values (p_slot, p_member, v_used, case when v_used then v_ms.id end, auth.uid())
  returning * into v_row;

  -- Sesión con costo y sin bolsa: generar cargo
  if not v_used and v_slot.price > 0 then
    with c as (
      insert into public.charges (family_id, concept, amount, due_date, created_by)
      values (v_fam, v_slot.title || ' · ' || to_char(v_slot.starts_at at time zone 'America/Mexico_City', 'DD/MM HH24:MI'), v_slot.price, public.today_mx(), auth.uid())
      returning id
    )
    insert into public.charge_items (charge_id, member_id, department, description, amount)
    select c.id, p_member, v_slot.department, v_slot.title, v_slot.price from c;
  end if;
  return v_row;
end $$;

create or replace function public.cancelar_reserva(p_booking uuid)
returns public.bookings
language plpgsql security definer set search_path = public as $$
declare v_b public.bookings; v_slot public.slots; v_hours int; v_on_time boolean;
begin
  select * into v_b from public.bookings where id = p_booking for update;
  if not found or v_b.status = 'cancelada' then raise exception 'Reserva no encontrada'; end if;
  if not public.can_act_for_member(v_b.member_id) and not public.is_staff() then raise exception 'Sin permiso'; end if;
  select * into v_slot from public.slots where id = v_b.slot_id;
  v_hours := coalesce((public.setting('reservas')->>'horas_cancelacion')::int, 12);
  v_on_time := v_slot.starts_at - now() >= make_interval(hours => v_hours);

  update public.bookings set status = 'cancelada', cancelled_at = now() where id = p_booking returning * into v_b;
  if v_b.used_session and (v_on_time or public.is_staff()) then
    update public.memberships set sessions_remaining = sessions_remaining + 1 where id = v_b.membership_id;
  end if;
  return v_b;
end $$;

-- ─────────────────────────────────────────────────────────────
-- Cobranza
-- ─────────────────────────────────────────────────────────────

-- Registrar un pago en recepción (o confirmado por el procesador)
create or replace function public.registrar_pago(
  p_family uuid, p_amount numeric, p_method text, p_charge uuid default null, p_reference text default null, p_notes text default null
) returns public.payments
language plpgsql security definer set search_path = public as $$
declare v_pay public.payments; v_fam public.families; v_left numeric := p_amount; c record;
begin
  if not public.is_front_office() then raise exception 'Solo recepción o administración registran pagos'; end if;
  select * into v_fam from public.families where id = p_family;
  if not found then raise exception 'Familia no encontrada'; end if;

  insert into public.payments (family_id, charge_id, amount, method, reference, notes, received_by)
  values (p_family, p_charge, p_amount, p_method, p_reference, p_notes, auth.uid())
  returning * into v_pay;

  -- Aplicar el pago: al cargo indicado o a los más antiguos
  for c in
    select id, amount from public.charges
     where family_id = p_family and status in ('pendiente','vencido')
       and (p_charge is null or id = p_charge)
     order by due_date, created_at
  loop
    continue when v_left < c.amount;  -- aplica a los cargos que alcance a cubrir completos
    update public.charges set status = 'pagado', paid_at = now() where id = c.id;
    v_left := v_left - c.amount;
  end loop;

  -- CFDI: individual si la familia pidió factura; si no, entra a la factura global del mes
  insert into public.invoices (family_id, payment_id, kind, period, total, receptor_rfc, receptor_nombre, uso_cfdi, status)
  values (p_family, v_pay.id,
          case when v_fam.wants_invoice and v_fam.rfc is not null then 'individual' else 'global' end,
          to_char(public.today_mx(), 'YYYY-MM'),
          p_amount,
          case when v_fam.wants_invoice then v_fam.rfc else 'XAXX010101000' end,
          case when v_fam.wants_invoice then v_fam.razon_social else 'PUBLICO EN GENERAL' end,
          case when v_fam.wants_invoice then v_fam.uso_cfdi else 'S01' end,
          'pendiente');

  if public.family_is_blocked(p_family) = false then
    update public.families set status = 'activa' where id = p_family and status = 'bloqueada';
  end if;
  return v_pay;
end $$;

-- Genera las mensualidades de un periodo ('AAAA-MM'): un cargo por familia con todos sus miembros
create or replace function public.generar_mensualidades(p_period text)
returns int
language plpgsql security definer set search_path = public as $$
declare v_n int := 0; f record; v_charge uuid; v_due date; v_total numeric;
begin
  if not public.is_front_office() then raise exception 'Sin permiso para generar mensualidades'; end if;
  v_due := to_date(p_period || '-' || lpad(coalesce((public.setting('cobranza')->>'dia_corte'),'1'), 2, '0'), 'YYYY-MM-DD');

  for f in
    select distinct m.family_id from public.members m
    where m.active and (
      exists (select 1 from public.enrollments e where e.member_id = m.id and e.status = 'activa')
      or exists (select 1 from public.memberships ms where ms.member_id = m.id and ms.status = 'activa')
    )
    and not exists (select 1 from public.charges c where c.family_id = m.family_id and c.period = p_period and c.status <> 'cancelado')
  loop
    insert into public.charges (family_id, period, concept, amount, due_date, created_by)
    values (f.family_id, p_period, 'Mensualidad ' || p_period, 0, v_due, auth.uid())
    returning id into v_charge;

    insert into public.charge_items (charge_id, member_id, department, description, amount)
    select v_charge, m.id, l.department,
           m.first_name || ' · ' || l.name || ' (' || g.name || ')',
           round(e.monthly_price * (1 - e.discount_pct / 100.0), 2)
    from public.enrollments e
    join public.members m on m.id = e.member_id
    join public.groups g on g.id = e.group_id
    join public.levels l on l.id = g.level_id
    where m.family_id = f.family_id and e.status = 'activa' and e.monthly_price > 0;

    insert into public.charge_items (charge_id, member_id, department, description, amount)
    select v_charge, m.id, p.department, m.first_name || ' · ' || p.name,
           round(ms.monthly_price * (1 - ms.discount_pct / 100.0), 2)
    from public.memberships ms
    join public.members m on m.id = ms.member_id
    join public.plans p on p.id = ms.plan_id
    where m.family_id = f.family_id and ms.status = 'activa' and ms.monthly_price > 0;

    -- Reponer bolsas de sesiones del mes
    update public.memberships ms set sessions_remaining = p.sessions_per_month
      from public.plans p, public.members m
     where p.id = ms.plan_id and m.id = ms.member_id and m.family_id = f.family_id
       and ms.status = 'activa' and p.sessions_per_month is not null;

    select coalesce(sum(amount), 0) into v_total from public.charge_items where charge_id = v_charge;
    if v_total = 0 then
      delete from public.charges where id = v_charge;
    else
      update public.charges set amount = v_total where id = v_charge;
      insert into public.notifications (family_id, channel, template, subject, body)
      values (f.family_id, 'correo', 'mensualidad', 'Tu mensualidad de ' || p_period, 'Total: $' || to_char(v_total, 'FM999,999,990.00') || ' MXN');
      v_n := v_n + 1;
    end if;
  end loop;

  -- Marcar vencidos
  update public.charges set status = 'vencido' where status = 'pendiente' and due_date < public.today_mx();
  return v_n;
end $$;

-- ─────────────────────────────────────────────────────────────
-- Consola central: indicadores del día
-- ─────────────────────────────────────────────────────────────
create or replace function public.kpis_consola()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v jsonb; d date := public.today_mx();
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
    'cobrado_hoy',      (select coalesce(sum(amount),0) from public.payments where status = 'aprobado' and (paid_at at time zone 'America/Mexico_City')::date = d),
    'cobrado_mes',      (select coalesce(sum(amount),0) from public.payments where status = 'aprobado' and paid_at >= date_trunc('month', d)),
    'por_cobrar',       (select coalesce(sum(amount),0) from public.charges where status in ('pendiente','vencido')),
    'vencido',          (select coalesce(sum(amount),0) from public.charges where status = 'vencido'),
    'familias_adeudo',  (select count(distinct family_id) from public.charges where status = 'vencido'),
    'ocupacion_pct',    (select case when sum(capacity) = 0 then 0 else round(100.0 * sum(enrolled) / sum(capacity)) end
                           from public.group_occupancy where active),
    'facturas_pendientes', (select count(*) from public.invoices where status = 'pendiente' and kind = 'individual')
  ) into v;
  return v;
end $$;

-- Ingresos por área en un rango (para consola y reportes)
create or replace function public.ingresos_por_area(p_from date, p_to date)
returns table(department text, total numeric)
language sql stable security definer set search_path = public as $$
  select coalesce(ci.department, 'otros') as department, sum(ci.amount)::numeric as total
  from public.charges c
  join public.charge_items ci on ci.charge_id = c.id
  where public.is_front_office()
    and c.status = 'pagado'
    and (c.paid_at at time zone 'America/Mexico_City')::date between p_from and p_to
  group by 1
  order by 2 desc
$$;

-- Serie diaria de cobros (últimos N días)
create or replace function public.cobros_diarios(p_days int default 30)
returns table(day date, total numeric)
language sql stable security definer set search_path = public as $$
  select d::date, coalesce(sum(p.amount), 0)::numeric
  from generate_series(public.today_mx() - (p_days - 1), public.today_mx(), interval '1 day') d
  left join public.payments p on (p.paid_at at time zone 'America/Mexico_City')::date = d::date and p.status = 'aprobado'
  where public.is_front_office()
  group by d order by d
$$;

-- Agenda del coach para un día
create or replace function public.mi_agenda(p_date date default null)
returns table(kind text, ref_id uuid, title text, department text, starts time, ends time, location text, people int, capacity int)
language sql stable security definer set search_path = public as $$
  with d as (select coalesce(p_date, public.today_mx()) as day)
  select 'grupo', g.id, l.name || ' · ' || g.name, l.department, g.start_time, g.end_time, g.location,
         (select count(*)::int from public.enrollments e where e.group_id = g.id and e.status = 'activa'), g.capacity
  from public.groups g join public.levels l on l.id = g.level_id, d
  where g.active and g.coach_id = auth.uid() and extract(isodow from d.day)::int = any(g.weekdays)
  union all
  select 'reserva', s.id, s.title, s.department,
         (s.starts_at at time zone 'America/Mexico_City')::time, (s.ends_at at time zone 'America/Mexico_City')::time, s.location,
         (select count(*)::int from public.bookings b where b.slot_id = s.id and b.status <> 'cancelada'), s.capacity
  from public.slots s, d
  where s.coach_id = auth.uid() and not s.cancelled and (s.starts_at at time zone 'America/Mexico_City')::date = d.day
  order by 5
$$;

-- Permisos de ejecución: solo usuarios con sesión
do $$
declare f text;
begin
  foreach f in array array[
    'inscribir(uuid, uuid, boolean)', 'cambiar_estado_inscripcion(uuid, text, text)', 'cambiar_grupo(uuid, uuid)',
    'subir_nivel(uuid, uuid, text)', 'pasar_asistencia(uuid, date, jsonb)', 'registrar_entrada(uuid, text)',
    'reservar(uuid, uuid)', 'cancelar_reserva(uuid)', 'registrar_pago(uuid, numeric, text, uuid, text, text)',
    'generar_mensualidades(text)', 'kpis_consola()', 'ingresos_por_area(date, date)', 'cobros_diarios(int)', 'mi_agenda(date)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
