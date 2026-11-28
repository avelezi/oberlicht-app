-- ════════════════════════════════════════════════════════════════════
-- Datos demo de Academia: rutinas de coaches ficticios (aprobadas, en revisión y devueltas),
-- festivales y un torneo con resultados, avance en la escuela de coaches, observaciones en clase
-- y certificados (uno por vencer). Requiere 01 y 02. Usa solo personal @demo.oberlicht.mx y familias DEMO-###.
-- Rutinas y eventos quedan registrados en settings 'demo_data' para borrarlos con 99_borrar_demo.sql;
-- lo del personal demo se borra con sus cuentas.
-- ════════════════════════════════════════════════════════════════════
do $$
declare
  hoy date := public.today_mx();
  p_laura uuid := (select id from public.profiles where email = 'laura.gomez@demo.oberlicht.mx');
  p_mariana uuid := (select id from public.profiles where email = 'mariana.ruiz@demo.oberlicht.mx');
  p_jorge uuid := (select id from public.profiles where email = 'jorge.castillo@demo.oberlicht.mx');
  p_sofia uuid := (select id from public.profiles where email = 'sofia.herrera@demo.oberlicht.mx');
  p_valeria uuid := (select id from public.profiles where email = 'valeria.nunez@demo.oberlicht.mx');
  p_andres uuid := (select id from public.profiles where email = 'andres.molina@demo.oberlicht.mx');
  lv_nat uuid := (select id from public.levels where department = 'natacion' and active order by sort_order limit 1);
  lv_bal uuid := (select id from public.levels where department = 'ballet' and active order by sort_order limit 1);
  lv_gim uuid := (select id from public.levels where department = 'gimnasia' and active order by sort_order limit 1);
  v_rut jsonb := '[]'; v_ev jsonb := '[]'; v_id uuid; e1 uuid; e2 uuid; e3 uuid;
  ex jsonb;
