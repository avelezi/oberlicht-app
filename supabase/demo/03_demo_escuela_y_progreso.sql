-- ════════════════════════════════════════════════════════════════════
-- Datos demo de «Escuela y retención» y «Progreso y retos».
-- Requiere 01_personal_demo.sql y 02_datos_demo.sql. Solo usa familias DEMO-###.
-- Prospectos y retos demo quedan registrados en settings 'demo_data' para borrarlos
-- con 99_borrar_demo.sql; lo demás cuelga de las familias demo y se borra con ellas.
-- ════════════════════════════════════════════════════════════════════
do $$
declare
  hoy date := public.today_mx();
  r record; k int; n int; i int; v_status text; v_coach uuid; v_id uuid;
  v_leads jsonb := '[]'; v_retos jsonb := '[]';
  c_dic uuid; c_nov uuid; c_sem uuid; c_club uuid; c_hab uuid;
  v_g record; v_fecha date;
begin
  if exists (select 1 from public.settings where key = 'demo_data' and value ? 'escuela_progreso') then
    raise notice 'Los datos demo de escuela y progreso ya estaban cargados'; return;
  end if;
  perform setseed(0.27);

  -- ── Habilidades evaluadas (alumnos demo activos en natación, ballet y gimnasia)
  for r in
    select e.member_id, g.level_id, g.coach_id, row_number() over (order by e.member_id) rn
      from public.enrollments e join public.groups g on g.id = e.group_id join public.levels l on l.id = g.level_id
      join public.members m on m.id = e.member_id join public.families f on f.id = m.family_id
     where e.status = 'activa' and l.department in ('natacion','ballet','gimnasia') and f.external_id like 'DEMO-%'
  loop
    v_coach := coalesce(r.coach_id, (select id from public.profiles where email like '%@demo.oberlicht.mx' and role in ('coach','coordinador') limit 1));
    n := (select count(*) from public.skills where level_id = r.level_id and active);
    k := ((r.rn * 7) % (n + 1))::int;                       -- cuántas lleva logradas
    i := 0;
    for v_id in select id from public.skills where level_id = r.level_id and active order by sort_order, name loop
      i := i + 1;
      v_status := case when i <= k then 'lograda' when i = k + 1 then 'en_proceso' else null end;
      continue when v_status is null;
      insert into public.skill_progress (member_id, skill_id, status, evaluated_by, evaluated_at, achieved_at)
      values (r.member_id, v_id, v_status, v_coach, now() - make_interval(days => (120 - i * 20 + (r.rn % 9)::int)),
              case when v_status = 'lograda' then now() - make_interval(days => (120 - i * 20 + (r.rn % 9)::int)) end)
      on conflict (member_id, skill_id) do nothing;
    end loop;
  end loop;

  -- ── Boletas para los primeros 18 alumnos evaluados
  for r in
    select sp.member_id, s.level_id, l.name lvl, l.department dep, min(sp.evaluated_by::text)::uuid coach
      from public.skill_progress sp join public.skills s on s.id = sp.skill_id join public.levels l on l.id = s.level_id
      join public.members m on m.id = sp.member_id join public.families f on f.id = m.family_id
     where f.external_id like 'DEMO-%'
     group by sp.member_id, s.level_id, l.name, l.department
     order by sp.member_id limit 18
  loop
    insert into public.report_cards (member_id, level_id, department, title, comment, skills, achieved, total, attendance_pct, created_by, created_at)
    select r.member_id, r.level_id, r.dep, 'Boleta ' || r.lvl || ' · Octubre 2026',
           (array['¡Gran avance este mes! Sigue practicando la respiración.', 'Muy participativo en clase. Trabajemos la constancia.',
                  'Excelente actitud. Está lista para retos nuevos.', 'Mejoró mucho su técnica. ¡Felicidades!'])[1 + (abs(hashtext(r.member_id::text)) % 4)],
           coalesce(jsonb_agg(jsonb_build_object('name', s.name, 'status', coalesce(sp.status, 'sin_iniciar'), 'note', null) order by s.sort_order), '[]'),
           count(*) filter (where sp.status = 'lograda'), count(*), 80 + (abs(hashtext(r.member_id::text)) % 20), r.coach, '2026-10-31 18:00-06'
      from public.skills s left join public.skill_progress sp on sp.skill_id = s.id and sp.member_id = r.member_id
     where s.level_id = r.level_id and s.active;
  end loop;

  -- ── Certificados: alumnos que ya lograron todas las habilidades de su nivel
  for r in
    select sp.member_id, s.level_id, l.department dep, min(sp.evaluated_by::text)::uuid coach
      from public.skill_progress sp join public.skills s on s.id = sp.skill_id join public.levels l on l.id = s.level_id
      join public.members m on m.id = sp.member_id join public.families f on f.id = m.family_id
     where f.external_id like 'DEMO-%' and sp.status = 'lograda'
     group by sp.member_id, s.level_id, l.department
    having count(*) >= (select count(*) from public.skills x where x.level_id = s.level_id and x.active)
     limit 6
  loop
    insert into public.certificates (member_id, level_id, department, notes, issued_by, issued_at)
    values (r.member_id, r.level_id, r.dep, '¡Felicidades por completar el nivel!', r.coach, now() - interval '12 days');
  end loop;

  -- ── Créditos de reposición (disponibles, agendados y usados)
  i := 0;
  for r in
    select e.id eid, e.member_id, g.id gid, g.level_id, l.department dep, g.weekdays
      from public.enrollments e join public.groups g on g.id = e.group_id join public.levels l on l.id = g.level_id
      join public.members m on m.id = e.member_id join public.families f on f.id = m.family_id
     where e.status = 'activa' and f.external_id like 'DEMO-%' and l.department in ('natacion','ballet','gimnasia')
     order by e.member_id offset 3 limit 12
  loop
    i := i + 1;
    v_fecha := (select d::date from generate_series(hoy - 20, hoy - 1, interval '1 day') d
                 where extract(isodow from d)::int = any (r.weekdays) order by d desc offset (i % 3) limit 1);
    continue when v_fecha is null;
    insert into public.attendance (member_id, group_id, department, date, status)
    values (r.member_id, r.gid, r.dep, v_fecha, 'justificada')
    on conflict do nothing;
    select g.id, d::date fecha into v_g
      from public.groups g cross join generate_series(hoy + 1, hoy + 10, interval '1 day') d
     where g.level_id = r.level_id and g.active and g.id <> r.gid and extract(isodow from d)::int = any (g.weekdays)
     order by d limit 1;
    insert into public.makeup_credits (member_id, enrollment_id, level_id, department, missed_group_id, missed_date, reason, expires_on, status, used_group_id, used_date)
    values (r.member_id, r.eid, r.level_id, r.dep, r.gid, v_fecha,
            (array['Enfermedad','Viaje familiar','Examen en la escuela','Cita médica'])[1 + i % 4], v_fecha + 30,
            case when i % 3 = 0 and v_g.id is not null then 'agendada' when i % 4 = 1 then 'usada' else 'disponible' end,
            case when i % 3 = 0 and v_g.id is not null then v_g.id when i % 4 = 1 then r.gid end,
            case when i % 3 = 0 and v_g.id is not null then v_g.fecha when i % 4 = 1 then v_fecha + 7 end)
    on conflict do nothing;
  end loop;

  -- ── Solicitudes de baja y cómo se resolvieron
  i := 0;
  for r in
    select e.id eid, e.member_id, m.family_id, l.department dep, e.discount_pct
      from public.enrollments e join public.groups g on g.id = e.group_id join public.levels l on l.id = g.level_id
      join public.members m on m.id = e.member_id join public.families f on f.id = m.family_id
     where f.external_id like 'DEMO-%' and e.status in ('activa','baja')
     order by e.member_id desc limit 9
  loop
    i := i + 1;
    insert into public.retention_cases (member_id, family_id, enrollment_id, department, reason, detail, choice, outcome, freeze_until, discount_pct, discount_until, prev_discount_pct, reverted, channel, created_at)
    values (r.member_id, r.family_id, r.eid, r.dep,
            (array['Horario','Precio','Vacaciones o viaje','No avanza o no le gusta','Cambio de casa o escuela','Salud o lesión'])[1 + i % 6], null,
            (array['congelar','descuento','cambio_grupo','baja'])[1 + i % 4],
            case when i % 4 = 3 then 'baja' else 'retenido' end,
            case when i % 4 = 0 then hoy - 20 end,
            case when i % 4 = 1 then 15 end, case when i % 4 = 1 then hoy + 30 end, case when i % 4 = 1 then r.discount_pct end,
            i % 4 = 1, case when i % 2 = 0 then 'portal' else 'recepcion' end, now() - make_interval(days => 5 + i * 9));
  end loop;

  -- ── Prospectos y clases de prueba
  for r in
    select * from (values
      ('Mariana Ortega', '5501110001', 'natacion', 'web', 'nuevo', 'Isabela', 5, 0, null::int, 'Quiere natación para su hija los martes.'),
      ('Ricardo Salinas', '5501110002', 'oberfit', 'visita', 'nuevo', null, null, 0, null, 'Pregunta por plan de pareja.'),
      ('Fernanda Lugo', '5501110003', 'ballet', 'redes', 'contactado', 'Camila', 6, 1, null, 'Vio el post de la presentación de fin de año.'),
      ('Héctor Campos', '5501110004', 'natacion', 'referido', 'contactado', 'Mateo', 8, 2, null, 'Lo recomendó la familia Ramírez.'),
      ('Paulina Cruz', '5501110005', 'gimnasia', 'whatsapp', 'prueba_agendada', 'Regina', 7, 1, 2, null),
      ('Óscar Medina', '5501110006', 'natacion', 'web', 'prueba_agendada', 'Santiago', 4, 1, 4, 'Tiene miedo al agua, avisar al coach.'),
      ('Lucía Benítez', '5501110007', 'ballet', 'visita', 'prueba_hecha', 'Valentina', 9, 2, -3, 'Le encantó la clase.'),
      ('Gabriel Ríos', '5501110008', 'natacion', 'telefono', 'prueba_hecha', 'Emilio', 10, 2, -2, null),
      ('Diana Fuentes', '5501110009', 'gimnasia', 'redes', 'inscrito', 'Sofía', 6, 3, -15, 'Se inscribió en Iniciación.'),
      ('Tomás Aguilar', '5501110010', 'oberfit', 'referido', 'inscrito', null, null, 2, -20, null),
      ('Carla Montes', '5501110011', 'natacion', 'web', 'perdido', 'Leo', 5, 4, -25, null),
      ('Jimena Pardo', '5501110012', 'ballet', 'whatsapp', 'perdido', 'Ximena', 11, 3, -30, null),
      ('Arturo Vidal', '5501110013', 'natacion', 'visita', 'contactado', null, null, 3, null, 'Busca clases para adultos en la mañana.'),
      ('Renata Solís', '5501110014', 'gimnasia', 'web', 'nuevo', 'Daniela', 8, 0, null, null)
    ) as t(nombre, tel, dep, fuente, estado, hijo, edad, intentos, prueba, nota)
  loop
    select g.id, d::date fecha into v_g
      from public.groups g join public.levels l on l.id = g.level_id
      cross join generate_series(hoy + coalesce(r.prueba, 0) - 3, hoy + coalesce(r.prueba, 0) + 3, interval '1 day') d
     where l.department = r.dep and g.active and extract(isodow from d)::int = any (g.weekdays)
       and (r.edad is null or (r.edad between l.min_age and l.max_age) or l.min_age >= 18)
     order by abs(d::date - (hoy + coalesce(r.prueba, 0))) limit 1;
    insert into public.leads (name, phone, child_name, child_birthdate, department, source, status, trial_group_id, trial_date, trial_attended,
                              next_follow_up, attempts, lost_reason, notes, created_at, updated_at)
    values (r.nombre, r.tel, case when r.hijo is not null then r.hijo || ' ' || split_part(r.nombre, ' ', 2) end,
            case when r.edad is not null then hoy - (r.edad * 365 + 40) end, r.dep, r.fuente, r.estado,
            case when r.prueba is not null then v_g.id end, case when r.prueba is not null then v_g.fecha end,
            case when r.estado in ('prueba_hecha','inscrito') then true when r.estado = 'perdido' and r.prueba is not null then false end,
            case r.estado when 'nuevo' then hoy when 'contactado' then hoy + (r.intentos % 3) - 1 when 'prueba_agendada' then v_g.fecha + 1
                          when 'prueba_hecha' then hoy else null end,
            r.intentos, case when r.estado = 'perdido' then (array['Precio','Horario'])[1 + r.intentos % 2] end,
            '[DEMO] ' || coalesce(r.nota, ''), now() - make_interval(days => 2 + r.intentos * 6), now() - make_interval(days => r.intentos))
    returning id into v_id;
    v_leads := v_leads || to_jsonb(v_id::text);
    insert into public.lead_activities (lead_id, kind, body, created_at)
    select v_id, (array['whatsapp','llamada','nota'])[1 + s % 3],
           (array['Se le mandó información y precios', 'No contestó, se deja mensaje', 'Pidió que le marquen la próxima semana'])[1 + s % 3],
           now() - make_interval(days => 2 + r.intentos * 6 - s * 3)
      from generate_series(1, r.intentos) s;
    if r.prueba is not null then
      insert into public.lead_activities (lead_id, kind, body, created_at)
      values (v_id, 'prueba', 'Clase de prueba agendada: ' || to_char(v_g.fecha, 'DD/MM/YYYY'), now() - interval '1 day');
    end if;
  end loop;

  -- ── Progreso y retos: socios demo que se inscribieron voluntariamente
  insert into public.progress_profiles (member_id, private_on, public_on, weekly_goal, guardian_consent_at, created_at)
  select m.id, true, (row_number() over (order by m.id)) % 3 <> 0, 2 + (abs(hashtext(m.id::text)) % 2),
         case when coalesce(public.age_at(m.birthdate, hoy), 99) < 18 and (row_number() over (order by m.id)) % 3 <> 0 then now() - interval '20 days' end,
         now() - interval '25 days'
    from public.members m join public.families f on f.id = m.family_id
   where f.external_id like 'DEMO-%' and m.active
     and exists (select 1 from public.visits v where v.member_id = m.id and v.check_in_at > now() - interval '45 days')
   order by m.id limit 60
  on conflict (member_id) do nothing;

  insert into public.challenges (title, description, kind, target, department, collective, starts_on, ends_on, reward, created_at)
  values ('Reto de diciembre: 12 días', 'Ven al club al menos 12 días en diciembre. Cuentan clases, gimnasio y alberca.', 'dias', 12, null, false,
          date_trunc('month', hoy + 31)::date, (date_trunc('month', hoy + 31) + interval '1 month - 1 day')::date, 'Termo Oberlicht para quien lo complete', now() - interval '2 days')
  returning id into c_dic;
  insert into public.challenges (title, description, kind, target, department, collective, starts_on, ends_on, reward, created_at)
  values ('Noviembre constante', '10 días con actividad en noviembre.', 'dias', 10, null, false,
          date_trunc('month', hoy)::date, (date_trunc('month', hoy) + interval '1 month - 1 day')::date, '10% en la tienda', now() - interval '26 days')
  returning id into c_nov;
  insert into public.challenges (title, description, kind, target, department, collective, starts_on, ends_on, reward, created_at)
  values ('8 semanas seguidas', 'Cumple tu meta semanal 8 semanas. Una falta avisada no rompe la racha.', 'semanas', 8, null, false,
          hoy - 49, hoy + 14, 'Medalla especial y mención en el muro del club', now() - interval '50 days')
  returning id into c_sem;
  insert into public.challenges (title, description, kind, target, department, collective, starts_on, ends_on, reward, created_at)
  values ('Meta del club: 600 días', 'Entre todos los participantes sumemos 600 días de entrenamiento este mes.', 'dias', 600, null, true,
          date_trunc('month', hoy)::date, (date_trunc('month', hoy) + interval '1 month - 1 day')::date, 'Clase especial de fin de año para todos', now() - interval '26 days')
  returning id into c_club;
  insert into public.challenges (title, description, kind, target, department, collective, starts_on, ends_on, reward, created_at)
  values ('Natación: 2 habilidades nuevas', 'Logra 2 habilidades nuevas de tu nivel antes de vacaciones.', 'habilidades', 2, 'natacion', false,
          hoy - 110, hoy + 20, 'Gorra de natación', now() - interval '60 days')
  returning id into c_hab;
  v_retos := jsonb_build_array(c_dic, c_nov, c_sem, c_club, c_hab);

  insert into public.challenge_entries (challenge_id, member_id, joined_at)
  select c, pp.member_id, now() - interval '10 days'
    from public.progress_profiles pp join public.members m on m.id = pp.member_id join public.families f on f.id = m.family_id,
         unnest(array[c_nov, c_club, c_sem, c_dic]) c
   where f.external_id like 'DEMO-%' and (abs(hashtext(pp.member_id::text || c::text)) % 4) <> 0
  on conflict do nothing;
  insert into public.challenge_entries (challenge_id, member_id, joined_at)
  select c_hab, pp.member_id, now() - interval '40 days'
    from public.progress_profiles pp join public.members m on m.id = pp.member_id join public.families f on f.id = m.family_id
   where f.external_id like 'DEMO-%'
     and exists (select 1 from public.enrollments e join public.groups g on g.id = e.group_id join public.levels l on l.id = g.level_id
                  where e.member_id = pp.member_id and e.status = 'activa' and l.department = 'natacion')
  on conflict do nothing;

  -- Aplausos entre participantes públicos
  insert into public.kudos (from_member, to_member, kind, day, created_at)
  select a.member_id, b.member_id, (array['aplauso','fuego','fuerza','estrella'])[1 + (abs(hashtext(a.member_id::text || b.member_id::text)) % 4)],
         hoy - (abs(hashtext(b.member_id::text || a.member_id::text)) % 20), now() - make_interval(days => abs(hashtext(b.member_id::text || a.member_id::text)) % 20)
    from public.progress_profiles a join public.progress_profiles b on a.member_id <> b.member_id
   where a.public_on and b.public_on and (abs(hashtext(a.member_id::text || b.member_id::text)) % 9) = 0
  on conflict do nothing;

  update public.settings
     set value = jsonb_set(jsonb_set(value, '{ids,leads}', v_leads), '{ids,challenges}', v_retos) || '{"escuela_progreso": true}'
   where key = 'demo_data';
end $$;

select 'Demo escuela y progreso' as resultado,
       (select count(*) from public.skill_progress) habilidades_evaluadas, (select count(*) from public.report_cards) boletas,
       (select count(*) from public.certificates) certificados, (select count(*) from public.makeup_credits) reposiciones,
       (select count(*) from public.leads) prospectos, (select count(*) from public.retention_cases) casos_baja,
       (select count(*) from public.progress_profiles) en_progreso, (select count(*) from public.challenge_entries) inscripciones_retos,
       (select count(*) from public.kudos) aplausos;
