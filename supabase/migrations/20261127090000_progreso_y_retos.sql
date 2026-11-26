-- Oberlicht · Progreso y retos (tipo Strava, voluntario)
-- Dos modos: «Mi progreso» (privado, contra uno mismo) y «Retos del club» (público, con tablas).
-- Constancia, rachas semanales, medallas, retos por temporada y aplausos predefinidos.
-- Los datos salen de entradas (visits), asistencia a clases y reposiciones usadas.
-- Todo es aditivo o "create or replace".

insert into public.settings (key, value, description) values
  ('progreso', '{"meta_semanal":2,"dia_aviso_racha":4}', 'Progreso y retos: días por semana para mantener la racha y día (1=lunes) desde el que se avisa que una racha está en riesgo')
on conflict (key) do nothing;

-- ─────────────────────────────────────────────────────────────
-- Inscripción voluntaria
-- ─────────────────────────────────────────────────────────────
create table public.progress_profiles (
  member_id          uuid primary key references public.members(id) on delete cascade,
  private_on         boolean not null default true,    -- «Mi progreso»
  public_on          boolean not null default false,   -- «Retos del club» con tablas
  weekly_goal        int not null default 2 check (weekly_goal between 1 and 7),
  guardian_consent_at timestamptz,                      -- permiso del papá o tutor (menores en modo público)
  guardian_consent_by uuid references public.profiles(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
alter table public.progress_profiles enable row level security;
create policy "ver mi inscripción a progreso" on public.progress_profiles for select to authenticated
  using (public.is_staff() or member_id in (select id from public.members where family_id in (select public.my_family_ids())));

-- Retos del club
create table public.challenges (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  description  text,
  kind         text not null check (kind in ('dias','semanas','habilidades')),  -- días con actividad · semanas cumpliendo la meta · habilidades logradas
  target       int not null check (target > 0),
  department   text references public.departments(code),    -- null = cuenta todo el club
  collective   boolean not null default false,               -- meta del club sumando a todos
  starts_on    date not null,
  ends_on      date not null,
  reward       text,
  active       boolean not null default true,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  check (ends_on >= starts_on)
);
create index on public.challenges (active, ends_on);

create table public.challenge_entries (
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  member_id    uuid not null references public.members(id) on delete cascade,
  status       text not null default 'activo' check (status in ('activo','retirado')),
  joined_at    timestamptz not null default now(),
  primary key (challenge_id, member_id)
);
create index on public.challenge_entries (member_id);

-- Aplausos predefinidos (sin comentarios libres)
create table public.kudos (
  id         uuid primary key default gen_random_uuid(),
  from_member uuid not null references public.members(id) on delete cascade,
  to_member   uuid not null references public.members(id) on delete cascade,
  kind       text not null check (kind in ('aplauso','fuego','fuerza','estrella')),
  day        date not null default public.today_mx(),
  created_at timestamptz not null default now(),
  check (from_member <> to_member)
);
create unique index kudos_uno_por_dia on public.kudos (from_member, to_member, day);
create index on public.kudos (to_member, created_at desc);

alter table public.challenges enable row level security;
alter table public.challenge_entries enable row level security;
alter table public.kudos enable row level security;
create policy "ver retos" on public.challenges for select to authenticated using (active or public.is_staff());
create policy "personal crea retos" on public.challenges for insert to authenticated
  with check (public.is_front_office() or (public.my_role() = 'coordinador' and (department is null or public.has_department(department))));
create policy "personal edita retos" on public.challenges for update to authenticated
  using (public.is_front_office() or (public.my_role() = 'coordinador' and (department is null or public.has_department(department))))
  with check (public.is_front_office() or (public.my_role() = 'coordinador' and (department is null or public.has_department(department))));
create policy "ver mis retos" on public.challenge_entries for select to authenticated
  using (public.is_staff() or member_id in (select id from public.members where family_id in (select public.my_family_ids())));
create policy "ver mis aplausos" on public.kudos for select to authenticated
  using (public.is_staff() or to_member in (select id from public.members where family_id in (select public.my_family_ids()))
         or from_member in (select id from public.members where family_id in (select public.my_family_ids())));

-- ─────────────────────────────────────────────────────────────
-- Cálculos
-- ─────────────────────────────────────────────────────────────
-- Días con actividad: entrada al club, clase presente o retardo, o reposición usada
create or replace function public.dias_activos(p_member uuid, p_desde date default null, p_hasta date default null, p_area text default null)
returns table(dia date) language sql stable security definer set search_path = public as $$
  select distinct d from (
    select (v.check_in_at at time zone 'America/Mexico_City')::date d from public.visits v
     where v.member_id = p_member and (p_area is null or v.department = p_area)
    union all
    select a.date from public.attendance a
     where a.member_id = p_member and a.status in ('presente','retardo') and (p_area is null or a.department = p_area)
    union all
    select c.used_date from public.makeup_credits c
     where c.member_id = p_member and c.status = 'usada' and c.used_date is not null and (p_area is null or c.department = p_area)
  ) x
  where d is not null and (p_desde is null or d >= p_desde) and (p_hasta is null or d <= p_hasta)
$$;

create or replace function public.categoria_edad(p_birth date)
returns text language sql stable set search_path = public as $$
  select case when p_birth is null then 'adultos'
              when public.age_at(p_birth, public.today_mx()) < 13 then 'infantil'
              when public.age_at(p_birth, public.today_mx()) < 18 then 'juvenil'
              else 'adultos' end
$$;

-- Nombre público: nombre e inicial del apellido (sin foto)
create or replace function public.nombre_publico(p_member uuid)
returns text language sql stable security definer set search_path = public as $$
  select m.first_name || coalesce(' ' || nullif(left(trim(m.last_name), 1), '') || '.', '') from public.members m where m.id = p_member
$$;

-- Rachas semanales: una semana cuenta si llega a la meta; una falta avisada, reposición o clase congelada la protege (ni suma ni rompe).
-- La semana en curso solo suma si ya llegó a la meta.
create or replace function public.racha_socio(p_member uuid, p_meta int default null)
returns table(actual int, mejor int, semana_dias int, meta int, semanas jsonb) language plpgsql stable security definer set search_path = public as $$
declare
  v_meta int; v_first date; v_w date; v_cur date := date_trunc('week', public.today_mx())::date;
  v_run int := 0; v_best int := 0; v_n int; v_prot boolean; v_estado text; v_hist jsonb := '[]'; v_now int := 0;
begin
  v_meta := coalesce(p_meta, (select weekly_goal from public.progress_profiles where member_id = p_member),
                     (public.setting('progreso')->>'meta_semanal')::int, 2);
  select min(dia) into v_first from public.dias_activos(p_member);
  if v_first is null then
    return query select 0, 0, 0, v_meta, '[]'::jsonb; return;
  end if;
  v_w := date_trunc('week', v_first)::date;
  while v_w <= v_cur loop
    select count(*) into v_n from public.dias_activos(p_member, v_w, v_w + 6);
    v_prot := exists (select 1 from public.attendance a where a.member_id = p_member and a.status = 'justificada' and a.date between v_w and v_w + 6)
           or exists (select 1 from public.makeup_credits c where c.member_id = p_member and c.missed_date between v_w and v_w + 6)
           or exists (select 1 from public.retention_cases r where r.member_id = p_member and r.choice = 'congelar'
                        and r.created_at::date <= v_w + 6 and r.freeze_until >= v_w);
    if v_n >= v_meta then
      v_estado := 'cumplida'; v_run := v_run + 1;
    elsif v_w = v_cur then
      v_estado := 'en_curso';
    elsif v_prot then
      v_estado := 'protegida';
    else
      v_estado := 'sin_meta'; v_run := 0;
    end if;
    v_best := greatest(v_best, v_run);
    if v_w = v_cur then v_now := v_n; end if;
    if v_w > v_cur - 7 * 16 then
      v_hist := v_hist || jsonb_build_object('semana', v_w, 'dias', v_n, 'estado', v_estado);
    end if;
    v_w := v_w + 7;
  end loop;
  return query select v_run, v_best, v_now, v_meta, v_hist;
end $$;

-- Avance de un socio en un reto
create or replace function public.avance_reto(p_challenge uuid, p_member uuid)
returns int language plpgsql stable security definer set search_path = public as $$
declare v_c public.challenges; v_n int := 0; v_w date; v_meta int; v_hasta date;
begin
  select * into v_c from public.challenges where id = p_challenge;
  if not found then return 0; end if;
  v_hasta := least(v_c.ends_on, public.today_mx());
  if v_c.kind = 'dias' then
    select count(*) into v_n from public.dias_activos(p_member, v_c.starts_on, v_hasta, v_c.department);
  elsif v_c.kind = 'habilidades' then
    select count(*) into v_n from public.skill_progress sp join public.skills s on s.id = sp.skill_id join public.levels l on l.id = s.level_id
     where sp.member_id = p_member and sp.status = 'lograda' and (sp.achieved_at at time zone 'America/Mexico_City')::date between v_c.starts_on and v_hasta
       and (v_c.department is null or l.department = v_c.department);
  else
    v_meta := coalesce((select weekly_goal from public.progress_profiles where member_id = p_member), (public.setting('progreso')->>'meta_semanal')::int, 2);
    v_w := date_trunc('week', v_c.starts_on)::date;
    while v_w <= v_hasta loop
      if (select count(*) from public.dias_activos(p_member, greatest(v_w, v_c.starts_on), least(v_w + 6, v_c.ends_on), v_c.department)) >= v_meta then
        v_n := v_n + 1;
      end if;
      v_w := v_w + 7;
    end loop;
  end if;
  return v_n;
end $$;

-- Medallas (se calculan con los datos; no hay que capturar nada)
create or replace function public.medallas_socio(p_member uuid, p_racha_mejor int default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_dias date[]; v_tot int; v_desde date; v_hab int; v_cert int; v_best int; v_out jsonb := '[]'; m record;
begin
  select array_agg(dia order by dia) into v_dias from public.dias_activos(p_member);
  v_tot := coalesce(array_length(v_dias, 1), 0);
  v_desde := least(v_dias[1],
                   (select min(e.enrolled_at)::date from public.enrollments e where e.member_id = p_member),
                   (select min(ms.starts_on) from public.memberships ms where ms.member_id = p_member));
  select count(*) into v_hab from public.skill_progress where member_id = p_member and status = 'lograda';
  select count(*) into v_cert from public.certificates where member_id = p_member;
  v_best := coalesce(p_racha_mejor, (select mejor from public.racha_socio(p_member)));

  for m in select * from (values
      ('visitas_10',  'visitas', 10,  'Primeros 10',      '10 días entrenando en el club'),
      ('visitas_25',  'visitas', 25,  'Constante',        '25 días entrenando'),
      ('visitas_50',  'visitas', 50,  'Medio centenar',   '50 días entrenando'),
      ('visitas_100', 'visitas', 100, 'Club de los 100',  '100 días entrenando'),
      ('visitas_200', 'visitas', 200, 'Imparable',        '200 días entrenando'),
      ('visitas_365', 'visitas', 365, 'Un año de días',   '365 días entrenando'),
      ('racha_4',     'racha',   4,   'Un mes seguido',   '4 semanas seguidas cumpliendo tu meta'),
      ('racha_8',     'racha',   8,   'Dos meses seguidos','8 semanas seguidas'),
      ('racha_12',    'racha',   12,  'Trimestre de hierro','12 semanas seguidas'),
      ('racha_26',    'racha',   26,  'Medio año',        '26 semanas seguidas'),
      ('racha_52',    'racha',   52,  'Año perfecto',     '52 semanas seguidas'),
      ('antiguedad_1','antiguedad', 365, 'Un año en Oberlicht', 'Un año desde que llegaste'),
      ('antiguedad_2','antiguedad', 730, 'Dos años en Oberlicht', 'Dos años en el club'),
      ('habilidades_5','habilidades', 5, 'Aprendiz',      '5 habilidades logradas'),
      ('habilidades_15','habilidades', 15, 'Talento',     '15 habilidades logradas'),
      ('nivel_1',     'nivel',   1,   'Subí de nivel',    'Completaste un nivel con certificado')
    ) as t(k, tipo, meta, titulo, descr)
  loop
    v_out := v_out || jsonb_build_object(
      'k', m.k, 'tipo', m.tipo, 'titulo', m.titulo, 'desc', m.descr, 'meta', m.meta,
      'progreso', case m.tipo when 'visitas' then least(v_tot, m.meta) when 'racha' then least(v_best, m.meta)
                     when 'antiguedad' then least(coalesce(public.today_mx() - v_desde, 0), m.meta)
                     when 'habilidades' then least(v_hab, m.meta) else least(v_cert, m.meta) end,
      'logrado', case m.tipo when 'visitas' then v_tot >= m.meta when 'racha' then v_best >= m.meta
                     when 'antiguedad' then coalesce(public.today_mx() - v_desde, 0) >= m.meta
                     when 'habilidades' then v_hab >= m.meta else v_cert >= m.meta end,
      'fecha', case when m.tipo = 'visitas' and v_tot >= m.meta then v_dias[m.meta]
                    when m.tipo = 'antiguedad' and v_desde is not null and public.today_mx() - v_desde >= m.meta then v_desde + m.meta end);
  end loop;
  return v_out;
end $$;

-- Todo el progreso de un socio para su pantalla
create or replace function public.mi_progreso(p_member uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_m public.members; v_p public.progress_profiles; r record; v_mes date := date_trunc('month', public.today_mx())::date; v_out jsonb;
begin
  if not (public.can_act_for_member(p_member) or public.is_staff()) then raise exception 'Sin permiso'; end if;
  select * into v_m from public.members where id = p_member;
  if not found then raise exception 'Socio no encontrado'; end if;
  select * into v_p from public.progress_profiles where member_id = p_member;
  select * into r from public.racha_socio(p_member);

  v_out := jsonb_build_object(
    'member_id', p_member,
    'nombre', v_m.first_name,
    'nombre_publico', public.nombre_publico(p_member),
    'categoria', public.categoria_edad(v_m.birthdate),
    'menor', coalesce(public.age_at(v_m.birthdate, public.today_mx()) < 18, false),
    'inscrito', v_p.member_id is not null and (v_p.private_on or v_p.public_on),
    'privado', coalesce(v_p.private_on, false),
    'publico', coalesce(v_p.public_on, false),
    'permiso_tutor', v_p.guardian_consent_at,
    'meta_semanal', r.meta,
    'racha', r.actual, 'racha_mejor', r.mejor, 'semana_dias', r.semana_dias, 'semanas', r.semanas,
    'dias_total', (select count(*) from public.dias_activos(p_member)),
    'dias_mes', (select count(*) from public.dias_activos(p_member, v_mes, null)),
    'dias_mes_anterior', (select count(*) from public.dias_activos(p_member, (v_mes - interval '1 month')::date, v_mes - 1)),
    'meses', (select coalesce(jsonb_agg(jsonb_build_object('mes', to_char(mm, 'YYYY-MM'),
                     'dias', (select count(*) from public.dias_activos(p_member, mm::date, (mm + interval '1 month')::date - 1))) order by mm), '[]')
                from generate_series(v_mes - interval '11 months', v_mes, interval '1 month') mm),
    'habilidades', (select count(*) from public.skill_progress where member_id = p_member and status = 'lograda'),
    'certificados', (select count(*) from public.certificates where member_id = p_member),
    'medallas', public.medallas_socio(p_member, r.mejor),
    'aplausos', (select coalesce(jsonb_object_agg(kind, n), '{}') from (select kind, count(*) n from public.kudos where to_member = p_member and created_at > now() - interval '30 days' group by kind) k),
    'retos', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'titulo', c.title, 'tipo', c.kind, 'meta', c.target, 'termina', c.ends_on,
                       'avance', public.avance_reto(c.id, p_member), 'colectivo', c.collective) order by c.ends_on), '[]')
                from public.challenge_entries e join public.challenges c on c.id = e.challenge_id
               where e.member_id = p_member and e.status = 'activo' and c.active and c.ends_on >= public.today_mx() - 7)
  );
  return v_out;
