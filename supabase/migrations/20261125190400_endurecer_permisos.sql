-- Oberlicht · Endurecimiento según el asesor de seguridad de Supabase

alter function public.age_at(date, date) set search_path = public;
alter function public.today_mx() set search_path = public;

-- Funciones de disparador e internas: nadie las llama por la API
revoke all on function public.audit_trigger() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.protect_profile_role() from public, anon, authenticated;
revoke all on function public.setting(text) from public, anon, authenticated;
revoke all on function public.can_act_for_member(uuid) from public, anon, authenticated;
revoke all on function public.family_is_blocked(uuid) from public, anon;
revoke all on function public.nivel_actual(uuid, text) from public, anon;
grant execute on function public.family_is_blocked(uuid) to authenticated;
grant execute on function public.nivel_actual(uuid, text) to authenticated;

-- Funciones que usan las políticas RLS: solo usuarios con sesión
revoke all on function public.my_role() from public, anon;
revoke all on function public.is_manager() from public, anon;
revoke all on function public.is_staff() from public, anon;
revoke all on function public.is_front_office() from public, anon;
revoke all on function public.has_department(text) from public, anon;
revoke all on function public.is_dept_coordinator(text) from public, anon;
revoke all on function public.my_family_ids() from public, anon;
revoke all on function public.member_in_my_departments(uuid) from public, anon;
revoke all on function public.group_department(uuid) from public, anon;
grant execute on function public.my_role(), public.is_manager(), public.is_staff(), public.is_front_office(),
  public.has_department(text), public.is_dept_coordinator(text), public.my_family_ids(),
  public.member_in_my_departments(uuid), public.group_department(uuid) to authenticated;
