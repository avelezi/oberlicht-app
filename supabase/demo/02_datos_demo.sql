-- ════════════════════════════════════════════════════════════════════
-- Datos de DEMOSTRACIÓN para Oberlicht. Todo es ficticio.
--
-- Orden:  01_personal_demo.sql  →  02_datos_demo.sql
-- Borrar: 99_borrar_demo.sql (quita exactamente lo que se cargó aquí)
--
-- Marcas: familias con external_id 'DEMO-###', personal con correo
-- @demo.oberlicht.mx y la lista de ids en settings.key = 'demo_data'.
-- Los teléfonos empiezan con 55 0… (no son números reales).
-- ════════════════════════════════════════════════════════════════════

do $$ begin
  if exists (select 1 from public.families where external_id like 'DEMO-%') then
    raise exception 'Los datos demo ya están cargados. Bórralos primero con 99_borrar_demo.sql';
  end if;
  if (select count(*) from public.profiles where email like '%@demo.oberlicht.mx') < 10 then
    raise exception 'Primero corre 01_personal_demo.sql';
  end if;
end $$;

select setseed(0.2611);

-- Utilidades temporales (solo viven en esta sesión)
create or replace function pg_temp.lt(d date, t time) returns timestamptz
language sql immutable as $$ select (d + t) at time zone 'America/Mexico_City' $$;

create or replace function pg_temp.asc(t text) returns text
language sql immutable as $$ select translate(lower(t), 'áéíóúñü ', 'aeiounu.') $$;

create or replace function pg_temp.festivo(d date) returns boolean
language sql immutable as $$
  select d in ('2025-09-16','2025-11-02','2025-11-17','2026-02-02','2026-03-16','2026-05-01','2026-09-16','2026-11-02','2026-11-16')
      or d between '2025-12-20' and '2026-01-06'
      or d between '2026-03-30' and '2026-04-05'
$$;

create or replace function pg_temp.staff(p text) returns uuid
language sql stable as $$ select id from public.profiles where email = p || '@demo.oberlicht.mx' $$;

-- Lo que ya existía antes (para registrar solo lo nuevo)
drop table if exists _pre;
create temp table _pre as
  select 'sales'::text t, id::text id from public.sales
  union all select 'products', id::text from public.products
  union all select 'coupons', id::text from public.coupons
  union all select 'coupon_redemptions', id::text from public.coupon_redemptions
  union all select 'lockers', id::text from public.lockers
  union all select 'slots', id::text from public.slots
  union all select 'announcements', id::text from public.announcements
  union all select 'invoices', id::text from public.invoices
  union all select 'notifications', id::text from public.notifications
  union all select 'import_batches', id::text from public.import_batches
  union all select 'suppliers', id::text from public.suppliers
  union all select 'supplies', id::text from public.supplies
  union all select 'supplier_prices', id::text from public.supplier_prices
  union all select 'maint_assets', id::text from public.maint_assets
  union all select 'work_orders', id::text from public.work_orders
  union all select 'purchases', id::text from public.purchases
  union all select 'pool_logs', id::text from public.pool_logs
  union all select 'maint_tasks', id::text from public.maint_tasks;
drop table if exists _audit0;
create temp table _audit0 as select coalesce(max(id), 0) as m from public.audit_log;
drop table if exists _tasks0;
create temp table _tasks0 as select id, last_done_on, next_due_on, assigned_to from public.maint_tasks;

-- ─────────────────────────────────────────────────────────────
-- Inscripciones y membresías (ayudantes)
-- ─────────────────────────────────────────────────────────────
create or replace function pg_temp.grupo_para(p_member uuid, p_dept text, p_excluir uuid default null) returns uuid
language sql volatile as $$
  select gr.id from public.groups gr join public.levels l on l.id = gr.level_id, public.members m
   where m.id = p_member and gr.active and l.department = p_dept and gr.id is distinct from p_excluir
     and (public.today_mx() - m.birthdate) / 365.25 >= l.min_age
     and (public.today_mx() - m.birthdate) / 365.25 < l.max_age + 0.1
   order by ((select count(*) from public.enrollments e where e.group_id = gr.id and e.status = 'activa') >= gr.capacity), random()
   limit 1
$$;

create or replace function pg_temp.lleno(p_group uuid) returns boolean
language sql stable as $$
  select (select count(*) from public.enrollments e where e.group_id = p_group and e.status = 'activa') >= (select capacity from public.groups where id = p_group)
$$;

create or replace function pg_temp.inscribir(p_member uuid, p_dept text, p_start date, p_inactive boolean, p_disc numeric) returns void
language plpgsql as $$
declare v_today date := public.today_mx(); g uuid; g2 uuid; v_price numeric; v_price2 numeric; v_end date; v_re date; v_mid date; r float := random();
begin
  g := pg_temp.grupo_para(p_member, p_dept);
  if g is null then return; end if;
  select p.price_monthly into v_price from public.groups gr join public.plans p on p.id = gr.plan_id where gr.id = g;

  if p_inactive then
    if p_start > v_today - 75 then return; end if;
    v_end := p_start + 45 + floor(random() * greatest(1, v_today - 30 - p_start - 45))::int;
    insert into public.enrollments (member_id, group_id, status, monthly_price, discount_pct, enrolled_at, ended_at, notes)
    values (p_member, g, 'baja', v_price, p_disc, pg_temp.lt(p_start, '10:30'), pg_temp.lt(v_end, '12:00'),
            (array['Cambio de domicilio','Horario ya no le acomoda','Motivos económicos','Se cambió de club'])[1 + floor(random()*4)::int]);
    return;
  end if;

  if pg_temp.lleno(g) then
    if (select count(*) from public.enrollments where group_id = g and status = 'lista_espera') < 4 then
      insert into public.enrollments (member_id, group_id, status, monthly_price, discount_pct, enrolled_at)
      values (p_member, g, 'lista_espera', v_price, p_disc, pg_temp.lt(v_today - floor(random()*25)::int, '11:00'));
    end if;
    return;
  end if;

  if r < 0.13 and p_start < v_today - 80 then
    -- Baja y, a veces, reingreso
    v_end := p_start + 40 + floor(random() * greatest(1, v_today - 20 - p_start - 40))::int;
    insert into public.enrollments (member_id, group_id, status, monthly_price, discount_pct, enrolled_at, ended_at, notes)
    values (p_member, g, 'baja', v_price, p_disc, pg_temp.lt(p_start, '10:30'), pg_temp.lt(v_end, '12:00'),
            (array['Horario ya no le acomoda','Vacaciones largas','Motivos económicos','Lesión'])[1 + floor(random()*4)::int]);
    if random() < 0.45 and v_end < v_today - 35 then
      v_re := v_end + 21 + floor(random() * least(70, v_today - v_end - 25))::int;
      g2 := pg_temp.grupo_para(p_member, p_dept);
      if g2 is not null and not pg_temp.lleno(g2) then
        select p.price_monthly into v_price2 from public.groups gr join public.plans p on p.id = gr.plan_id where gr.id = g2;
        insert into public.enrollments (member_id, group_id, status, monthly_price, discount_pct, enrolled_at, notes)
        values (p_member, g2, 'activa', v_price2, p_disc, pg_temp.lt(v_re, '17:00'), 'Reingreso');
      end if;
    end if;
  elsif r < 0.18 and p_start < v_today - 70 then
    -- Cambio de grupo
    g2 := pg_temp.grupo_para(p_member, p_dept, g);
    if g2 is not null and not pg_temp.lleno(g2) then
      v_mid := p_start + 30 + floor(random() * greatest(1, v_today - 10 - p_start - 30))::int;
      select p.price_monthly into v_price2 from public.groups gr join public.plans p on p.id = gr.plan_id where gr.id = g2;
      insert into public.enrollments (member_id, group_id, status, monthly_price, discount_pct, enrolled_at, ended_at, notes)
      values (p_member, g, 'baja', v_price, p_disc, pg_temp.lt(p_start, '10:30'), pg_temp.lt(v_mid, '09:00'), 'Cambio de grupo');
      insert into public.enrollments (member_id, group_id, status, monthly_price, discount_pct, enrolled_at, notes)
      values (p_member, g2, 'activa', v_price2, p_disc, pg_temp.lt(v_mid, '09:00'), 'Cambio desde otro grupo');
    else
      insert into public.enrollments (member_id, group_id, status, monthly_price, discount_pct, enrolled_at)
      values (p_member, g, 'activa', v_price, p_disc, pg_temp.lt(p_start, '10:30'));
    end if;
  else
    insert into public.enrollments (member_id, group_id, status, monthly_price, discount_pct, enrolled_at)
    values (p_member, g, 'activa', v_price, p_disc, pg_temp.lt(p_start, '10:30'));
  end if;
end $$;

create or replace function pg_temp.membresia(p_member uuid, p_plan text, p_start date, p_inactive boolean) returns void
language plpgsql as $$
declare v_today date := public.today_mx(); p public.plans; v_end date; v_status text := 'activa';
begin
  select * into p from public.plans where name = p_plan;
  if not found then return; end if;
  if p_inactive then
    if p_start > v_today - 75 then return; end if;
    v_status := 'baja'; v_end := p_start + 40 + floor(random() * greatest(1, v_today - 30 - p_start - 40))::int;
  elsif random() < 0.12 and p_start < v_today - 80 then
    v_status := 'baja'; v_end := p_start + 40 + floor(random() * greatest(1, v_today - 20 - p_start - 40))::int;
  elsif random() < 0.04 then
    v_status := 'congelada';
  end if;
  insert into public.memberships (member_id, plan_id, status, starts_on, ends_on, monthly_price, discount_pct, sessions_remaining, created_at)
  values (p_member, p.id, v_status, p_start, v_end, p.price_monthly, 0,
          case when p.sessions_per_month is not null then floor(random() * (p.sessions_per_month + 1))::int end,
          pg_temp.lt(p_start, '11:00'));
end $$;

-- ─────────────────────────────────────────────────────────────
-- Familias, socios, inscripciones y membresías
-- ─────────────────────────────────────────────────────────────
do $$
declare
  v_today date := public.today_mx();
  ln text[] := array['García','Hernández','Martínez','López','González','Rodríguez','Pérez','Sánchez','Ramírez','Torres',
                     'Flores','Rivera','Gómez','Díaz','Cruz','Morales','Reyes','Gutiérrez','Ortiz','Ruiz',
                     'Mendoza','Aguilar','Castillo','Jiménez','Vargas','Romero','Herrera','Medina','Castro','Ríos',
                     'Navarro','Domínguez','Salazar','Vega','Cortés','Guerrero','Rojas','Fuentes','Campos','Peña',
                     'Cabrera','Montes','Ibarra','Lozano','Escobar','Villarreal','Del Valle','Arriaga','Zamora','Treviño'];
  af text[] := array['Mariana','Gabriela','Alejandra','Daniela','Fernanda','Paulina','Claudia','Verónica','Andrea','Karla',
                     'Adriana','Mónica','Natalia','Lorena','Patricia','Carolina','Ana Sofía','Jimena','Beatriz','Luisa'];
  am text[] := array['Alejandro','Ricardo','Eduardo','Fernando','Javier','Roberto','Rodrigo','Arturo','Héctor','Gustavo',
                     'Sergio','Manuel','Pablo','Óscar','Enrique','Mauricio','Gerardo','Iván','Raúl','Jorge'];
  kf text[] := array['Sofía','Valentina','Regina','Camila','María José','Ximena','Renata','Victoria','Isabella','Natalia',
                     'Romina','Emilia','Lucía','Fernanda','Ana Paula','Constanza','Paula','Julieta','Elena','Mía'];
  km text[] := array['Santiago','Mateo','Sebastián','Leonardo','Emiliano','Diego','Daniel','Nicolás','Iker','Gael',
                     'Tomás','Joaquín','Patricio','Bruno','Julián','Lucas','Maximiliano','Emilio','Andrés','Rodrigo'];
  calles text[] := array['Calle Pino','Calle Cedro','Av. de los Arcos','Calle Magnolia','Calle Encino','Privada Laurel','Calle Olmo','Av. Jacarandas'];
  colonias text[] := array['Col. Los Árboles','Col. Jardines del Lago','Col. Lomas del Sol','Col. Valle Verde','Col. Bosques del Río'];
  cps text[] := array['03100','03810','01210','11560','04510','14390'];
  i int; k int; nkids int; v_inactive boolean; v_since date; ap1 text; ap2 text; tg text; tf text; v_fam uuid; v_tit uuid; v_sp uuid;
  v_mid uuid; v_bd date; v_age numeric; v_g text; v_name text; v_email text; v_phone text; v_inv boolean; d1 text; d2 text; r float;
  v_kid_idx int; v_has_adult_plan boolean;
