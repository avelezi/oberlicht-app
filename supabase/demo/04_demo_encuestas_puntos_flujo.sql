-- ════════════════════════════════════════════════════════════════════
-- Datos demo de «Encuestas de satisfacción», «Puntos Oberlicht» y «Flujo de caja».
-- Requiere 01, 02 y 03. Respuestas y puntos cuelgan de las familias DEMO-### y se
-- borran con ellas; encuestas y cuentas por pagar demo quedan registradas en
-- settings 'demo_data' para borrarlas con 99_borrar_demo.sql.
-- ════════════════════════════════════════════════════════════════════
do $$
declare
  hoy date := public.today_mx();
  s_ago uuid; s_nov uuid; r record; v_score int; v_dep text; v_when timestamptz; v_id uuid; v_note text;
  v_pay jsonb := '[]'; d date; m date; i int; v_amt numeric; v_status text;
  com_pro text[] := array['Los coaches son excelentes, mis hijos aman venir.', 'Muy limpio y organizado.', 'Se nota el avance de mi hija en natación.',
                          'La atención en recepción es muy amable.', 'Nos encanta la app para reservar.', 'Excelente ambiente familiar.', '', '', ''];
  com_neu text[] := array['Todo bien, pero el estacionamiento se llena.', 'Me gustaría más horarios en la tarde.', 'Buen servicio, algo caro.',
                          'La alberca a veces está fría.', '', ''];
  com_det text[] := array['Cambiaron al coach sin avisar.', 'Los vestidores necesitan mantenimiento.', 'Se cancelan clases muy seguido.',
                          'Subieron la mensualidad sin explicar.', 'No me contestan por WhatsApp.', 'Mi hijo no ha avanzado de nivel en meses.'];
  notas text[] := array['Se llamó a la familia y se ofreció cambio de horario.', 'Se habló con la coordinadora del área; ya se corrigió.',
                        'Se ofreció una clase de reposición sin costo.', 'Se explicó el ajuste de precio; quedaron conformes.'];