end $$;

-- Inscribirse, cambiar meta o salirse (el titular decide por sus hijos y da el permiso)
create or replace function public.configurar_progreso(p_member uuid, p_privado boolean, p_publico boolean, p_meta int default null, p_permiso_tutor boolean default false)
returns public.progress_profiles language plpgsql security definer set search_path = public as $$
declare v_m public.members; v_row public.progress_profiles; v_menor boolean;
begin
  if not public.can_act_for_member(p_member) then raise exception 'No tienes permiso para este socio'; end if;
  select * into v_m from public.members where id = p_member;
  v_menor := coalesce(public.age_at(v_m.birthdate, public.today_mx()) < 18, false);
  insert into public.progress_profiles (member_id) values (p_member) on conflict (member_id) do nothing;
  select * into v_row from public.progress_profiles where member_id = p_member for update;
  if p_publico and v_menor and v_row.guardian_consent_at is null and not p_permiso_tutor then
    raise exception 'Para que un menor aparezca en las tablas del club se necesita el permiso de su papá, mamá o tutor';
  end if;
  update public.progress_profiles set
         private_on = p_privado or p_publico,
         public_on = p_publico,
         weekly_goal = coalesce(least(greatest(p_meta, 1), 7), weekly_goal),
         guardian_consent_at = case when v_menor and p_publico and p_permiso_tutor and guardian_consent_at is null then now()
                                    when not p_publico then null else guardian_consent_at end,
         guardian_consent_by = case when v_menor and p_publico and p_permiso_tutor and guardian_consent_at is null then auth.uid()
                                    when not p_publico then null else guardian_consent_by end,
         updated_at = now()
   where member_id = p_member returning * into v_row;
  if not (p_privado or p_publico) then
    update public.challenge_entries set status = 'retirado' where member_id = p_member and status = 'activo';
  end if;
  return v_row;