begin
  for i in 1..84 loop
    v_inactive := i > 75;
    if i <= 5 then v_since := v_today - (2 + floor(random() * 22))::int;
    elsif v_inactive then v_since := v_today - (230 + floor(random() * 230))::int;
    else v_since := v_today - (30 + floor(power(random(), 0.55) * 500))::int;
    end if;
    ap1 := ln[1 + floor(random() * 50)::int];
    ap2 := ln[1 + floor(random() * 50)::int];
    if ap2 = ap1 then ap2 := ln[1 + ((array_position(ln, ap1) + 7) % 50)]; end if;
    tg := case when random() < 0.62 then 'F' else 'M' end;
    tf := case tg when 'F' then af[1 + floor(random() * 20)::int] else am[1 + floor(random() * 20)::int] end;
    v_email := pg_temp.asc(split_part(tf, ' ', 1) || '.' || split_part(ap1, ' ', 1)) || i || '@demo.oberlicht.mx';
    v_phone := '55 0' || lpad(floor(random() * 1000)::text, 3, '0') || ' ' || lpad(floor(random() * 10000)::text, 4, '0');
    v_inv := random() < 0.25;
    v_bd := v_today - floor((30 + random() * 18) * 365.25)::int;

    insert into public.families (name, email, phone, address, rfc, razon_social, regimen_fiscal, cp_fiscal, uso_cfdi, wants_invoice,
                                 status, member_since, external_id, created_at, notes)
    values (ap1 || ' ' || ap2, v_email, v_phone,
            calles[1 + floor(random() * 8)::int] || ' ' || (10 + floor(random() * 290))::int || ', ' || colonias[1 + floor(random() * 5)::int],
            case when v_inv then upper(substr(pg_temp.asc(ap1), 1, 2) || substr(pg_temp.asc(ap2), 1, 1) || substr(pg_temp.asc(tf), 1, 1))
                                 || to_char(v_bd, 'YYMMDD') || 'D' || floor(random() * 9)::int || 'A' end,
            case when v_inv then upper(tf || ' ' || ap1 || ' ' || ap2) end,
            case when v_inv then '605' end,
            case when v_inv then cps[1 + floor(random() * 6)::int] end,
            case when v_inv then 'G03' end,
            v_inv, case when v_inactive then 'inactiva' else 'activa' end, v_since, 'DEMO-' || lpad(i::text, 3, '0'),
            pg_temp.lt(v_since, '10:00'), 'Familia ficticia de demostración')
    returning id into v_fam;

    insert into public.members (family_id, first_name, last_name, birthdate, gender, is_titular, email, phone, member_since,
                                waiver_signed_at, waiver_signed_by, active, created_at)
    values (v_fam, tf, ap1 || ' ' || ap2, v_bd, tg, true, v_email, v_phone, v_since,
            pg_temp.lt(v_since, '10:05'), tf || ' ' || ap1, not v_inactive, pg_temp.lt(v_since, '10:00'))
    returning id into v_tit;

    v_sp := null;
    if random() < 0.45 then
      insert into public.members (family_id, first_name, last_name, birthdate, gender, is_titular, member_since, waiver_signed_at,
                                  waiver_signed_by, active, created_at)
      values (v_fam, case tg when 'F' then am[1 + floor(random() * 20)::int] else af[1 + floor(random() * 20)::int] end,
              ln[1 + floor(random() * 50)::int] || ' ' || ln[1 + floor(random() * 50)::int],
              v_today - floor((31 + random() * 18) * 365.25)::int, case tg when 'F' then 'M' else 'F' end, false, v_since,
              pg_temp.lt(v_since, '10:06'), tf || ' ' || ap1, not v_inactive, pg_temp.lt(v_since, '10:00'))
      returning id into v_sp;
    end if;
    update public.members set emergency_name = (select first_name || ' ' || last_name from public.members where id = v_sp),
                              emergency_phone = '55 0' || lpad(floor(random() * 1000)::text, 3, '0') || ' ' || lpad(floor(random() * 10000)::text, 4, '0')
     where id = v_tit and v_sp is not null;

    r := random();
    nkids := case when r < 0.12 then 0 when r < 0.47 then 1 when r < 0.85 then 2 else 3 end;
    v_kid_idx := 0;
    for k in 1..nkids loop
      v_g := case when random() < 0.5 then 'F' else 'M' end;
      v_name := case v_g when 'F' then kf[1 + floor(random() * 20)::int] else km[1 + floor(random() * 20)::int] end;
      v_bd := v_today - floor((1 + random() * 14.5) * 365.25)::int;
      insert into public.members (family_id, first_name, last_name, birthdate, gender, is_titular, member_since, allergies,
                                  emergency_name, emergency_phone, waiver_signed_at, waiver_signed_by, active, created_at)
      values (v_fam, v_name, ap1 || ' ' || ap2, v_bd, v_g, false, v_since,
              case when random() < 0.08 then (array['Penicilina','Nueces','Picadura de abeja','Asma leve'])[1 + floor(random()*4)::int] end,
              tf || ' ' || ap1, v_phone, pg_temp.lt(v_since, '10:07'), tf || ' ' || ap1, not v_inactive, pg_temp.lt(v_since, '10:00'))
      returning id into v_mid;
      v_age := (v_today - v_bd) / 365.25;

      if v_age < 3 then d1 := 'natacion'; d2 := null;
      else
        r := random();
        if v_g = 'F' then d1 := case when r < 0.4 then 'natacion' when r < 0.78 then 'ballet' else 'gimnasia' end;
        else d1 := case when r < 0.65 then 'natacion' when r < 0.95 then 'gimnasia' else 'ballet' end;
        end if;
        d2 := case when random() < 0.3 then (array['natacion','gimnasia','ballet'])[1 + floor(random()*3)::int] end;
        if d2 = d1 then d2 := null; end if;
      end if;
      perform pg_temp.inscribir(v_mid, d1, v_since + floor(random() * least(30, v_today - v_since))::int, v_inactive,
                        case when v_kid_idx > 0 then 10 else 0 end);
      v_kid_idx := v_kid_idx + 1;
      if d2 is not null then
        perform pg_temp.inscribir(v_mid, d2, v_since + floor(random() * (v_today - v_since))::int, v_inactive, 0);
      end if;
      if v_age >= 4 and random() < 0.06 then
        perform pg_temp.membresia(v_mid, 'Paquete 4 sesiones de terapia', v_since + floor(random() * (v_today - v_since))::int, v_inactive);
      end if;
    end loop;

    -- Adultos
    foreach v_mid in array array_remove(array[v_tit, v_sp], null) loop
      v_has_adult_plan := false;
      if random() < 0.42 or (nkids = 0 and v_mid = v_tit) then
        r := random();
        perform pg_temp.membresia(v_mid, case when r < 0.6 then 'Oberfit mensual' when r < 0.9 then 'Oberfit + 8 clases' else 'Paquete 4 sesiones personales' end,
                                  v_since + floor(random() * (v_today - v_since))::int, v_inactive);
      end if;
      if random() < 0.08 then perform pg_temp.inscribir(v_mid, 'natacion', v_since + floor(random() * (v_today - v_since))::int, v_inactive, 0); end if;
      if random() < 0.10 and (select gender from public.members where id = v_mid) = 'F' then
        perform pg_temp.inscribir(v_mid, 'ballet', v_since + floor(random() * (v_today - v_since))::int, v_inactive, 0);
      end if;
      if random() < 0.07 then perform pg_temp.membresia(v_mid, 'Consulta de nutrición mensual', v_since + floor(random() * (v_today - v_since))::int, v_inactive); end if;
    end loop;
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────
-- Coaches en los grupos y tarifas de clases privadas
-- ─────────────────────────────────────────────────────────────
update public.groups g set coach_id = case l.department
    when 'natacion' then case when l.sort_order % 2 = 0 then pg_temp.staff('mariana.ruiz') else pg_temp.staff('jorge.castillo') end
    when 'ballet' then pg_temp.staff('sofia.herrera')
    when 'gimnasia' then pg_temp.staff('valeria.nunez') end
  from public.levels l where l.id = g.level_id and g.coach_id is null and l.department in ('natacion','ballet','gimnasia');

insert into public.instructor_rates (profile_id, department, price, commission_pct) values
  (pg_temp.staff('mariana.ruiz'), 'natacion', 450, 40),
  (pg_temp.staff('jorge.castillo'), 'natacion', 500, 45),
  (pg_temp.staff('andres.molina'), 'oberfit', 500, 40),
  (pg_temp.staff('ana.vega'), 'terapia', 550, 50)
on conflict do nothing;

-- ─────────────────────────────────────────────────────────────
-- Entradas al club (check-in/out) y asistencia a clases
-- ─────────────────────────────────────────────────────────────
-- Socios que dejaron de venir (para la alerta "Dejaron de venir")
drop table if exists _risk;
create temp table _risk as
select member_id, public.today_mx() - (16 + floor(random() * 25))::int as stop
  from (select distinct x.member_id from (
          select e.member_id from public.enrollments e where e.status = 'activa' and e.enrolled_at < now() - interval '80 days'
          union select ms.member_id from public.memberships ms where ms.status = 'activa' and ms.starts_on < public.today_mx() - 80) x
          join public.members m on m.id = x.member_id join public.families f on f.id = m.family_id
         where f.external_id like 'DEMO-%' and f.status = 'activa') y
 order by random() limit 12;

drop table if exists _ses;
create temp table _ses (member_id uuid, department text, group_id uuid, d date, t time, dur int);

-- Clases de grupo
insert into _ses
select e.member_id, l.department, g.id, d::date, g.start_time, (extract(epoch from g.end_time - g.start_time) / 60)::int
  from (select e.*, 0.62 + random() * 0.33 as rate from public.enrollments e
          join public.members m on m.id = e.member_id join public.families f on f.id = m.family_id
         where f.external_id like 'DEMO-%' and e.status in ('activa','baja')) e
  join public.groups g on g.id = e.group_id join public.levels l on l.id = g.level_id
  cross join lateral generate_series((e.enrolled_at at time zone 'America/Mexico_City')::date,
                                     coalesce((e.ended_at at time zone 'America/Mexico_City')::date - 1, public.today_mx()), interval '1 day') d
 where extract(isodow from d)::int = any(g.weekdays)
   and not pg_temp.festivo(d::date)
   and random() < e.rate
   and not exists (select 1 from _risk r where r.member_id = e.member_id and d::date > r.stop)
   and pg_temp.lt(d::date, g.start_time) < now();