begin
  if p_mariana is null then raise notice 'Primero carga 01_personal_demo.sql'; return; end if;
  if exists (select 1 from public.settings where key = 'demo_data' and value ? 'academia') then
    raise notice 'Los datos demo de Academia ya estaban cargados'; return;
  end if;
  ex := (select jsonb_object_agg(slug, jsonb_build_object('exercise_id', id, 'titulo', title, 'dosis', dose)) from public.exercises where slug is not null);

  -- ── Rutinas
  insert into public.routines (department, level_id, title, age_min, age_max, minutes, objective, blocks, family_summary, home_task, source, ai_request, status, created_by, reviewed_by, reviewed_at, is_template, used_on, created_at)
  values ('natacion', lv_nat, 'Patada de crol con juego · Pecesitos', 5, 7, 45, 'Patada desde la cadera con pierna casi estirada',
    jsonb_build_array(
      jsonb_build_object('nombre','Calentamiento','minutos',8,'items',jsonb_build_array(ex->'burbujas', ex->'flotacion-estrella')),
      jsonb_build_object('nombre','Parte principal','minutos',25,'items',jsonb_build_array(ex->'flecha-deslizamiento', ex->'patada-crol' || '{"nota":"Estación de refuerzo para quien aún dobla rodillas"}', ex->'dorso-patada')),
      jsonb_build_object('nombre','Juego','minutos',8,'items',jsonb_build_array(ex->'relevos-juego')),
      jsonb_build_object('nombre','Vuelta a la calma','minutos',4,'items',jsonb_build_array(ex->'flotacion-estrella'))),
    'Esta semana trabajamos la patada de crol: pierna larga y pies en punta, como la cola de un tiburoncito.',
    'En la regadera o la tina: soplar burbujas 10 veces con la cara en el agua.', 'ia',
    'Clase de 45 min para Pecesitos de 5 a 7 años, patada de crol con juego al final', 'aprobada', p_mariana, p_laura, now() - interval '3 days', true,
    array[hoy - 7, hoy - 3], now() - interval '5 days') returning id into v_id; v_rut := v_rut || to_jsonb(v_id);

  insert into public.routines (department, level_id, title, age_min, age_max, minutes, objective, blocks, family_summary, source, ai_request, status, created_by, created_at)
  values ('natacion', lv_nat, 'Respiración lateral · nivel inicial', 6, 8, 45, 'Respirar de lado sin levantar la cabeza',
    jsonb_build_array(
      jsonb_build_object('nombre','Calentamiento','minutos',8,'items',jsonb_build_array(ex->'burbujas')),
      jsonb_build_object('nombre','Parte principal','minutos',27,'items',jsonb_build_array(ex->'respiracion-crol', ex->'brazada-crol-un-brazo', ex->'patada-crol')),
      jsonb_build_object('nombre','Juego','minutos',6,'items',jsonb_build_array(ex->'relevos-juego')),
      jsonb_build_object('nombre','Vuelta a la calma','minutos',4,'items',jsonb_build_array(ex->'flotacion-estrella'))),
    'Esta semana aprendemos a respirar de lado, con un ojo dentro del agua.', 'ia',
    '45 minutos de respiración lateral para niños de 6 a 8 años', 'revision', p_jorge, now() - interval '1 day')
  returning id into v_id; v_rut := v_rut || to_jsonb(v_id);

  insert into public.routines (department, title, age_min, age_max, minutes, objective, blocks, source, status, review_note, created_by, reviewed_by, reviewed_at, created_at)
  values ('oberfit', 'Fuerza de piernas · adolescentes', 13, 16, 50, 'Patrón de sentadilla y zancada',
    jsonb_build_array(
      jsonb_build_object('nombre','Calentamiento','minutos',8,'items',jsonb_build_array(ex->'movilidad-articular')),
      jsonb_build_object('nombre','Parte principal','minutos',35,'items',jsonb_build_array(ex->'sentadilla' || '{"dosis":"4 × 10 con kettlebell 8 kg"}', ex->'zancada', ex->'plancha')),
      jsonb_build_object('nombre','Vuelta a la calma','minutos',7,'items','[]'::jsonb)),
    'manual', 'devuelta', 'Para menores de 14 años quita la kettlebell: sentadilla con peso corporal. Lo demás está bien.', p_andres, p_laura, now() - interval '2 days', now() - interval '3 days')
  returning id into v_id; v_rut := v_rut || to_jsonb(v_id);

  insert into public.routines (department, level_id, title, age_min, age_max, minutes, objective, blocks, family_summary, home_task, source, status, created_by, reviewed_by, reviewed_at, is_template, created_at)
  values ('ballet', lv_bal, 'Barra básica · Baby ballet', 5, 7, 45, 'Plié, tendu y relevé con buena alineación',
    jsonb_build_array(
      jsonb_build_object('nombre','Calentamiento','minutos',8,'items','[]'::jsonb),
      jsonb_build_object('nombre','Barra','minutos',22,'items',jsonb_build_array(ex->'plie-primera', ex->'tendu', ex->'releve')),
      jsonb_build_object('nombre','Centro','minutos',10,'items','[]'::jsonb),
      jsonb_build_object('nombre','Vuelta a la calma','minutos',5,'items',jsonb_build_array(ex->'estiramiento-mariposa'))),
    'Trabajamos el plié: rodillas sobre los dedos de los pies y espalda de reina.', 'Hacer 8 relevés tomada de una silla.', 'manual', 'aprobada', p_sofia, p_sofia, now() - interval '6 days', true, now() - interval '8 days')
  returning id into v_id; v_rut := v_rut || to_jsonb(v_id);

  insert into public.routines (department, level_id, title, age_min, age_max, minutes, objective, blocks, source, ai_request, status, created_by, created_at)
  values ('gimnasia', lv_gim, 'Parada de manos y rodadas', 7, 10, 50, 'Alinear el cuerpo en la parada de manos',
    jsonb_build_array(
      jsonb_build_object('nombre','Calentamiento','minutos',10,'items','[]'::jsonb),
      jsonb_build_object('nombre','Parte principal','minutos',30,'items',jsonb_build_array(ex->'rodada-frente', ex->'parada-de-manos', ex->'puente')),
      jsonb_build_object('nombre','Vuelta a la calma','minutos',10,'items',jsonb_build_array(ex->'estiramiento-split'))),
    'ia', 'Clase de 50 min, 7 a 10 años, parada de manos', 'revision', p_valeria, now() - interval '4 hours')
  returning id into v_id; v_rut := v_rut || to_jsonb(v_id);

  -- ── Eventos
  insert into public.events (department, title, kind, starts_at, location, description, registration_until, fee, capacity, categories, status)
  values ('natacion', 'Festival de fin de ciclo · Natación', 'festival', (hoy + 20)::timestamptz + time '10:00', 'Alberca principal',
          'Todos los niveles nadan su distancia frente a sus familias. Medalla de participación para todos.', hoy + 14, 150, 80,
          '["Pecesitos 12.5 m","Delfines 25 m crol","Tiburones 50 m libre"]', 'abierto') returning id into e1;
  insert into public.events (department, title, kind, starts_at, location, description, fee, categories, status)
  values ('natacion', 'Torneo interno de crol', 'torneo', (hoy - 15)::timestamptz + time '09:00', 'Alberca principal',
          'Series por edad. Tiempos oficiales del club.', 0, '["25 m crol 6-8 años","25 m crol 9-11 años"]', 'terminado') returning id into e2;
  insert into public.events (department, title, kind, starts_at, location, description, registration_until, fee, categories, status)
  values ('ballet', 'Exhibición navideña de ballet', 'exhibicion', (hoy + 24)::timestamptz + time '17:00', 'Salón de usos múltiples',
          'Cada grupo presenta su coreografía.', hoy + 10, 250, '["Baby ballet","Ballet infantil","Ballet juvenil"]', 'abierto') returning id into e3;
  v_ev := jsonb_build_array(e1, e2, e3);

  insert into public.event_entries (event_id, member_id, category, paid)
  select e1, x.member_id, (array['Pecesitos 12.5 m','Delfines 25 m crol','Tiburones 50 m libre'])[1 + (x.rn % 3)], x.rn % 4 <> 0
    from (select distinct e.member_id, row_number() over (order by e.member_id) rn
            from public.enrollments e join public.groups g on g.id = e.group_id join public.levels l on l.id = g.level_id
            join public.members m on m.id = e.member_id join public.families f on f.id = m.family_id
           where e.status = 'activa' and l.department = 'natacion' and f.external_id like 'DEMO-%') x
   where x.rn <= 34
  on conflict do nothing;

  insert into public.event_entries (event_id, member_id, category, heat, lane, result, place, medal, paid)
  select e2, x.member_id, case when x.rn % 2 = 0 then '25 m crol 6-8 años' else '25 m crol 9-11 años' end,
         1 + ((x.rn - 1) / 6)::int % 3, 1 + ((x.rn - 1) % 6)::int,
         '0:' || lpad((22 + (abs(hashtext(x.member_id::text)) % 18))::text, 2, '0') || '.' || (abs(hashtext(x.member_id::text)) % 10),
         null, null, true
    from (select distinct e.member_id, row_number() over (order by e.member_id desc) rn
            from public.enrollments e join public.groups g on g.id = e.group_id join public.levels l on l.id = g.level_id
            join public.members m on m.id = e.member_id join public.families f on f.id = m.family_id
           where e.status = 'activa' and l.department = 'natacion' and f.external_id like 'DEMO-%') x
   where x.rn <= 18
  on conflict do nothing;
  -- lugares y medallas por categoría
  update public.event_entries t set place = r.pos,
         medal = case r.pos when 1 then 'oro' when 2 then 'plata' when 3 then 'bronce' else 'participacion' end
    from (select id, row_number() over (partition by category order by result) pos from public.event_entries where event_id = e2) r
   where t.id = r.id;

  insert into public.event_entries (event_id, member_id, category, paid)
  select e3, x.member_id, (array['Baby ballet','Ballet infantil','Ballet juvenil'])[1 + (x.rn % 3)], x.rn % 3 <> 0
    from (select distinct e.member_id, row_number() over (order by e.member_id) rn
            from public.enrollments e join public.groups g on g.id = e.group_id join public.levels l on l.id = g.level_id
            join public.members m on m.id = e.member_id join public.families f on f.id = m.family_id
           where e.status = 'activa' and l.department = 'ballet' and f.external_id like 'DEMO-%') x
   where x.rn <= 20
  on conflict do nothing;

  -- ── Escuela de coaches
  insert into public.coach_tiers (profile_id, department, tier, since) values
    (p_laura, 'natacion', 4, hoy - 900), (p_mariana, 'natacion', 2, hoy - 400), (p_jorge, 'natacion', 1, hoy - 60),
    (p_sofia, 'ballet', 4, hoy - 1200), (p_valeria, 'gimnasia', 2, hoy - 300), (p_andres, 'oberfit', 1, hoy - 90)
  on conflict do nothing;

  insert into public.lesson_progress (profile_id, lesson_id, score, completed_at)
  select p.id, l.id, case when l.kind in ('quiz','que_esta_mal') then 70 + (abs(hashtext(p.id::text || l.id::text)) % 31) end,
         now() - make_interval(days => abs(hashtext(l.id::text || p.id::text)) % 40)
    from public.profiles p cross join public.lessons l join public.courses c on c.id = l.course_id
   where p.id in (p_laura, p_mariana, p_jorge, p_sofia, p_valeria, p_andres)
     and (c.department is null or exists (select 1 from public.profile_departments pd where pd.profile_id = p.id and pd.department = c.department))
     and (abs(hashtext(p.id::text || l.id::text)) % 10) < case when p.id = p_jorge then 4 when p.id = p_andres then 5 else 9 end
  on conflict do nothing;

  insert into public.class_observations (coach_id, observer_id, department, observed_on, scores, strengths, improve) values
    (p_mariana, p_laura, 'natacion', hoy - 12, '{"puntualidad":4,"seguridad":4,"tecnica":3,"energia":4,"grupo":4}', 'Grupo muy ordenado y alegre; usa bien el juego.', 'Dar una corrección técnica concreta por niño en cada serie.'),
    (p_jorge, p_laura, 'natacion', hoy - 5, '{"puntualidad":3,"seguridad":3,"tecnica":3,"energia":4,"grupo":2}', 'Buena energía y cercanía con los niños.', 'Contar a los niños al entrar y salir del agua; organizar estaciones para no tener tiempos muertos.'),
    (p_valeria, p_sofia, 'gimnasia', hoy - 20, '{"puntualidad":4,"seguridad":4,"tecnica":4,"energia":3,"grupo":3}', 'Ayudas seguras en parada de manos.', 'Más ritmo entre ejercicios.'),
    (p_andres, p_laura, 'oberfit', hoy - 9, '{"puntualidad":4,"seguridad":2,"tecnica":3,"energia":4,"grupo":3}', 'Explica muy claro la técnica.', 'Revisar límites de carga por edad antes de cada clase.');

  insert into public.staff_certifications (profile_id, name, kind, department, issued_on, expires_on) values
    (p_mariana, 'RCP y primeros auxilios (Cruz Roja)', 'externo', null, hoy - 340, hoy + 25),
    (p_jorge, 'RCP y primeros auxilios (Cruz Roja)', 'externo', null, hoy - 100, hoy + 265),
    (p_laura, 'Salvavidas profesional', 'externo', 'natacion', hoy - 700, hoy - 5),
    (p_mariana, 'Coach titular de natación Oberlicht', 'interno', 'natacion', hoy - 400, null),
    (p_sofia, 'Mentora de ballet Oberlicht', 'interno', 'ballet', hoy - 1200, null),
    (p_valeria, 'Coach titular de gimnasia Oberlicht', 'interno', 'gimnasia', hoy - 300, null);

  update public.settings
     set value = jsonb_set(jsonb_set(value, '{ids,routines}', v_rut), '{ids,events}', v_ev) || '{"academia": true}'
   where key = 'demo_data';
end $$;

select 'Demo Academia' as resultado,
       (select count(*) from public.routines) rutinas, (select count(*) from public.events) eventos,
       (select count(*) from public.event_entries) inscripciones, (select count(*) from public.lesson_progress) lecciones_hechas,
       (select count(*) from public.class_observations) observaciones, (select count(*) from public.staff_certifications) certificados;
