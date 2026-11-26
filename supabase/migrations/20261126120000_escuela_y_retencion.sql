-- Oberlicht · Etapa 3: escuela y retención
-- 4. Evaluación de habilidades por nivel, boleta y certificado
-- 5. Reposición de faltas con créditos
-- 6. Lista de espera que ofrece el lugar sola, con plazo para aceptar
-- 7. Flujo para salvar bajas (congelar, descuento o cambio de grupo)
-- 9. Prospectos y clases de prueba con seguimiento
-- 10. Predicción de bajas con más datos y acciones automáticas
-- Todo es aditivo o "create or replace".

-- ─────────────────────────────────────────────────────────────
-- Reglas configurables
-- ─────────────────────────────────────────────────────────────
insert into public.settings (key, value, description) values
  ('reposiciones', '{"dias_vigencia":30,"max_por_mes":2,"horas_aviso":2,"dias_adelante":14}', 'Créditos para reponer faltas avisadas'),
  ('lista_espera', '{"horas_para_aceptar":48}', 'Plazo para aceptar un lugar ofrecido'),
  ('retencion', '{"descuento_pct":15,"meses_descuento":2,"max_meses_congelar":2}', 'Ofertas antes de dar de baja'),
  ('prospectos', '{"dias_primer_contacto":0,"dias_despues_prueba":1,"dias_recontacto":3,"max_intentos":4}', 'Seguimiento de prospectos y clases de prueba')
on conflict (key) do nothing;

create policy "familias leen reglas de escuela" on public.settings for select to authenticated
  using (key in ('reposiciones','lista_espera','retencion'));

insert into public.message_templates (key, name, body) values
  ('lugar_ofrecido', 'Lugar disponible', 'Hola {nombre}, ¡se liberó un lugar para {detalle} en {club}! Tienes hasta el {fecha} para aceptarlo desde el portal o respondiendo este mensaje.'),
  ('prospecto_nuevo', 'Prospecto: primer contacto', 'Hola {nombre}, gracias por tu interés en {club}. Me encantaría invitarte a una clase de prueba sin costo de {detalle}. ¿Qué día te acomoda?'),
  ('prospecto_prueba', 'Prospecto: recordatorio de prueba', 'Hola {nombre}, te esperamos el {fecha} a las {hora} para la clase de prueba de {detalle} en {club}. Llega 10 minutos antes. ¡Nos vemos!'),
  ('prospecto_post_prueba', 'Prospecto: después de la prueba', 'Hola {nombre}, ¿qué tal les pareció la clase de prueba de {detalle}? Si quieren apartar su lugar, con gusto te ayudo a inscribirlos.'),
  ('prospecto_recontacto', 'Prospecto: seguimiento', 'Hola {nombre}, te escribo de {club} para saber si sigues interesado en {detalle}. Tenemos lugares disponibles esta semana.'),
  ('riesgo_te_extranamos', 'Retención: te extrañamos', 'Hola {nombre}, en {club} notamos que {detalle} no ha venido últimamente. ¿Todo bien? Si necesitas cambiar de horario o congelar unas semanas, con gusto te ayudamos.'),
  ('riesgo_bienvenida', 'Retención: bienvenida', 'Hola {nombre}, ¿cómo van las primeras semanas de {detalle} en {club}? Cualquier duda o ajuste de horario, aquí estamos.'),
  ('boleta_lista', 'Boleta lista', 'Hola {nombre}, ya está disponible la boleta de avance de {detalle} en el portal de {club}. ¡Felicidades por su esfuerzo!')
on conflict (key) do nothing;

alter table public.enrollments add column if not exists queue_at timestamptz;      -- turno en lista de espera (si rechaza o deja vencer la oferta, pasa al final)
alter table public.enrollments add column if not exists freeze_until date;         -- congelado con lugar guardado hasta esta fecha
alter table public.memberships add column if not exists freeze_until date;

create or replace function public.level_department(l uuid)
returns text language sql stable security definer set search_path = public as $$
  select department from public.levels where id = l
$$;


-- ═════════════════════════════════════════════════════════════
-- 4. Habilidades, boletas y certificados
-- ═════════════════════════════════════════════════════════════
create table public.skills (
  id          uuid primary key default gen_random_uuid(),
  level_id    uuid not null references public.levels(id) on delete cascade,
  name        text not null,
  description text,
  sort_order  int not null default 0,
  active      boolean not null default true,
  is_example  boolean not null default false,   -- ejemplo inicial, el club lo reemplaza
  created_at  timestamptz not null default now()
);
create index on public.skills (level_id, sort_order);

create table public.skill_progress (
  member_id    uuid not null references public.members(id) on delete cascade,
  skill_id     uuid not null references public.skills(id) on delete cascade,
  status       text not null default 'en_proceso' check (status in ('sin_iniciar','en_proceso','lograda')),
  note         text,
  evaluated_by uuid references public.profiles(id) on delete set null,
  evaluated_at timestamptz not null default now(),
  achieved_at  timestamptz,
  primary key (member_id, skill_id)
);

create table public.report_cards (
  id             uuid primary key default gen_random_uuid(),
  member_id      uuid not null references public.members(id) on delete cascade,
  level_id       uuid not null references public.levels(id),
  department     text not null references public.departments(code),
  group_id       uuid references public.groups(id) on delete set null,
  title          text not null,
  comment        text,
  skills         jsonb not null default '[]',   -- foto de las habilidades al emitir
  achieved       int not null default 0,
  total          int not null default 0,
  attendance_pct numeric(5,1),
  created_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now()
);
create index on public.report_cards (member_id, created_at desc);

create sequence if not exists public.certificate_folio_seq start 1;
create table public.certificates (
  id            uuid primary key default gen_random_uuid(),
  folio         int not null unique default nextval('public.certificate_folio_seq'),
  member_id     uuid not null references public.members(id) on delete cascade,
  level_id      uuid not null references public.levels(id),
  department    text not null references public.departments(code),
  next_level_id uuid references public.levels(id),
  notes         text,
  issued_by     uuid references public.profiles(id) on delete set null,
  issued_at     timestamptz not null default now()
);
create index on public.certificates (member_id);

alter table public.skills         enable row level security;
alter table public.skill_progress enable row level security;
alter table public.report_cards   enable row level security;
alter table public.certificates   enable row level security;

create policy "ver habilidades" on public.skills for select to authenticated using (true);
create policy "coordinación edita habilidades" on public.skills for all to authenticated
  using (public.is_dept_coordinator(public.level_department(level_id)))
  with check (public.is_dept_coordinator(public.level_department(level_id)));

create policy "ver avance de habilidades" on public.skill_progress for select to authenticated
  using (public.is_front_office()
         or exists (select 1 from public.skills s join public.levels l on l.id = s.level_id where s.id = skill_id and public.has_department(l.department))
         or member_id in (select id from public.members where family_id in (select public.my_family_ids())));
create policy "ver boletas" on public.report_cards for select to authenticated
  using (public.is_front_office() or public.has_department(department)
         or member_id in (select id from public.members where family_id in (select public.my_family_ids())));
create policy "ver certificados" on public.certificates for select to authenticated
  using (public.is_front_office() or public.has_department(department)
         or member_id in (select id from public.members where family_id in (select public.my_family_ids())));