-- Gimnasio Oberfit (libre, por la mañana o por la tarde)
insert into _ses
select ms.member_id, 'oberfit', null, d::date, make_time(x.h, x.mm, 0), 50 + floor(random() * 50)::int
  from (select ms.*, 0.22 + random() * 0.4 as freq, random() < 0.55 as am from public.memberships ms
          join public.plans p on p.id = ms.plan_id join public.members m on m.id = ms.member_id join public.families f on f.id = m.family_id
         where f.external_id like 'DEMO-%' and p.department = 'oberfit' and ms.status in ('activa','baja')) ms
  cross join lateral generate_series(ms.starts_on, coalesce(ms.ends_on - 1, public.today_mx()), interval '1 day') d
  cross join lateral (select case when ms.am then (array[6,6,7,7,8,9])[1 + floor(random() * 6)::int]
                                  else (array[13,17,18,18,19,19,20])[1 + floor(random() * 7)::int] end as h,
                             floor(random() * 50)::int as mm, d as dd) x
 where random() < ms.freq * case extract(isodow from d) when 7 then 0.3 when 6 then 0.7 else 1 end
   and to_char(d, 'MM-DD') not in ('12-24','12-25','12-31','01-01')
   and not exists (select 1 from _risk r where r.member_id = ms.member_id and d::date > r.stop)
   and pg_temp.lt(d::date, make_time(x.h, x.mm, 0)) < now();

-- Terapia (semanal) y nutrición (mensual)
insert into _ses
select ms.member_id, p.department, null, d::date, case when p.department = 'terapia' then time '16:00' + (ms.k * interval '1 hour') else time '10:00' + (ms.k * interval '1 hour') end,
       case when p.department = 'terapia' then 50 else 40 end
  from (select ms.*, floor(random() * 3)::int as k, (2 + floor(random() * 3))::int as dow from public.memberships ms
          join public.members m on m.id = ms.member_id join public.families f on f.id = m.family_id
         where f.external_id like 'DEMO-%' and ms.status in ('activa','baja')) ms
  join public.plans p on p.id = ms.plan_id and p.department in ('terapia','nutricion')
  cross join lateral generate_series(ms.starts_on, coalesce(ms.ends_on - 1, public.today_mx()), case when p.department = 'terapia' then interval '1 day' else interval '13 days' end) d
 where (p.department = 'nutricion' or extract(isodow from d)::int = ms.dow)
   and not pg_temp.festivo(d::date) and random() < 0.88
   and not exists (select 1 from _risk r where r.member_id = ms.member_id and d::date > r.stop)
   and pg_temp.lt(d::date, time '16:00') < now();

-- Lotes de importación (historial traído del sistema anterior)
insert into public.import_batches (kind, file_name, rows_total, rows_ok, rows_skipped, rows_error, errors, created_by, created_at)
values ('socios', 'socios_sistema_anterior.xlsx', 0, 0, 0, 0, '[]', null, now() - interval '2 days'),
       ('visitas', 'checkins_hasta_octubre.xlsx', 0, 0, 0, 0, '[]', null, now() - interval '2 days');

insert into public.visits (member_id, department, check_in_at, check_out_at, source, import_batch, recorded_by, created_at)
select s.member_id, s.department, ci, case when co < now() then co end,
       case when s.d < date '2026-11-01' then 'importado' else 'recepcion' end,
       case when s.d < date '2026-11-01' then (select id from public.import_batches where file_name = 'checkins_hasta_octubre.xlsx' order by created_at desc limit 1) end,
       case when s.d >= date '2026-11-01' then pg_temp.staff('paola.diaz') end, ci
  from (select s.*, pg_temp.lt(s.d, s.t) - case when s.group_id is not null then (5 + floor(random() * 12)::int) * interval '1 minute' else interval '0' end as ci
          from _ses s) s
  cross join lateral (select s.ci + (s.dur + 10 + floor(random() * 15)::int) * interval '1 minute' as co) o
on conflict do nothing;

update public.import_batches b set rows_total = x.n + 3, rows_ok = x.n, rows_skipped = 3,
       errors = '[{"fila": 112, "error": "Socio no encontrado"}, {"fila": 540, "error": "Fecha no válida"}, {"fila": 1981, "error": "Socio no encontrado"}]'
  from (select count(*)::int n from public.visits where source = 'importado') x
 where b.file_name = 'checkins_hasta_octubre.xlsx';
update public.import_batches b set rows_total = x.n, rows_ok = x.n
  from (select count(*)::int n from public.members m join public.families f on f.id = m.family_id
         where f.external_id like 'DEMO-%' and f.member_since < date '2026-11-01') x
 where b.file_name = 'socios_sistema_anterior.xlsx';

-- Lista de asistencia de las últimas 6 semanas
insert into public.attendance (member_id, group_id, department, date, status, recorded_by, recorded_at)
select e.member_id, g.id, l.department, d::date,
       case when exists (select 1 from _ses s where s.member_id = e.member_id and s.group_id = g.id and s.d = d::date)
            then case when random() < 0.05 then 'retardo' else 'presente' end
            else case when random() < 0.25 then 'justificada' else 'ausente' end end,
       g.coach_id, pg_temp.lt(d::date, g.end_time)
  from public.enrollments e
  join public.members m on m.id = e.member_id join public.families f on f.id = m.family_id
  join public.groups g on g.id = e.group_id join public.levels l on l.id = g.level_id
  cross join lateral generate_series(greatest((e.enrolled_at at time zone 'America/Mexico_City')::date, public.today_mx() - 42),
                                     coalesce((e.ended_at at time zone 'America/Mexico_City')::date - 1, public.today_mx()), interval '1 day') d
 where f.external_id like 'DEMO-%' and e.status in ('activa','baja')
   and extract(isodow from d)::int = any(g.weekdays) and not pg_temp.festivo(d::date)
   and pg_temp.lt(d::date, g.end_time) < now()
on conflict do nothing;

-- ─────────────────────────────────────────────────────────────
-- Cupones
-- ─────────────────────────────────────────────────────────────
insert into public.coupons (code, description, kind, value, applies_to, starts_on, ends_on, max_uses, uses, once_per_family, active, created_by, created_at) values
  ('BUENFIN15', 'Buen Fin: 15% en tienda y barra', 'porcentaje', 15, 'tienda', '2026-11-13', '2026-11-17', null, 0, false, true, null, '2026-11-10 10:00-06'),
  ('INSCRIPCION50', '50% en inscripción, otoño 2026', 'porcentaje', 50, 'inscripcion', '2026-10-01', '2026-12-31', 30, 0, true, true, null, '2026-09-28 10:00-06'),
  ('NAVIDAD200', '$200 de descuento en la mensualidad de diciembre', 'monto', 200, 'mensualidad', '2026-12-01', '2026-12-31', 100, 0, true, true, null, '2026-11-20 10:00-06'),
  ('BIENVENIDA', '$300 en la primera mensualidad para familias nuevas', 'monto', 300, 'mensualidad', null, null, null, 0, true, true, null, '2026-06-01 10:00-06'),
  ('VERANO2026', 'Curso de verano: 10% en todo', 'porcentaje', 10, 'todo', '2026-07-01', '2026-08-15', 50, 0, false, false, null, '2026-06-20 10:00-06');

-- ─────────────────────────────────────────────────────────────
-- Mensualidades (un cargo por familia y mes, con el detalle por socio)
-- ─────────────────────────────────────────────────────────────
drop table if exists _subs;
create temp table _subs as
select m.family_id, e.member_id, l.department, (e.enrolled_at at time zone 'America/Mexico_City')::date as s,
       case when e.status = 'baja' then (e.ended_at at time zone 'America/Mexico_City')::date - 1 end as en,
       round(e.monthly_price * (1 - coalesce(e.discount_pct, 0) / 100), 2) as amt,
       d.name || ' · ' || l.name || ' · ' || g.name || ' · ' || m.first_name as descr,
       coalesce(e.notes, '') = 'Cambio desde otro grupo' as from_change
  from public.enrollments e join public.members m on m.id = e.member_id join public.families f on f.id = m.family_id
  join public.groups g on g.id = e.group_id join public.levels l on l.id = g.level_id join public.departments d on d.code = l.department
 where f.external_id like 'DEMO-%' and e.status in ('activa','baja')
union all
select m.family_id, ms.member_id, p.department, ms.starts_on, case when ms.status = 'baja' then ms.ends_on - 1 end,
       round(ms.monthly_price * (1 - coalesce(ms.discount_pct, 0) / 100), 2), p.name || ' · ' || m.first_name, false
  from public.memberships ms join public.members m on m.id = ms.member_id join public.families f on f.id = m.family_id
  join public.plans p on p.id = ms.plan_id
 where f.external_id like 'DEMO-%' and ms.status in ('activa','baja');

drop table if exists _mi;
create temp table _mi as
select s.*, mo::date as mo
  from _subs s
  cross join lateral generate_series(date_trunc('month', s.s), date_trunc('month', coalesce(s.en, public.today_mx())), interval '1 month') mo
 where not (s.from_change and mo::date = date_trunc('month', s.s)::date);

insert into public.charges (family_id, period, concept, amount, due_date, status, created_at)
select x.family_id, to_char(x.mo, 'YYYY-MM'), 'Mensualidad ' || to_char(x.mo, 'YYYY-MM'), x.total,
       greatest(x.mo, f.member_since), 'pendiente', pg_temp.lt(greatest(x.mo, f.member_since) - 1, '06:00')
  from (select family_id, mo, sum(amt) total from _mi group by 1, 2) x join public.families f on f.id = x.family_id;

insert into public.charge_items (charge_id, member_id, department, description, amount, sat_product_key, sat_unit_key)
select c.id, mi.member_id, mi.department, mi.descr, mi.amt, '94141500', 'E48'
  from _mi mi join public.charges c on c.family_id = mi.family_id and c.period = to_char(mi.mo, 'YYYY-MM');

-- Inscripciones (primera vez en cada área)
insert into public.charges (family_id, concept, amount, due_date, status, created_at)
select x.family_id, 'Inscripción ' || x.dname || ' · ' || x.first_name, x.fee, x.s, 'pendiente', pg_temp.lt(x.s, '10:20')
  from (select distinct on (e.member_id, l.department) m.family_id, m.first_name, d.name dname, p.enrollment_fee fee,
               (e.enrolled_at at time zone 'America/Mexico_City')::date s, l.department, e.member_id
          from public.enrollments e join public.members m on m.id = e.member_id join public.families f on f.id = m.family_id
          join public.groups g on g.id = e.group_id join public.levels l on l.id = g.level_id join public.plans p on p.id = g.plan_id
          join public.departments d on d.code = l.department
         where f.external_id like 'DEMO-%' and e.status in ('activa','baja') and p.enrollment_fee > 0
         order by e.member_id, l.department, e.enrolled_at) x;
insert into public.charge_items (charge_id, member_id, department, description, amount, sat_product_key, sat_unit_key)
select c.id, m.id, d.code, c.concept, c.amount, '94141500', 'E48'
  from public.charges c join public.families f on f.id = c.family_id
  join public.departments d on c.concept like 'Inscripción ' || d.name || ' · %'
  join public.members m on m.family_id = c.family_id and c.concept = 'Inscripción ' || d.name || ' · ' || m.first_name
 where f.external_id like 'DEMO-%' and c.concept like 'Inscripción %'
   and not exists (select 1 from public.charge_items ci where ci.charge_id = c.id);

