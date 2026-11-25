-- Importación de datos del sistema anterior (socios y entradas/salidas) y analítica del club.

-- ─────────────────────────────────────────────────────────────
-- Antigüedad e identificadores del sistema anterior
-- ─────────────────────────────────────────────────────────────
alter table public.families add column if not exists member_since date;
alter table public.families add column if not exists external_id text;
create unique index if not exists families_external_id on public.families (external_id) where external_id is not null;
alter table public.members add column if not exists member_since date;
alter table public.members add column if not exists external_id text;
create unique index if not exists members_external_id on public.members (external_id) where external_id is not null;

-- ─────────────────────────────────────────────────────────────
-- Visitas: entradas y salidas (recepción, importadas o por API del sistema de acceso)
-- ─────────────────────────────────────────────────────────────
create table public.import_batches (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('socios','visitas')),
  file_name   text,
  rows_total  int not null default 0,
  rows_ok     int not null default 0,
  rows_skipped int not null default 0,
  rows_error  int not null default 0,
  errors      jsonb not null default '[]',
  created_by  uuid references public.profiles(id) default auth.uid(),
  created_at  timestamptz not null default now()
);
alter table public.import_batches enable row level security;
create policy "ver importaciones" on public.import_batches for select to authenticated using (public.is_front_office());

create table public.visits (
  id            uuid primary key default gen_random_uuid(),
  member_id     uuid not null references public.members(id) on delete cascade,
  department    text references public.departments(code),
  check_in_at   timestamptz not null,
  check_out_at  timestamptz,
  source        text not null default 'recepcion' check (source in ('recepcion','importado','api')),
  import_batch  uuid references public.import_batches(id) on delete set null,
  recorded_by   uuid references public.profiles(id),
  created_at    timestamptz not null default now(),
  check (check_out_at is null or check_out_at >= check_in_at)
);
create unique index visits_unique on public.visits (member_id, check_in_at);
create index on public.visits (check_in_at);
alter table public.visits enable row level security;
create policy "ver visitas" on public.visits for select to authenticated
  using (public.is_front_office() or (department is not null and public.has_department(department))
         or member_id in (select id from public.members where family_id in (select public.my_family_ids())));

-- Entrada desde recepción: además de la asistencia del día, abre una visita.
create or replace function public.registrar_entrada(p_member uuid, p_department text)
returns public.attendance
language plpgsql security definer set search_path = public as $$
declare v_row public.attendance;
begin
  if not public.is_front_office() and not public.has_department(p_department) then
    raise exception 'No tienes permiso para registrar entradas';
  end if;
  insert into public.attendance (member_id, group_id, department, date, status, recorded_by)
  values (p_member, null, p_department, public.today_mx(), 'presente', auth.uid())
  on conflict (member_id, coalesce(group_id, '00000000-0000-0000-0000-000000000000'::uuid), date)
  do update set recorded_at = now()
  returning * into v_row;
  insert into public.visits (member_id, department, check_in_at, source, recorded_by)
  values (p_member, p_department, now(), 'recepcion', auth.uid())
  on conflict do nothing;
  return v_row;
end $$;

create or replace function public.registrar_salida(p_member uuid)
returns public.visits
language plpgsql security definer set search_path = public as $$
declare v public.visits;
begin
  if not public.is_front_office() then raise exception 'Solo recepción registra salidas'; end if;
  update public.visits set check_out_at = now()
   where id = (select id from public.visits where member_id = p_member and check_out_at is null
                 and check_in_at > now() - interval '18 hours' order by check_in_at desc limit 1)
  returning * into v;
  if not found then raise exception 'No hay una entrada abierta hoy para esta persona'; end if;
  return v;
end $$;

