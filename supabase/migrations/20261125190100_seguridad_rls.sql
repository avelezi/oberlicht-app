-- Oberlicht · Seguridad: funciones de rol/departamento, RLS y bitácora

-- ─────────────────────────────────────────────────────────────
-- Funciones auxiliares (security definer, sin recursión de RLS)
-- ─────────────────────────────────────────────────────────────

create or replace function public.my_role()
returns public.app_role language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and active
$$;

create or replace function public.is_manager()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role in ('direccion','administracion') from public.profiles where id = auth.uid() and active), false)
$$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role <> 'titular' from public.profiles where id = auth.uid() and active), false)
$$;

-- Personal con acceso a todas las familias y la caja: dirección, administración y recepción
create or replace function public.is_front_office()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role in ('direccion','administracion','recepcion') from public.profiles where id = auth.uid() and active), false)
$$;

create or replace function public.has_department(dep text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_manager() or exists (
    select 1 from public.profile_departments pd
    join public.profiles p on p.id = pd.profile_id and p.active
    where pd.profile_id = auth.uid() and pd.department = dep
  )
$$;

create or replace function public.is_dept_coordinator(dep text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_manager() or (public.my_role() = 'coordinador' and public.has_department(dep))
$$;

create or replace function public.my_family_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select id from public.families where titular_profile_id = auth.uid()
$$;

create or replace function public.member_in_my_departments(m uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.enrollments e
    join public.groups g on g.id = e.group_id
    join public.levels l on l.id = g.level_id
    where e.member_id = m and e.status <> 'baja' and public.has_department(l.department)
  ) or exists (
    select 1 from public.memberships ms
    join public.plans pl on pl.id = ms.plan_id
    where ms.member_id = m and ms.status <> 'baja' and public.has_department(pl.department)
  )
$$;

create or replace function public.group_department(g uuid)
returns text language sql stable security definer set search_path = public as $$
  select l.department from public.groups gr join public.levels l on l.id = gr.level_id where gr.id = g
$$;

-- ─────────────────────────────────────────────────────────────
-- Alta automática de perfil al registrarse
-- ─────────────────────────────────────────────────────────────

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, email, phone, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.email,
    new.raw_user_meta_data->>'phone',
    'titular'   -- el personal se promueve desde Configuración → Usuarios
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Evita que un usuario cambie su propio rol
create or replace function public.protect_profile_role()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- auth.uid() nulo = consola SQL o service role (administración técnica)
  if (new.role is distinct from old.role or new.active is distinct from old.active)
     and auth.uid() is not null and not public.is_manager() then
    raise exception 'Solo Dirección o Administración pueden cambiar roles';
  end if;
  return new;
end $$;

create trigger profiles_protect_role before update on public.profiles
  for each row execute function public.protect_profile_role();

-- ─────────────────────────────────────────────────────────────
-- Bitácora de cambios en dinero, precios y permisos
-- ─────────────────────────────────────────────────────────────

create or replace function public.audit_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_log (table_name, record_id, action, changed_by, old_data, new_data)
  values (
    tg_table_name,
    coalesce((case when tg_op = 'DELETE' then old.id else new.id end)::text, null),
    tg_op,
    auth.uid(),
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end $$;

create trigger audit_payments after insert or update or delete on public.payments for each row execute function public.audit_trigger();
create trigger audit_charges  after insert or update or delete on public.charges  for each row execute function public.audit_trigger();
create trigger audit_invoices after insert or update or delete on public.invoices for each row execute function public.audit_trigger();
create trigger audit_plans    after insert or update or delete on public.plans    for each row execute function public.audit_trigger();
create trigger audit_profiles after update on public.profiles for each row execute function public.audit_trigger();

-- ─────────────────────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────────────────────

alter table public.departments          enable row level security;
alter table public.settings             enable row level security;
alter table public.profiles             enable row level security;
alter table public.profile_departments  enable row level security;
alter table public.families             enable row level security;
alter table public.members              enable row level security;
alter table public.plans                enable row level security;
alter table public.levels               enable row level security;
alter table public.cycles               enable row level security;
alter table public.groups               enable row level security;
alter table public.enrollments          enable row level security;
alter table public.memberships          enable row level security;
alter table public.level_history        enable row level security;
alter table public.progress_notes       enable row level security;
alter table public.slots                enable row level security;
alter table public.bookings             enable row level security;
alter table public.attendance           enable row level security;
alter table public.charges              enable row level security;
alter table public.charge_items         enable row level security;
alter table public.payments             enable row level security;
alter table public.invoices             enable row level security;
alter table public.notifications        enable row level security;
alter table public.announcements        enable row level security;
alter table public.audit_log            enable row level security;

-- Catálogos públicos para usuarios con sesión
create policy "leer departamentos" on public.departments for select to authenticated using (true);
create policy "leer planes"   on public.plans  for select to authenticated using (active or public.is_staff());
create policy "leer niveles"  on public.levels for select to authenticated using (true);
create policy "leer ciclos"   on public.cycles for select to authenticated using (true);
create policy "leer grupos"   on public.groups for select to authenticated using (true);
create policy "leer horarios" on public.slots  for select to authenticated using (true);

create policy "gestionar planes"  on public.plans  for all to authenticated using (public.is_manager()) with check (public.is_manager());
create policy "gestionar niveles" on public.levels for all to authenticated using (public.is_dept_coordinator(department)) with check (public.is_dept_coordinator(department));
create policy "gestionar ciclos"  on public.cycles for all to authenticated using (public.is_dept_coordinator(department)) with check (public.is_dept_coordinator(department));
create policy "gestionar grupos"  on public.groups for all to authenticated
  using (public.is_dept_coordinator(public.group_department(id)))
  with check (exists (select 1 from public.levels l where l.id = level_id and public.is_dept_coordinator(l.department)));
create policy "gestionar horarios" on public.slots for all to authenticated
  using (public.is_dept_coordinator(department) or public.my_role() = 'recepcion' or coach_id = auth.uid())
  with check (public.is_dept_coordinator(department) or public.my_role() = 'recepcion' or coach_id = auth.uid());

-- Configuración
create policy "leer configuracion" on public.settings for select to authenticated using (public.is_staff() or key in ('club','reservas'));
create policy "editar configuracion" on public.settings for all to authenticated using (public.is_manager()) with check (public.is_manager());

-- Perfiles
create policy "ver mi perfil o personal" on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_staff());
create policy "editar mi perfil" on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_manager()) with check (id = auth.uid() or public.is_manager());
create policy "dirección crea perfiles" on public.profiles for insert to authenticated with check (public.is_manager());

create policy "ver departamentos del personal" on public.profile_departments for select to authenticated
  using (profile_id = auth.uid() or public.is_staff());
create policy "dirección asigna departamentos" on public.profile_departments for all to authenticated
  using (public.is_manager()) with check (public.is_manager());

-- Familias
create policy "ver familias" on public.families for select to authenticated
  using (
    public.is_front_office()
    or titular_profile_id = auth.uid()
    or (public.is_staff() and exists (select 1 from public.members m where m.family_id = families.id and public.member_in_my_departments(m.id)))
  );
create policy "crear familias" on public.families for insert to authenticated
  with check (public.is_front_office() or titular_profile_id = auth.uid());
create policy "editar familias" on public.families for update to authenticated
  using (public.is_front_office() or titular_profile_id = auth.uid())
  with check (public.is_front_office() or titular_profile_id = auth.uid());
create policy "borrar familias" on public.families for delete to authenticated using (public.is_manager());

-- Miembros
create policy "ver miembros" on public.members for select to authenticated
  using (
    public.is_front_office()
    or family_id in (select public.my_family_ids())
    or (public.is_staff() and public.member_in_my_departments(id))
  );
create policy "crear miembros" on public.members for insert to authenticated
  with check (public.is_front_office() or family_id in (select public.my_family_ids()));
create policy "editar miembros" on public.members for update to authenticated
  using (public.is_front_office() or family_id in (select public.my_family_ids()))
  with check (public.is_front_office() or family_id in (select public.my_family_ids()));
create policy "borrar miembros" on public.members for delete to authenticated using (public.is_manager());

-- Inscripciones (las altas pasan por la función inscribir())
create policy "ver inscripciones" on public.enrollments for select to authenticated
  using (
    public.is_front_office()
    or public.has_department(public.group_department(group_id))
    or member_id in (select id from public.members where family_id in (select public.my_family_ids()))
  );
create policy "editar inscripciones" on public.enrollments for update to authenticated
  using (public.is_front_office() or public.is_dept_coordinator(public.group_department(group_id)))
  with check (public.is_front_office() or public.is_dept_coordinator(public.group_department(group_id)));

-- Membresías
create policy "ver membresias" on public.memberships for select to authenticated
  using (
    public.is_front_office()
    or exists (select 1 from public.plans p where p.id = plan_id and public.has_department(p.department))
    or member_id in (select id from public.members where family_id in (select public.my_family_ids()))
  );
create policy "gestionar membresias" on public.memberships for all to authenticated
  using (public.is_front_office()) with check (public.is_front_office());

-- Nivel y avance
create policy "ver historial de nivel" on public.level_history for select to authenticated
  using (public.is_front_office() or public.has_department(department)
         or member_id in (select id from public.members where family_id in (select public.my_family_ids())));
create policy "registrar nivel" on public.level_history for insert to authenticated
  with check (public.has_department(department) and public.is_staff());

create policy "ver notas de avance" on public.progress_notes for select to authenticated
  using (public.is_front_office() or public.has_department(department)
         or (visible_to_family and member_id in (select id from public.members where family_id in (select public.my_family_ids()))));
create policy "escribir notas de avance" on public.progress_notes for insert to authenticated
  with check (public.has_department(department) and public.is_staff());

-- Reservas (altas y cancelaciones pasan por reservar() / cancelar_reserva())
create policy "ver reservas" on public.bookings for select to authenticated
  using (
    public.is_front_office()
    or exists (select 1 from public.slots s where s.id = slot_id and (s.coach_id = auth.uid() or public.has_department(s.department)))
    or member_id in (select id from public.members where family_id in (select public.my_family_ids()))
  );
create policy "personal actualiza reservas" on public.bookings for update to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- Asistencia
create policy "ver asistencia" on public.attendance for select to authenticated
  using (public.is_front_office() or public.has_department(department)
         or member_id in (select id from public.members where family_id in (select public.my_family_ids())));
create policy "pasar asistencia" on public.attendance for insert to authenticated
  with check (public.is_front_office() or public.has_department(department));
create policy "corregir asistencia" on public.attendance for update to authenticated
  using (public.is_front_office() or public.has_department(department))
  with check (public.is_front_office() or public.has_department(department));

-- Dinero: solo dirección, administración y recepción; la familia ve lo suyo
create policy "ver cargos" on public.charges for select to authenticated
  using (public.is_front_office() or family_id in (select public.my_family_ids()));
create policy "gestionar cargos" on public.charges for all to authenticated
  using (public.is_front_office()) with check (public.is_front_office());

create policy "ver conceptos" on public.charge_items for select to authenticated
  using (exists (select 1 from public.charges c where c.id = charge_id and (public.is_front_office() or c.family_id in (select public.my_family_ids()))));
create policy "gestionar conceptos" on public.charge_items for all to authenticated
  using (public.is_front_office()) with check (public.is_front_office());

create policy "ver pagos" on public.payments for select to authenticated
  using (public.is_front_office() or family_id in (select public.my_family_ids()));
create policy "registrar pagos" on public.payments for insert to authenticated with check (public.is_front_office());
create policy "corregir pagos" on public.payments for update to authenticated using (public.is_manager()) with check (public.is_manager());

create policy "ver facturas" on public.invoices for select to authenticated
  using (public.is_front_office() or family_id in (select public.my_family_ids()));
create policy "gestionar facturas" on public.invoices for all to authenticated
  using (public.is_front_office()) with check (public.is_front_office());

-- Avisos
create policy "ver notificaciones" on public.notifications for select to authenticated
  using (public.is_front_office() or family_id in (select public.my_family_ids()));
create policy "crear notificaciones" on public.notifications for insert to authenticated with check (public.is_staff());

create policy "ver comunicados" on public.announcements for select to authenticated
  using (
    (audience = 'todos')
    or (audience = 'personal' and public.is_staff())
    or (audience = 'familias' and (not public.is_staff() or public.is_front_office()))
  );
create policy "publicar comunicados" on public.announcements for all to authenticated
  using (public.is_manager() or (department is not null and public.is_dept_coordinator(department)))
  with check (public.is_manager() or (department is not null and public.is_dept_coordinator(department)));

-- Bitácora: solo lectura para dirección/administración
create policy "ver bitácora" on public.audit_log for select to authenticated using (public.is_manager());