-- Cupón INSCRIPCION50 en inscripciones recientes
do $$
declare c record; v_coupon uuid := (select id from public.coupons where code = 'INSCRIPCION50'); n int := 0; v_disc numeric;
begin
  for c in select ch.* from public.charges ch join public.families f on f.id = ch.family_id
            where f.external_id like 'DEMO-%' and ch.concept like 'Inscripción %' and ch.due_date >= '2026-10-01'
              and f.external_id not in ('DEMO-001','DEMO-002') order by random() limit 7 loop
    v_disc := round(c.amount * 0.5, 2);
    insert into public.charge_items (charge_id, description, amount) values (c.id, 'Descuento cupón INSCRIPCION50', -v_disc);
    update public.charges set amount = amount - v_disc where id = c.id;
    insert into public.coupon_redemptions (coupon_id, family_id, charge_id, amount, created_at) values (v_coupon, c.family_id, c.id, v_disc, c.created_at);
    n := n + 1;
  end loop;
  update public.coupons set uses = n where id = v_coupon;
end $$;

-- Estado de los cargos: lo pasado está pagado; algunas familias deben noviembre (y unas pocas octubre)
drop table if exists _morosos;
create temp table _morosos as
select id, row_number() over () as n from (
  select f.id from public.families f
   where f.external_id like 'DEMO-%' and f.status = 'activa' and f.member_since < public.today_mx() - 60
     and exists (select 1 from public.charges c where c.family_id = f.id and c.period = to_char(public.today_mx(), 'YYYY-MM'))
   order by random() limit 9) x;

update public.charges c set status = 'pagado',
       paid_at = least(now() - interval '1 hour', pg_temp.lt(c.due_date + floor(random() * 7)::int, time '09:00' + floor(random() * 660)::int * interval '1 minute'))
  from public.families f where f.id = c.family_id and f.external_id like 'DEMO-%' and c.status = 'pendiente';

update public.charges c set status = 'vencido', paid_at = null, attempts = 2, last_attempt_at = now() - interval '3 days'
 where c.family_id in (select id from _morosos) and c.period = to_char(public.today_mx(), 'YYYY-MM');
update public.charges c set status = 'vencido', paid_at = null, attempts = 3, last_attempt_at = now() - interval '20 days'
 where c.family_id in (select id from _morosos where n <= 3) and c.period = to_char(public.today_mx() - interval '1 month', 'YYYY-MM');

-- Familias recién llegadas con pagos por vencer
update public.charges c set status = 'pendiente', paid_at = null, due_date = public.today_mx() + case when f.external_id = 'DEMO-001' then 2 else 1 end
  from public.families f where f.id = c.family_id and f.external_id in ('DEMO-001','DEMO-002');

-- ─────────────────────────────────────────────────────────────
-- Casilleros
-- ─────────────────────────────────────────────────────────────
insert into public.lockers (code, zone, size, monthly_price, status, notes)
select z.p || '-' || lpad(n::text, 2, '0'), z.zone,
       case when n <= 20 then 'chico' when n <= 27 then 'mediano' else 'grande' end,
       case when n <= 20 then 250 when n <= 27 then 350 else 450 end, 'disponible', null
  from (values ('M', 'Vestidor mujeres'), ('H', 'Vestidor hombres')) z(p, zone), generate_series(1, 30) n;
update public.lockers set status = 'mantenimiento', notes = 'Chapa dañada, se pidió refacción' where code = 'H-17';

do $$
declare v_today date := public.today_mx(); l record; m record; k int := 0; v_months int; v_start date; v_end date; v_charge uuid; v_status text;
begin
  for l in select * from public.lockers where status = 'disponible' order by random() limit 44 loop
    k := k + 1;
    select mb.id, mb.family_id, mb.first_name into m from public.members mb join public.families f on f.id = mb.family_id
     where f.external_id like 'DEMO-%' and f.status = 'activa' and mb.birthdate < v_today - 16 * 365
       and mb.gender = case when l.code like 'M-%' then 'F' else 'M' end
       and not exists (select 1 from public.locker_rentals r where r.member_id = mb.id)
     order by random() limit 1;
    if not found then continue; end if;
    v_months := (array[1, 1, 3, 3, 6, 12])[1 + floor(random() * 6)::int];
    v_status := 'activa';
    if k <= 4 then v_end := v_today + k + 1;                 -- vencen esta semana
    elsif k <= 7 then v_end := v_today - (k - 3);             -- ya vencieron y siguen ocupados
    elsif k <= 15 then v_end := v_today - 20 - floor(random() * 120)::int; v_status := 'terminada';
    else v_end := v_today + 8 + floor(random() * v_months * 28)::int;
    end if;
    v_start := (v_end - make_interval(months => v_months))::date;
    insert into public.locker_rentals (locker_id, family_id, member_id, starts_on, ends_on, monthly_price, status, created_by, created_at)
    values (l.id, m.family_id, m.id, v_start, v_end, l.monthly_price, v_status, null, pg_temp.lt(v_start, '11:00'));
    insert into public.charges (family_id, concept, amount, due_date, status, paid_at, created_at)
    values (m.family_id, 'Casillero ' || l.code || ' · ' || v_months || case when v_months = 1 then ' mes' else ' meses' end,
            l.monthly_price * v_months, v_start, 'pagado', pg_temp.lt(v_start, '11:05'), pg_temp.lt(v_start, '11:00'))
    returning id into v_charge;
    insert into public.charge_items (charge_id, member_id, description, amount) values (v_charge, m.id, 'Renta de casillero ' || l.code, l.monthly_price * v_months);
    if v_status = 'activa' then update public.lockers set status = 'ocupado' where id = l.id; end if;
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────
-- Clases privadas (8 semanas atrás y 2 hacia adelante)
-- ─────────────────────────────────────────────────────────────
do $$
declare v_today date := public.today_mx(); c record; m record; v_status text; v_charge uuid; v_cstatus text; v_starts timestamptz; r float;
begin
  for c in
    select ir.profile_id, ir.department, ir.price, ir.commission_pct, d::date as d, h
      from public.instructor_rates ir
      join public.profiles p on p.id = ir.profile_id and p.email like '%@demo.oberlicht.mx'
      cross join generate_series(v_today - 56, v_today + 14, interval '1 day') d
      cross join unnest(array[9, 11, 13, 15]) h
     where extract(isodow from d) between 1 and 6 and not pg_temp.festivo(d::date) and random() < 0.11
     order by d, h
  loop
    if c.department = 'natacion' then
      select mb.id, mb.family_id, mb.first_name into m from public.enrollments e join public.groups g on g.id = e.group_id
        join public.levels l on l.id = g.level_id join public.members mb on mb.id = e.member_id join public.families f on f.id = mb.family_id
       where e.status = 'activa' and l.department = 'natacion' and f.external_id like 'DEMO-%' and c.d is not null order by random() limit 1;
    else
      select mb.id, mb.family_id, mb.first_name into m from public.memberships ms join public.plans p on p.id = ms.plan_id
        join public.members mb on mb.id = ms.member_id join public.families f on f.id = mb.family_id
       where ms.status = 'activa' and p.department = c.department and f.external_id like 'DEMO-%' and c.d is not null order by random() limit 1;
    end if;
    if not found then continue; end if;
    v_starts := pg_temp.lt(c.d, make_time(c.h, 0, 0));
    r := random();
    if v_starts > now() then v_status := 'programada';
    else v_status := case when r < 0.78 then 'realizada' when r < 0.86 then 'no_asistio' when r < 0.95 then 'cancelada' else 'programada' end;
    end if;
    v_cstatus := case v_status when 'cancelada' then 'cancelado' when 'programada' then 'pendiente' else 'pagado' end;
    insert into public.charges (family_id, concept, amount, due_date, status, paid_at, created_at)
    values (m.family_id, 'Clase privada · ' || m.first_name || ' · ' || to_char(v_starts at time zone 'America/Mexico_City', 'DD/MM HH24:MI'),
            c.price, c.d, v_cstatus, case when v_cstatus = 'pagado' then least(now(), v_starts + interval '70 minutes') end,
            v_starts - (1 + floor(random() * 6)::int) * interval '1 day')
    returning id into v_charge;
    insert into public.charge_items (charge_id, member_id, department, description, amount)
    values (v_charge, m.id, c.department, 'Clase privada ' || case when c.department = 'terapia' then 50 else 60 end || ' min', c.price);
    insert into public.private_sessions (member_id, family_id, instructor_id, department, starts_at, duration_min, price, commission_pct,
                                         status, charge_id, notes, created_at)
    values (m.id, m.family_id, c.profile_id, c.department, v_starts, case when c.department = 'terapia' then 50 else 60 end, c.price,
            c.commission_pct, v_status, v_charge,
            case v_status when 'cancelada' then 'Avisó con anticipación' when 'no_asistio' then 'No se presentó' end,
            v_starts - (1 + floor(random() * 6)::int) * interval '1 day');
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────
-- Punto de venta: productos, 60 días de ventas e inventario
-- ─────────────────────────────────────────────────────────────
insert into public.products (name, category, sku, price, cost, stock, min_stock, track_stock, active, created_at) values
  ('Agua natural 1 L', 'barra', 'BAR-AGUA1L', 20, 8, 0, 24, true, true, now() - interval '70 days'),
  ('Bebida isotónica 600 ml', 'barra', 'BAR-ISO600', 35, 18, 0, 18, true, true, now() - interval '70 days'),
  ('Café americano', 'barra', 'BAR-CAFE', 30, 7, 0, 0, false, true, now() - interval '70 days'),
  ('Capuchino', 'barra', 'BAR-CAPU', 45, 12, 0, 0, false, true, now() - interval '70 days'),
  ('Smoothie de frutos rojos', 'barra', 'BAR-SMOO', 65, 22, 0, 0, false, true, now() - interval '70 days'),
  ('Sándwich de pavo', 'barra', 'BAR-SAND', 75, 32, 0, 8, true, true, now() - interval '70 days'),
  ('Barra de proteína', 'barra', 'BAR-PROT', 40, 21, 0, 15, true, true, now() - interval '70 days'),
  ('Fruta picada', 'barra', 'BAR-FRUT', 45, 15, 0, 0, false, true, now() - interval '70 days'),
  ('Goggles infantiles', 'tienda', 'TIE-GOGI', 280, 140, 0, 6, true, true, now() - interval '70 days'),
  ('Gorra de natación Oberlicht', 'tienda', 'TIE-GORR', 180, 70, 0, 10, true, true, now() - interval '70 days'),
  ('Toalla de microfibra', 'tienda', 'TIE-TOAL', 350, 160, 0, 5, true, true, now() - interval '70 days'),
  ('Leotardo de ballet', 'tienda', 'TIE-LEOT', 520, 260, 0, 4, true, true, now() - interval '70 days'),
  ('Playera Oberlicht', 'tienda', 'TIE-PLAY', 320, 120, 0, 8, true, true, now() - interval '70 days'),
  ('Termo Oberlicht 750 ml', 'tienda', 'TIE-TERM', 290, 130, 0, 6, true, true, now() - interval '70 days');

do $$
declare v_today date := public.today_mx(); d date; n int; t timestamptz; ts timestamptz[]; it int; p record; v_sale public.sales;
        v_sub numeric; v_disc numeric; v_method text; v_fam uuid; v_mem uuid; v_coupon uuid := (select id from public.coupons where code = 'BUENFIN15');
        v_seller uuid; v_items jsonb; x jsonb; v_charge uuid; r float; v_tienda boolean; v_used int := 0; v_cats text;