end $$;

create or replace function public.unirse_reto(p_challenge uuid, p_member uuid, p_unirse boolean default true)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_c public.challenges;
begin
  if not public.can_act_for_member(p_member) then raise exception 'No tienes permiso para este socio'; end if;
  select * into v_c from public.challenges where id = p_challenge and active;
  if not found then raise exception 'Reto no disponible'; end if;
  if p_unirse then
    if v_c.ends_on < public.today_mx() then raise exception 'Este reto ya terminó'; end if;
    insert into public.progress_profiles (member_id) values (p_member) on conflict (member_id) do nothing;
    update public.progress_profiles set private_on = true where member_id = p_member and not private_on and not public_on;
    insert into public.challenge_entries (challenge_id, member_id) values (p_challenge, p_member)
    on conflict (challenge_id, member_id) do update set status = 'activo', joined_at = now();
  else
    update public.challenge_entries set status = 'retirado' where challenge_id = p_challenge and member_id = p_member;
  end if;
  return p_unirse;
end $$;

-- Retos visibles con avance de la familia, participantes y meta colectiva
create or replace function public.retos_club(p_member uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if p_member is not null and not (public.can_act_for_member(p_member) or public.is_staff()) then raise exception 'Sin permiso'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id, 'titulo', c.title, 'descripcion', c.description, 'tipo', c.kind, 'meta', c.target, 'area', c.department,
      'colectivo', c.collective, 'inicia', c.starts_on, 'termina', c.ends_on, 'premio', c.reward,
      'participantes', (select count(*) from public.challenge_entries e where e.challenge_id = c.id and e.status = 'activo'),
      'completados', (select count(*) from public.challenge_entries e where e.challenge_id = c.id and e.status = 'activo' and not c.collective
                        and public.avance_reto(c.id, e.member_id) >= c.target),
      'avance_club', case when c.collective then (select coalesce(sum(public.avance_reto(c.id, e.member_id)), 0) from public.challenge_entries e where e.challenge_id = c.id and e.status = 'activo') end,
      'inscrito', p_member is not null and exists (select 1 from public.challenge_entries e where e.challenge_id = c.id and e.member_id = p_member and e.status = 'activo'),
      'avance', case when p_member is not null then public.avance_reto(c.id, p_member) end
    ) order by c.ends_on, c.title), '[]')
    from public.challenges c where c.active and c.ends_on >= public.today_mx() - 30);