begin
  if not exists (select 1 from public.settings where key = 'demo_data') then raise exception 'Primero corre 01, 02 y 03'; end if;
  if exists (select 1 from public.settings where key = 'demo_data' and value ? 'encuestas_flujo') then
    raise notice 'Los datos demo de encuestas, puntos y flujo ya estaban cargados'; return;
  end if;
  perform setseed(0.41);

  -- ── Encuestas
  insert into public.surveys (title, starts_on, ends_on, active, created_by)
  values ('Satisfacción · agosto 2026', '2026-08-01', '2026-08-31', true, null) returning id into s_ago;
  insert into public.surveys (title, starts_on, ends_on, active, created_by)
  values ('Satisfacción · noviembre 2026', hoy - 17, hoy + 13, true, null) returning id into s_nov;

  for r in select f.id, f.titular_profile_id, row_number() over (order by f.number) rn from public.families f
            where f.external_id like 'DEMO-%' and f.status = 'activa' loop
    for i in 1..2 loop
      continue when random() > (case i when 1 then 0.55 else 0.48 end);
      -- noviembre sale un poco mejor que agosto
      v_score := case
        when random() < (case i when 1 then 0.42 else 0.52 end) then 9 + (random() < 0.5)::int
        when random() < 0.55 then 7 + (random() < 0.5)::int
        else (array[2,3,4,5,5,6,6,6])[1 + floor(random() * 8)::int] end;
      select l.department into v_dep from public.members mm join public.enrollments e on e.member_id = mm.id and e.status = 'activa'
        join public.groups g on g.id = e.group_id join public.levels l on l.id = g.level_id where mm.family_id = r.id order by random() limit 1;
      if v_dep is null then
        select p.department into v_dep from public.members mm join public.memberships ms on ms.member_id = mm.id and ms.status = 'activa'
          join public.plans p on p.id = ms.plan_id where mm.family_id = r.id order by random() limit 1;
      end if;
      v_when := case i when 1 then timestamp '2026-08-02 10:00' + make_interval(days => floor(random() * 28)::int, hours => floor(random() * 10)::int)
                      else (hoy - floor(random() * 17)::int)::timestamp + make_interval(hours => 9 + floor(random() * 11)::int) end at time zone 'America/Mexico_City';
      v_note := case when v_score <= 6 and (i = 1 or random() < 0.4) then notas[1 + floor(random() * 4)::int] end;
      insert into public.survey_responses (survey_id, family_id, department, score, comment, answered_by, created_at, follow_status, follow_note, followed_at)
      values (case i when 1 then s_ago else s_nov end, r.id, v_dep, v_score,
              nullif(case when v_score >= 9 then com_pro[1 + floor(random() * 9)::int] when v_score >= 7 then com_neu[1 + floor(random() * 6)::int]
                          else com_det[1 + floor(random() * 6)::int] end, ''),
              r.titular_profile_id, v_when,
              case when v_score <= 6 then case when v_note is not null then 'atendida' else 'pendiente' end end,
              v_note, case when v_note is not null then v_when + interval '2 days' end)
      returning id into v_id;
      insert into public.points_ledger (family_id, points, kind, source_key, description, created_by, created_at)
      values (r.id, coalesce((public.setting('puntos')->>'por_encuesta')::int, 50), 'encuesta', 'encuesta:' || v_id,
              'Gracias por responder la encuesta', null, v_when)
      on conflict do nothing;
    end loop;
  end loop;

  -- ── Puntos: rachas, medallas, retos y recomendaciones de las familias demo
  for r in select id from public.families where external_id like 'DEMO-%' loop
    perform public.acreditar_puntos(r.id);
  end loop;
  -- Algunos canjes en barra y tienda
  for r in select x.family_id, x.saldo from (select pl.family_id, sum(pl.points) saldo from public.points_ledger pl
             join public.families f on f.id = pl.family_id where f.external_id like 'DEMO-%' group by 1) x
           where x.saldo >= 400 order by random() limit 22 loop
    v_amt := (array[100, 150, 200, 250, 300, 400])[1 + floor(random() * 6)::int];
    insert into public.points_ledger (family_id, points, kind, description, created_by, created_at)
    values (r.family_id, -least(v_amt, r.saldo)::int, 'canje', 'Canje en barra y tienda', null, now() - make_interval(days => floor(random() * 25)::int, hours => floor(random() * 8)::int));
  end loop;

  -- ── Cuentas por pagar: junio a noviembre pagadas; lo que sigue, pendiente
  m := '2026-06-01';
  while m <= date_trunc('month', hoy)::date loop
    -- nómina quincenal
    foreach d in array array[m + 14, (m + interval '1 month')::date - 1] loop
      v_amt := case when m < '2026-09-01' then 62000 else 66500 end;
      insert into public.payables (payee, category, concept, amount, due_date, status, paid_on, paid_method, recurrence, notes, created_by, created_at)
      values ('Personal del club', 'nomina', 'Nómina quincenal', v_amt, d, case when d < hoy then 'pagada' else 'pendiente' end,
              case when d < hoy then d end, case when d < hoy then 'transferencia' end, 'quincenal', '[DEMO]', null, d - 10)
      returning id into v_id; v_pay := v_pay || to_jsonb(v_id);
    end loop;
    for r in select * from (values
        ('Inmobiliaria del Valle', 'renta', 'Renta del inmueble', 45000::numeric, 5, 0::numeric),
        ('CFE', 'servicios', 'Luz', 17500, 12, 3500),
        ('Organismo de agua', 'servicios', 'Agua', 5800, 18, 900),
        ('Gas del Centro', 'alberca', 'Gas para calentar la alberca', 9200, 20, 2500),
        ('Telmex', 'servicios', 'Internet y teléfono', 1899, 8, 0),
        ('Despacho Contable Ríos', 'honorarios', 'Honorarios del contador', 7500, 3, 0),
        ('SAT', 'impuestos', 'ISR e IVA del mes anterior', 14000, 17, 4000),
        ('Meta', 'marketing', 'Anuncios en redes sociales', 6000, 25, 1500),
        ('Distribuidora Saludable', 'insumos', 'Insumos de barra', 8200, 22, 2000)
      ) t(payee, cat, concept, base, dia, var) loop
      d := m + (r.dia - 1);
      v_amt := round(r.base + (random() - 0.4) * r.var);
      v_status := case when d < hoy then 'pagada' else 'pendiente' end;
      -- dos cuentas de noviembre se quedan vencidas para mostrar la alerta
      if d < hoy and m = date_trunc('month', hoy)::date and r.concept in ('Luz', 'Insumos de barra') then v_status := 'pendiente'; end if;
      insert into public.payables (payee, category, concept, amount, due_date, status, paid_on, paid_method, recurrence, notes, created_by, created_at)
      values (r.payee, r.cat, r.concept, v_amt, d, v_status, case when v_status = 'pagada' then d end,
              case when v_status = 'pagada' then (case when r.cat in ('servicios','marketing') then 'domiciliacion' else 'transferencia' end) end,
              'mensual', '[DEMO]', null, d - 15)
      returning id into v_id; v_pay := v_pay || to_jsonb(v_id);
    end loop;
    m := (m + interval '1 month')::date;
  end loop;
  -- Lo que viene: la siguiente de cada cuenta que se repite (si su última ya se pagó)
  for r in select distinct on (concept) * from public.payables where notes = '[DEMO]' and recurrence <> 'no' order by concept, due_date desc loop
    continue when r.status = 'pendiente';
    insert into public.payables (payee, category, concept, amount, due_date, recurrence, notes, created_by)
    values (r.payee, r.category, r.concept, r.amount, public.siguiente_fecha(r.due_date, r.recurrence), r.recurrence, '[DEMO]', null)
    returning id into v_id; v_pay := v_pay || to_jsonb(v_id);
  end loop;
  -- Gastos únicos
  insert into public.payables (payee, category, concept, amount, due_date, notes, created_by) values
    ('Uniformes Deportivos MX', 'otros', 'Uniformes del equipo de natación', 12500, hoy + 13, '[DEMO]', null) returning id into v_id; v_pay := v_pay || to_jsonb(v_id);
  insert into public.payables (payee, category, concept, amount, due_date, notes, created_by) values
    ('Termotecnia', 'mantenimiento', 'Servicio anual de calderas', 18900, hoy + 24, '[DEMO]', null) returning id into v_id; v_pay := v_pay || to_jsonb(v_id);
  insert into public.payables (payee, category, concept, amount, due_date, notes, created_by) values
    ('Personal del club', 'nomina', 'Aguinaldos', 128000, '2026-12-19', '[DEMO]', null) returning id into v_id; v_pay := v_pay || to_jsonb(v_id);

  -- Saldo en bancos de ejemplo (solo si el club no ha capturado el suyo)
  if (select value->>'fecha_saldo' from public.settings where key = 'flujo') is null then
    update public.settings set value = value || '{"saldo_inicial":420000,"fecha_saldo":"2026-05-31"}' where key = 'flujo';
    update public.settings set value = value || '{"flujo_saldo_demo": true}' where key = 'demo_data';
  end if;

  update public.settings
     set value = jsonb_set(jsonb_set(value, '{ids,payables}', v_pay), '{ids,surveys}', jsonb_build_array(s_ago, s_nov)) || '{"encuestas_flujo": true}'
   where key = 'demo_data';
end $$;

select 'Demo encuestas, puntos y flujo' as resultado,
       (select count(*) from public.survey_responses) respuestas,
       (select count(*) from public.points_ledger) movimientos_puntos,
       (select coalesce(sum(points), 0) from public.points_ledger) puntos_en_circulacion,
       (select count(*) from public.payables) cuentas_por_pagar;