begin
  for d in select generate_series(v_today - 59, v_today, interval '1 day')::date loop
    n := 7 + floor(random() * 8)::int + case extract(isodow from d) when 6 then 7 when 7 then 2 else 0 end;
    select array_agg(q.tt order by q.tt) into ts from (
      select pg_temp.lt(d, time '07:00' + floor(random() * 840)::int * interval '1 minute') tt from generate_series(1, n)) q;
    foreach t in array ts loop
      continue when t > now();
      -- productos del ticket
      v_items := '[]'; v_sub := 0; v_tienda := false;
      for it in 1..(1 + floor(power(random(), 2) * 3)::int) loop
        select * into p from public.products
         where sku like 'BAR-%' or sku like 'TIE-%'
         order by (category = case when random() < 0.82 then 'barra' else 'tienda' end) desc, random() limit 1;
        v_items := v_items || jsonb_build_object('id', p.id, 'name', p.name, 'category', p.category, 'qty', case when random() < 0.85 then 1 else 2 end,
                                                 'price', p.price, 'track', p.track_stock);
      end loop;
      select coalesce(sum((e->>'price')::numeric * (e->>'qty')::int), 0), bool_or(e->>'category' = 'tienda') into v_sub, v_tienda
        from jsonb_array_elements(v_items) e;
      r := random();
      v_method := case when r < 0.38 then 'efectivo' when r < 0.72 then 'tarjeta' when r < 0.80 then 'terminal' when r < 0.87 then 'transferencia' else 'cuenta' end;
      v_fam := null; v_mem := null;
      if v_method = 'cuenta' or random() < 0.3 then
        select mb.family_id, mb.id into v_fam, v_mem from public.members mb join public.families f on f.id = mb.family_id
         where f.external_id like 'DEMO-%' and f.status = 'activa' and t is not null order by random() limit 1;
      end if;
      v_disc := 0;
      if d between '2026-11-13' and '2026-11-17' and random() < 0.35 then v_disc := round(v_sub * 0.15, 2); end if;
      v_seller := case when random() < 0.85 then pg_temp.staff('daniela.ortiz') else pg_temp.staff('paola.diaz') end;

      insert into public.sales (family_id, member_id, subtotal, discount, total, method, coupon_id, status, sold_by, created_at)
      values (v_fam, v_mem, v_sub, v_disc, v_sub - v_disc, v_method, case when v_disc > 0 then v_coupon end,
              case when v_method = 'cuenta' then 'a_cuenta' else 'pagada' end, v_seller, t)
      returning * into v_sale;

      for x in select * from jsonb_array_elements(v_items) loop
        insert into public.sale_items (sale_id, product_id, name, category, qty, unit_price, total)
        values (v_sale.id, (x->>'id')::uuid, x->>'name', x->>'category', (x->>'qty')::int, (x->>'price')::numeric,
                (x->>'price')::numeric * (x->>'qty')::int);
        if (x->>'track')::boolean then
          insert into public.inventory_moves (product_id, qty, kind, sale_id, created_by, created_at)
          values ((x->>'id')::uuid, -(x->>'qty')::int, 'venta', v_sale.id, v_seller, t);
        end if;
      end loop;

      if v_disc > 0 then
        insert into public.coupon_redemptions (coupon_id, family_id, sale_id, amount, created_by, created_at)
        values (v_coupon, v_fam, v_sale.id, v_disc, v_seller, t);
        v_used := v_used + 1;
      end if;

      if v_method = 'cuenta' then
        select string_agg(distinct case category when 'barra' then 'Barra' else 'Tienda' end, ' y ') into v_cats from public.sale_items where sale_id = v_sale.id;
        insert into public.charges (family_id, concept, amount, due_date, status, paid_at, created_at, created_by)
        values (v_fam, v_cats || ' · ticket ' || v_sale.folio, v_sale.total, d + 7,
                case when d + 7 < v_today then 'pagado' else 'pendiente' end,
                case when d + 7 < v_today then pg_temp.lt(d + 1 + floor(random() * 6)::int, '18:30') end, t, v_seller)
        returning id into v_charge;
        insert into public.charge_items (charge_id, member_id, department, description, amount, sat_product_key, sat_unit_key)
        select v_charge, v_mem, case category when 'barra' then 'cafeteria' else 'tienda' end, name || ' x' || qty, total, '90101500', 'H87'
          from public.sale_items where sale_id = v_sale.id;
        if v_disc > 0 then insert into public.charge_items (charge_id, description, amount) values (v_charge, 'Descuento', -v_disc); end if;
        update public.sales set charge_id = v_charge where id = v_sale.id;
      end if;
    end loop;
  end loop;
  update public.coupons set uses = v_used where id = v_coupon;

  -- Algunas ventas canceladas
  for v_sale in select * from public.sales where method <> 'cuenta' and status = 'pagada' and created_at > now() - interval '30 days'
                 order by random() limit 3 loop
    update public.sales set status = 'cancelada', cancelled_at = v_sale.created_at + interval '6 minutes',
           cancel_reason = (array['Se cobró dos veces','El cliente cambió de producto','Error al capturar'])[1 + floor(random()*3)::int]
     where id = v_sale.id;
    insert into public.inventory_moves (product_id, qty, kind, sale_id, note, created_by, created_at)
    select product_id, -qty, 'cancelacion', sale_id, 'Venta cancelada', v_sale.sold_by, v_sale.created_at + interval '6 minutes'
      from public.inventory_moves where sale_id = v_sale.id and kind = 'venta';
  end loop;

  -- Compras de mercancía: dejan algunas existencias por debajo del mínimo
  for p in select pr.*, coalesce(-sum(m.qty), 0)::int as vendido from public.products pr
             left join public.inventory_moves m on m.product_id = pr.id
            where pr.track_stock and pr.sku ~ '^(BAR|TIE)-' group by pr.id loop
    n := case p.sku when 'BAR-ISO600' then 9 when 'TIE-GOGI' then 2 when 'BAR-PROT' then 11 else p.min_stock + 6 + floor(random() * 20)::int end;
    insert into public.inventory_moves (product_id, qty, kind, note, created_by, created_at)
    values (p.id, ceil((p.vendido + n) * 0.6), 'compra', 'Pedido inicial', pg_temp.staff('daniela.ortiz'), now() - interval '61 days'),
           (p.id, (p.vendido + n) - ceil((p.vendido + n) * 0.6) + 2, 'compra', 'Resurtido', pg_temp.staff('daniela.ortiz'), now() - interval '24 days');
    insert into public.inventory_moves (product_id, qty, kind, note, created_by, created_at)
    values (p.id, -2, 'merma', case when p.category = 'barra' then 'Caducado' else 'Dañado en exhibición' end, pg_temp.staff('daniela.ortiz'), now() - interval '9 days');
    update public.products set stock = (select sum(qty) from public.inventory_moves where product_id = p.id) where id = p.id;
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────
-- Recomendaciones (referidos): las pagadas se premian solas al registrar el pago
-- ─────────────────────────────────────────────────────────────
insert into public.referrals (referrer_family_id, referred_family_id, status, created_at)
select (select id from public.families where external_id = x.referrer), f.id, 'pendiente', pg_temp.lt(f.member_since, '10:00')
  from (values ('DEMO-044', 'DEMO-003'), ('DEMO-012', 'DEMO-004'), ('DEMO-057', 'DEMO-008')) x(referrer, referred)
  join public.families f on f.external_id = x.referred;

-- ─────────────────────────────────────────────────────────────
-- Pagos de todo lo cobrado
-- ─────────────────────────────────────────────────────────────
insert into public.payments (family_id, charge_id, amount, method, status, processor_ref, reference, received_by, paid_at)
select c.family_id, c.id, c.amount, m.method, 'aprobado',
       case when m.method in ('tarjeta','liga') then 'demo_' || substr(md5(c.id::text), 1, 14) end,
       case when m.method = 'transferencia' then 'SPEI ' || substr(md5(c.id::text || 'r'), 1, 10) end,
       case when m.method in ('efectivo','terminal') then pg_temp.staff('paola.diaz') end, c.paid_at
  from (select c.*, random() as r from public.charges c join public.families f on f.id = c.family_id
         where f.external_id like 'DEMO-%' and c.status = 'pagado' and c.amount > 0) c
  cross join lateral (select case when c.r < 0.42 then 'tarjeta' when c.r < 0.67 then 'transferencia' when c.r < 0.82 then 'terminal'
                                  when c.r < 0.96 then 'efectivo' else 'liga' end as method, c.id as cid) m
 order by c.paid_at;

-- Intentos de cobro con tarjeta rechazados en los adeudos
insert into public.payments (family_id, charge_id, amount, method, status, processor_ref, notes, paid_at)
select c.family_id, c.id, c.amount, 'tarjeta', 'rechazado', 'demo_' || substr(md5(c.id::text || k), 1, 14), 'Tarjeta declinada por el banco',
       c.due_date + k * 3 + interval '7 hours'
  from public.charges c join public.families f on f.id = c.family_id, generate_series(0, 1) k
 where f.external_id like 'DEMO-%' and c.status = 'vencido';

-- Una recomendación todavía pendiente: la familia nueva aún no paga
insert into public.referrals (referrer_family_id, referred_family_id, status, created_at)
select (select id from public.families where external_id = 'DEMO-031'), f.id, 'pendiente', pg_temp.lt(f.member_since, '10:00')
  from public.families f where f.external_id = 'DEMO-001';

update public.referrals r set rewarded_at = (select min(paid_at) from public.payments p where p.family_id = r.referred_family_id and p.status = 'aprobado')
 where r.status = 'recompensado' and r.referred_family_id in (select id from public.families where external_id like 'DEMO-%');

-- ─────────────────────────────────────────────────────────────
-- Facturas (CFDI de demostración: los UUID no son reales)
-- ─────────────────────────────────────────────────────────────
insert into public.invoices (family_id, payment_id, kind, period, serie, folio, uuid_sat, total, receptor_rfc, receptor_nombre, uso_cfdi, status, pac, issued_at, created_at)
select p.family_id, p.id, 'individual', c.period, 'OB', 1000 + row_number() over (order by p.paid_at),
       upper(gen_random_uuid()::text), p.amount, f.rfc, f.razon_social, f.uso_cfdi,
       case when p.paid_at > now() - interval '4 days' then 'pendiente' else 'timbrada' end, 'demo',
       case when p.paid_at <= now() - interval '4 days' then p.paid_at + interval '2 hours' end, p.paid_at + interval '1 hour'
  from public.payments p join public.charges c on c.id = p.charge_id join public.families f on f.id = p.family_id
 where f.external_id like 'DEMO-%' and f.wants_invoice and p.status = 'aprobado';
update public.invoices set uuid_sat = null where status = 'pendiente' and pac = 'demo';
update public.invoices set status = 'error', uuid_sat = null, issued_at = null, error_message = 'CFDI40147: el código postal del receptor no coincide con el registrado en el SAT'
 where id = (select id from public.invoices where pac = 'demo' and status = 'timbrada' order by created_at desc limit 1);
update public.invoices set status = 'cancelada', cancelled_at = issued_at + interval '1 day', cancel_reason = '02 · Comprobante con errores sin relación'
 where id = (select id from public.invoices where pac = 'demo' and status = 'timbrada' order by created_at desc offset 5 limit 1);

-- Factura global mensual (público en general)
insert into public.invoices (kind, period, serie, folio, uuid_sat, total, receptor_rfc, receptor_nombre, uso_cfdi, status, pac, issued_at, created_at)
select 'global', to_char(mo, 'YYYY-MM'), 'OBG', row_number() over (order by mo), upper(gen_random_uuid()::text), total,
       'XAXX010101000', 'PUBLICO EN GENERAL', 'S01', 'timbrada', 'demo', mo + interval '1 month 1 day 10 hours', mo + interval '1 month 1 day 10 hours'
  from (select date_trunc('month', p.paid_at at time zone 'America/Mexico_City') mo, sum(p.amount) total
          from public.payments p join public.families f on f.id = p.family_id
         where f.external_id like 'DEMO-%' and not f.wants_invoice and p.status = 'aprobado'
         group by 1) x
 where mo < date_trunc('month', public.today_mx());