end $$;

-- Tabla de un reto: solo quienes eligieron el modo público (menores con permiso). Nombre e inicial, sin foto.
create or replace function public.tabla_reto(p_challenge uuid, p_categoria text default null)
returns table(pos int, member_id uuid, nombre text, categoria text, avance int, meta int, completado boolean, mia boolean)
language sql stable security definer set search_path = public as $$
  with c as (select * from public.challenges where id = p_challenge and active),
  p as (
    select e.member_id, public.nombre_publico(e.member_id) nombre, public.categoria_edad(m.birthdate) cat,
           public.avance_reto(p_challenge, e.member_id) av, m.family_id
      from public.challenge_entries e join public.members m on m.id = e.member_id
      join public.progress_profiles pp on pp.member_id = e.member_id
     where e.challenge_id = p_challenge and e.status = 'activo' and pp.public_on
       and (coalesce(public.age_at(m.birthdate, public.today_mx()), 99) >= 18 or pp.guardian_consent_at is not null)
  )
  select (rank() over (order by p.av desc))::int, p.member_id, p.nombre, p.cat, p.av, c.target, p.av >= c.target,
         p.family_id in (select public.my_family_ids())
    from p, c
   where auth.uid() is not null and (p_categoria is null or p.cat = p_categoria)
   order by p.av desc, p.nombre
   limit 100
