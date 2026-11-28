-- Oberlicht · Academia
-- Biblioteca de ejercicios con videos pares (mal hecho / bien hecho) y marcas de corrección,
-- programas por ciclo, rutinas (a mano o con IA) con revisión de coordinación,
-- eventos y festivales, y escuela de coaches (cursos, lecciones, observación en clase, certificados).
-- Todo es aditivo. Los ejercicios y cursos que trae son EJEMPLOS (is_example = true): el club los reemplaza.

insert into public.settings (key, value, description) values
  ('academia', '{"ia_modelo":"claude-sonnet-5-5","sin_carga_menores_de":14,"revision_obligatoria":true,"aviso_vigencia_dias":30}',
   'Academia: modelo de IA para rutinas, edad mínima para ejercicios con carga, si toda rutina pasa por coordinación y días de aviso antes de que venza un certificado')
on conflict (key) do nothing;

-- ─────────────────────────────────────────────────────────────
-- Biblioteca de ejercicios
-- ─────────────────────────────────────────────────────────────
create table public.exercises (
  id            uuid primary key default gen_random_uuid(),
  department    text not null references public.departments(code),
  slug          text unique,
  title         text not null,
  block         text not null default 'principal' check (block in ('calentamiento','principal','juego','calma')),
  objective     text,
  steps         jsonb not null default '[]',      -- ["paso 1", …]
  key_points    jsonb not null default '[]',      -- ["clave técnica", …]
  errors        jsonb not null default '[]',      -- [{"error":"…","correccion":"…"}]
  kid_version   text,                             -- explicación en lenguaje de juego
  easier        text,
  harder        text,
  equipment     text,
  min_age       numeric(4,1) not null default 3,
  max_age       numeric(4,1) not null default 99,
  level_ids     uuid[] not null default '{}',     -- niveles donde aplica (vacío = todos los del área)
  minutes       int not null default 5 check (minutes between 1 and 60),
  dose          text,                             -- «4 × 12.5 m», «3 × 10»
  for_families  boolean not null default false,   -- se puede mostrar en «En casa»
  safety_note   text,
  status        text not null default 'aprobado' check (status in ('borrador','revision','aprobado','retirado')),
  approved_by   uuid references public.profiles(id) on delete set null,
  approved_at   timestamptz,
  is_example    boolean not null default false,
  created_by    uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index on public.exercises (department, status);

create table public.exercise_videos (
  id            uuid primary key default gen_random_uuid(),
  exercise_id   uuid not null references public.exercises(id) on delete cascade,
  kind          text not null check (kind in ('mal','bien')),
  url           text,                              -- null = pendiente de generar
  provider      text not null default 'higgsfield',
  job_id        text,                              -- trabajo de Higgsfield (para finalizar en mejor resolución)
  resolution    text,
  prompt        text,
  annotations   jsonb not null default '[]',       -- [{"desde":0.5,"hasta":3,"x":0.4,"y":0.6,"tipo":"error"|"ok","texto":"…"}]
  status        text not null default 'revision' check (status in ('pendiente','revision','aprobado','retirado')),
  approved_by   uuid references public.profiles(id) on delete set null,
  approved_at   timestamptz,
  created_at    timestamptz not null default now(),
  unique (exercise_id, kind)
);

create or replace function public.puede_academia(dep text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_manager() or public.is_dept_coordinator(dep)
$$;

alter table public.exercises enable row level security;
alter table public.exercise_videos enable row level security;
create policy "personal ve la biblioteca" on public.exercises for select to authenticated
  using (public.is_staff() or (for_families and status = 'aprobado'));
create policy "personal propone ejercicios" on public.exercises for insert to authenticated
  with check (public.is_staff() and public.has_department(department) and (status in ('borrador','revision') or public.puede_academia(department)));
create policy "coordinación edita ejercicios" on public.exercises for update to authenticated
  using (public.puede_academia(department) or (created_by = auth.uid() and status in ('borrador','revision')))
  with check (public.puede_academia(department) or status in ('borrador','revision'));
create policy "coordinación borra ejercicios" on public.exercises for delete to authenticated using (public.puede_academia(department));

create policy "ver videos de técnica" on public.exercise_videos for select to authenticated
  using (public.is_staff() or exists (select 1 from public.exercises e where e.id = exercise_id and e.for_families and e.status = 'aprobado') and status = 'aprobado');
create policy "coordinación maneja videos" on public.exercise_videos for all to authenticated
  using (exists (select 1 from public.exercises e where e.id = exercise_id and public.puede_academia(e.department)))
  with check (exists (select 1 from public.exercises e where e.id = exercise_id and public.puede_academia(e.department)));

-- ─────────────────────────────────────────────────────────────
-- Programas del ciclo (qué se trabaja cada semana por nivel)
-- ─────────────────────────────────────────────────────────────
create table public.programs (
  id           uuid primary key default gen_random_uuid(),
  department   text not null references public.departments(code),
  level_id     uuid references public.levels(id) on delete set null,
  title        text not null,
  weeks        jsonb not null default '[]',   -- [{"semana":1,"enfoque":"…","habilidades":["…"],"ejercicios":["slug"],"nota":"…"}]
  notes        text,
  status       text not null default 'aprobado' check (status in ('borrador','aprobado','archivado')),
  is_example   boolean not null default false,
  created_by   uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
alter table public.programs enable row level security;
create policy "personal ve programas" on public.programs for select to authenticated using (public.is_staff());
create policy "coordinación maneja programas" on public.programs for all to authenticated
  using (public.puede_academia(department)) with check (public.puede_academia(department));

-- ─────────────────────────────────────────────────────────────
-- Rutinas (a mano o con IA) con revisión de coordinación
-- ─────────────────────────────────────────────────────────────
create table public.routines (
  id             uuid primary key default gen_random_uuid(),
  department     text not null references public.departments(code),
  level_id       uuid references public.levels(id) on delete set null,
  group_id       uuid references public.groups(id) on delete set null,
  title          text not null,
  age_min        numeric(4,1),
  age_max        numeric(4,1),
  minutes        int not null default 45,
  objective      text,
  blocks         jsonb not null default '[]',   -- [{"nombre":"Calentamiento","minutos":8,"items":[{"exercise_id":"…","titulo":"…","dosis":"…","nota":"…"}]}]
  family_summary text,
  home_task      text,
  source         text not null default 'manual' check (source in ('manual','ia','demo')),
  ai_request     text,
  status         text not null default 'borrador' check (status in ('borrador','revision','aprobada','devuelta','archivada')),
  review_note    text,
  reviewed_by    uuid references public.profiles(id) on delete set null,
  reviewed_at    timestamptz,
  is_template    boolean not null default false,
  used_on        date[] not null default '{}',
  created_by     uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index on public.routines (department, status);
alter table public.routines enable row level security;
create policy "ver rutinas del área" on public.routines for select to authenticated
  using (created_by = auth.uid() or public.has_department(department) or public.is_front_office());
create policy "crear rutinas" on public.routines for insert to authenticated
  with check (public.is_staff() and public.has_department(department));
create policy "editar rutinas" on public.routines for update to authenticated
  using (created_by = auth.uid() or public.puede_academia(department))
  with check (created_by = auth.uid() or public.puede_academia(department));
create policy "borrar rutinas" on public.routines for delete to authenticated
  using ((created_by = auth.uid() and status in ('borrador','devuelta')) or public.puede_academia(department));

-- Solo coordinación aprueba o devuelve; quien la creó puede mandarla a revisión.
create or replace function public.guard_routine_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('aprobada','devuelta') and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    if auth.uid() is not null then   -- sin usuario = carga del sistema (SQL Editor, datos demo)
      if not public.puede_academia(new.department) then
        raise exception 'Solo la coordinación del área puede aprobar o devolver una rutina';
      end if;
      new.reviewed_by := auth.uid(); new.reviewed_at := now();
    end if;
  end if;
  if tg_op = 'UPDATE' and old.status = 'aprobada' and new.status = 'aprobada'
     and (old.blocks is distinct from new.blocks) and auth.uid() is not null and not public.puede_academia(new.department) then
    new.status := 'revision';   -- cambiar una rutina aprobada la regresa a revisión
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger routines_guard before insert or update on public.routines for each row execute function public.guard_routine_status();

-- ─────────────────────────────────────────────────────────────
-- Eventos y festivales
-- ─────────────────────────────────────────────────────────────
create table public.events (
  id                 uuid primary key default gen_random_uuid(),
  department         text references public.departments(code),
  title              text not null,
  kind               text not null default 'festival' check (kind in ('festival','exhibicion','torneo','evaluacion','clinica')),
  starts_at          timestamptz not null,
  location           text,
  description        text,
  registration_until date,
  fee                numeric(10,2) not null default 0,
  capacity           int,
  categories         jsonb not null default '[]',   -- ["25 m crol 6-8 años", …]
  status             text not null default 'abierto' check (status in ('borrador','abierto','cerrado','terminado','cancelado')),
  created_by         uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at         timestamptz not null default now()
);
create table public.event_entries (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events(id) on delete cascade,
  member_id   uuid not null references public.members(id) on delete cascade,
  category    text,
  heat        int,
  lane        int,
  result      text,       -- tiempo «0:28.4» o calificación
  place       int,
  medal       text check (medal in ('oro','plata','bronce','participacion')),
  paid        boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (event_id, member_id, category)
);
alter table public.events enable row level security;
alter table public.event_entries enable row level security;
create policy "ver eventos" on public.events for select to authenticated using (status <> 'borrador' or public.is_staff());
create policy "organizar eventos" on public.events for all to authenticated
  using (public.is_front_office() or public.puede_academia(coalesce(department,'')))
  with check (public.is_front_office() or public.puede_academia(coalesce(department,'')));
create policy "ver inscripciones a eventos" on public.event_entries for select to authenticated
  using (public.is_staff() or member_id in (select id from public.members where family_id in (select public.my_family_ids())));
create policy "inscribir a eventos" on public.event_entries for insert to authenticated
  with check (public.is_staff() or member_id in (select id from public.members where family_id in (select public.my_family_ids())));
create policy "editar inscripciones a eventos" on public.event_entries for update to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "quitar inscripciones a eventos" on public.event_entries for delete to authenticated
  using (public.is_staff() or member_id in (select id from public.members where family_id in (select public.my_family_ids())));

-- ─────────────────────────────────────────────────────────────
-- Escuela de coaches
-- ─────────────────────────────────────────────────────────────
create table public.courses (
  id               uuid primary key default gen_random_uuid(),
  department       text references public.departments(code),   -- null = todo el personal técnico
  tier             int not null default 0 check (tier between 0 and 4),  -- 0 inducción · 1 asistente · 2 titular · 3 senior · 4 mentor
  title            text not null,
  description      text,
  minutes          int not null default 20,
  required         boolean not null default false,
  validity_months  int,                       -- null = no vence
  sort_order       int not null default 0,
  active           boolean not null default true,
  is_example       boolean not null default false,
  created_at       timestamptz not null default now()
);
create table public.lessons (
  id          uuid primary key default gen_random_uuid(),
  course_id   uuid not null references public.courses(id) on delete cascade,
  title       text not null,
  kind        text not null check (kind in ('lectura','video','quiz','que_esta_mal')),
  body        text,
  exercise_id uuid references public.exercises(id) on delete set null,   -- para «¿qué está mal?» y video
  questions   jsonb not null default '[]',   -- [{"p":"…","opciones":["…"],"correcta":0,"explica":"…"}]
  minutes     int not null default 4,
  sort_order  int not null default 0
);
create table public.lesson_progress (
  profile_id    uuid not null references public.profiles(id) on delete cascade,
  lesson_id     uuid not null references public.lessons(id) on delete cascade,
  score         int,                          -- % en quizzes
  completed_at  timestamptz not null default now(),
  primary key (profile_id, lesson_id)
);
create table public.coach_tiers (
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  department  text not null references public.departments(code),
  tier        int not null default 0 check (tier between 0 and 4),
  since       date not null default public.today_mx(),
  note        text,
  primary key (profile_id, department)
);
create table public.class_observations (
  id           uuid primary key default gen_random_uuid(),
  coach_id     uuid not null references public.profiles(id) on delete cascade,
  observer_id  uuid references public.profiles(id) on delete set null default auth.uid(),
  group_id     uuid references public.groups(id) on delete set null,
  department   text references public.departments(code),
  observed_on  date not null default public.today_mx(),
  scores       jsonb not null default '{}',    -- {"puntualidad":1-4,"seguridad":…,"tecnica":…,"energia":…,"grupo":…}
  strengths    text,
  improve      text,
  created_at   timestamptz not null default now()
);
create table public.staff_certifications (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  name        text not null,
  kind        text not null default 'interno' check (kind in ('interno','externo')),
  department  text references public.departments(code),
  issued_on   date not null default public.today_mx(),
  expires_on  date,
  course_id   uuid references public.courses(id) on delete set null,
  created_at  timestamptz not null default now()
);

alter table public.courses enable row level security;
alter table public.lessons enable row level security;
alter table public.lesson_progress enable row level security;
alter table public.coach_tiers enable row level security;
alter table public.class_observations enable row level security;
alter table public.staff_certifications enable row level security;

create or replace function public.forma_coaches()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_manager() or public.my_role() = 'coordinador'
$$;

create policy "personal ve cursos" on public.courses for select to authenticated using (public.is_staff());
create policy "coordinación maneja cursos" on public.courses for all to authenticated using (public.forma_coaches()) with check (public.forma_coaches());
create policy "personal ve lecciones" on public.lessons for select to authenticated using (public.is_staff());
create policy "coordinación maneja lecciones" on public.lessons for all to authenticated using (public.forma_coaches()) with check (public.forma_coaches());
create policy "ver avance de lecciones" on public.lesson_progress for select to authenticated using (profile_id = auth.uid() or public.forma_coaches());
create policy "registrar mi avance" on public.lesson_progress for insert to authenticated with check (profile_id = auth.uid());
create policy "actualizar mi avance" on public.lesson_progress for update to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy "ver nivel de coach" on public.coach_tiers for select to authenticated using (profile_id = auth.uid() or public.forma_coaches());
create policy "coordinación asigna nivel" on public.coach_tiers for all to authenticated using (public.puede_academia(department)) with check (public.puede_academia(department));
create policy "ver observaciones" on public.class_observations for select to authenticated using (coach_id = auth.uid() or public.forma_coaches());
create policy "coordinación observa clases" on public.class_observations for all to authenticated using (public.forma_coaches()) with check (public.forma_coaches());
create policy "ver certificados del personal" on public.staff_certifications for select to authenticated using (profile_id = auth.uid() or public.forma_coaches());
create policy "coordinación certifica" on public.staff_certifications for all to authenticated using (public.forma_coaches()) with check (public.forma_coaches());

-- Panel de formación: avance de cada coach, observaciones y vigencias
create or replace function public.panel_formacion()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  dias int := coalesce((select (value->>'aviso_vigencia_dias')::int from public.settings where key = 'academia'), 30);
begin
  if not public.forma_coaches() then raise exception 'Solo coordinación y dirección ven el panel de formación'; end if;
  return jsonb_build_object(
    'coaches', coalesce((
      select jsonb_agg(x order by x->>'nombre') from (
        select jsonb_build_object(
          'id', p.id, 'nombre', p.full_name, 'rol', p.role,
          'areas', (select coalesce(jsonb_agg(pd.department), '[]') from public.profile_departments pd where pd.profile_id = p.id),
          'nivel', (select max(t.tier) from public.coach_tiers t where t.profile_id = p.id),
          'lecciones', (select count(*) from public.lesson_progress lp where lp.profile_id = p.id),
          'obligatorias_pendientes', (select count(*) from public.lessons l join public.courses c on c.id = l.course_id
              where c.required and c.active and not exists (select 1 from public.lesson_progress lp where lp.profile_id = p.id and lp.lesson_id = l.id)),
          'ultima_obs', (select max(o.observed_on) from public.class_observations o where o.coach_id = p.id),
          'promedio_obs', (select round(avg((v.value)::numeric), 1) from public.class_observations o, jsonb_each_text(o.scores) v
              where o.coach_id = p.id and o.observed_on > public.today_mx() - 180),
          'por_vencer', (select count(*) from public.staff_certifications s where s.profile_id = p.id and s.expires_on is not null and s.expires_on <= public.today_mx() + dias)
        ) x
        from public.profiles p where p.active and p.role in ('coach','coordinador')
      ) q), '[]'),
    'vencimientos', coalesce((
      select jsonb_agg(jsonb_build_object('nombre', p.full_name, 'certificado', s.name, 'vence', s.expires_on) order by s.expires_on)
        from public.staff_certifications s join public.profiles p on p.id = s.profile_id
       where s.expires_on is not null and s.expires_on <= public.today_mx() + dias), '[]'),
    'rutinas_por_revisar', (select count(*) from public.routines r where r.status = 'revision' and public.puede_academia(r.department))
  );
end $$;

-- ─────────────────────────────────────────────────────────────
-- Ejemplos: biblioteca (20 ejercicios, 6 con videos pares) — el club los reemplaza
-- ─────────────────────────────────────────────────────────────
insert into public.exercises (department, slug, title, block, objective, steps, key_points, errors, kid_version, easier, harder, equipment, min_age, max_age, minutes, dose, for_families, safety_note, is_example, approved_at) values
('natacion','patada-crol','Patada de crol con tabla','principal','Patada continua desde la cadera que mantenga el cuerpo horizontal',
 '["Toma la tabla con los brazos estirados","Cara en el agua, mirando al fondo","Patea desde la cadera con pierna casi estirada","Tobillos sueltos y en punta, patada pequeña y rápida"]',
 '["La fuerza nace en la cadera, no en la rodilla","Rodilla relajada, apenas flexionada","Pies en punta como bailarina","Los talones apenas rompen la superficie"]',
 '[{"error":"Rodillas muy dobladas (patada de bicicleta)","correccion":"Piensa en patear con toda la pierna, como si fuera una tijera larga"},{"error":"Pies en flexión (punta hacia arriba)","correccion":"Estira los empeines; imagina que quieres tocar la pared de atrás con los dedos"},{"error":"Piernas hundidas","correccion":"Mete la cara al agua y empuja el pecho hacia abajo para subir la cadera"}]',
 'Patada de tiburoncito: la cola del tiburón se mueve rapidito y pequeñita, sin doblar la rodilla.','Con aletas cortas','Sin tabla, brazos en flecha','Tabla',4,99,6,'4 × 12.5 m',true,'Coach dentro o al borde para menores de 6 años',true,now()),
('natacion','respiracion-crol','Respiración lateral en crol','principal','Respirar sin levantar la cabeza para no perder la posición del cuerpo',
 '["Nada crol con la cara en el agua soltando burbujas","Cuando el brazo sale, gira la cabeza junto con el hombro","Deja un ojo y la mitad de la boca en el agua","Toma aire rápido y regresa la cara al agua"]',
 '["Girar, no levantar","Un ojo dentro del agua","Soltar el aire bajo el agua antes de girar","La cadera no se hunde al respirar"]',
 '[{"error":"Levanta la cabeza al frente para respirar","correccion":"Gira la cabeza de lado como si vieras tu hombro"},{"error":"Las piernas se hunden al respirar","correccion":"Sigue pateando mientras respiras y mantén la mirada al lado, no arriba"},{"error":"Aguanta el aire bajo el agua","correccion":"Haz burbujas todo el tiempo para que al girar solo tengas que tomar aire"}]',
 'El oído en la almohada: recuesta la cabeza en tu brazo como si fuera tu almohada y toma aire de lado.','Respirar parado en lo bajito con el brazo apoyado en el borde','Respirar cada 3 brazadas, alternando lados',null,6,99,8,'6 × 12.5 m',false,null,true,now()),
('natacion','flecha-deslizamiento','Flecha (deslizamiento desde la pared)','principal','Posición más hidrodinámica al salir de la pared',
 '["Espalda a la pared, un pie apoyado","Brazos estirados arriba, una mano encima de la otra","Brazos apretando las orejas, cabeza entre los brazos","Empuja fuerte y deslízate sin moverte"]',
 '["Mano sobre mano","Brazos pegados a las orejas","Mirada al fondo","Piernas juntas y pies en punta"]',
 '[{"error":"Brazos separados o doblados","correccion":"Junta las manos y aprieta las orejas con los brazos"},{"error":"Cabeza levantada","correccion":"Mira al fondo de la alberca y esconde la cabeza entre los brazos"},{"error":"Piernas abiertas","correccion":"Junta tobillos como si tuvieras una sola aleta"}]',
 'Cohete: las manos son la punta del cohete y el cuerpo va derechito para llegar lejos.','Deslizarse con tabla','Flecha con patada de delfín',null,4,99,5,'6 repeticiones',true,null,true,now()),
('natacion','burbujas','Burbujas y control de la respiración','calentamiento','Perder el miedo a meter la cara y controlar la exhalación',
 '["Parado en lo bajo, toma aire por la boca","Mete la cara y suelta burbujas por nariz y boca","Sube despacio y repite"]','["Soltar el aire bajo el agua","Calma, sin prisa"]',
 '[{"error":"Aguanta la respiración bajo el agua","correccion":"Haz que se oiga el «mmmm» de las burbujas"}]','Hacemos sopa de burbujas: ¿quién hace más burbujas?','Soplar en la superficie','Burbujas hasta sentarse en el fondo',null,3,10,4,'10 repeticiones',true,'Siempre en zona donde el niño toque piso',true,now()),
('natacion','flotacion-estrella','Flotación de estrella','calentamiento','Flotar boca arriba y boca abajo con el cuerpo relajado',
 '["Abre brazos y piernas como estrella","Recuesta la cabeza con orejas en el agua","Ombligo arriba, respira tranquilo"]','["Orejas dentro del agua","Ombligo hacia el techo"]',
 '[{"error":"Dobla la cadera y se sienta","correccion":"Empuja el ombligo hacia arriba"}]','Estrella de mar: flota quietita y mira el cielo.','Con apoyo del coach en la nuca','Pasar de estrella boca arriba a boca abajo',null,3,12,4,'3 × 10 s',false,null,true,now()),
('natacion','brazada-crol-un-brazo','Crol a un brazo','principal','Aislar la brazada y coordinarla con la respiración',
 '["Un brazo extendido al frente","El otro hace la brazada completa","Respira del lado del brazo que trabaja"]','["Entrada de la mano frente al hombro","Empuje largo hasta el muslo"]',
 '[{"error":"La mano cruza la línea del centro","correccion":"Entra con la mano frente a tu hombro, como en dos rieles"}]','Un brazo es remo y el otro es la punta del barco.','Con tabla en el brazo extendido','Alternar 3 brazadas por lado','Tabla',7,99,6,'4 × 25 m',false,null,true,now()),
('natacion','dorso-patada','Patada de dorso','principal','Patada de espalda con cadera alta','["Boca arriba, brazos a los lados","Patea desde la cadera","Rodillas no salen del agua"]','["Rodillas debajo del agua","Mentón neutro"]',
 '[{"error":"Se sienta y salen las rodillas","correccion":"Ombligo arriba y patea como si quisieras salpicar con los dedos"}]','Patada de nutria: flotamos de espaldas y pateamos sin sacar las rodillas.','Con tabla en el pecho','Un brazo arriba en flecha',null,5,99,6,'4 × 12.5 m',false,null,true,now()),
('natacion','relevos-juego','Relevos del tesoro','juego','Reforzar la patada con juego','["Equipos de 3 en el borde","Cada uno patea con tabla a recoger un aro","Regresa y choca la mano del siguiente"]','["Patada correcta aunque haya prisa"]','[]','¡Rescata el tesoro del fondo antes que el otro equipo!',null,null,'Aros y tablas',4,12,8,'2 rondas',false,'Un coach por cada 6 niños en el agua',true,now()),
('ballet','plie-primera','Demi-plié en primera posición','principal','Flexión de rodillas alineada con los pies y la columna larga',
 '["Talones juntos, puntas hacia afuera sin forzar","Columna larga y hombros abajo","Abre las rodillas sobre los dedos al bajar","Talones en el piso, sube empujando el suelo"]',
 '["Rodillas sobre el segundo y tercer dedo","Talones pegados al piso","Pelvis neutra, sin sacar cola","Cuello largo, hombros abajo"]',
 '[{"error":"Rodillas hacia adentro, delante de los pies","correccion":"Abre las rodillas como si siguieran la línea de los dedos de los pies"},{"error":"Espalda arqueada, cola afuera","correccion":"Alarga el coxis hacia el piso y mete ligeramente el abdomen"},{"error":"Hombros levantados","correccion":"Baja los hombros como si llevaras una mochila ligera"}]',
 'Rana elegante: abre las rodillas como rana pero con la espalda de reina.','Con las dos manos en la barra','Grand plié',null,5,99,6,'2 × 8 tiempos',true,null,true,now()),
('ballet','tendu','Battement tendu al frente','principal','Deslizar el pie hasta la punta sin perder el en dehors','["De quinta o primera, desliza el pie al frente","Pasa por media punta hasta la punta","Regresa por el mismo camino"]','["Rodilla estirada","Cadera cuadrada"]',
 '[{"error":"Se levanta la cadera de la pierna que trabaja","correccion":"Las dos caderas miran al frente, como faros de coche"}]','Pinta una línea en el piso con la punta del pie.','A la barra, solo al frente','En cruz con port de bras',null,5,99,5,'2 × 8 tiempos',false,null,true,now()),
('ballet','releve','Relevé en primera','principal','Subir a media punta con tobillos alineados','["De primera, sube a media punta","Peso en los dedos grandes","Baja despacio"]','["Tobillos sin rodar hacia afuera","Cuerpo alto"]',
 '[{"error":"El tobillo rueda hacia afuera (sickle)","correccion":"Imagina una línea recta de la rodilla al dedo grande"}]','Crecer como flor que busca el sol.','Con las dos manos en la barra','Relevé en una pierna',null,5,99,4,'2 × 8',true,null,true,now()),
('ballet','estiramiento-mariposa','Mariposa y estiramiento final','calma','Bajar pulsaciones y estirar aductores','["Sentada, plantas juntas","Espalda larga","Respira y deja caer las rodillas"]','["Sin rebotes","Espalda larga"]','[]','Mariposa que se duerme: alas abajo poco a poco.',null,null,null,3,99,5,'1 min',true,null,true,now()),
('oberfit','sentadilla','Sentadilla con peso corporal','principal','Patrón de sentadilla seguro: rodillas alineadas y espalda neutra',
 '["Pies al ancho de hombros, puntas un poco afuera","Lleva la cadera atrás y abajo","Rodillas siguen la línea de los pies","Pecho arriba, sube empujando con los talones"]',
 '["Rodillas hacia afuera, siguiendo los dedos","Talones apoyados","Espalda neutra, pecho arriba","Bajar hasta donde mantengas la técnica"]',
 '[{"error":"Rodillas se juntan hacia adentro (valgo)","correccion":"Empuja las rodillas hacia afuera, como si abrieras el piso con los pies"},{"error":"Talones se levantan","correccion":"Lleva el peso a medio pie y talón; baja menos si hace falta"},{"error":"Espalda redonda","correccion":"Saca el pecho como si mostraras el logo de tu playera"}]',
 'Sentarse en una silla invisible sin que se mueva.','Sentadilla a un cajón','Sentadilla goblet con kettlebell',null,8,99,6,'3 × 10',true,'Sin carga externa para menores de 14 años (ajuste de Academia)',true,now()),
('oberfit','plancha','Plancha frontal','principal','Estabilidad del tronco','["Antebrazos bajo los hombros","Cuerpo en línea de cabeza a talones","Aprieta abdomen y glúteos"]','["Cadera alineada","Respirar"]',
 '[{"error":"Cadera caída","correccion":"Aprieta glúteos y lleva el ombligo hacia la columna"}]','Tabla de surf: el cuerpo derechito para no caerse de la ola.','Con rodillas apoyadas','Levantando un pie',null,8,99,4,'3 × 20 s',true,null,true,now()),
('oberfit','zancada','Zancada alterna','principal','Fuerza unilateral de pierna','["Paso largo al frente","Baja la rodilla de atrás cerca del piso","Regresa empujando con el pie de adelante"]','["Rodilla de adelante sobre el tobillo","Tronco recto"]',
 '[{"error":"La rodilla de adelante se va hacia adentro","correccion":"Alinea la rodilla con el segundo dedo del pie"}]','Paso de gigante y regreso.','Zancada estática con apoyo','Zancada con mancuernas',null,10,99,5,'3 × 8 por pierna',false,'Sin carga externa para menores de 14 años',true,now()),
('oberfit','movilidad-articular','Movilidad articular general','calentamiento','Preparar articulaciones','["Círculos de tobillos, rodillas y cadera","Círculos de hombros","Rotaciones de tronco"]','["Movimientos controlados"]','[]','Despertar al robot: cada articulación hace círculos.',null,null,null,6,99,6,'8 por articulación',true,null,true,now()),
('gimnasia','parada-de-manos','Parada de manos contra la pared','principal','Alinear manos, hombros, cadera y pies en vertical',
 '["Manos al ancho de hombros a un palmo de la pared","Sube una pierna y luego la otra","Brazos estirados, hombros abiertos junto a las orejas","Abdomen y glúteos apretados, piernas juntas"]',
 '["Hombros abiertos, empujando el piso","Costillas cerradas","Cuerpo en una sola línea","Mirada entre las manos"]',
 '[{"error":"Espalda arqueada (plátano)","correccion":"Cierra costillas y aprieta glúteos: de plátano a lápiz"},{"error":"Codos doblados u hombros cerrados","correccion":"Empuja el piso lejos y acerca las orejas a los brazos"},{"error":"Piernas separadas","correccion":"Junta tobillos y estira los empeines"}]',
 'El lápiz de cabeza: todo el cuerpo derechito como un lápiz.','Pies en un cajón (media parada)','Parada libre con ayuda del coach','Pared y colchoneta',7,99,6,'5 × 10 s',false,'Siempre con colchoneta y ayuda del coach en las primeras sesiones',true,now()),
('gimnasia','rodada-frente','Rodada al frente','principal','Rodar redondo y levantarse sin manos','["En cuclillas, manos al frente","Mete la barbilla al pecho","Empuja con los pies y rueda redondo","Levántate sin apoyar manos"]','["Barbilla al pecho","Espalda redonda"]',
 '[{"error":"Apoya la cabeza en lugar de la nuca","correccion":"Barbilla al pecho, como si sostuvieras una naranja"}]','Bolita que rueda.','Rodada en plano inclinado','Rodada a parado con brazos arriba','Colchoneta',4,99,5,'6 repeticiones',false,'Siempre sobre colchoneta',true,now()),
('gimnasia','puente','Puente desde el piso','principal','Flexibilidad de hombros y espalda','["Boca arriba, pies cerca de la cadera","Manos junto a las orejas","Empuja y sube cadera y pecho"]','["Brazos estirados","Empujar con hombros"]',
 '[{"error":"Brazos doblados","correccion":"Empuja el piso con las manos y estira codos"}]','Arcoíris: el cuerpo forma un arco.','Medio puente (solo cadera)','Puente con una pierna arriba','Colchoneta',6,99,5,'4 × 10 s',false,null,true,now()),
('gimnasia','estiramiento-split','Estiramiento hacia el split','calma','Flexibilidad de isquiotibiales y flexores','["Pierna adelante estirada","Pierna atrás estirada","Baja hasta sentir estiramiento sin dolor"]','["Cadera cuadrada","Respirar"]','[]','Tijera que se abre despacito.',null,null,'Bloques',6,99,5,'30 s por lado',true,null,true,now());

-- Videos pares generados con Higgsfield (borrador 480p). Las marcas se dibujan encima en la app.
insert into public.exercise_videos (exercise_id, kind, url, job_id, resolution, status, approved_at, annotations)
select e.id, v.kind, v.url, v.job, '480p (borrador IA)', 'aprobado', now(), v.ann::jsonb
from (values
 ('patada-crol','mal','https://d8j0ntlcm91z4.cloudfront.net/user_3CLXYSi53p50Ay5lbEakHKZf2X5/hf_20261128_003617_e7847597-f668-4216-b0e6-aa54fe3d1862.mp4','e7847597-f668-4216-b0e6-aa54fe3d1862',
  '[{"desde":0.4,"hasta":2.6,"x":0.62,"y":0.55,"tipo":"error","texto":"Rodillas muy dobladas: patada de bicicleta"},{"desde":2.6,"hasta":5,"x":0.8,"y":0.5,"tipo":"error","texto":"Pies en flexión y piernas hundidas"}]'),
 ('patada-crol','bien','https://d8j0ntlcm91z4.cloudfront.net/user_3CLXYSi53p50Ay5lbEakHKZf2X5/hf_20261128_003616_ce67390b-c993-4f88-ac00-a2508eba5ac4.mp4','ce67390b-c993-4f88-ac00-a2508eba5ac4',
  '[{"desde":0.4,"hasta":2.6,"x":0.62,"y":0.5,"tipo":"ok","texto":"Pierna casi estirada, patada desde la cadera"},{"desde":2.6,"hasta":5,"x":0.8,"y":0.48,"tipo":"ok","texto":"Pies en punta, cuerpo horizontal"}]'),
 ('respiracion-crol','mal','https://d8j0ntlcm91z4.cloudfront.net/user_3CLXYSi53p50Ay5lbEakHKZf2X5/hf_20261128_003616_cfab0a77-61ae-47fb-9c1d-75282806b717.mp4','cfab0a77-61ae-47fb-9c1d-75282806b717',
  '[{"desde":0.4,"hasta":2.8,"x":0.4,"y":0.4,"tipo":"error","texto":"Levanta la cabeza al frente"},{"desde":2.8,"hasta":5,"x":0.7,"y":0.6,"tipo":"error","texto":"La cadera y las piernas se hunden"}]'),
 ('respiracion-crol','bien','https://d8j0ntlcm91z4.cloudfront.net/user_3CLXYSi53p50Ay5lbEakHKZf2X5/hf_20261128_003616_47af0630-596d-46d6-9eea-43e340ab6c20.mp4','47af0630-596d-46d6-9eea-43e340ab6c20',
  '[{"desde":0.4,"hasta":2.8,"x":0.4,"y":0.42,"tipo":"ok","texto":"Gira la cabeza de lado, un ojo en el agua"},{"desde":2.8,"hasta":5,"x":0.7,"y":0.5,"tipo":"ok","texto":"Cuerpo largo y cadera arriba"}]'),
 ('flecha-deslizamiento','mal','https://d8j0ntlcm91z4.cloudfront.net/user_3CLXYSi53p50Ay5lbEakHKZf2X5/hf_20261128_003616_d2d59ee6-f2f4-49b9-9907-b3ae8d00bf17.mp4','d2d59ee6-f2f4-49b9-9907-b3ae8d00bf17',
  '[{"desde":0.4,"hasta":2.6,"x":0.35,"y":0.45,"tipo":"error","texto":"Brazos separados y cabeza levantada"},{"desde":2.6,"hasta":5,"x":0.7,"y":0.55,"tipo":"error","texto":"Piernas abiertas: frena el deslizamiento"}]'),
 ('flecha-deslizamiento','bien','https://d8j0ntlcm91z4.cloudfront.net/user_3CLXYSi53p50Ay5lbEakHKZf2X5/hf_20261128_003616_f318d624-2923-4d51-b569-647afa43b221.mp4','f318d624-2923-4d51-b569-647afa43b221',
  '[{"desde":0.4,"hasta":2.6,"x":0.35,"y":0.45,"tipo":"ok","texto":"Mano sobre mano, brazos en las orejas"},{"desde":2.6,"hasta":5,"x":0.7,"y":0.5,"tipo":"ok","texto":"Piernas juntas y pies en punta"}]'),
 ('plie-primera','mal','https://d8j0ntlcm91z4.cloudfront.net/user_3CLXYSi53p50Ay5lbEakHKZf2X5/hf_20261128_003616_93384cb8-a266-4f1f-9495-edfe2f566ed1.mp4','93384cb8-a266-4f1f-9495-edfe2f566ed1',
  '[{"desde":0.4,"hasta":2.6,"x":0.5,"y":0.72,"tipo":"error","texto":"Rodillas hacia adentro, delante de los pies"},{"desde":2.6,"hasta":5,"x":0.5,"y":0.45,"tipo":"error","texto":"Espalda arqueada y hombros arriba"}]'),
 ('plie-primera','bien','https://d8j0ntlcm91z4.cloudfront.net/user_3CLXYSi53p50Ay5lbEakHKZf2X5/hf_20261128_003617_a2b4e2c5-852b-41ff-b239-e989a10c55f3.mp4','a2b4e2c5-852b-41ff-b239-e989a10c55f3',
  '[{"desde":0.4,"hasta":2.6,"x":0.5,"y":0.72,"tipo":"ok","texto":"Rodillas sobre los dedos de los pies"},{"desde":2.6,"hasta":5,"x":0.5,"y":0.45,"tipo":"ok","texto":"Columna larga, hombros abajo"}]'),
 ('sentadilla','mal','https://d8j0ntlcm91z4.cloudfront.net/user_3CLXYSi53p50Ay5lbEakHKZf2X5/hf_20261128_003617_37b541da-22bf-4755-ade0-2386a005b5e9.mp4','37b541da-22bf-4755-ade0-2386a005b5e9',
  '[{"desde":0.4,"hasta":2.6,"x":0.5,"y":0.68,"tipo":"error","texto":"Rodillas se juntan hacia adentro"},{"desde":2.6,"hasta":5,"x":0.5,"y":0.4,"tipo":"error","texto":"Espalda redonda y talones arriba"}]'),
 ('sentadilla','bien','https://d8j0ntlcm91z4.cloudfront.net/user_3CLXYSi53p50Ay5lbEakHKZf2X5/hf_20261128_003617_f8064fd1-edea-4c75-bf49-d0208fa976d9.mp4','f8064fd1-edea-4c75-bf49-d0208fa976d9',
  '[{"desde":0.4,"hasta":2.6,"x":0.5,"y":0.68,"tipo":"ok","texto":"Rodillas alineadas con los pies"},{"desde":2.6,"hasta":5,"x":0.5,"y":0.4,"tipo":"ok","texto":"Pecho arriba, talones apoyados"}]'),
 ('parada-de-manos','mal','https://d8j0ntlcm91z4.cloudfront.net/user_3CLXYSi53p50Ay5lbEakHKZf2X5/hf_20261128_003616_2c0d5d8d-02bd-4005-9df8-32dab0a0ac86.mp4','2c0d5d8d-02bd-4005-9df8-32dab0a0ac86',
  '[{"desde":0.4,"hasta":2.6,"x":0.5,"y":0.5,"tipo":"error","texto":"Espalda arqueada (plátano)"},{"desde":2.6,"hasta":5,"x":0.5,"y":0.75,"tipo":"error","texto":"Hombros cerrados y codos doblados"}]'),
 ('parada-de-manos','bien','https://d8j0ntlcm91z4.cloudfront.net/user_3CLXYSi53p50Ay5lbEakHKZf2X5/hf_20261128_003617_83f8b1db-12f5-4c99-aeae-f11c88a68018.mp4','83f8b1db-12f5-4c99-aeae-f11c88a68018',
  '[{"desde":0.4,"hasta":2.6,"x":0.5,"y":0.5,"tipo":"ok","texto":"Cuerpo en una sola línea (lápiz)"},{"desde":2.6,"hasta":5,"x":0.5,"y":0.75,"tipo":"ok","texto":"Brazos estirados, hombros abiertos"}]')
) as v(slug, kind, url, job, ann)
join public.exercises e on e.slug = v.slug;

-- Programa de ejemplo: 8 semanas para el primer nivel de natación que exista
insert into public.programs (department, level_id, title, weeks, notes, is_example)
select 'natacion', (select id from public.levels where department = 'natacion' and active order by sort_order limit 1),
 'Ciclo de 8 semanas · nivel inicial de natación',
 '[{"semana":1,"enfoque":"Adaptación: burbujas y flotación","ejercicios":["burbujas","flotacion-estrella"]},
   {"semana":2,"enfoque":"Flotación y flecha desde la pared","ejercicios":["flotacion-estrella","flecha-deslizamiento"]},
   {"semana":3,"enfoque":"Patada de crol con tabla","ejercicios":["flecha-deslizamiento","patada-crol"]},
   {"semana":4,"enfoque":"Patada de crol y de dorso","ejercicios":["patada-crol","dorso-patada","relevos-juego"]},
   {"semana":5,"enfoque":"Respiración lateral parado y con tabla","ejercicios":["burbujas","respiracion-crol"]},
   {"semana":6,"enfoque":"Crol a un brazo con respiración","ejercicios":["brazada-crol-un-brazo","respiracion-crol"]},
   {"semana":7,"enfoque":"Crol completo 12.5 m","ejercicios":["patada-crol","brazada-crol-un-brazo","respiracion-crol"]},
   {"semana":8,"enfoque":"Evaluación de habilidades y festival","ejercicios":["relevos-juego"],"nota":"Llenar boleta de habilidades"}]',
 'Ejemplo: el coordinador de natación lo ajusta a su método.', true;

-- Cursos de ejemplo de la escuela de coaches
insert into public.courses (department, tier, title, description, minutes, required, validity_months, sort_order, is_example) values
 (null, 0, 'Protección de menores', 'Reglas del club para trabajar con niños: nunca a solas, vestidores, fotos y contacto físico.', 25, true, 12, 1, true),
 (null, 0, 'Seguridad y emergencias', 'Plan de emergencia del club, botiquín, cuándo parar una clase y a quién llamar.', 20, true, 12, 2, true),
 (null, 0, 'Usar la plataforma Oberlicht', 'Pasar lista, evaluar habilidades, rutinas y avisos desde el celular.', 15, true, null, 3, true),
 ('natacion', 1, 'Método de natación por niveles', 'Progresión de adaptación al agua hasta estilos y cómo se evalúa cada habilidad.', 30, false, null, 10, true),
 ('natacion', 1, 'Entrena el ojo: errores de crol', 'Clips mal hecho / bien hecho para aprender a ver y corregir.', 15, false, null, 11, true),
 ('ballet', 1, 'Fundamentos de barra', 'Plié, tendu y relevé: claves y correcciones.', 25, false, null, 20, true),
 ('oberfit', 1, 'Fuerza segura por edades', 'Patrones básicos y límites de carga para niños y adolescentes.', 25, false, null, 30, true),
 ('gimnasia', 1, 'Ayudas y seguridad en elementos', 'Cómo dar ayuda en parada de manos, rodadas y puentes.', 25, false, null, 40, true),
 (null, 2, 'Hablar con papás', 'Cómo dar avances, malas noticias y manejar quejas.', 20, false, null, 50, true);

insert into public.lessons (course_id, title, kind, body, exercise_id, questions, minutes, sort_order)
select c.id, l.title, l.kind, l.body, (select id from public.exercises where slug = l.slug), l.q::jsonb, l.mins, l.ord
from (values
 ('Protección de menores','Reglas de oro','lectura','1. Nunca a solas con un menor en un espacio cerrado.\n2. No se toman fotos ni videos de alumnos con el celular personal.\n3. El contacto físico es solo el necesario para enseñar o dar seguridad, y se avisa antes («te voy a sostener la espalda»).\n4. En vestidores entra solo personal del mismo sexo y nunca a solas.\n5. Cualquier sospecha se reporta el mismo día a coordinación.',null,'[]',5,1),
 ('Protección de menores','Comprueba lo aprendido','quiz',null,null,'[{"p":"Un papá te pide que grabes a su hijo con tu celular para mandárselo. ¿Qué haces?","opciones":["Lo grabo y se lo mando por WhatsApp","Le explico que el club no permite videos en celulares personales y le sugiero grabarlo él desde la grada","Lo grabo y lo borro después"],"correcta":1,"explica":"Los videos de alumnos nunca van en celulares personales del personal."},{"p":"Un niño se queda solo esperando a sus papás. ¿Qué haces?","opciones":["Me quedo con él en un salón cerrado","Lo acompaño a recepción, en un espacio abierto y con otro adulto","Lo dejo afuera"],"correcta":1,"explica":"Siempre en un espacio abierto y con otro adulto cerca."}]',4,2),
 ('Seguridad y emergencias','Plan de emergencia','lectura','Ante un incidente en el agua: 1) saca al alumno, 2) pide ayuda en voz alta y que alguien llame a recepción, 3) revisa respiración, 4) inicia RCP si es necesario. Ubica el botiquín, el DEA y la salida de emergencia de tu área.',null,'[]',5,1),
 ('Seguridad y emergencias','Comprueba lo aprendido','quiz',null,null,'[{"p":"¿Cuántos niños menores de 6 años puede tener un coach en el agua? (valor de ejemplo)","opciones":["4","8","12"],"correcta":0,"explica":"Ejemplo editable: el club define la proporción real."}]',3,2),
 ('Usar la plataforma Oberlicht','Tu día en el celular','lectura','En «Mi día» ves tus clases. Desde ahí pasas lista, abres la rutina aprobada del grupo y evalúas habilidades. En Academia → Rutinas puedes pedir una rutina a la IA y mandarla a revisión.',null,'[]',5,1),
 ('Método de natación por niveles','La progresión','lectura','Nivel inicial: adaptación (burbujas, flotación, flecha). Después: patada de crol y dorso, respiración lateral, brazada. Cada habilidad se marca en la boleta cuando el alumno la hace 3 veces seguidas sin ayuda.',null,'[]',8,1),
 ('Entrena el ojo: errores de crol','¿Qué está mal en esta patada?','que_esta_mal',null,'patada-crol','[{"p":"Mira el clip «mal hecho». ¿Cuál es el error principal?","opciones":["Brazos separados","Rodillas muy dobladas, como bicicleta","Respira de frente"],"correcta":1,"explica":"La patada debe nacer en la cadera, con la pierna casi estirada."}]',4,1),
 ('Entrena el ojo: errores de crol','¿Qué está mal en esta respiración?','que_esta_mal',null,'respiracion-crol','[{"p":"¿Qué hace mal el nadador al respirar?","opciones":["Levanta la cabeza al frente y se le hunden las piernas","Respira de lado","Patea muy rápido"],"correcta":0,"explica":"Hay que girar la cabeza de lado, con un ojo en el agua."}]',4,2),
 ('Entrena el ojo: errores de crol','¿Qué está mal en esta flecha?','que_esta_mal',null,'flecha-deslizamiento','[{"p":"¿Qué corrige primero?","opciones":["Que junte las manos y meta la cabeza entre los brazos","Que patee más","Que respire"],"correcta":0,"explica":"Mano sobre mano y brazos en las orejas."}]',4,3),
 ('Fundamentos de barra','¿Qué está mal en este plié?','que_esta_mal',null,'plie-primera','[{"p":"¿Cuál es el error?","opciones":["Rodillas hacia adentro y espalda arqueada","Brazos muy altos","Talones juntos"],"correcta":0,"explica":"Rodillas sobre los dedos y columna larga."}]',4,1),
 ('Fuerza segura por edades','¿Qué está mal en esta sentadilla?','que_esta_mal',null,'sentadilla','[{"p":"¿Qué corriges?","opciones":["Rodillas que se juntan y espalda redonda","Que baje más rápido","Nada"],"correcta":0,"explica":"Rodillas siguiendo los pies, pecho arriba."}]',4,1),
 ('Fuerza segura por edades','Límites por edad','lectura','Ejemplo editable: sin carga externa antes de los 14 años; prioridad a técnica y peso corporal. Cualquier alumno con lesión necesita rutina revisada por coordinación.',null,'[]',5,2),
 ('Ayudas y seguridad en elementos','¿Qué está mal en esta parada?','que_esta_mal',null,'parada-de-manos','[{"p":"¿Qué error ves?","opciones":["Espalda arqueada y hombros cerrados","Manos muy separadas","Mirada al piso"],"correcta":0,"explica":"De plátano a lápiz: costillas cerradas y hombros abiertos."}]',4,1),
 ('Hablar con papás','Dar un avance','lectura','Empieza con algo que el niño ya logra, luego lo que sigue y cómo pueden ayudar en casa. Usa la boleta de habilidades para hablar con datos.',null,'[]',5,1)
) as l(course, title, kind, body, slug, q, mins, ord)
join public.courses c on c.title = l.course and c.is_example;

-- Almacenamiento propio para los videos de la biblioteca (copia de los de Higgsfield o subidos por coordinación)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('academia', 'academia', true, 52428800, array['video/mp4','video/webm','image/png','image/jpeg'])
on conflict (id) do nothing;
create policy "coordinación sube videos de academia" on storage.objects for insert to authenticated
  with check (bucket_id = 'academia' and public.forma_coaches());
create policy "coordinación reemplaza videos de academia" on storage.objects for update to authenticated
  using (bucket_id = 'academia' and public.forma_coaches());
