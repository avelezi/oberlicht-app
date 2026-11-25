-- Rol para encargados de mantenimiento (alberca, instalaciones, equipos)
alter type public.app_role add value if not exists 'mantenimiento' before 'titular';
insert into public.departments (code, name, is_area, color, sort_order)
values ('mantenimiento', 'Mantenimiento', false, '#475569', 12)
on conflict (code) do nothing;
