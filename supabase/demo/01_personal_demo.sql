-- Personal ficticio para la demostración (correos @demo.oberlicht.mx, no pueden iniciar sesión).
-- Requiere el auth.users completo de Supabase. Se identifica por el dominio del correo.
insert into public.staff_invites (email, role, departments) values
  ('laura.gomez@demo.oberlicht.mx', 'coordinador', '{natacion}'),
  ('mariana.ruiz@demo.oberlicht.mx', 'coach', '{natacion}'),
  ('jorge.castillo@demo.oberlicht.mx', 'coach', '{natacion}'),
  ('sofia.herrera@demo.oberlicht.mx', 'coordinador', '{ballet}'),
  ('valeria.nunez@demo.oberlicht.mx', 'coach', '{gimnasia}'),
  ('andres.molina@demo.oberlicht.mx', 'coach', '{oberfit}'),
  ('ana.vega@demo.oberlicht.mx', 'coach', '{terapia,nutricion}'),
  ('paola.diaz@demo.oberlicht.mx', 'recepcion', '{}'),
  ('ricardo.pena@demo.oberlicht.mx', 'mantenimiento', '{}'),
  ('daniela.ortiz@demo.oberlicht.mx', 'ventas', '{cafeteria,tienda}')
on conflict (email) do nothing;

with s(email, nombre) as (values
  ('laura.gomez@demo.oberlicht.mx', 'Laura Gómez'), ('mariana.ruiz@demo.oberlicht.mx', 'Mariana Ruiz'),
  ('jorge.castillo@demo.oberlicht.mx', 'Jorge Castillo'), ('sofia.herrera@demo.oberlicht.mx', 'Sofía Herrera'),
  ('valeria.nunez@demo.oberlicht.mx', 'Valeria Núñez'), ('andres.molina@demo.oberlicht.mx', 'Andrés Molina'),
  ('ana.vega@demo.oberlicht.mx', 'Ana Lucía Vega'), ('paola.diaz@demo.oberlicht.mx', 'Paola Díaz'),
  ('ricardo.pena@demo.oberlicht.mx', 'Ricardo Peña'), ('daniela.ortiz@demo.oberlicht.mx', 'Daniela Ortiz'))
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change, email_change_token_current, phone_change, phone_change_token, reauthentication_token)
select '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', s.email,
       extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf', 6)), now(),
       '{"provider":"email","providers":["email"]}', jsonb_build_object('full_name', s.nombre), now(), now(), '', '', '', '', '', '', '', ''
  from s where not exists (select 1 from auth.users u where u.email = s.email);