-- ─────────────────────────────────────────────────────────────
-- Reservas: clases de Oberfit, terapia y nutrición (2 semanas atrás y 2 adelante)
-- ─────────────────────────────────────────────────────────────
insert into public.slots (department, title, kind, coach_id, starts_at, ends_at, capacity, price, location)
select x.dep, x.title, x.kind, pg_temp.staff(x.coach), pg_temp.lt(d::date, x.t), pg_temp.lt(d::date, x.t) + x.dur * interval '1 minute',
       x.cap, x.price, x.loc
  from generate_series(public.today_mx() - 14, public.today_mx() + 13, interval '1 day') d
  join (values ('oberfit', 'Funcional', 'clase', 'andres.molina', time '07:00', 50, 14, 0::numeric, 'Área funcional', array[1,3,5]),
               ('oberfit', 'Spinning', 'clase', 'andres.molina', time '19:00', 45, 12, 0, 'Salón de spinning', array[2,4]),
               ('oberfit', 'HIIT', 'clase', 'andres.molina', time '20:00', 45, 12, 0, 'Área funcional', array[1,3]),
               ('oberfit', 'Yoga', 'clase', 'andres.molina', time '09:00', 60, 15, 0, 'Salón A', array[6]),
               ('terapia', 'Terapia física', 'privada', 'ana.vega', time '16:00', 50, 1, 550, 'Consultorio', array[2,4]),
               ('terapia', 'Terapia física', 'privada', 'ana.vega', time '17:00', 50, 1, 550, 'Consultorio', array[2,4]),
               ('nutricion', 'Consulta de nutrición', 'privada', 'ana.vega', time '10:00', 40, 1, 850, 'Consultorio', array[3]),
               ('nutricion', 'Consulta de nutrición', 'privada', 'ana.vega', time '11:00', 40, 1, 850, 'Consultorio', array[3]),
               ('oberfit', 'Carril de nado libre', 'espacio', null, time '13:00', 60, 4, 0, 'Carril 6', array[1,2,3,4,5])
       ) x(dep, title, kind, coach, t, dur, cap, price, loc, dows) on extract(isodow from d)::int = any(x.dows)
 where not pg_temp.festivo(d::date);

insert into public.bookings (slot_id, member_id, status, used_session, membership_id, created_at, cancelled_at)
select s.id, b.member_id,
       case when s.starts_at < now() then case when b.r < 0.85 then 'asistio' when b.r < 0.95 then 'no_asistio' else 'cancelada' end
            else case when b.r < 0.92 then 'reservada' else 'cancelada' end end,
       b.sessions, case when b.sessions then b.ms_id end,
       s.starts_at - (1 + floor(b.r * 5)::int) * interval '1 day',
       case when (s.starts_at < now() and b.r >= 0.95) or (s.starts_at >= now() and b.r >= 0.92) then s.starts_at - interval '1 day' end
  from public.slots s
  cross join lateral (
    select ms.member_id, ms.id as ms_id, p.sessions_per_month is not null as sessions, random() as r
      from public.memberships ms join public.plans p on p.id = ms.plan_id join public.members m on m.id = ms.member_id
      join public.families f on f.id = m.family_id
     where f.external_id like 'DEMO-%' and ms.status = 'activa' and p.department = s.department
       and (s.kind <> 'privada' or random() < 0.8) and s.id is not null
     order by random()
     limit case when s.kind = 'privada' then 1 else floor(s.capacity * (0.45 + random() * 0.5))::int end) b
 where s.department in ('oberfit','terapia','nutricion') and s.created_at > now() - interval '1 hour';

-- ─────────────────────────────────────────────────────────────
-- Niveles y notas de avance
-- ─────────────────────────────────────────────────────────────
insert into public.level_history (member_id, department, level_id, decided_by, notes, created_at)
select e.member_id, l.department, prev.id, pg_temp.staff(case l.department when 'natacion' then 'laura.gomez' when 'ballet' then 'sofia.herrera' else 'valeria.nunez' end),
       'Nivel de ingreso', e.enrolled_at - interval '120 days'
  from public.enrollments e join public.groups g on g.id = e.group_id join public.levels l on l.id = g.level_id
  join public.members m on m.id = e.member_id join public.families f on f.id = m.family_id
  join lateral (select pl.id from public.levels pl where pl.department = l.department and pl.sort_order = l.sort_order - 1 limit 1) prev on true
 where f.external_id like 'DEMO-%' and e.status = 'activa' and l.department in ('natacion','ballet','gimnasia')
   and e.enrolled_at < now() - interval '90 days' and random() < 0.3;
insert into public.level_history (member_id, department, level_id, decided_by, notes, created_at)
select e.member_id, l.department, l.id, pg_temp.staff(case l.department when 'natacion' then 'laura.gomez' when 'ballet' then 'sofia.herrera' else 'valeria.nunez' end),
       case when exists (select 1 from public.level_history h where h.member_id = e.member_id and h.department = l.department)
            then 'Subió de nivel en la evaluación del ciclo' else 'Evaluación inicial' end, e.enrolled_at
  from public.enrollments e join public.groups g on g.id = e.group_id join public.levels l on l.id = g.level_id
  join public.members m on m.id = e.member_id join public.families f on f.id = m.family_id
 where f.external_id like 'DEMO-%' and e.status = 'activa' and l.department in ('natacion','ballet','gimnasia');

insert into public.progress_notes (member_id, department, note, visible_to_family, created_by, created_at)
select e.member_id, l.department,
       (case l.department
          when 'natacion' then array['Ya flota de espalda sin apoyo. Seguimos con patada de crol.','Mejoró mucho la respiración lateral.',
                                     'Le cuesta entrar al agua profunda; vamos poco a poco.','Lista para evaluación de cambio de nivel.',
                                     'Excelente técnica de dorso. Trabajar vueltas.','Faltó varias clases; conviene reforzar en casa la confianza.']
          when 'ballet' then array['Muy buena postura en barra.','Trabajar puntas y extensión de rodilla.','Aprendió la coreografía del festival.',
                                   'Necesita traer el cabello recogido en chongo.','Gran avance en giros.']
          else array['Ya hace la rueda de carro sola.','Mejoró la fuerza en barras.','Trabajar flexibilidad en casa (split).',
                     'Muy disciplinada en el calentamiento.','Lista para presentar en la exhibición.'] end)[1 + floor(random() * 5)::int],
       random() < 0.85, g.coach_id, now() - floor(random() * 40)::int * interval '1 day' - interval '3 hours'
  from public.enrollments e join public.groups g on g.id = e.group_id join public.levels l on l.id = g.level_id
  join public.members m on m.id = e.member_id join public.families f on f.id = m.family_id
 where f.external_id like 'DEMO-%' and e.status = 'activa' and l.department in ('natacion','ballet','gimnasia') and random() < 0.45;

-- ─────────────────────────────────────────────────────────────
-- Avisos y recordatorios enviados
-- ─────────────────────────────────────────────────────────────
insert into public.announcements (title, body, department, audience, starts_on, ends_on, created_by, created_at) values
  ('Vacaciones de invierno', 'Del 21 de diciembre al 6 de enero no hay clases regulares. Oberfit abre de 7:00 a 14:00 (cerrado 24, 25 y 31 de diciembre y 1 de enero).',
   null, 'familias', public.today_mx() - 3, '2027-01-06', null, now() - interval '3 days'),
  ('Festival de ballet', 'Sábado 13 de diciembre a las 11:00 en el Salón B. Ensayo general el jueves 11 en el horario de clase.',
   'ballet', 'familias', public.today_mx() - 5, '2026-12-13', pg_temp.staff('sofia.herrera'), now() - interval '5 days'),
  ('Evaluaciones de nivel en natación', 'La semana del 1 al 5 de diciembre los coaches evaluarán a todos los alumnos. Los resultados se verán en el portal.',
   'natacion', 'familias', public.today_mx() - 1, '2026-12-05', pg_temp.staff('laura.gomez'), now() - interval '1 day'),
  ('Junta de coaches', 'Lunes 1 de diciembre a las 14:00 en la sala de juntas. Traer listas de evaluación.',
   null, 'personal', public.today_mx() - 2, '2026-12-01', pg_temp.staff('laura.gomez'), now() - interval '2 days');

insert into public.notifications (family_id, member_id, channel, template, subject, body, status, created_at, sent_at, sent_by)
select f.id, null, 'correo', 'mensualidad', 'Tu mensualidad de ' || c.period, 'Total: $' || to_char(c.amount, 'FM999,999,990.00') || ' MXN',
       'enviado', pg_temp.lt(c.due_date, '06:00'), pg_temp.lt(c.due_date, '06:01'), null
  from public.charges c join public.families f on f.id = c.family_id
 where f.external_id like 'DEMO-%' and c.period = to_char(public.today_mx(), 'YYYY-MM');

insert into public.notifications (family_id, member_id, channel, template, body, status, created_at, sent_at, sent_by)
select c.family_id, m.id, 'whatsapp', 'pago_vencido',
       'Hola ' || m.first_name || ', te recordamos que tienes un pago pendiente de $' || to_char(c.amount, 'FM999,999,990.00') || ' en Oberlicht. Puedes pagar en recepción o por transferencia.',
       'enviado', now() - interval '3 days' + interval '2 hours', now() - interval '3 days' + interval '2 hours', pg_temp.staff('paola.diaz')
  from public.charges c join public.members m on m.family_id = c.family_id and m.is_titular
 where c.status = 'vencido' and c.period = to_char(public.today_mx(), 'YYYY-MM') and random() < 0.6;

insert into public.notifications (family_id, member_id, channel, template, body, status, created_at, sent_at, sent_by)
select m.family_id, m.id, case when random() < 0.7 then 'whatsapp' else 'correo' end, 'te_extranamos',
       'Hola ' || m.first_name || ', te extrañamos en Oberlicht. ¿Todo bien? Aquí estamos para ayudarte a retomar.',
       'enviado', now() - interval '2 days', now() - interval '2 days', pg_temp.staff('paola.diaz')
  from _risk r join public.members m on m.id = r.member_id
 where r.stop < public.today_mx() - 25;

-- ─────────────────────────────────────────────────────────────
-- Mantenimiento
-- ─────────────────────────────────────────────────────────────
insert into public.suppliers (name, rfc, contact, phone, email, areas, payment_terms, delivery_days, rating, notes, created_at) values
  ('Químicos Acuáticos del Valle', 'QAV150312AB1', 'Lic. Teresa Mora', '55 0101 2020', 'ventas@quimicosdemo.mx', array['alberca'], 'Crédito 15 días', 2, 5, 'Entrega en sitio. Proveedor de demostración.', now() - interval '200 days'),
  ('Distribuidora Hidrotec', 'DHI180905KJ3', 'Ing. Raúl Pineda', '55 0303 4040', 'pedidos@hidrotecdemo.mx', array['alberca','plomeria'], 'Contado', 4, 4, 'Buen precio en volumen. Proveedor de demostración.', now() - interval '200 days'),
  ('Ferretería La Esperanza', 'FES990101QW2', 'Don Chucho', '55 0505 6060', null, array['plomeria','electrico','edificio'], 'Contado', 1, 4, 'A dos cuadras del club. Proveedor de demostración.', now() - interval '200 days'),
  ('Climas y Refrigeración Sánchez', 'CRS120620PL8', 'Marco Sánchez', '55 0707 8080', 'servicio@climasdemo.mx', array['clima'], 'Crédito 30 días', 3, 3, 'Servicio técnico de mini-splits. Proveedor de demostración.', now() - interval '200 days'),
  ('Limpieza Total Industrial', 'LTI200214MN5', 'Sandra Vélez', '55 0909 1010', 'contacto@limpiezademo.mx', array['limpieza'], 'Crédito 15 días', 3, 5, 'Proveedor de demostración.', now() - interval '200 days');