-- Evaluar varias habilidades a la vez (la clase completa en tablet)
-- p_items: [{"member_id": "...", "skill_id": "...", "status": "lograda", "note": "..."}]
create or replace function public.evaluar_habilidades(p_items jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare it jsonb; v_dep text; v_n int := 0; v_status text;
begin
  for it in select * from jsonb_array_elements(p_items) loop
    select l.department into v_dep from public.skills s join public.levels l on l.id = s.level_id where s.id = (it->>'skill_id')::uuid;
    if v_dep is null then raise exception 'Habilidad no encontrada'; end if;
    if not (public.is_staff() and public.has_department(v_dep)) then
      raise exception 'Solo el personal del área puede evaluar habilidades';
    end if;
    v_status := coalesce(it->>'status', 'en_proceso');
    if v_status not in ('sin_iniciar','en_proceso','lograda') then raise exception 'Estado no válido'; end if;
    insert into public.skill_progress (member_id, skill_id, status, note, evaluated_by, evaluated_at, achieved_at)
    values ((it->>'member_id')::uuid, (it->>'skill_id')::uuid, v_status, nullif(it->>'note', ''), auth.uid(), now(),
            case when v_status = 'lograda' then now() end)
    on conflict (member_id, skill_id) do update
      set status = excluded.status,
          note = coalesce(excluded.note, skill_progress.note),
          evaluated_by = excluded.evaluated_by, evaluated_at = now(),
          achieved_at = case when excluded.status = 'lograda' then coalesce(skill_progress.achieved_at, now()) else null end;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- Emitir boleta: guarda la foto de habilidades del nivel, asistencia de 90 días y el comentario del coach
create or replace function public.emitir_boleta(p_member uuid, p_level uuid, p_comment text default null, p_group uuid default null)
returns public.report_cards language plpgsql security definer set search_path = public as $$
declare v_level public.levels; v_m public.members; v_row public.report_cards; v_sk jsonb; v_ok int; v_tot int; v_att numeric;
begin
  select * into v_level from public.levels where id = p_level;
  if not found then raise exception 'Nivel no encontrado'; end if;
  if not (public.is_staff() and public.has_department(v_level.department)) then
    raise exception 'Solo el personal del área puede emitir boletas';
  end if;
  select * into v_m from public.members where id = p_member;
  if not found then raise exception 'Alumno no encontrado'; end if;

  select coalesce(jsonb_agg(jsonb_build_object('name', s.name, 'status', coalesce(sp.status, 'sin_iniciar'), 'note', sp.note) order by s.sort_order, s.name), '[]'),
         count(*) filter (where sp.status = 'lograda'), count(*)
    into v_sk, v_ok, v_tot
    from public.skills s left join public.skill_progress sp on sp.skill_id = s.id and sp.member_id = p_member
   where s.level_id = p_level and s.active;

  select round(100.0 * count(*) filter (where status in ('presente','retardo')) / nullif(count(*), 0), 1) into v_att
    from public.attendance where member_id = p_member and department = v_level.department and date >= public.today_mx() - 90;

  insert into public.report_cards (member_id, level_id, department, group_id, title, comment, skills, achieved, total, attendance_pct, created_by)
  values (p_member, p_level, v_level.department, p_group,
          'Boleta ' || v_level.name || ' · ' || to_char(public.today_mx(), 'TMMonth YYYY'),
          nullif(trim(coalesce(p_comment, '')), ''), v_sk, v_ok, v_tot, v_att, auth.uid())
  returning * into v_row;

  insert into public.notifications (family_id, member_id, channel, template, subject, body)
  values (v_m.family_id, p_member, 'correo', 'boleta_lista', 'Boleta de ' || v_m.first_name,
          v_m.first_name || ' logró ' || v_ok || ' de ' || v_tot || ' habilidades de ' || v_level.name || '.');
  return v_row;
end $$;

-- Certificado al completar un nivel; si se indica el siguiente, también lo sube de nivel
create or replace function public.emitir_certificado(p_member uuid, p_level uuid, p_next_level uuid default null, p_notes text default null)
returns public.certificates language plpgsql security definer set search_path = public as $$
declare v_level public.levels; v_row public.certificates;
begin
  select * into v_level from public.levels where id = p_level;
  if not found then raise exception 'Nivel no encontrado'; end if;
  if not (public.is_staff() and public.has_department(v_level.department)) then
    raise exception 'Solo el personal del área puede emitir certificados';
  end if;
  insert into public.certificates (member_id, level_id, department, next_level_id, notes, issued_by)
  values (p_member, p_level, v_level.department, p_next_level, nullif(trim(coalesce(p_notes, '')), ''), auth.uid())
  returning * into v_row;
  if p_next_level is not null then
    perform public.subir_nivel(p_member, p_next_level, coalesce(p_notes, 'Completó ' || v_level.name));
  end if;
  return v_row;
end $$;

-- Habilidades de ejemplo (el club las ajusta en Niveles y grupos)
insert into public.skills (level_id, name, sort_order, is_example)
select l.id, s.name, s.ord, true
  from public.levels l
  join (values
    ('natacion','Bebés',1,'Entra al agua con confianza'), ('natacion','Bebés',2,'Sopla burbujas'), ('natacion','Bebés',3,'Flota boca arriba con apoyo'), ('natacion','Bebés',4,'Patea con apoyo'),
    ('natacion','Preescolar',1,'Sumerge la cara 5 segundos'), ('natacion','Preescolar',2,'Flota boca abajo sin apoyo'), ('natacion','Preescolar',3,'Patada de crol con tabla'), ('natacion','Preescolar',4,'Salta y regresa solo a la orilla'),
    ('natacion','Principiante',1,'Crol 12 m sin apoyo'), ('natacion','Principiante',2,'Dorso 12 m'), ('natacion','Principiante',3,'Respiración lateral'), ('natacion','Principiante',4,'Flotación vertical 30 s'),
    ('natacion','Intermedio',1,'Crol 25 m con respiración bilateral'), ('natacion','Intermedio',2,'Dorso 25 m'), ('natacion','Intermedio',3,'Patada de pecho'), ('natacion','Intermedio',4,'Clavado sentado'),
    ('natacion','Avanzado',1,'Crol 50 m'), ('natacion','Avanzado',2,'Pecho 25 m'), ('natacion','Avanzado',3,'Mariposa 15 m'), ('natacion','Avanzado',4,'Vuelta de campana'),
    ('natacion','Pre-equipo',1,'200 m combinado'), ('natacion','Pre-equipo',2,'Salida de banco'), ('natacion','Pre-equipo',3,'Vueltas de reglamento'), ('natacion','Pre-equipo',4,'Series con ritmo'),
    ('natacion','Adultos',1,'Crol 50 m continuo'), ('natacion','Adultos',2,'Técnica de respiración'), ('natacion','Adultos',3,'Dorso 25 m'), ('natacion','Adultos',4,'Nado continuo 15 min'),
    ('ballet','Baby ballet',1,'Primera posición de pies'), ('ballet','Baby ballet',2,'Marcha con ritmo'), ('ballet','Baby ballet',3,'Plié con apoyo'), ('ballet','Baby ballet',4,'Sigue la secuencia de la clase'),
    ('ballet','Pre-ballet',1,'Posiciones de pies 1ª a 3ª'), ('ballet','Pre-ballet',2,'Demi-plié y relevé'), ('ballet','Pre-ballet',3,'Sautés'), ('ballet','Pre-ballet',4,'Postura y colocación'),
    ('ballet','Nivel I',1,'Las cinco posiciones'), ('ballet','Nivel I',2,'Battement tendu'), ('ballet','Nivel I',3,'Port de bras básico'), ('ballet','Nivel I',4,'Chassé y pas de bourrée'),
    ('ballet','Nivel II',1,'Pirouette en passé'), ('ballet','Nivel II',2,'Grand plié'), ('ballet','Nivel II',3,'Adagio sencillo'), ('ballet','Nivel II',4,'Glissade y assemblé'),
    ('ballet','Nivel III',1,'Doble pirouette'), ('ballet','Nivel III',2,'Développé a 90°'), ('ballet','Nivel III',3,'Grand jeté'), ('ballet','Nivel III',4,'Variación corta'),
    ('ballet','Adultos',1,'Colocación en barra'), ('ballet','Adultos',2,'Port de bras'), ('ballet','Adultos',3,'Combinación en centro'), ('ballet','Adultos',4,'Pirouette simple'),
    ('gimnasia','Iniciación',1,'Rodada al frente'), ('gimnasia','Iniciación',2,'Equilibrio en un pie 5 s'), ('gimnasia','Iniciación',3,'Salto con aterrizaje controlado'), ('gimnasia','Iniciación',4,'Manejo básico de pelota'),
    ('gimnasia','Básico',1,'Rodada atrás'), ('gimnasia','Básico',2,'Puente'), ('gimnasia','Básico',3,'Rueda de carro'), ('gimnasia','Básico',4,'Lanza y atrapa la pelota'),
    ('gimnasia','Intermedio',1,'Split frontal'), ('gimnasia','Intermedio',2,'Parada de manos 3 s'), ('gimnasia','Intermedio',3,'Giro en relevé'), ('gimnasia','Intermedio',4,'Manejo de aro y cuerda'),
    ('gimnasia','Pre-equipo',1,'Rutina completa con aparato'), ('gimnasia','Pre-equipo',2,'Saltos con elevación'), ('gimnasia','Pre-equipo',3,'Pivotes dobles'), ('gimnasia','Pre-equipo',4,'Flexibilidad de espalda')
  ) as s(dep, lvl, ord, name) on l.department = s.dep and l.name = s.lvl
 where not exists (select 1 from public.skills k where k.level_id = l.id);

-- ═════════════════════════════════════════════════════════════
-- 6. Lista de espera con oferta y plazo
-- ═════════════════════════════════════════════════════════════
create table public.waitlist_offers (
  id            uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.enrollments(id) on delete cascade,
  group_id      uuid not null references public.groups(id) on delete cascade,
  member_id     uuid not null references public.members(id) on delete cascade,
  status        text not null default 'pendiente' check (status in ('pendiente','aceptada','rechazada','vencida')),
  offered_at    timestamptz not null default now(),
  expires_at    timestamptz not null,
  responded_at  timestamptz,
  responded_by  uuid references public.profiles(id) on delete set null
);
create unique index waitlist_offers_one_pending on public.waitlist_offers (enrollment_id) where status = 'pendiente';
create index on public.waitlist_offers (group_id, status);

alter table public.waitlist_offers enable row level security;
create policy "ver ofertas de lugar" on public.waitlist_offers for select to authenticated
  using (public.is_front_office() or public.has_department(public.group_department(group_id))
         or member_id in (select id from public.members where family_id in (select public.my_family_ids())));

-- Lugares ocupados de un grupo: activos + congelados con lugar guardado + ofertas pendientes
create or replace function public.lugares_ocupados(p_group uuid)
returns int language sql stable security definer set search_path = public as $$
  select (select count(*) from public.enrollments e where e.group_id = p_group
            and (e.status = 'activa' or (e.status = 'congelada' and e.freeze_until >= public.today_mx())))::int
       + (select count(*) from public.waitlist_offers o where o.group_id = p_group and o.status = 'pendiente' and o.expires_at > now())::int
$$;

-- Ofrece los lugares libres de un grupo a la lista de espera, en orden
create or replace function public.ofrecer_lugares(p_group uuid)
returns int language plpgsql security definer set search_path = public as $$
declare v_g public.groups; v_free int; v_next public.enrollments; v_n int := 0; v_h int; v_exp timestamptz;
begin
  -- Ofertas vencidas: pierden el turno y pasan al final de la lista
  with v as (
    update public.waitlist_offers set status = 'vencida', responded_at = now()
     where group_id = p_group and status = 'pendiente' and expires_at <= now()
    returning enrollment_id)
  update public.enrollments e set queue_at = now() from v where e.id = v.enrollment_id and e.status = 'lista_espera';

  select * into v_g from public.groups where id = p_group and active for update;
  if not found then return 0; end if;
  v_h := coalesce((public.setting('lista_espera')->>'horas_para_aceptar')::int, 48);
  v_free := v_g.capacity - public.lugares_ocupados(p_group);
  while v_free > 0 loop
    select e.* into v_next from public.enrollments e
     where e.group_id = p_group and e.status = 'lista_espera'
       and not exists (select 1 from public.waitlist_offers o where o.enrollment_id = e.id and o.status = 'pendiente')
     order by coalesce(e.queue_at, e.enrolled_at) limit 1;
    exit when not found;
    v_exp := now() + make_interval(hours => v_h);
    insert into public.waitlist_offers (enrollment_id, group_id, member_id, expires_at)
    values (v_next.id, p_group, v_next.member_id, v_exp);
    insert into public.notifications (family_id, member_id, channel, template, subject, body)
    select m.family_id, m.id, 'correo', 'lugar_ofrecido', '¡Se liberó un lugar!',
           m.first_name || ' tiene lugar en ' || l.name || ' (' || v_g.name || '). Acéptalo antes del ' ||
           to_char(v_exp at time zone 'America/Mexico_City', 'DD/MM HH24:MI') || '.'
      from public.members m, public.levels l where m.id = v_next.member_id and l.id = v_g.level_id;
    v_free := v_free - 1; v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- Revisa todos los grupos con lista de espera (lo llaman las pantallas al abrir)
create or replace function public.procesar_lista_espera()
returns int language plpgsql security definer set search_path = public as $$
declare g uuid; v_n int := 0;
begin
  for g in select distinct group_id from public.enrollments where status = 'lista_espera' loop
    v_n := v_n + public.ofrecer_lugares(g);
  end loop;
  return v_n;
end $$;

create or replace function public.responder_oferta(p_offer uuid, p_aceptar boolean)
returns public.waitlist_offers language plpgsql security definer set search_path = public as $$
declare v_o public.waitlist_offers; v_e public.enrollments; v_m public.members; v_l public.levels; v_p public.plans; v_g public.groups;
begin
  select * into v_o from public.waitlist_offers where id = p_offer for update;
  if not found then raise exception 'Oferta no encontrada'; end if;
  if not (public.can_act_for_member(v_o.member_id) or public.is_dept_coordinator(public.group_department(v_o.group_id))) then
    raise exception 'No tienes permiso para responder esta oferta';
  end if;
  if v_o.status <> 'pendiente' then raise exception 'Esta oferta ya fue respondida o venció'; end if;
  if v_o.expires_at <= now() then
    perform public.ofrecer_lugares(v_o.group_id);
    raise exception 'El plazo para aceptar este lugar ya venció';
  end if;

  select * into v_e from public.enrollments where id = v_o.enrollment_id for update;
  select * into v_m from public.members where id = v_o.member_id;
  select * into v_g from public.groups where id = v_o.group_id;
  select * into v_l from public.levels where id = v_g.level_id;
  select * into v_p from public.plans where id = v_g.plan_id;

  if p_aceptar then
    update public.waitlist_offers set status = 'aceptada', responded_at = now(), responded_by = auth.uid() where id = p_offer returning * into v_o;
    update public.enrollments set status = 'activa', enrolled_at = now(), queue_at = null where id = v_e.id;
    if coalesce(v_p.enrollment_fee, 0) > 0 then
      with c as (
        insert into public.charges (family_id, concept, amount, due_date, created_by)
        values (v_m.family_id, 'Inscripción ' || v_l.name || ' · ' || v_m.first_name, v_p.enrollment_fee, public.today_mx(), auth.uid())
        returning id)
      insert into public.charge_items (charge_id, member_id, department, description, amount)
      select c.id, v_m.id, v_l.department, 'Inscripción ' || v_l.name, v_p.enrollment_fee from c;
    end if;
    insert into public.notifications (family_id, member_id, channel, template, subject, body)
    values (v_m.family_id, v_m.id, 'correo', 'inscripcion_confirmada', 'Inscripción confirmada', v_m.first_name || ' · ' || v_l.name || ' · ' || v_g.name);
  else
    update public.waitlist_offers set status = 'rechazada', responded_at = now(), responded_by = auth.uid() where id = p_offer returning * into v_o;
    update public.enrollments set queue_at = now() where id = v_e.id;
    perform public.ofrecer_lugares(v_o.group_id);
  end if;
  return v_o;
end $$;

-- Inscripción: igual que antes, pero respeta lugares guardados y ofertas pendientes
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

  -- Si ya hay gente esperando, se forma en la lista aunque haya lugar (el lugar se le ofrece al primero)
  v_status := case when public.lugares_ocupados(p_group) < v_group.capacity
                    and not exists (select 1 from public.enrollments where group_id = p_group and status = 'lista_espera')
                   then 'activa' else 'lista_espera' end;

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

  if v_status = 'lista_espera' then perform public.ofrecer_lugares(p_group); end if;
  return v_row;
end $$;

-- Baja, congelamiento y reactivación: al liberar lugar se OFRECE al primero de la lista (ya no entra solo)
create or replace function public.cambiar_estado_inscripcion(p_enrollment uuid, p_status text, p_notes text default null)
returns public.enrollments
language plpgsql security definer set search_path = public as $$
declare v_row public.enrollments;
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
         freeze_until = case when p_status = 'congelada' then freeze_until else null end,
         notes = coalesce(p_notes, notes)
   where id = p_enrollment returning * into v_row;

  update public.waitlist_offers set status = 'rechazada', responded_at = now()
   where enrollment_id = p_enrollment and status = 'pendiente' and p_status = 'baja';

  if p_status in ('baja','congelada') then
    perform public.ofrecer_lugares(v_row.group_id);
  end if;
  return v_row;
end $$;

-- ═════════════════════════════════════════════════════════════
-- 5. Reposición de faltas con créditos
-- ═════════════════════════════════════════════════════════════
create table public.makeup_credits (
  id              uuid primary key default gen_random_uuid(),
  member_id       uuid not null references public.members(id) on delete cascade,
  enrollment_id   uuid references public.enrollments(id) on delete set null,
  level_id        uuid not null references public.levels(id),
  department      text not null references public.departments(code),
  missed_group_id uuid references public.groups(id) on delete set null,
  missed_date     date not null,
  reason          text,
  expires_on      date not null,
  status          text not null default 'disponible' check (status in ('disponible','agendada','usada','vencida','cancelada')),
  used_group_id   uuid references public.groups(id) on delete set null,
  used_date       date,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now()
);
create unique index makeup_credits_one_per_class on public.makeup_credits (member_id, missed_group_id, missed_date) where status <> 'cancelada';
create index on public.makeup_credits (used_group_id, used_date);
create index on public.makeup_credits (member_id, status);

alter table public.makeup_credits enable row level security;
create policy "ver créditos de reposición" on public.makeup_credits for select to authenticated
  using (public.is_front_office() or public.has_department(department)
         or member_id in (select id from public.members where family_id in (select public.my_family_ids())));


create or replace function public.dia_iso(d date)
returns int language sql immutable as $$ select extract(isodow from d)::int $$;

-- La familia avisa que su hijo faltará: queda justificada y, si cumple las reglas, gana un crédito
create or replace function public.avisar_falta(p_enrollment uuid, p_date date, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_e public.enrollments; v_g public.groups; v_l public.levels; r jsonb; v_cnt int; v_exp date; v_credit uuid;
begin
  select * into v_e from public.enrollments where id = p_enrollment;
  if not found or v_e.status <> 'activa' then raise exception 'La inscripción no está activa'; end if;
  if not (public.can_act_for_member(v_e.member_id) or public.has_department(public.group_department(v_e.group_id))) then
    raise exception 'No tienes permiso para avisar esta falta';
  end if;
  select * into v_g from public.groups where id = v_e.group_id;
  select * into v_l from public.levels where id = v_g.level_id;
  r := coalesce(public.setting('reposiciones'), '{}');
  if not (public.dia_iso(p_date) = any (v_g.weekdays)) then raise exception 'Ese día no hay clase en este grupo'; end if;
  if p_date < public.today_mx() then raise exception 'Solo se pueden avisar faltas de clases que no han pasado'; end if;
  if p_date = public.today_mx() and not public.is_staff()
     and (now() at time zone 'America/Mexico_City')::time > v_g.start_time - make_interval(hours => coalesce((r->>'horas_aviso')::int, 2)) then
    raise exception 'Hay que avisar al menos % horas antes de la clase', coalesce((r->>'horas_aviso')::int, 2);
  end if;

  insert into public.attendance (member_id, group_id, department, date, status, recorded_by)
  values (v_e.member_id, v_g.id, v_l.department, p_date, 'justificada', auth.uid())
  on conflict (member_id, coalesce(group_id, '00000000-0000-0000-0000-000000000000'::uuid), date)
  do update set status = 'justificada', recorded_by = excluded.recorded_by, recorded_at = now();

  if exists (select 1 from public.makeup_credits where member_id = v_e.member_id and missed_group_id = v_g.id and missed_date = p_date and status <> 'cancelada') then
    return jsonb_build_object('credito', true, 'mensaje', 'Esta falta ya tenía su crédito');
  end if;
  select count(*) into v_cnt from public.makeup_credits
   where member_id = v_e.member_id and department = v_l.department and status <> 'cancelada'
     and date_trunc('month', missed_date) = date_trunc('month', p_date);
  if v_cnt >= coalesce((r->>'max_por_mes')::int, 2) then
    return jsonb_build_object('credito', false, 'mensaje', 'Falta justificada. Ya usó las ' || coalesce((r->>'max_por_mes')::int, 2) || ' reposiciones de este mes.');
  end if;
  v_exp := p_date + coalesce((r->>'dias_vigencia')::int, 30);
  insert into public.makeup_credits (member_id, enrollment_id, level_id, department, missed_group_id, missed_date, reason, expires_on, created_by)
  values (v_e.member_id, v_e.id, v_l.id, v_l.department, v_g.id, p_date, nullif(trim(coalesce(p_reason, '')), ''), v_exp, auth.uid())
  returning id into v_credit;
  return jsonb_build_object('credito', true, 'id', v_credit, 'vence', v_exp, 'mensaje', 'Falta avisada. Tiene un crédito para reponer la clase hasta el ' || to_char(v_exp, 'DD/MM/YYYY') || '.');
end $$;

-- El personal da un crédito sin límites (p. ej. clase cancelada por el club)
create or replace function public.otorgar_reposicion(p_enrollment uuid, p_date date, p_reason text default null)
returns public.makeup_credits language plpgsql security definer set search_path = public as $$
declare v_e public.enrollments; v_g public.groups; v_l public.levels; v_row public.makeup_credits;
begin
  select * into v_e from public.enrollments where id = p_enrollment;
  if not found then raise exception 'Inscripción no encontrada'; end if;
  select * into v_g from public.groups where id = v_e.group_id;
  select * into v_l from public.levels where id = v_g.level_id;
  if not (public.is_front_office() or (public.is_staff() and public.has_department(v_l.department))) then
    raise exception 'Solo el personal puede otorgar reposiciones';
  end if;
  insert into public.makeup_credits (member_id, enrollment_id, level_id, department, missed_group_id, missed_date, reason, expires_on, created_by)
  values (v_e.member_id, v_e.id, v_l.id, v_l.department, v_g.id, p_date, coalesce(nullif(trim(coalesce(p_reason, '')), ''), 'Otorgada por el club'),
          greatest(p_date, public.today_mx()) + coalesce((public.setting('reposiciones')->>'dias_vigencia')::int, 30), auth.uid())
  on conflict (member_id, missed_group_id, missed_date) where status <> 'cancelada' do nothing
  returning * into v_row;
  if v_row.id is null then raise exception 'Esa falta ya tiene un crédito'; end if;
  return v_row;
end $$;

-- Clases del mismo nivel donde se puede reponer (con lugar libre y dentro de la vigencia)
create or replace function public.opciones_reposicion(p_credit uuid)
returns table(group_id uuid, fecha date, hora_inicio time, hora_fin time, ubicacion text, nivel text, grupo text, libres int)
language plpgsql stable security definer set search_path = public as $$
declare v_c public.makeup_credits; v_ad int;
begin
  select * into v_c from public.makeup_credits where id = p_credit;
  if not found then raise exception 'Crédito no encontrado'; end if;
  if not (public.can_act_for_member(v_c.member_id) or public.has_department(v_c.department)) then
    raise exception 'No tienes permiso para ver este crédito';
  end if;
  v_ad := coalesce((public.setting('reposiciones')->>'dias_adelante')::int, 14);
  return query
  select g.id, d::date, g.start_time, g.end_time, g.location, l.name, g.name, public.lugares_libres_en(g.id, d::date)
    from public.groups g join public.levels l on l.id = g.level_id
    cross join generate_series(public.today_mx(), least(v_c.expires_on, public.today_mx() + v_ad), interval '1 day') d
   where g.level_id = v_c.level_id and g.active
     and public.dia_iso(d::date) = any (g.weekdays)
     and not (d::date = public.today_mx() and g.start_time <= (now() at time zone 'America/Mexico_City')::time)
     and not exists (select 1 from public.enrollments e where e.group_id = g.id and e.member_id = v_c.member_id and e.status = 'activa')
     and public.lugares_libres_en(g.id, d::date) > 0
   order by d, g.start_time;
end $$;

create or replace function public.usar_reposicion(p_credit uuid, p_group uuid, p_date date)
returns public.makeup_credits language plpgsql security definer set search_path = public as $$
declare v_c public.makeup_credits; v_m public.members; v_l public.levels;
begin
  select * into v_c from public.makeup_credits where id = p_credit for update;
  if not found then raise exception 'Crédito no encontrado'; end if;
  if not (public.can_act_for_member(v_c.member_id) or public.has_department(v_c.department)) then
    raise exception 'No tienes permiso para usar este crédito';
  end if;
  if v_c.status <> 'disponible' then raise exception 'Este crédito ya se usó o no está disponible'; end if;
  if v_c.expires_on < public.today_mx() then
    update public.makeup_credits set status = 'vencida' where id = p_credit;
    raise exception 'Este crédito ya venció';
  end if;
  perform pg_advisory_xact_lock(hashtext(p_group::text || p_date::text));
  if not exists (select 1 from public.opciones_reposicion(p_credit) o where o.group_id = p_group and o.fecha = p_date) then
    raise exception 'Esa clase ya no tiene lugar disponible';
  end if;
  update public.makeup_credits set status = 'agendada', used_group_id = p_group, used_date = p_date where id = p_credit returning * into v_c;
  select * into v_m from public.members where id = v_c.member_id;
  select l.* into v_l from public.levels l join public.groups g on g.level_id = l.id where g.id = p_group;
  insert into public.notifications (family_id, member_id, channel, template, subject, body)
  values (v_m.family_id, v_m.id, 'correo', 'reposicion_agendada', 'Reposición agendada',
          v_m.first_name || ' repone su clase de ' || v_l.name || ' el ' || to_char(p_date, 'DD/MM/YYYY') || '.');
  return v_c;
end $$;

create or replace function public.cancelar_reposicion(p_credit uuid)
returns public.makeup_credits language plpgsql security definer set search_path = public as $$
declare v_c public.makeup_credits;
begin
  select * into v_c from public.makeup_credits where id = p_credit for update;
  if not found then raise exception 'Crédito no encontrado'; end if;
  if not (public.can_act_for_member(v_c.member_id) or public.has_department(v_c.department)) then
    raise exception 'No tienes permiso para cambiar este crédito';
  end if;
  if v_c.status <> 'agendada' or v_c.used_date < public.today_mx() then raise exception 'Solo se puede cancelar una reposición próxima'; end if;
  update public.makeup_credits set status = case when expires_on >= public.today_mx() then 'disponible' else 'vencida' end,
         used_group_id = null, used_date = null
   where id = p_credit returning * into v_c;
  return v_c;
end $$;

-- El coach marca si el alumno vino a reponer
create or replace function public.marcar_reposicion(p_credit uuid, p_asistio boolean)
returns public.makeup_credits language plpgsql security definer set search_path = public as $$
declare v_c public.makeup_credits;
begin
  select * into v_c from public.makeup_credits where id = p_credit for update;
  if not found then raise exception 'Crédito no encontrado'; end if;
  if not (public.is_front_office() or (public.is_staff() and public.has_department(v_c.department))) then
    raise exception 'Solo el personal puede pasar lista';
  end if;
  update public.makeup_credits set status = case when p_asistio then 'usada' else 'vencida' end where id = p_credit returning * into v_c;
  return v_c;
end $$;

-- ═════════════════════════════════════════════════════════════
-- 9. Prospectos y clases de prueba
-- ═════════════════════════════════════════════════════════════
create table public.leads (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  phone            text,
  email            text,
  child_name       text,
  child_birthdate  date,
  department       text references public.departments(code),
  source           text not null default 'visita' check (source in ('visita','whatsapp','telefono','redes','referido','web','otro')),
  status           text not null default 'nuevo' check (status in ('nuevo','contactado','prueba_agendada','prueba_hecha','inscrito','perdido')),
  trial_group_id   uuid references public.groups(id) on delete set null,
  trial_date       date,
  trial_attended   boolean,
  next_follow_up   date default public.today_mx(),
  attempts         int not null default 0,
  assigned_to      uuid references public.profiles(id) on delete set null,
  family_id        uuid references public.families(id) on delete set null,
  lost_reason      text,
  notes            text,
  created_by       uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index on public.leads (status, next_follow_up);
create index on public.leads (trial_group_id, trial_date);

create table public.lead_activities (
  id         uuid primary key default gen_random_uuid(),
  lead_id    uuid not null references public.leads(id) on delete cascade,
  kind       text not null check (kind in ('nota','llamada','whatsapp','correo','prueba','estado')),
  body       text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.lead_activities (lead_id, created_at desc);

-- Lugares libres de un grupo en una fecha (para reposiciones y clases de prueba)
create or replace function public.lugares_libres_en(p_group uuid, p_date date)
returns int language sql stable security definer set search_path = public as $$
  select g.capacity
       - (select count(*) from public.enrollments e where e.group_id = g.id and e.status = 'activa')::int
       + (select count(*) from public.attendance a join public.enrollments e on e.member_id = a.member_id and e.group_id = a.group_id and e.status = 'activa'
           where a.group_id = g.id and a.date = p_date and a.status = 'justificada')::int
       - (select count(*) from public.makeup_credits c where c.used_group_id = g.id and c.used_date = p_date and c.status in ('agendada','usada'))::int
       - (select count(*) from public.leads l where l.trial_group_id = g.id and l.trial_date = p_date and l.status in ('prueba_agendada','prueba_hecha'))::int
    from public.groups g where g.id = p_group
$$;

create or replace function public.puede_prospectos(p_dep text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_front_office() or public.my_role() = 'ventas'
      or (public.my_role() in ('coordinador','coach') and (p_dep is null or public.has_department(p_dep)))
$$;

alter table public.leads enable row level security;
alter table public.lead_activities enable row level security;
create policy "ver prospectos" on public.leads for select to authenticated using (public.puede_prospectos(department));
create policy "crear prospectos" on public.leads for insert to authenticated with check (public.puede_prospectos(department));
create policy "editar prospectos" on public.leads for update to authenticated
  using (public.puede_prospectos(department)) with check (public.puede_prospectos(department));
create policy "ver seguimiento de prospectos" on public.lead_activities for select to authenticated
  using (exists (select 1 from public.leads l where l.id = lead_id and public.puede_prospectos(l.department)));
create policy "anotar seguimiento de prospectos" on public.lead_activities for insert to authenticated
  with check (exists (select 1 from public.leads l where l.id = lead_id and public.puede_prospectos(l.department)));

-- Formulario público de clase de prueba (sin sesión)
create or replace function public.solicitar_prueba(p_name text, p_phone text, p_email text default null, p_child text default null,
                                                   p_birthdate date default null, p_department text default null, p_message text default null)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_digits text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
begin
  if length(trim(coalesce(p_name, ''))) < 2 or length(p_name) > 120 then raise exception 'Escribe tu nombre'; end if;
  if length(v_digits) < 10 or length(v_digits) > 13 then raise exception 'Escribe un celular de 10 dígitos'; end if;
  if p_department is not null and not exists (select 1 from public.departments where code = p_department and is_area) then
    raise exception 'Área no válida';
  end if;
  if exists (select 1 from public.leads where regexp_replace(coalesce(phone, ''), '\D', '', 'g') = v_digits and created_at > now() - interval '1 day') then
    return true; -- ya la recibimos hoy
  end if;
  insert into public.leads (name, phone, email, child_name, child_birthdate, department, source, notes, next_follow_up)
  values (left(trim(p_name), 120), v_digits, left(nullif(trim(coalesce(p_email, '')), ''), 160), left(nullif(trim(coalesce(p_child, '')), ''), 120),
          p_birthdate, p_department, 'web', left(nullif(trim(coalesce(p_message, '')), ''), 1000), public.today_mx());
  return true;
end $$;

create or replace function public.agendar_prueba(p_lead uuid, p_group uuid, p_date date)
returns public.leads language plpgsql security definer set search_path = public as $$
declare v_l public.leads; v_g public.groups; v_lv public.levels; v_d int;
begin
  select * into v_l from public.leads where id = p_lead for update;
  if not found then raise exception 'Prospecto no encontrado'; end if;
  select * into v_g from public.groups where id = p_group and active;
  if not found then raise exception 'Grupo no disponible'; end if;
  select * into v_lv from public.levels where id = v_g.level_id;
  if not public.puede_prospectos(v_lv.department) then raise exception 'No tienes permiso para agendar pruebas'; end if;
  if p_date < public.today_mx() then raise exception 'Elige una fecha futura'; end if;
  if not (public.dia_iso(p_date) = any (v_g.weekdays)) then raise exception 'Ese día no hay clase en este grupo'; end if;
  if not (v_l.trial_group_id = p_group and v_l.trial_date = p_date) and public.lugares_libres_en(p_group, p_date) <= 0 then
    raise exception 'Esa clase está llena ese día';
  end if;
  v_d := coalesce((public.setting('prospectos')->>'dias_despues_prueba')::int, 1);
  update public.leads set status = 'prueba_agendada', trial_group_id = p_group, trial_date = p_date, trial_attended = null,
         department = coalesce(department, v_lv.department), next_follow_up = p_date + v_d, updated_at = now()
   where id = p_lead returning * into v_l;
  insert into public.lead_activities (lead_id, kind, body, created_by)
  values (p_lead, 'prueba', 'Clase de prueba: ' || v_lv.name || ' · ' || to_char(p_date, 'DD/MM/YYYY') || ' ' || to_char(v_g.start_time, 'HH24:MI'), auth.uid());
  return v_l;
end $$;

create or replace function public.resultado_prueba(p_lead uuid, p_asistio boolean)
returns public.leads language plpgsql security definer set search_path = public as $$
declare v_l public.leads;
begin
  select * into v_l from public.leads where id = p_lead for update;
  if not found then raise exception 'Prospecto no encontrado'; end if;
  if not (public.puede_prospectos(v_l.department) or public.has_department(public.group_department(v_l.trial_group_id))) then
    raise exception 'No tienes permiso';
  end if;
  update public.leads set trial_attended = p_asistio,
         status = case when p_asistio then 'prueba_hecha' else 'contactado' end,
         next_follow_up = public.today_mx() + case when p_asistio then coalesce((public.setting('prospectos')->>'dias_despues_prueba')::int, 1) else 0 end,
         updated_at = now()
   where id = p_lead returning * into v_l;
  insert into public.lead_activities (lead_id, kind, body, created_by)
  values (p_lead, 'prueba', case when p_asistio then 'Vino a su clase de prueba' else 'No llegó a su clase de prueba' end, auth.uid());
  return v_l;
end $$;

-- Registrar un contacto o cambio de estado; la próxima fecha de seguimiento se calcula sola
create or replace function public.seguimiento_prospecto(p_lead uuid, p_kind text, p_body text default null, p_status text default null,
                                                        p_next date default null, p_lost_reason text default null)
returns public.leads language plpgsql security definer set search_path = public as $$
declare v_l public.leads; v_new text; v_r jsonb := coalesce(public.setting('prospectos'), '{}');
begin
  select * into v_l from public.leads where id = p_lead for update;
  if not found then raise exception 'Prospecto no encontrado'; end if;
  if not public.puede_prospectos(v_l.department) then raise exception 'No tienes permiso'; end if;
  v_new := coalesce(p_status, case when v_l.status = 'nuevo' and p_kind in ('llamada','whatsapp','correo') then 'contactado' else v_l.status end);
  if v_new not in ('nuevo','contactado','prueba_agendada','prueba_hecha','inscrito','perdido') then raise exception 'Estado no válido'; end if;
  update public.leads set
         status = v_new,
         attempts = attempts + case when p_kind in ('llamada','whatsapp','correo') then 1 else 0 end,
         lost_reason = case when v_new = 'perdido' then coalesce(p_lost_reason, lost_reason) else lost_reason end,
         next_follow_up = case
           when v_new in ('inscrito','perdido') then null
           when p_next is not null then p_next
           when v_new = 'prueba_agendada' then coalesce(trial_date, public.today_mx()) + coalesce((v_r->>'dias_despues_prueba')::int, 1)
           when p_kind in ('llamada','whatsapp','correo') then public.today_mx() + coalesce((v_r->>'dias_recontacto')::int, 3)
           else coalesce(next_follow_up, public.today_mx()) end,
         updated_at = now()
   where id = p_lead returning * into v_l;
  insert into public.lead_activities (lead_id, kind, body, created_by)
  values (p_lead, p_kind, coalesce(nullif(trim(coalesce(p_body, '')), ''),
          case when p_status is not null then 'Estado: ' || p_status else null end), auth.uid());
  return v_l;
end $$;

-- Convertir en familia: crea familia, titular e hijo (si hay) y marca inscrito
create or replace function public.convertir_prospecto(p_lead uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_l public.leads; v_fam uuid; v_first text; v_last text;
begin
  select * into v_l from public.leads where id = p_lead for update;
  if not found then raise exception 'Prospecto no encontrado'; end if;
  if not public.is_front_office() then raise exception 'Solo recepción o dirección registran familias'; end if;
  if v_l.family_id is not null then return v_l.family_id; end if;
  v_first := split_part(trim(v_l.name), ' ', 1);
  v_last := nullif(trim(substr(trim(v_l.name), length(v_first) + 1)), '');
  insert into public.families (name, phone, email, created_by)
  values ('Familia ' || coalesce(v_last, v_first), v_l.phone, v_l.email, auth.uid()) returning id into v_fam;
  insert into public.members (family_id, first_name, last_name, is_titular, phone, email)
  values (v_fam, v_first, coalesce(v_last, ''), true, v_l.phone, v_l.email);
  if v_l.child_name is not null then
    insert into public.members (family_id, first_name, last_name, birthdate)
    values (v_fam, split_part(trim(v_l.child_name), ' ', 1),
            coalesce(nullif(trim(substr(trim(v_l.child_name), length(split_part(trim(v_l.child_name), ' ', 1)) + 1)), ''), coalesce(v_last, '')),
            v_l.child_birthdate);
  end if;
  update public.leads set status = 'inscrito', family_id = v_fam, next_follow_up = null, updated_at = now() where id = p_lead;
  insert into public.lead_activities (lead_id, kind, body, created_by) values (p_lead, 'estado', 'Se registró como familia', auth.uid());
  return v_fam;
end $$;

-- ═════════════════════════════════════════════════════════════
-- 7. Flujo para salvar bajas
-- ═════════════════════════════════════════════════════════════
create table public.retention_cases (
  id                uuid primary key default gen_random_uuid(),
  member_id         uuid not null references public.members(id) on delete cascade,
  family_id         uuid references public.families(id) on delete cascade,
  enrollment_id     uuid references public.enrollments(id) on delete set null,
  membership_id     uuid references public.memberships(id) on delete set null,
  department        text references public.departments(code),
  reason            text not null,
  detail            text,
  choice            text not null check (choice in ('congelar','descuento','cambio_grupo','baja')),
  outcome           text not null check (outcome in ('retenido','baja')),
  freeze_until      date,
  discount_pct      numeric(5,2),
  discount_until    date,
  prev_discount_pct numeric(5,2),
  reverted          boolean not null default false,
  channel           text not null default 'recepcion' check (channel in ('portal','recepcion')),
  created_by        uuid references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now()
);
create index on public.retention_cases (created_at desc);
create index on public.retention_cases (member_id);

alter table public.retention_cases enable row level security;
create policy "ver casos de retención" on public.retention_cases for select to authenticated
  using (public.is_front_office() or (public.is_staff() and public.has_department(department))
         or family_id in (select public.my_family_ids()));

-- Pide la baja con motivo y decide: congelar con lugar guardado, descuento temporal, cambio de grupo o baja
create or replace function public.solicitar_baja(p_enrollment uuid, p_membership uuid, p_reason text, p_detail text,
                                                 p_choice text, p_months int default 1, p_new_group uuid default null)
returns public.retention_cases language plpgsql security definer set search_path = public as $$
declare
  v_e public.enrollments; v_ms public.memberships; v_mem uuid; v_dep text; v_fam uuid;
  v_r jsonb := coalesce(public.setting('retencion'), '{}'); v_row public.retention_cases;
  v_pct numeric; v_months int; v_until date; v_prev numeric;
begin
  if p_choice not in ('congelar','descuento','cambio_grupo','baja') then raise exception 'Opción no válida'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Elige un motivo'; end if;
  if p_enrollment is not null then
    select * into v_e from public.enrollments where id = p_enrollment for update;
    if not found or v_e.status = 'baja' then raise exception 'Inscripción no encontrada'; end if;
    v_mem := v_e.member_id; v_dep := public.group_department(v_e.group_id); v_prev := v_e.discount_pct;
  elsif p_membership is not null then
    select * into v_ms from public.memberships where id = p_membership for update;
    if not found or v_ms.status = 'baja' then raise exception 'Membresía no encontrada'; end if;
    v_mem := v_ms.member_id; select department into v_dep from public.plans where id = v_ms.plan_id; v_prev := v_ms.discount_pct;
  else
    raise exception 'Falta la inscripción o membresía';
  end if;
  if not (public.can_act_for_member(v_mem) or public.is_dept_coordinator(v_dep)) then
    raise exception 'No tienes permiso para dar de baja';
  end if;
  select family_id into v_fam from public.members where id = v_mem;

  if p_choice = 'congelar' then
    v_months := least(greatest(coalesce(p_months, 1), 1), coalesce((v_r->>'max_meses_congelar')::int, 2));
    v_until := (public.today_mx() + make_interval(months => v_months))::date;
    if p_enrollment is not null then
      update public.enrollments set status = 'congelada', freeze_until = v_until, notes = 'Congelada hasta ' || to_char(v_until, 'DD/MM/YYYY') where id = p_enrollment;
    else
      update public.memberships set status = 'congelada', freeze_until = v_until where id = p_membership;
    end if;
  elsif p_choice = 'descuento' then
    if exists (select 1 from public.retention_cases where member_id = v_mem and choice = 'descuento'
                 and coalesce(enrollment_id::text, membership_id::text) = coalesce(p_enrollment::text, p_membership::text)
                 and created_at > now() - interval '1 year') then
      raise exception 'Este alumno ya recibió el descuento de permanencia en el último año';
    end if;
    v_pct := coalesce((v_r->>'descuento_pct')::numeric, 15);
    v_until := (public.today_mx() + make_interval(months => coalesce((v_r->>'meses_descuento')::int, 2)))::date;
    if p_enrollment is not null then
      update public.enrollments set discount_pct = least(100, discount_pct + v_pct) where id = p_enrollment;
    else
      update public.memberships set discount_pct = least(100, discount_pct + v_pct) where id = p_membership;
    end if;
  elsif p_choice = 'cambio_grupo' then
    if p_enrollment is null or p_new_group is null then raise exception 'Elige el nuevo grupo'; end if;
    perform public.cambiar_grupo(p_enrollment, p_new_group);
  else
    if p_enrollment is not null then
      perform public.cambiar_estado_inscripcion(p_enrollment, 'baja', 'Baja: ' || p_reason);
    else
      update public.memberships set status = 'baja', ends_on = public.today_mx() where id = p_membership;
    end if;
  end if;

  insert into public.retention_cases (member_id, family_id, enrollment_id, membership_id, department, reason, detail, choice, outcome,
                                      freeze_until, discount_pct, discount_until, prev_discount_pct, channel, created_by)
  values (v_mem, v_fam, p_enrollment, p_membership, v_dep, p_reason, nullif(trim(coalesce(p_detail, '')), ''), p_choice,
          case when p_choice = 'baja' then 'baja' else 'retenido' end,
          case when p_choice = 'congelar' then v_until end,
          case when p_choice = 'descuento' then v_pct end,
          case when p_choice = 'descuento' then v_until end,
          case when p_choice = 'descuento' then v_prev end,
          case when public.is_staff() then 'recepcion' else 'portal' end, auth.uid())
  returning * into v_row;

  -- Las acciones de riesgo abiertas de este alumno quedan atendidas
  update public.churn_actions set status = 'hecha', done_at = now(), done_by = auth.uid(),
         result = coalesce(result, case when p_choice = 'baja' then 'Se dio de baja' else 'Retenido: ' || p_choice end)
   where member_id = v_mem and status = 'pendiente';
  return v_row;
end $$;

-- Reactiva congelados que cumplieron su plazo y quita descuentos temporales vencidos
create or replace function public.aplicar_vencimientos_retencion()
returns int language plpgsql security definer set search_path = public as $$
declare v_n int := 0; v_k int;
begin
  update public.enrollments set status = 'activa', freeze_until = null
   where status = 'congelada' and freeze_until is not null and freeze_until <= public.today_mx();
  get diagnostics v_k = row_count; v_n := v_n + v_k;
  update public.memberships set status = 'activa', freeze_until = null
   where status = 'congelada' and freeze_until is not null and freeze_until <= public.today_mx();
  get diagnostics v_k = row_count; v_n := v_n + v_k;

  with r as (
    update public.retention_cases set reverted = true
     where choice = 'descuento' and not reverted and discount_until <= public.today_mx()
    returning enrollment_id, membership_id, prev_discount_pct)
  , a as (update public.enrollments e set discount_pct = r.prev_discount_pct from r where e.id = r.enrollment_id returning 1)
  update public.memberships ms set discount_pct = r.prev_discount_pct from r where ms.id = r.membership_id;
  return v_n;
end $$;

-- ═════════════════════════════════════════════════════════════
-- 10. Predicción de bajas y acciones
-- ═════════════════════════════════════════════════════════════
create table public.churn_actions (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references public.members(id) on delete cascade,
  family_id   uuid references public.families(id) on delete cascade,
  department  text references public.departments(code),
  score       int not null,
  factors     jsonb not null default '[]',
  action      text not null check (action in ('whatsapp','llamada_cobranza','llamada_bienvenida','boleta_coach','llamada_regreso','oferta_retencion')),
  status      text not null default 'pendiente' check (status in ('pendiente','hecha','descartada')),
  due_on      date not null default public.today_mx(),
  assigned_to uuid references public.profiles(id) on delete set null,
  result      text,
  created_at  timestamptz not null default now(),
  done_at     timestamptz,
  done_by     uuid references public.profiles(id) on delete set null
);
create index on public.churn_actions (status, due_on);
create index on public.churn_actions (member_id, created_at desc);

alter table public.churn_actions enable row level security;
create policy "ver acciones de retención" on public.churn_actions for select to authenticated
  using (public.is_front_office() or assigned_to = auth.uid() or (public.is_staff() and public.has_department(department)));

-- Cálculo interno del riesgo (sin revisar permisos; lo usan riesgo_bajas y generar_acciones_riesgo)
create or replace function public.calcular_riesgo(p_area text default null)
returns table(member_id uuid, family_id uuid, nombre text, familia text, telefono text, area text, edad numeric,
              ultima_visita date, puntaje int, nivel text, factores jsonb, accion text, coach_id uuid)
language sql stable security definer set search_path = public as $$
  with act as (select a as member_id from public.activos_en(public.today_mx(), p_area) a),
  base as (
    select m.id, m.family_id, m.first_name || ' ' || m.last_name as nombre, f.name as familia,
           coalesce(f.phone, m.phone) as telefono, public.age_at(m.birthdate, public.today_mx()) as edad,
           (select l.department from public.enrollments e join public.groups g on g.id = e.group_id join public.levels l on l.id = g.level_id
             where e.member_id = m.id and e.status in ('activa','congelada') and (p_area is null or l.department = p_area) order by e.enrolled_at limit 1) as dep_e,
           (select p.department from public.memberships ms join public.plans p on p.id = ms.plan_id
             where ms.member_id = m.id and ms.status in ('activa','congelada') and (p_area is null or p.department = p_area) limit 1) as dep_m,
           (select g.coach_id from public.enrollments e join public.groups g on g.id = e.group_id
             where e.member_id = m.id and e.status = 'activa' order by e.enrolled_at limit 1) as coach_id,
           greatest((select max((v.check_in_at at time zone 'America/Mexico_City')::date) from public.visits v where v.member_id = m.id),
                    (select max(t.date) from public.attendance t where t.member_id = m.id and t.status in ('presente','retardo'))) as ultima,
           (select min(s.started) from public.suscripciones(p_area) s where s.member_id = m.id) as desde,
           (select count(*) filter (where t.status in ('presente','retardo'))::numeric / nullif(count(*), 0)
              from public.attendance t where t.member_id = m.id and t.date > public.today_mx() - 28) as tasa_rec,
           (select count(*) filter (where t.status in ('presente','retardo'))::numeric / nullif(count(*), 0)
              from public.attendance t where t.member_id = m.id and t.date <= public.today_mx() - 28 and t.date > public.today_mx() - 84) as tasa_prev,
           (select count(*) from public.attendance t where t.member_id = m.id and t.status = 'ausente' and t.date > public.today_mx() - 28) as faltas,
           coalesce((select fb.days_overdue from public.family_balances fb where fb.family_id = m.family_id and fb.balance > 0), 0) as dias_adeudo,
           exists (select 1 from public.enrollments e where e.member_id = m.id and e.status = 'congelada') as congelado,
           exists (select 1 from public.retention_cases rc where rc.member_id = m.id and rc.created_at > now() - interval '180 days') as pidio_baja,
           greatest((select max(lh.created_at)::date from public.level_history lh where lh.member_id = m.id),
                    (select max(sp.achieved_at)::date from public.skill_progress sp where sp.member_id = m.id)) as ultimo_avance,
           exists (select 1 from public.enrollments e join public.groups g on g.id = e.group_id join public.levels l on l.id = g.level_id
                    where e.member_id = m.id and e.status = 'activa' and l.department in ('natacion','ballet','gimnasia')) as escuela
      from act join public.members m on m.id = act.member_id join public.families f on f.id = m.family_id
     where m.active
  ),
  fac as (
    select b.*, (public.today_mx() - coalesce(b.ultima, b.desde)) as dias_sin_venir,
      jsonb_strip_nulls(jsonb_build_array(
        case when public.today_mx() - coalesce(b.ultima, b.desde) >= 21 then jsonb_build_object('k','inactividad','p',30,'t','No viene hace ' || (public.today_mx() - coalesce(b.ultima, b.desde)) || ' días')
             when public.today_mx() - coalesce(b.ultima, b.desde) >= 14 then jsonb_build_object('k','inactividad','p',20,'t','No viene hace ' || (public.today_mx() - coalesce(b.ultima, b.desde)) || ' días')
             when public.today_mx() - coalesce(b.ultima, b.desde) >= 8 then jsonb_build_object('k','inactividad','p',8,'t','Una semana sin venir') end,
        case when b.tasa_prev > 0 and coalesce(b.tasa_rec, 0) < b.tasa_prev * 0.6 then jsonb_build_object('k','caida','p',20,'t','Asistencia bajó de ' || round(b.tasa_prev * 100) || '% a ' || round(coalesce(b.tasa_rec, 0) * 100) || '%') end,
        case when b.faltas >= 3 then jsonb_build_object('k','faltas','p',10,'t', b.faltas || ' faltas sin avisar en 4 semanas') end,
        case when b.dias_adeudo >= 30 then jsonb_build_object('k','adeudo','p',20,'t','Adeudo de ' || b.dias_adeudo || ' días')
             when b.dias_adeudo > 0 then jsonb_build_object('k','adeudo','p',12,'t','Pago atrasado ' || b.dias_adeudo || ' días') end,
        case when b.desde > public.today_mx() - 90 then jsonb_build_object('k','nuevo','p',10,'t','Menos de 3 meses en el club') end,
        case when b.escuela and b.desde < public.today_mx() - 180 and coalesce(b.ultimo_avance, b.desde) < public.today_mx() - 180
             then jsonb_build_object('k','sin_avance','p',10,'t','Sin avance registrado en 6 meses') end,
        case when b.congelado then jsonb_build_object('k','congelado','p',10,'t','Tiene una clase congelada') end,
        case when b.pidio_baja then jsonb_build_object('k','pidio_baja','p',10,'t','Pidió la baja en los últimos 6 meses') end,
        case when b.edad between 13 and 17 then jsonb_build_object('k','edad','p',5,'t','Adolescente (mayor abandono)') end
      )) as fs
      from base b
  ),
  sc as (
    select fac.*, coalesce((select jsonb_agg(x order by (x->>'p')::int desc) from jsonb_array_elements(fac.fs) x where x <> 'null'::jsonb), '[]') as fs2
      from fac
  )
  select s.id, s.family_id, s.nombre, s.familia, s.telefono, coalesce(s.dep_e, s.dep_m), s.edad, s.ultima,
         least(100, coalesce((select sum((x->>'p')::int) from jsonb_array_elements(s.fs2) x), 0))::int as puntaje,
         case when least(100, coalesce((select sum((x->>'p')::int) from jsonb_array_elements(s.fs2) x), 0)) >= 50 then 'alto'
              when least(100, coalesce((select sum((x->>'p')::int) from jsonb_array_elements(s.fs2) x), 0)) >= 30 then 'medio' else 'bajo' end,
         s.fs2,
         case s.fs2->0->>'k'
           when 'adeudo' then 'llamada_cobranza' when 'nuevo' then 'llamada_bienvenida' when 'sin_avance' then 'boleta_coach'
           when 'congelado' then 'llamada_regreso' when 'pidio_baja' then 'oferta_retencion' else 'whatsapp' end,
         s.coach_id
    from sc s
   where jsonb_array_length(s.fs2) > 0
$$;

create or replace function public.riesgo_bajas(p_area text default null)
returns table(member_id uuid, family_id uuid, nombre text, familia text, telefono text, area text, edad numeric,
              ultima_visita date, puntaje int, nivel text, factores jsonb, accion text, coach_id uuid)
language sql stable security definer set search_path = public as $$
  select * from public.calcular_riesgo(p_area)
   where (public.is_front_office() or public.puede_analitica(p_area)) and puntaje >= 20
   order by puntaje desc, nombre limit 300
$$;

-- Crea una acción pendiente para cada socio en riesgo alto que no tenga una reciente
create or replace function public.generar_acciones_riesgo()
returns int language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  if not (public.is_front_office() or public.my_role() = 'coordinador') then return 0; end if;
  insert into public.churn_actions (member_id, family_id, department, score, factors, action, assigned_to)
  select r.member_id, r.family_id, r.area, r.puntaje, r.factores, r.accion,
         case when r.accion = 'boleta_coach' then r.coach_id end
    from public.calcular_riesgo(null) r
   where r.nivel = 'alto'
     and not exists (select 1 from public.churn_actions c where c.member_id = r.member_id
                       and (c.status = 'pendiente' or c.created_at > now() - interval '14 days'));
  get diagnostics v_n = row_count;
  return v_n;
end $$;

create or replace function public.completar_accion(p_action uuid, p_status text, p_result text default null)
returns public.churn_actions language plpgsql security definer set search_path = public as $$
declare v_a public.churn_actions;
begin
  if p_status not in ('hecha','descartada','pendiente') then raise exception 'Estado no válido'; end if;
  select * into v_a from public.churn_actions where id = p_action for update;
  if not found then raise exception 'Acción no encontrada'; end if;
  if not (public.is_front_office() or v_a.assigned_to = auth.uid() or (public.is_staff() and public.has_department(v_a.department))) then
    raise exception 'No tienes permiso';
  end if;
  update public.churn_actions set status = p_status, result = coalesce(nullif(trim(coalesce(p_result, '')), ''), result),
         done_at = case when p_status = 'pendiente' then null else now() end,
         done_by = case when p_status = 'pendiente' then null else auth.uid() end
   where id = p_action returning * into v_a;
  return v_a;
end $$;

-- Resumen de retención para la pantalla
create or replace function public.retencion_resumen(p_dias int default 90)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when public.is_front_office() or public.my_role() = 'coordinador' then jsonb_build_object(
    'solicitudes', (select count(*) from public.retention_cases where created_at > now() - make_interval(days => p_dias)),
    'retenidos',   (select count(*) from public.retention_cases where outcome = 'retenido' and created_at > now() - make_interval(days => p_dias)),
    'por_opcion',  (select coalesce(jsonb_object_agg(choice, n), '{}') from (select choice, count(*) n from public.retention_cases where created_at > now() - make_interval(days => p_dias) group by choice) x),
    'por_motivo',  (select coalesce(jsonb_agg(jsonb_build_object('motivo', reason, 'n', n, 'retenidos', r) order by n desc), '[]')
                      from (select reason, count(*) n, count(*) filter (where outcome = 'retenido') r from public.retention_cases
                             where created_at > now() - make_interval(days => p_dias) group by reason) x),
    'acciones_pendientes', (select count(*) from public.churn_actions where status = 'pendiente'),
    'acciones_hechas',     (select count(*) from public.churn_actions where status = 'hecha' and done_at > now() - make_interval(days => p_dias))
  ) end
$$;

-- ─────────────────────────────────────────────────────────────
-- Rutina diaria (las pantallas la llaman al abrir; idempotente)
-- ─────────────────────────────────────────────────────────────
create or replace function public.rutina_diaria()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_ofertas int; v_reac int; v_venc int; v_acc int := 0;
begin
  if auth.uid() is null then return null; end if;
  v_reac := public.aplicar_vencimientos_retencion();
  v_ofertas := public.procesar_lista_espera();
  update public.makeup_credits set status = 'vencida' where status = 'disponible' and expires_on < public.today_mx();
  get diagnostics v_venc = row_count;
  update public.makeup_credits set status = 'usada' where status = 'agendada' and used_date < public.today_mx();
  if public.is_front_office() or public.my_role() = 'coordinador' then v_acc := public.generar_acciones_riesgo(); end if;
  return jsonb_build_object('ofertas', v_ofertas, 'reactivados', v_reac, 'creditos_vencidos', v_venc, 'acciones', v_acc);
end $$;

-- Mensualidades: primero aplica vencimientos de congelados y descuentos temporales
create or replace function public.generar_mensualidades(p_period text)
returns int
language plpgsql security definer set search_path = public as $$
declare v_n int := 0; f record; v_charge uuid; v_due date; v_total numeric;
begin
  if not public.is_front_office() then raise exception 'Sin permiso para generar mensualidades'; end if;
  perform public.aplicar_vencimientos_retencion();
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

    update public.memberships ms set sessions_remaining = p.sessions_per_month
      from public.plans p, public.members m
     where p.id = ms.plan_id and m.id = ms.member_id and m.family_id = f.family_id
       and ms.status = 'activa' and p.sessions_per_month is not null;

    select coalesce(sum(amount), 0) into v_total from public.charge_items where charge_id = v_charge;
    if v_total = 0 then
      update public.charges set status = 'cancelado', concept = concept || ' (sin importe)' where id = v_charge;
    else
      update public.charges set amount = v_total where id = v_charge;
      insert into public.notifications (family_id, channel, template, subject, body)
      values (f.family_id, 'correo', 'mensualidad', 'Tu mensualidad de ' || p_period, 'Total: $' || to_char(v_total, 'FM999,999,990.00') || ' MXN');
      v_n := v_n + 1;
    end if;
  end loop;

  update public.charges set status = 'vencido' where status = 'pendiente' and due_date < public.today_mx();
  return v_n;
end $$;

-- ─────────────────────────────────────────────────────────────
-- Permisos de ejecución
-- ─────────────────────────────────────────────────────────────
do $$
declare f text;
begin
  foreach f in array array[
    'evaluar_habilidades(jsonb)', 'emitir_boleta(uuid, uuid, text, uuid)', 'emitir_certificado(uuid, uuid, uuid, text)',
    'procesar_lista_espera()', 'responder_oferta(uuid, boolean)', 'inscribir(uuid, uuid, boolean)', 'cambiar_estado_inscripcion(uuid, text, text)',
    'avisar_falta(uuid, date, text)', 'otorgar_reposicion(uuid, date, text)', 'opciones_reposicion(uuid)', 'usar_reposicion(uuid, uuid, date)',
    'cancelar_reposicion(uuid)', 'marcar_reposicion(uuid, boolean)',
    'agendar_prueba(uuid, uuid, date)', 'resultado_prueba(uuid, boolean)', 'seguimiento_prospecto(uuid, text, text, text, date, text)',
    'convertir_prospecto(uuid)', 'solicitar_baja(uuid, uuid, text, text, text, int, uuid)',
    'riesgo_bajas(text)', 'generar_acciones_riesgo()', 'completar_accion(uuid, text, text)', 'retencion_resumen(int)', 'rutina_diaria()',
    'generar_mensualidades(text)', 'lugares_libres_en(uuid, date)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  foreach f in array array['ofrecer_lugares(uuid)', 'aplicar_vencimientos_retencion()', 'calcular_riesgo(text)', 'lugares_ocupados(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
  execute 'revoke all on function public.solicitar_prueba(text, text, text, text, date, text, text) from public';
  execute 'grant execute on function public.solicitar_prueba(text, text, text, text, date, text, text) to anon, authenticated';
end $$;

grant select on public.skills, public.skill_progress, public.report_cards, public.certificates, public.waitlist_offers,
                public.makeup_credits, public.leads, public.lead_activities, public.retention_cases, public.churn_actions to authenticated;
grant insert, update on public.skills, public.leads to authenticated;
grant insert on public.lead_activities to authenticated;