$$;

-- Tabla de constancia del mes (días con actividad), por categoría de edad
create or replace function public.tabla_constancia(p_categoria text default null)
returns table(pos int, member_id uuid, nombre text, categoria text, dias int, racha int, mia boolean)
language sql stable security definer set search_path = public as $$
  with p as (
    select pp.member_id, public.nombre_publico(pp.member_id) nombre, public.categoria_edad(m.birthdate) cat, m.family_id,
           (select count(*) from public.dias_activos(pp.member_id, date_trunc('month', public.today_mx())::date, null))::int dias
      from public.progress_profiles pp join public.members m on m.id = pp.member_id
     where pp.public_on and m.active
       and (coalesce(public.age_at(m.birthdate, public.today_mx()), 99) >= 18 or pp.guardian_consent_at is not null)
  )
  select (rank() over (order by p.dias desc))::int, p.member_id, p.nombre, p.cat, p.dias,
         (select actual from public.racha_socio(p.member_id)), p.family_id in (select public.my_family_ids())
    from p
   where auth.uid() is not null and (p_categoria is null or p.cat = p_categoria) and p.dias > 0
   order by p.dias desc, p.nombre
   limit 50
$$;

-- Aplaudir a alguien de la tabla (una vez al día por persona)
create or replace function public.aplaudir(p_from uuid, p_to uuid, p_kind text default 'aplauso')
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not public.can_act_for_member(p_from) then raise exception 'No tienes permiso'; end if;
  if p_kind not in ('aplauso','fuego','fuerza','estrella') then raise exception 'Aplauso no válido'; end if;
  if not exists (select 1 from public.progress_profiles where member_id = p_from and public_on) then
    raise exception 'Activa «Retos del club» para aplaudir a otros socios';
  end if;
  if not exists (select 1 from public.progress_profiles where member_id = p_to and public_on) then raise exception 'Este socio no participa en las tablas'; end if;
  insert into public.kudos (from_member, to_member, kind) values (p_from, p_to, p_kind)
  on conflict (from_member, to_member, day) do update set kind = excluded.kind, created_at = now();
  return true;