insert into public.supplies (area, name, category, unit, stock, min_stock, reorder_qty, daily_use, purchase_every_days, preferred_supplier, notes, created_at)
select x.area, x.name, x.cat, x.unit, 0, x.mn, x.ro, x.du, x.every, (select id from public.suppliers where name = x.sup), null, now() - interval '150 days'
  from (values ('alberca', 'Hipoclorito de calcio 65%', 'Químicos', 'kg', 40, 100, 3.0, 30, 'Químicos Acuáticos del Valle'),
               ('alberca', 'Ácido muriático', 'Químicos', 'L', 30, 80, 2.0, 30, 'Químicos Acuáticos del Valle'),
               ('alberca', 'Bicarbonato de sodio', 'Químicos', 'kg', 25, 50, 0.8, 45, 'Distribuidora Hidrotec'),
               ('alberca', 'Cloruro de calcio', 'Químicos', 'kg', 20, 50, 0.4, 60, 'Distribuidora Hidrotec'),
               ('alberca', 'Ácido cianúrico (estabilizador)', 'Químicos', 'kg', 10, 25, 0.15, 90, 'Químicos Acuáticos del Valle'),
               ('alberca', 'Clarificador', 'Químicos', 'L', 8, 20, 0.3, 45, 'Químicos Acuáticos del Valle'),
               ('alberca', 'Reactivos DPD (cloro)', 'Medición', 'pza', 50, 200, 4, 45, 'Distribuidora Hidrotec'),
               ('alberca', 'Arena sílica para filtro', 'Filtración', 'bulto', 4, 10, 0, 365, 'Distribuidora Hidrotec'),
               ('limpieza', 'Desinfectante multiusos', 'Limpieza', 'L', 20, 60, 1.5, 30, 'Limpieza Total Industrial'),
               ('limpieza', 'Jabón para manos', 'Limpieza', 'L', 15, 40, 1.0, 30, 'Limpieza Total Industrial'),
               ('limpieza', 'Papel higiénico (caja 12 rollos)', 'Consumibles', 'caja', 10, 30, 0.8, 30, 'Limpieza Total Industrial'),
               ('electrico', 'Foco LED 12 W', 'Refacciones', 'pza', 12, 24, 0.1, 120, 'Ferretería La Esperanza'),
               ('plomeria', 'Cinta teflón', 'Refacciones', 'pza', 10, 20, 0.05, 180, 'Ferretería La Esperanza'),
               ('clima', 'Filtro para mini-split', 'Refacciones', 'pza', 6, 12, 0.05, 180, 'Climas y Refrigeración Sánchez')
       ) x(area, name, cat, unit, mn, ro, du, every, sup);

-- Cotizaciones para comparar proveedores
insert into public.supplier_prices (supply_id, supplier_id, unit_price, source, quoted_on, notes)
select s.id, sp.id, round((x.base * (0.9 + random() * 0.3))::numeric, 2), 'cotizacion', public.today_mx() - floor(random() * 50)::int, 'Cotización por correo'
  from public.supplies s
  join (values ('Hipoclorito de calcio 65%', 68), ('Ácido muriático', 22), ('Bicarbonato de sodio', 28), ('Cloruro de calcio', 35),
               ('Ácido cianúrico (estabilizador)', 120), ('Clarificador', 95), ('Reactivos DPD (cloro)', 6.5)) x(name, base) on x.name = s.name
  join public.suppliers sp on 'alberca' = any(sp.areas);

insert into public.maint_assets (area, name, brand, model, serial, location, purchase_date, warranty_until, status, notes)
values ('alberca', 'Bomba principal 3 HP', 'Pentair', 'WhisperFlo', 'PF-30221', 'Cuarto de máquinas', '2022-03-10', '2025-03-10', 'operando', null),
       ('alberca', 'Bomba de respaldo 2 HP', 'Pentair', 'SuperFlo', 'PF-21877', 'Cuarto de máquinas', '2022-03-10', '2025-03-10', 'operando', null),
       ('alberca', 'Filtro de arena 1', 'Hayward', 'Pro S310', 'HW-1101', 'Cuarto de máquinas', '2022-03-10', null, 'operando', null),
       ('alberca', 'Filtro de arena 2', 'Hayward', 'Pro S310', 'HW-1102', 'Cuarto de máquinas', '2022-03-10', null, 'operando', null),
       ('alberca', 'Calentador de alberca', 'Raypak', 'Avia 400', 'RP-77810', 'Cuarto de máquinas', '2023-01-15', '2027-01-15', 'falla', 'No enciende el piloto; en garantía'),
       ('alberca', 'Clorador automático', 'Hayward', 'CL220', 'HW-CL883', 'Cuarto de máquinas', '2023-06-01', '2025-06-01', 'operando', null),
       ('clima', 'Mini-split Salón A', 'Mirage', 'Magnum 18', 'MG-55102', 'Salón A', '2021-08-20', null, 'operando', null),
       ('clima', 'Mini-split Salón B', 'Mirage', 'Magnum 18', 'MG-55103', 'Salón B', '2021-08-20', null, 'operando', null),
       ('gimnasio', 'Caminadora 1', 'Life Fitness', 'T5', 'LF-T5-001', 'Gimnasio', '2021-05-01', null, 'operando', null),
       ('gimnasio', 'Caminadora 2', 'Life Fitness', 'T5', 'LF-T5-002', 'Gimnasio', '2021-05-01', null, 'operando', null),
       ('gimnasio', 'Caminadora 3', 'Life Fitness', 'T5', 'LF-T5-003', 'Gimnasio', '2021-05-01', null, 'fuera_servicio', 'Banda rota, esperando refacción'),
       ('electrico', 'Tablero eléctrico principal', 'Square D', 'QO', null, 'Cuarto eléctrico', '2019-02-01', null, 'operando', null),
       ('plomeria', 'Hidroneumático', 'Evans', 'HN-750', 'EV-4421', 'Azotea', '2020-09-12', null, 'operando', null);

-- Tareas de rutina de otras áreas (las de alberca ya existen)
insert into public.maint_tasks (area, asset_id, title, instructions, frequency_days, last_done_on, next_due_on, assigned_to, est_minutes)
values ('clima', null, 'Limpiar filtros de mini-splits', 'Desmontar filtros, lavar con agua y jabón, dejar secar y reinstalar.', 30, public.today_mx() - 25, public.today_mx() + 5, pg_temp.staff('ricardo.pena'), 45),
       ('electrico', null, 'Revisar tablero y apriete de conexiones', 'Con el tablero desenergizado, revisar apriete y temperatura de pastillas.', 90, public.today_mx() - 95, public.today_mx() - 5, pg_temp.staff('ricardo.pena'), 60),
       ('gimnasio', null, 'Lubricar y alinear bandas de caminadoras', 'Silicón para banda, revisar tensión y alineación.', 30, public.today_mx() - 10, public.today_mx() + 20, pg_temp.staff('ricardo.pena'), 40),
       ('plomeria', null, 'Revisar fugas en regaderas y lavabos', 'Recorrer vestidores; anotar llaves que goteen.', 15, public.today_mx() - 15, public.today_mx(), pg_temp.staff('ricardo.pena'), 30),
       ('jardin', null, 'Poda y riego de jardineras', null, 14, public.today_mx() - 8, public.today_mx() + 6, pg_temp.staff('ricardo.pena'), 60),
       ('limpieza', null, 'Limpieza profunda de vestidores', 'Tallado de pisos y juntas, desinfección de bancas.', 7, public.today_mx() - 7, public.today_mx(), pg_temp.staff('ricardo.pena'), 90);

-- Fechas en las tareas de alberca que ya existían (se restauran al borrar el demo)
update public.maint_tasks t set assigned_to = pg_temp.staff('ricardo.pena'),
       last_done_on = public.today_mx() - x.ago, next_due_on = public.today_mx() - x.ago + t.frequency_days
  from (values ('Medir pH, cloro y temperatura', 1), ('Aspirar fondo y cepillar paredes', 2), ('Retrolavado de filtros', 9),
               ('Limpiar canastillas de desnatadores y prefiltro de bomba', 1), ('Medir alcalinidad, dureza y ácido cianúrico', 3),
               ('Revisar bombas, motores y fugas', 12), ('Revisar calentador / caldera', 33),
               ('Cambio o limpieza profunda de medio filtrante', 200), ('Supercloración (choque)', 6)) x(title, ago)
 where t.area = 'alberca' and t.title = x.title and t.id in (select id from _tasks0);

-- Órdenes de trabajo
insert into public.work_orders (area, asset_id, kind, title, description, priority, status, reported_by, assigned_to, supplier_id,
                                due_on, started_at, completed_at, labor_cost, materials_cost, resolution, created_at)
select x.area, (select id from public.maint_assets where name = x.asset), x.kind, x.title, x.descr, x.prio, x.st,
       pg_temp.staff(x.rep), pg_temp.staff('ricardo.pena'), (select id from public.suppliers where name = x.sup),
       public.today_mx() + x.due, case when x.st in ('en_proceso','en_espera','terminada') then now() - (x.ago - 1) * interval '1 day' end,
       case when x.st = 'terminada' then now() - (x.ago - 2) * interval '1 day' end, x.labor, x.mat, x.res, now() - x.ago * interval '1 day'
  from (values
    ('alberca', 'Calentador de alberca', 'correctivo', 'El calentador no enciende', 'La alberca bajó a 26.5 °C. El piloto no prende.', 'urgente', 'en_espera', 'mariana.ruiz', 'Distribuidora Hidrotec', 1, 3, 0, 0, null),
    ('plomeria', null, 'correctivo', 'Fuga en regadera 3 del vestidor de hombres', 'Gotea constantemente aunque esté cerrada.', 'media', 'en_proceso', 'paola.diaz', 'Ferretería La Esperanza', 2, 2, 0, 0, null),
    ('gimnasio', 'Caminadora 3', 'correctivo', 'Cambiar banda de caminadora 3', 'La banda se rompió. Se pidió refacción al distribuidor.', 'alta', 'en_espera', 'andres.molina', null, 5, 12, 0, 0, null),
    ('electrico', null, 'correctivo', 'Lámparas fundidas en pasillo de vestidores', 'Tres lámparas sin funcionar.', 'baja', 'abierta', 'paola.diaz', null, 7, 1, 0, 0, null),
    ('edificio', null, 'mejora', 'Pintar barandal de la entrada', 'Se ve oxidado. Lijar y pintar.', 'baja', 'abierta', 'laura.gomez', null, 20, 4, 0, 0, null),
    ('clima', 'Mini-split Salón B', 'preventivo', 'Mantenimiento semestral de mini-splits', 'Limpieza de serpentines y revisión de gas.', 'media', 'terminada', 'sofia.herrera', 'Climas y Refrigeración Sánchez', -60, 64, 2400, 850, 'Se limpiaron ambos equipos y se recargó gas al del Salón B.'),
    ('alberca', 'Filtro de arena 2', 'preventivo', 'Revisión de válvula multipuerto del filtro 2', 'Fuga ligera en la válvula al retrolavar.', 'media', 'terminada', 'ricardo.pena', 'Distribuidora Hidrotec', -35, 38, 600, 1450, 'Se cambió el empaque de la válvula.'),
    ('alberca', 'Bomba principal 3 HP', 'correctivo', 'Ruido en bomba principal', 'Zumbido fuerte al arrancar.', 'alta', 'terminada', 'mariana.ruiz', null, -95, 97, 800, 1200, 'Se cambiaron baleros del motor.'),
    ('limpieza', null, 'correctivo', 'Destapar coladera de regaderas de mujeres', null, 'media', 'terminada', 'paola.diaz', null, -12, 13, 350, 0, 'Se destapó con guía.'),
    ('plomeria', 'Hidroneumático', 'preventivo', 'Revisión de presión del hidroneumático', null, 'baja', 'terminada', 'ricardo.pena', null, -130, 132, 0, 0, 'Presión correcta: 40 psi.'),
    ('edificio', null, 'mejora', 'Antiderrapante en escaleras de la alberca', 'Colocar cinta antiderrapante.', 'media', 'cancelada', 'laura.gomez', null, -40, 45, 0, 0, 'Se hará en la remodelación de enero.')
  ) x(area, asset, kind, title, descr, prio, st, rep, sup, due, ago, labor, mat, res)
 order by x.ago desc;