-- ─────────────────────────────────────────────────────────────
-- Importar entradas/salidas
-- p_rows: [{"ref","nombre","numero_familia","entrada","salida","area"}]  (entrada/salida en ISO con zona)
-- Busca al socio por id del sistema anterior, luego por número de familia + nombre, luego por nombre único.
-- ─────────────────────────────────────────────────────────────
-- Lectura tolerante de datos importados (fechas dd/mm/aaaa, horas sin zona = hora de CDMX, sí/no)
create or replace function public.imp_fecha(p text) returns date language plpgsql immutable as $$
declare t text := btrim(coalesce(p, ''));
begin
  if t = '' then return null; end if;
  if t ~ '^\d{1,2}[/.-]\d{1,2}[/.-]\d{4}' then
    return make_date(split_part(regexp_replace(t, '[/.-]', '/', 'g'), '/', 3)::int % 10000,
                     split_part(regexp_replace(t, '[/.-]', '/', 'g'), '/', 2)::int,
                     split_part(regexp_replace(t, '[/.-]', '/', 'g'), '/', 1)::int);
  end if;
  return left(t, 10)::date;
end $$;

create or replace function public.imp_momento(p text) returns timestamptz language plpgsql stable as $$
declare t text := btrim(coalesce(p, '')); d text; h text;
begin
  if t = '' then return null; end if;
  if t ~ '^\d{1,2}[/.-]\d{1,2}[/.-]\d{4}' then
    d := substring(t from '^\S+'); h := btrim(substr(t, length(d) + 1));
    t := public.imp_fecha(d)::text || ' ' || coalesce(nullif(h, ''), '00:00');
  end if;
  if t ~ '([zZ]|[+-]\d{2}(:?\d{2})?)$' then return t::timestamptz; end if;
  return t::timestamp at time zone 'America/Mexico_City';
end $$;

create or replace function public.imp_bool(p text) returns boolean language sql immutable as $$
  select case when p is null or btrim(p) = '' then null
              else lower(btrim(p)) in ('si','sí','s','x','1','true','verdadero','yes','y','titular') end
$$;