end $$;

-- Panel para coaches y dirección
create or replace function public.panel_progreso(p_area text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_dow int := extract(isodow from public.today_mx())::int; v_aviso int := coalesce((public.setting('progreso')->>'dia_aviso_racha')::int, 4);
begin
  if not public.is_staff() then raise exception 'Sin permiso'; end if;
  return (
    with part as (
      select pp.*, m.first_name || ' ' || m.last_name nombre, m.family_id, coalesce(f.phone, m.phone) telefono, m.birthdate,
             (select l.department from public.enrollments e join public.groups g on g.id = e.group_id join public.levels l on l.id = g.level_id
               where e.member_id = m.id and e.status = 'activa' limit 1) area_clase
        from public.progress_profiles pp join public.members m on m.id = pp.member_id join public.families f on f.id = m.family_id
       where m.active and (pp.private_on or pp.public_on)
    ),
    calc as (
      select p.*, r.actual, r.mejor, r.semana_dias, r.meta,
             (select count(*) from public.dias_activos(p.member_id))::int total,
             (select count(*) from public.dias_activos(p.member_id, date_trunc('month', public.today_mx())::date, null))::int mes
        from part p, lateral public.racha_socio(p.member_id) r
       where p_area is null or p.area_clase = p_area
    )
    select jsonb_build_object(
      'participantes', (select count(*) from calc),
      'publico', (select count(*) from calc where public_on),
      'solo_privado', (select count(*) from calc where not public_on),
      'activos_totales', (select count(distinct a) from public.activos_en(public.today_mx(), p_area) a),
      'dias_mes_participantes', (select round(avg(mes)::numeric, 1) from calc),
      'rachas_en_riesgo', (select coalesce(jsonb_agg(jsonb_build_object('member_id', member_id, 'family_id', family_id, 'nombre', nombre, 'telefono', telefono,
                                  'racha', actual, 'semana_dias', semana_dias, 'meta', meta) order by actual desc), '[]')
                             from calc where actual >= 2 and semana_dias < meta and v_dow >= v_aviso),
      'por_medalla', (select coalesce(jsonb_agg(x order by (x->>'faltan')::int), '[]') from (
                        select jsonb_build_object('member_id', member_id, 'family_id', family_id, 'nombre', nombre,
                               'medalla', 'Club de los ' || nx, 'faltan', nx - total) x
                          from (select calc.*, (select min(v) from unnest(array[10,25,50,100,200,365]) v where v > total) nx from calc) q
                         where nx is not null and nx - total between 1 and 3 limit 30) s),
      'mejores_rachas', (select coalesce(jsonb_agg(jsonb_build_object('member_id', member_id, 'family_id', family_id, 'nombre', nombre, 'racha', actual, 'mes', mes) order by actual desc, mes desc), '[]')
                           from (select * from calc where actual > 0 order by actual desc, mes desc limit 10) t),
      'retos', public.retos_club(null)
    )
  );
end $$;

-- ─────────────────────────────────────────────────────────────
-- Permisos
-- ─────────────────────────────────────────────────────────────
do $$
declare f text;
begin
  foreach f in array array[
    'mi_progreso(uuid)', 'configurar_progreso(uuid, boolean, boolean, int, boolean)', 'unirse_reto(uuid, uuid, boolean)',
    'retos_club(uuid)', 'tabla_reto(uuid, text)', 'tabla_constancia(text)', 'aplaudir(uuid, uuid, text)', 'panel_progreso(text)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  foreach f in array array['dias_activos(uuid, date, date, text)', 'racha_socio(uuid, int)', 'avance_reto(uuid, uuid)', 'medallas_socio(uuid, int)', 'nombre_publico(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
end $$;

grant select on public.progress_profiles, public.challenges, public.challenge_entries, public.kudos to authenticated;
grant insert, update on public.challenges to authenticated;