-- Compras con factura (al registrar cada partida sube el inventario y se guarda el precio)
do $$
declare v_today date := public.today_mx(); c record; v_pur uuid; v_sub numeric; it record;
begin
  for c in select * from (values
      (130, 'alberca', 'Químicos Acuáticos del Valle', 'A-4410', 'pagada', null::text),
      (100, 'alberca', 'Químicos Acuáticos del Valle', 'A-4502', 'pagada', null),
      (95,  'alberca', 'Distribuidora Hidrotec', 'F-22871', 'pagada', 'Ruido en bomba principal'),
      (70,  'alberca', 'Químicos Acuáticos del Valle', 'A-4618', 'pagada', null),
      (60,  'clima', 'Climas y Refrigeración Sánchez', 'CS-1190', 'pagada', 'Mantenimiento semestral de mini-splits'),
      (45,  'limpieza', 'Limpieza Total Industrial', 'LT-3021', 'pagada', null),
      (38,  'alberca', 'Distribuidora Hidrotec', 'F-23104', 'pagada', 'Revisión de válvula multipuerto del filtro 2'),
      (35,  'alberca', 'Químicos Acuáticos del Valle', 'A-4733', 'pagada', null),
      (14,  'limpieza', 'Limpieza Total Industrial', 'LT-3110', 'por_pagar', null),
      (6,   'alberca', 'Químicos Acuáticos del Valle', 'A-4851', 'por_pagar', null),
      (3,   'plomeria', 'Ferretería La Esperanza', 'T-88213', 'por_pagar', 'Fuga en regadera 3 del vestidor de hombres')
    ) x(ago, area, sup, folio, st, wo) loop
    insert into public.purchases (area, supplier_id, invoice_number, invoice_uuid, invoice_date, subtotal, tax, total, status, paid_at,
                                  work_order_id, notes, created_by, created_at)
    values (c.area, (select id from public.suppliers where name = c.sup), c.folio, upper(gen_random_uuid()::text), v_today - c.ago, 0, 0, 1,
            c.st, case when c.st = 'pagada' then v_today - c.ago + 10 end, (select id from public.work_orders where title = c.wo),
            'Factura de demostración', pg_temp.staff('ricardo.pena'), pg_temp.lt(v_today - c.ago, '12:00'))
    returning id into v_pur;
    for it in
      select s.id, s.name, s.unit,
             case when c.wo is not null then null else s.reorder_qty end as qty,
             round((coalesce((select avg(unit_price) from public.supplier_prices sp where sp.supply_id = s.id), 50) * (0.95 + random() * 0.1))::numeric, 2) as price
        from public.supplies s
       where c.wo is null and s.area = c.area and s.preferred_supplier = (select id from public.suppliers where name = c.sup)
         and s.reorder_qty > 0 and (s.daily_use >= 1 or c.ago in (130, 45, 35))
    loop
      insert into public.purchase_items (purchase_id, supply_id, description, qty, unit_price)
      values (v_pur, it.id, it.name || ' (' || it.unit || ')', it.qty, it.price);
    end loop;
    if c.wo is not null then
      insert into public.purchase_items (purchase_id, supply_id, description, qty, unit_price)
      values (v_pur, null, case c.area when 'clima' then 'Servicio y recarga de gas R410' when 'plomeria' then 'Cartucho de regadera y llave de paso'
                               else 'Refacciones según orden de trabajo' end, 1,
              (select coalesce(nullif(materials_cost, 0), 480) from public.work_orders where title = c.wo));
    end if;
    select coalesce(sum(total), 0) into v_sub from public.purchase_items where purchase_id = v_pur;
    update public.purchases set subtotal = v_sub, tax = round(v_sub * 0.16, 2), total = round(v_sub * 1.16, 2) where id = v_pur;
  end loop;
end $$;

-- Consumo de materiales y conteo físico: algunas existencias quedan bajo el mínimo
insert into public.supply_moves (supply_id, qty, kind, note, created_by, created_at)
select s.id, -round((s.daily_use * 7)::numeric, 2), 'uso', 'Consumo semanal', pg_temp.staff('ricardo.pena'), now() - w * interval '7 days'
  from public.supplies s cross join generate_series(0, 17) w
 where s.daily_use > 0 and s.created_at > now() - interval '1 day' - interval '150 days' and s.id not in (select (id)::uuid from _pre where t = 'supplies');
do $$
declare s record; v_target numeric;
begin
  for s in select * from public.supplies where id not in (select (id)::uuid from _pre where t = 'supplies') loop
    v_target := case s.name when 'Hipoclorito de calcio 65%' then 32 when 'Clarificador' then 5 when 'Papel higiénico (caja 12 rollos)' then 7
                            else s.min_stock + round((s.reorder_qty * (0.3 + random() * 0.6))::numeric) end;
    insert into public.supply_moves (supply_id, qty, kind, note, created_by, created_at)
    values (s.id, v_target - (select coalesce(sum(qty), 0) from public.supply_moves where supply_id = s.id), 'ajuste', 'Conteo físico',
            pg_temp.staff('ricardo.pena'), now() - interval '1 day');
    update public.supplies set stock = v_target where id = s.id;
  end loop;
end $$;

-- Bitácora de la alberca: 2 lecturas al día en cada cuerpo de agua, 45 días
insert into public.pool_logs (pool, taken_at, ph, free_chlorine, combined_chlorine, alkalinity, hardness, cya, temperature, clarity,
                              chemicals_added, backwash, notes, taken_by)
select p.pool, pg_temp.lt(d::date, h.t) + floor(random() * 25)::int * interval '1 minute',
       round((7.45 + (random() - 0.5) * 0.36)::numeric, 2),
       round((1.9 + (random() - 0.5) * 1.4)::numeric, 1),
       round((random() * 0.18)::numeric, 2),
       case when extract(isodow from d) = 1 and h.t = '08:00' then round(90 + random() * 25) end,
       case when extract(isodow from d) = 1 and h.t = '08:00' then round(240 + random() * 80) end,
       case when extract(isodow from d) = 1 and h.t = '08:00' then round(25 + random() * 15) end,
       round(((case p.pool when 'Chapoteadero' then 29.3 else 28.4 end) + (random() - 0.5) * 1.0)::numeric, 1),
       'cristalina',
       case when random() < 0.18 then (array['Hipoclorito 1.5 kg','Ácido muriático 2 L','Bicarbonato 3 kg','Clarificador 0.5 L'])[1 + floor(random() * 4)::int] end,
       p.pool = 'Alberca principal' and extract(isodow from d) = 1 and h.t = '08:00', null,
       pg_temp.staff(case when h.t = '08:00' then 'ricardo.pena' else 'mariana.ruiz' end)
  from generate_series(public.today_mx() - 44, public.today_mx(), interval '1 day') d
  cross join (values ('Alberca principal'), ('Chapoteadero')) p(pool)
  cross join (values (time '08:00'), (time '16:00')) h(t)
 where pg_temp.lt(d::date, h.t) + interval '25 minutes' < now();

-- Lecturas fuera de rango (para que se vean las alertas)
update public.pool_logs set ph = 7.95, chemicals_added = 'Ácido muriático 3 L', notes = 'pH alto después de lluvia'
 where id = (select id from public.pool_logs where pool = 'Alberca principal' and taken_at::date = public.today_mx() - 12 order by taken_at limit 1);
update public.pool_logs set free_chlorine = 0.6, clarity = 'ligeramente_turbia', chemicals_added = 'Hipoclorito 1 kg', notes = 'Mucho uso en clase de bebés'
 where id = (select id from public.pool_logs where pool = 'Chapoteadero' and taken_at::date = public.today_mx() - 5 order by taken_at desc limit 1);
update public.pool_logs set temperature = round((26.4 + random() * 0.5)::numeric, 1), notes = 'Calentador sin funcionar'
 where pool = 'Alberca principal' and taken_at > now() - interval '3 days';

-- ─────────────────────────────────────────────────────────────
-- Registro de lo cargado (para poder borrarlo exacto) y limpieza
-- ─────────────────────────────────────────────────────────────
delete from public.audit_log where id > (select m from _audit0);

insert into public.settings (key, value, description, updated_at)
select 'demo_data',
       jsonb_build_object(
         'cargado', now(),
         'familias', (select count(*) from public.families where external_id like 'DEMO-%'),
         'ids', (select jsonb_object_agg(t, ids) from (
                   select t, jsonb_agg(id) ids from (
                     select 'sales' t, id::text id from public.sales
                     union all select 'products', id::text from public.products
                     union all select 'coupons', id::text from public.coupons
                     union all select 'coupon_redemptions', id::text from public.coupon_redemptions
                     union all select 'lockers', id::text from public.lockers
                     union all select 'slots', id::text from public.slots
                     union all select 'announcements', id::text from public.announcements
                     union all select 'invoices', id::text from public.invoices
                     union all select 'notifications', id::text from public.notifications
                     union all select 'import_batches', id::text from public.import_batches
                     union all select 'suppliers', id::text from public.suppliers
                     union all select 'supplies', id::text from public.supplies
                     union all select 'supplier_prices', id::text from public.supplier_prices
                     union all select 'maint_assets', id::text from public.maint_assets
                     union all select 'work_orders', id::text from public.work_orders
                     union all select 'purchases', id::text from public.purchases
                     union all select 'pool_logs', id::text from public.pool_logs
                     union all select 'maint_tasks', id::text from public.maint_tasks
                   ) a where (t, id) not in (select t, id from _pre) group by t) g),
         'tareas_originales', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from _tasks0 x)),
       'Datos de demostración cargados. Se borran con supabase/demo/99_borrar_demo.sql', now()
on conflict (key) do update set value = excluded.value, description = excluded.description, updated_at = now();

drop table if exists _pre; drop table if exists _audit0; drop table if exists _tasks0; drop table if exists _risk;
drop table if exists _ses; drop table if exists _subs; drop table if exists _mi; drop table if exists _morosos;

select 'Datos demo cargados' as resultado,
       (select count(*) from public.families where external_id like 'DEMO-%') as familias,
       (select count(*) from public.members m join public.families f on f.id = m.family_id where f.external_id like 'DEMO-%') as socios,
       (select count(*) from public.visits) as entradas,
       (select count(*) from public.payments) as pagos,
       (select count(*) from public.sales) as ventas;
