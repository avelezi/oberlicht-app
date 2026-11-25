-- Invitaciones de personal: Dirección registra el correo y el rol; cuando esa persona
-- crea su cuenta (con su propia contraseña) recibe el rol y departamentos automáticamente.

create table public.staff_invites (
  email       text primary key check (email = lower(email)),
  role        public.app_role not null check (role <> 'titular'),
  departments text[] not null default '{}',
  invited_by  uuid references public.profiles(id),
  created_at  timestamptz not null default now()
);
alter table public.staff_invites enable row level security;
create policy "dirección gestiona invitaciones" on public.staff_invites for all to authenticated
  using (public.is_manager()) with check (public.is_manager());

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_inv public.staff_invites;
begin
  select * into v_inv from public.staff_invites where email = lower(new.email);

  insert into public.profiles (id, full_name, email, phone, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.email,
    new.raw_user_meta_data->>'phone',
    coalesce(v_inv.role, 'titular')
  )
  on conflict (id) do nothing;

  if v_inv.email is not null then
    insert into public.profile_departments (profile_id, department)
    select new.id, d from unnest(v_inv.departments) d
    on conflict do nothing;
    delete from public.staff_invites where email = v_inv.email;
  end if;
  return new;
end $$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