create or replace function public.importar_visitas(p_rows jsonb, p_file text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r jsonb; v_batch uuid; v_member uuid; v_in timestamptz; v_out timestamptz; v_area text;
  n_ok int := 0; n_dup int := 0; n_err int := 0; v_errors jsonb := '[]'; v_i int := 0; v_cnt int;
begin
  if not public.is_front_office() then raise exception 'Solo recepción, administración o dirección pueden importar'; end if;
  insert into public.import_batches (kind, file_name, rows_total) values ('visitas', p_file, jsonb_array_length(p_rows)) returning id into v_batch;

  for r in select * from jsonb_array_elements(p_rows) loop
    v_i := v_i + 1; v_member := null;
    begin
      v_in := public.imp_momento(r->>'entrada');
      v_out := public.imp_momento(r->>'salida');
      if v_in is null then raise exception 'Sin fecha y hora de entrada'; end if;
      if v_out is not null and v_out < v_in then v_out := null; end if;

      if coalesce(r->>'ref', '') <> '' then
        select id into v_member from public.members where external_id = r->>'ref';
      end if;
      if v_member is null and coalesce(r->>'numero_familia', '') <> '' and coalesce(r->>'nombre', '') <> '' then
        select m.id into v_member from public.members m join public.families f on f.id = m.family_id
         where (f.number::text = r->>'numero_familia' or f.external_id = r->>'numero_familia')
           and lower(m.first_name || ' ' || m.last_name) like '%' || lower(trim(r->>'nombre')) || '%'
         limit 1;
      end if;
      if v_member is null and coalesce(r->>'nombre', '') <> '' then
        select count(*), min(m.id::text)::uuid into v_cnt, v_member from public.members m
         where lower(trim(m.first_name || ' ' || m.last_name)) = lower(trim(r->>'nombre'));
        if v_cnt <> 1 then v_member := null; end if;
      end if;
      if v_member is null then raise exception 'No encontramos al socio'; end if;

      v_area := nullif(lower(r->>'area'), '');
      if v_area is not null and not exists (select 1 from public.departments where code = v_area) then v_area := null; end if;

      insert into public.visits (member_id, department, check_in_at, check_out_at, source, import_batch, recorded_by)
      values (v_member, v_area, v_in, v_out, 'importado', v_batch, auth.uid())
      on conflict (member_id, check_in_at) do nothing;
      if found then n_ok := n_ok + 1; else n_dup := n_dup + 1; end if;
    exception when others then
      n_err := n_err + 1;
      if jsonb_array_length(v_errors) < 200 then
        v_errors := v_errors || jsonb_build_object('fila', v_i, 'dato', coalesce(r->>'nombre', r->>'ref', ''), 'motivo', sqlerrm);
      end if;
    end;
  end loop;

  update public.import_batches set rows_ok = n_ok, rows_skipped = n_dup, rows_error = n_err, errors = v_errors where id = v_batch;
  return jsonb_build_object('lote', v_batch, 'importados', n_ok, 'repetidos', n_dup, 'con_error', n_err, 'errores', v_errors);
end $$;

-- ─────────────────────────────────────────────────────────────
-- Importar socios y familias
-- p_rows: [{"id_externo","familia","numero_familia","nombre","apellidos","titular","fecha_nacimiento",
--           "celular","correo","socio_desde","alergias","notas","rfc","genero"}]
-- La familia se identifica por numero_familia (del sistema anterior) o, si no hay, por su nombre.
-- ─────────────────────────────────────────────────────────────
create or replace function public.importar_socios(p_rows jsonb, p_file text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r jsonb; v_batch uuid; v_fam uuid; v_member uuid; v_key text; v_famname text; v_since date; v_birth date;
  v_first text; v_last text; v_new_fam boolean; v_titular boolean; v_i int := 0;
  n_fam int := 0; n_new int := 0; n_upd int := 0; n_err int := 0; v_errors jsonb := '[]';
begin
  if not public.is_front_office() then raise exception 'Solo recepción, administración o dirección pueden importar'; end if;
  insert into public.import_batches (kind, file_name, rows_total) values ('socios', p_file, jsonb_array_length(p_rows)) returning id into v_batch;

  for r in select * from jsonb_array_elements(p_rows) loop
    v_i := v_i + 1;
    begin
      v_first := initcap(trim(coalesce(r->>'nombre', '')));
      v_last := initcap(trim(coalesce(r->>'apellidos', '')));
      if v_first = '' then raise exception 'Falta el nombre'; end if;
      v_since := public.imp_fecha(r->>'socio_desde');
      v_birth := public.imp_fecha(r->>'fecha_nacimiento');
      v_famname := coalesce(nullif(trim(r->>'familia'), ''), nullif('Familia ' || split_part(v_last, ' ', 1), 'Familia '), 'Familia ' || v_first);
      v_key := coalesce(nullif(trim(r->>'numero_familia'), ''), 'nombre:' || lower(v_famname));

      select id into v_fam from public.families where external_id = v_key;
      v_new_fam := v_fam is null;
      if v_new_fam then
        insert into public.families (name, phone, email, rfc, member_since, external_id, notes)
        values (v_famname, nullif(r->>'celular', ''), nullif(lower(r->>'correo'), ''), nullif(upper(r->>'rfc'), ''), v_since, v_key, 'Importada del sistema anterior')
        returning id into v_fam;
      else
        update public.families set
          member_since = least(coalesce(member_since, v_since), coalesce(v_since, member_since)),
          phone = coalesce(phone, nullif(r->>'celular', '')), email = coalesce(email, nullif(lower(r->>'correo'), ''))
        where id = v_fam;
      end if;

      v_member := null;
      if coalesce(r->>'id_externo', '') <> '' then select id into v_member from public.members where external_id = r->>'id_externo'; end if;
      if v_member is null then
        select id into v_member from public.members
         where family_id = v_fam and lower(first_name) = lower(v_first) and lower(last_name) = lower(v_last) limit 1;
      end if;
      v_titular := coalesce(public.imp_bool(r->>'titular'), false) or (v_new_fam and v_member is null);

      if v_member is null then
        insert into public.members (family_id, first_name, last_name, birthdate, gender, is_titular, email, phone,
                                    allergies, medical_notes, member_since, external_id)
        values (v_fam, v_first, v_last, v_birth, case when lower(btrim(r->>'genero')) ~ '^(f|mu|niña)' then 'F' when lower(btrim(r->>'genero')) ~ '^(h|m|ni)' then 'M' end, v_titular,
                nullif(lower(r->>'correo'), ''), nullif(r->>'celular', ''), nullif(r->>'alergias', ''), nullif(r->>'notas', ''),
                v_since, nullif(r->>'id_externo', ''));
        n_new := n_new + 1;
      else
        update public.members set
          birthdate = coalesce(birthdate, v_birth),
          phone = coalesce(phone, nullif(r->>'celular', '')), email = coalesce(email, nullif(lower(r->>'correo'), '')),
          allergies = coalesce(allergies, nullif(r->>'alergias', '')),
          member_since = least(coalesce(member_since, v_since), coalesce(v_since, member_since)),
          external_id = coalesce(external_id, nullif(r->>'id_externo', ''))
        where id = v_member;
        n_upd := n_upd + 1;
      end if;
      if v_new_fam then n_fam := n_fam + 1; end if;
    exception when others then
      n_err := n_err + 1;
      if jsonb_array_length(v_errors) < 200 then
        v_errors := v_errors || jsonb_build_object('fila', v_i, 'dato', trim(coalesce(r->>'nombre', '') || ' ' || coalesce(r->>'apellidos', '')),
          'motivo', case when sqlstate in ('22007','22008') then 'Fecha no válida' when sqlstate = '23514' then 'Dato fuera de lo permitido' else sqlerrm end);
      end if;
    end;
  end loop;

  update public.import_batches set rows_ok = n_new + n_upd, rows_error = n_err, errors = v_errors where id = v_batch;
  return jsonb_build_object('lote', v_batch, 'familias_nuevas', n_fam, 'socios_nuevos', n_new, 'actualizados', n_upd, 'con_error', n_err, 'errores', v_errors);
end $$;

-- ─────────────────────────────────────────────────────────────
-- Analítica
-- Una «suscripción» es una inscripción a grupo o una membresía: inicio, fin y área.
-- Los cambios de grupo no cuentan como baja.
-- ─────────────────────────────────────────────────────────────
create or replace function public.puede_analitica(p_area text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_manager() or (public.my_role() = 'coordinador' and p_area is not null and public.has_department(p_area))
$$;

create or replace function public.suscripciones(p_area text default null)
returns table(member_id uuid, department text, started date, ended date, is_change boolean)
language sql stable security definer set search_path = public as $$
  select e.member_id, l.department,
         (e.enrolled_at at time zone 'America/Mexico_City')::date,
         case when e.status = 'baja' then coalesce((e.ended_at at time zone 'America/Mexico_City')::date, public.today_mx()) end,
         coalesce(e.notes, '') = 'Cambio de grupo'
    from public.enrollments e join public.groups g on g.id = e.group_id join public.levels l on l.id = g.level_id
   where e.status <> 'lista_espera' and (p_area is null or l.department = p_area)
  union all
  select ms.member_id, p.department, ms.starts_on, case when ms.status = 'baja' then coalesce(ms.ends_on, public.today_mx()) end, false
    from public.memberships ms join public.plans p on p.id = ms.plan_id
   where (p_area is null or p.department = p_area)
$$;

-- Socios activos en una fecha
create or replace function public.activos_en(p_day date, p_area text default null)
returns setof uuid language sql stable security definer set search_path = public as $$
  select distinct member_id from public.suscripciones(p_area) s
   where s.started <= p_day and (s.ended is null or s.ended > p_day)
$$;

create or replace function public.analitica_resumen(p_from date, p_to date, p_area text default null)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v jsonb; v_start int; v_kept int;
begin
  if not public.puede_analitica(p_area) then raise exception 'Sin permiso para ver esta analítica'; end if;
  select count(*) into v_start from public.activos_en(p_from, p_area);
  select count(*) into v_kept from public.activos_en(p_from, p_area) a where a in (select public.activos_en(p_to, p_area));

  with s as (select * from public.suscripciones(p_area)),
  firsts as (select member_id, min(started) as first_day from s group by member_id),
  starts as (  -- inicios reales (sin cambios de grupo)
    select s.member_id, s.started from s
     where s.started between p_from and p_to
       and not exists (select 1 from s s2 where s2.member_id = s.member_id and s2.is_change and s2.ended = s.started)),
  vis as (select * from public.visits v where (v.check_in_at at time zone 'America/Mexico_City')::date between p_from and p_to
            and (p_area is null or v.department = p_area)),
  act as (select * from public.activos_en(p_to, p_area) as member_id),
  last_seen as (
    select a.member_id, greatest(
      (select max((v.check_in_at at time zone 'America/Mexico_City')::date) from public.visits v where v.member_id = a.member_id),
      (select max(t.date) from public.attendance t where t.member_id = a.member_id and t.status in ('presente','retardo'))) as d
    from act a)
  select jsonb_build_object(
    'activos', (select count(*) from act),
    'activos_inicio', v_start,
    'retencion_pct', case when v_start = 0 then null else round(100.0 * v_kept / v_start) end,
    'altas_nuevas', (select count(distinct st.member_id) from starts st join firsts f on f.member_id = st.member_id and f.first_day = st.started),
    'reingresos', (select count(distinct st.member_id) from starts st
                    where exists (select 1 from s p where p.member_id = st.member_id and not p.is_change and p.ended is not null and p.ended <= st.started)),
    'bajas', (select count(distinct member_id) from s where not is_change and ended between p_from and p_to
                and member_id not in (select member_id from act)),
    'antiguedad_meses', (select round(avg((p_to - f.first_day) / 30.4)::numeric, 1) from firsts f where f.member_id in (select member_id from act)),
    'permanencia_bajas_meses', (select round(avg((x.last_end - f.first_day) / 30.4)::numeric, 1) from
                                  (select member_id, max(ended) as last_end from s where ended between p_from and p_to group by member_id) x
                                  join firsts f using (member_id) where x.member_id not in (select member_id from act)),
    'visitas', (select count(*) from vis),
    'visitantes', (select count(distinct member_id) from vis),
    'visitas_por_semana', (select case when count(distinct member_id) = 0 then 0 else
                             round(count(*)::numeric / count(distinct member_id) / greatest(1, (p_to - p_from + 1) / 7.0), 1) end from vis),
    'estancia_min', (select round(avg(extract(epoch from (check_out_at - check_in_at)) / 60)) from vis
                      where check_out_at is not null and check_out_at - check_in_at < interval '8 hours'),
    'asistencias_clase', (select count(*) from public.attendance t join public.groups g on g.id = t.group_id join public.levels l on l.id = g.level_id
                           where t.date between p_from and p_to and t.status in ('presente','retardo') and (p_area is null or l.department = p_area)),
    'asistencia_pct', (select round(100.0 * count(*) filter (where t.status in ('presente','retardo')) / nullif(count(*), 0))
                         from public.attendance t join public.groups g on g.id = t.group_id join public.levels l on l.id = g.level_id
                        where t.date between p_from and p_to and (p_area is null or l.department = p_area)),
    'sin_venir_14d', (select count(*) from last_seen where d is null or d < p_to - 14)
  ) into v;
  return v;
end $$;

-- Ocupación por día de la semana y hora (entradas + asistencias a clase)
create or replace function public.analitica_ocupacion(p_from date, p_to date, p_area text default null)
returns table(dow int, hour int, visitas int)
language sql stable security definer set search_path = public as $$
  with x as (
    select extract(isodow from v.check_in_at at time zone 'America/Mexico_City')::int as dow,
           extract(hour from v.check_in_at at time zone 'America/Mexico_City')::int as hour
      from public.visits v
     where (v.check_in_at at time zone 'America/Mexico_City')::date between p_from and p_to and (p_area is null or v.department = p_area)
    union all
    select extract(isodow from t.date)::int, extract(hour from g.start_time)::int
      from public.attendance t join public.groups g on g.id = t.group_id join public.levels l on l.id = g.level_id
     where t.date between p_from and p_to and t.status in ('presente','retardo') and (p_area is null or l.department = p_area)
  )
  select dow, hour, count(*)::int from x where public.puede_analitica(p_area) group by 1, 2 order by 1, 2
$$;

-- Visitas por día (para ver por día, semana o mes en pantalla)
create or replace function public.analitica_diaria(p_from date, p_to date, p_area text default null)
returns table(day date, visitas int, personas int)
language sql stable security definer set search_path = public as $$
  with x as (
    select v.member_id, (v.check_in_at at time zone 'America/Mexico_City')::date as d from public.visits v
     where (v.check_in_at at time zone 'America/Mexico_City')::date between p_from and p_to and (p_area is null or v.department = p_area)
    union all
    select t.member_id, t.date from public.attendance t join public.groups g on g.id = t.group_id join public.levels l on l.id = g.level_id
     where t.date between p_from and p_to and t.status in ('presente','retardo') and (p_area is null or l.department = p_area)
  )
  select gs::date, count(x.member_id)::int, count(distinct x.member_id)::int
    from generate_series(p_from, p_to, interval '1 day') gs left join x on x.d = gs::date
   where public.puede_analitica(p_area)
   group by 1 order by 1
$$;

-- Altas, reingresos, bajas y activos de los últimos 12 meses
create or replace function public.analitica_tendencia(p_area text default null)
returns table(month text, altas int, reingresos int, bajas int, activos int)
language sql stable security definer set search_path = public as $$
  with s as (select * from public.suscripciones(p_area)),
  firsts as (select member_id, min(started) as first_day from s group by member_id),
  m as (select generate_series(date_trunc('month', public.today_mx()) - interval '11 months', date_trunc('month', public.today_mx()), interval '1 month')::date as m0),
  starts as (select s.member_id, s.started from s
              where not exists (select 1 from s s2 where s2.member_id = s.member_id and s2.is_change and s2.ended = s.started))
  select to_char(m.m0, 'YYYY-MM'),
    (select count(distinct st.member_id) from starts st join firsts f on f.member_id = st.member_id and f.first_day = st.started
      where st.started >= m.m0 and st.started < (m.m0 + interval '1 month'))::int,
    (select count(distinct st.member_id) from starts st
      where st.started >= m.m0 and st.started < (m.m0 + interval '1 month')
        and exists (select 1 from s p where p.member_id = st.member_id and not p.is_change and p.ended is not null and p.ended <= st.started))::int,
    (select count(distinct s.member_id) from s where not s.is_change and s.ended >= m.m0 and s.ended < (m.m0 + interval '1 month'))::int,
    (select count(*) from public.activos_en(least((m.m0 + interval '1 month' - interval '1 day')::date, public.today_mx()), p_area))::int
  from m where public.puede_analitica(p_area) order by 1
$$;

-- Edades de los socios activos
create or replace function public.analitica_edades(p_area text default null)
returns table(rango text, orden int, socios int)
language sql stable security definer set search_path = public as $$
  with a as (select m.birthdate from public.members m where m.id in (select public.activos_en(public.today_mx(), p_area))),
  b as (select case
      when birthdate is null then 'Sin dato'
      when public.age_at(birthdate, public.today_mx()) < 4 then '0–3'
      when public.age_at(birthdate, public.today_mx()) < 7 then '4–6'
      when public.age_at(birthdate, public.today_mx()) < 10 then '7–9'
      when public.age_at(birthdate, public.today_mx()) < 13 then '10–12'
      when public.age_at(birthdate, public.today_mx()) < 18 then '13–17'
      when public.age_at(birthdate, public.today_mx()) < 30 then '18–29'
      when public.age_at(birthdate, public.today_mx()) < 45 then '30–44'
      when public.age_at(birthdate, public.today_mx()) < 60 then '45–59'
      else '60+' end as rango from a)
  select rango, case rango when '0–3' then 1 when '4–6' then 2 when '7–9' then 3 when '10–12' then 4 when '13–17' then 5
                  when '18–29' then 6 when '30–44' then 7 when '45–59' then 8 when '60+' then 9 else 10 end, count(*)::int
    from b where public.puede_analitica(p_area) group by rango order by 2
$$;

-- Recurrencia: cuántas veces por semana viene cada socio activo
create or replace function public.analitica_recurrencia(p_from date, p_to date, p_area text default null)
returns table(rango text, orden int, socios int)
language sql stable security definer set search_path = public as $$
  with act as (select * from public.activos_en(p_to, p_area) as member_id),
  x as (
    select v.member_id, (v.check_in_at at time zone 'America/Mexico_City')::date d from public.visits v
     where (v.check_in_at at time zone 'America/Mexico_City')::date between p_from and p_to and (p_area is null or v.department = p_area)
    union
    select t.member_id, t.date from public.attendance t join public.groups g on g.id = t.group_id join public.levels l on l.id = g.level_id
     where t.date between p_from and p_to and t.status in ('presente','retardo') and (p_area is null or l.department = p_area)),
  per as (select a.member_id, (select count(*) from x where x.member_id = a.member_id) / greatest(1, (p_to - p_from + 1) / 7.0) as w from act a),
  b as (select case when w = 0 then 'No vino' when w < 1 then 'Menos de 1 vez' when w < 2 then '1 vez' when w < 3 then '2 veces'
                    when w < 4 then '3 veces' else '4 o más' end as rango from per)
  select rango, case rango when 'No vino' then 1 when 'Menos de 1 vez' then 2 when '1 vez' then 3 when '2 veces' then 4 when '3 veces' then 5 else 6 end,
         count(*)::int from b where public.puede_analitica(p_area) group by rango order by 2
$$;

-- Resumen por área
create or replace function public.analitica_areas(p_from date, p_to date)
returns table(department text, activos int, altas int, bajas int, asistencias int, ocupacion_pct int, estancia_min int)
language sql stable security definer set search_path = public as $$
  select d.code,
    (select count(*) from public.activos_en(p_to, d.code))::int,
    (select count(distinct member_id) from public.suscripciones(d.code) s where s.started between p_from and p_to and not exists
       (select 1 from public.suscripciones(d.code) s2 where s2.member_id = s.member_id and s2.is_change and s2.ended = s.started))::int,
    (select count(distinct member_id) from public.suscripciones(d.code) s where not s.is_change and s.ended between p_from and p_to)::int,
    ((select count(*) from public.visits v where v.department = d.code and (v.check_in_at at time zone 'America/Mexico_City')::date between p_from and p_to)
     + (select count(*) from public.attendance t join public.groups g on g.id = t.group_id join public.levels l on l.id = g.level_id
         where l.department = d.code and t.date between p_from and p_to and t.status in ('presente','retardo')))::int,
    (select case when sum(capacity) = 0 then null else round(100.0 * sum(enrolled) / sum(capacity)) end from public.group_occupancy o where o.active and o.department = d.code)::int,
    (select round(avg(extract(epoch from (check_out_at - check_in_at)) / 60)) from public.visits v
      where v.department = d.code and v.check_out_at is not null and v.check_out_at - v.check_in_at < interval '8 hours'
        and (v.check_in_at at time zone 'America/Mexico_City')::date between p_from and p_to)::int
  from public.departments d
  where d.is_area and public.puede_analitica(d.code)
  order by d.sort_order
$$;

-- Retención por generación: de quienes empezaron cada mes, cuántos siguen a 1, 3 y 6 meses
create or replace function public.analitica_cohortes(p_area text default null)
returns table(cohorte text, inician int, mes1 int, mes3 int, mes6 int)
language sql stable security definer set search_path = public as $$
  with s as (select * from public.suscripciones(p_area)),
  firsts as (select member_id, min(started) as first_day from s group by member_id),
  c as (select date_trunc('month', first_day)::date as m0, member_id, first_day from firsts
         where first_day >= date_trunc('month', public.today_mx()) - interval '11 months')
  select to_char(m0, 'YYYY-MM'), count(*)::int,
    case when m0 + interval '2 month' > public.today_mx() then null else round(100.0 * count(*) filter (where exists
      (select 1 from s where s.member_id = c.member_id and s.started <= c.first_day + 30 and (s.ended is null or s.ended > c.first_day + 30))) / count(*)) end::int,
    case when m0 + interval '4 month' > public.today_mx() then null else round(100.0 * count(*) filter (where exists
      (select 1 from s where s.member_id = c.member_id and s.started <= c.first_day + 91 and (s.ended is null or s.ended > c.first_day + 91))) / count(*)) end::int,
    case when m0 + interval '7 month' > public.today_mx() then null else round(100.0 * count(*) filter (where exists
      (select 1 from s where s.member_id = c.member_id and s.started <= c.first_day + 182 and (s.ended is null or s.ended > c.first_day + 182))) / count(*)) end::int
  from c where public.puede_analitica(p_area) group by m0 order by m0
$$;

-- Socios activos en riesgo: no vienen hace 14+ días
create or replace function public.analitica_riesgo(p_area text default null)
returns table(member_id uuid, family_id uuid, nombre text, familia text, ultima_visita date, dias int, antiguedad_meses numeric)
language sql stable security definer set search_path = public as $$
  with act as (select * from public.activos_en(public.today_mx(), p_area) as member_id),
  ls as (select a.member_id, greatest(
      (select max((v.check_in_at at time zone 'America/Mexico_City')::date) from public.visits v where v.member_id = a.member_id),
      (select max(t.date) from public.attendance t where t.member_id = a.member_id and t.status in ('presente','retardo'))) as d
    from act a),
  f as (select member_id, min(started) as first_day from public.suscripciones(p_area) group by member_id)
  select m.id, m.family_id, m.first_name || ' ' || m.last_name, fa.name, ls.d,
         (public.today_mx() - coalesce(ls.d, f.first_day))::int, round(((public.today_mx() - f.first_day) / 30.4)::numeric, 1)
    from ls join public.members m on m.id = ls.member_id join public.families fa on fa.id = m.family_id
    left join f on f.member_id = ls.member_id
   where public.puede_analitica(p_area) and (ls.d is null or ls.d < public.today_mx() - 14)
     and f.first_day < public.today_mx() - 14
   order by 6 desc nulls first limit 100
$$;

-- Permisos de ejecución
do $$
declare f text;
begin
  foreach f in array array[
    'registrar_salida(uuid)', 'importar_visitas(jsonb, text)', 'importar_socios(jsonb, text)',
    'analitica_resumen(date, date, text)', 'analitica_ocupacion(date, date, text)', 'analitica_diaria(date, date, text)',
    'analitica_tendencia(text)', 'analitica_edades(text)', 'analitica_recurrencia(date, date, text)',
    'analitica_areas(date, date)', 'analitica_cohortes(text)', 'analitica_riesgo(text)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  foreach f in array array['puede_analitica(text)', 'suscripciones(text)', 'activos_en(date, text)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
end $$;
