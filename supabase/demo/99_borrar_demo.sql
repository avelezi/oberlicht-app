-- ════════════════════════════════════════════════════════════════════
-- Borra TODOS los datos de demostración (01_personal_demo.sql, 02_datos_demo.sql y 03_demo_escuela_y_progreso.sql).
-- No toca familias, personal ni catálogo reales: solo lo marcado como demo
-- (familias DEMO-###, correos @demo.oberlicht.mx y los ids en settings 'demo_data').
-- ════════════════════════════════════════════════════════════════════

do $$
declare
  reg jsonb := (select value from public.settings where key = 'demo_data');
  ids jsonb := coalesce(reg->'ids', '{}');
  a0 bigint := (select coalesce(max(id), 0) from public.audit_log);
  staff uuid[] := array(select id from public.profiles where email like '%@demo.oberlicht.mx');
  fk record;
begin
  -- Ventas y cupones (antes que las familias)
  delete from public.coupon_redemptions where id in (select (jsonb_array_elements_text(ids->'coupon_redemptions'))::uuid);
  delete from public.sales where id in (select (jsonb_array_elements_text(ids->'sales'))::uuid);
  delete from public.invoices where id in (select (jsonb_array_elements_text(ids->'invoices'))::uuid);

  -- Escuela, retención y progreso (03_demo_escuela_y_progreso.sql)
  delete from public.challenges where id in (select (jsonb_array_elements_text(ids->'challenges'))::uuid);
  delete from public.leads where id in (select (jsonb_array_elements_text(ids->'leads'))::uuid) or notes like '[DEMO]%';

  -- Familias demo: arrastra socios, inscripciones, entradas, asistencia, cargos, pagos, casilleros rentados, privadas, referidos…
  delete from public.families where external_id like 'DEMO-%';

  delete from public.coupons where id in (select (jsonb_array_elements_text(ids->'coupons'))::uuid);
  delete from public.products where id in (select (jsonb_array_elements_text(ids->'products'))::uuid);
  delete from public.lockers where id in (select (jsonb_array_elements_text(ids->'lockers'))::uuid);
  delete from public.slots where id in (select (jsonb_array_elements_text(ids->'slots'))::uuid);
  delete from public.announcements where id in (select (jsonb_array_elements_text(ids->'announcements'))::uuid);
  delete from public.notifications where id in (select (jsonb_array_elements_text(ids->'notifications'))::uuid);
  delete from public.import_batches where id in (select (jsonb_array_elements_text(ids->'import_batches'))::uuid);

  -- Mantenimiento
  delete from public.purchases where id in (select (jsonb_array_elements_text(ids->'purchases'))::uuid);
  delete from public.work_orders where id in (select (jsonb_array_elements_text(ids->'work_orders'))::uuid);
  delete from public.supplier_prices where id in (select (jsonb_array_elements_text(ids->'supplier_prices'))::uuid);
  delete from public.supplies where id in (select (jsonb_array_elements_text(ids->'supplies'))::uuid);
  delete from public.suppliers where id in (select (jsonb_array_elements_text(ids->'suppliers'))::uuid);
  delete from public.pool_logs where id in (select (jsonb_array_elements_text(ids->'pool_logs'))::uuid);
  delete from public.maint_tasks where id in (select (jsonb_array_elements_text(ids->'maint_tasks'))::uuid);
  delete from public.maint_assets where id in (select (jsonb_array_elements_text(ids->'maint_assets'))::uuid);
  update public.maint_tasks t set last_done_on = (o->>'last_done_on')::date, next_due_on = (o->>'next_due_on')::date,
         assigned_to = (o->>'assigned_to')::uuid
    from jsonb_array_elements(coalesce(reg->'tareas_originales', '[]')) o where t.id = (o->>'id')::uuid;

  -- Personal demo: quitar sus referencias en lo que quede y borrar sus cuentas
  for fk in
    select c.conrelid::regclass as tbl, a.attname as col, a.attnotnull as notnull
      from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
     where c.contype = 'f' and c.confrelid = 'public.profiles'::regclass and c.connamespace = 'public'::regnamespace
       and c.confdeltype <> 'c'
  loop
    if fk.notnull then
      execute format('delete from %s where %I = any($1)', fk.tbl, fk.col) using staff;
    else
      execute format('update %s set %I = null where %I = any($1)', fk.tbl, fk.col, fk.col) using staff;
    end if;
  end loop;
  delete from public.instructor_rates where profile_id = any(staff);
  delete from public.profile_departments where profile_id = any(staff);
  delete from public.profiles where id = any(staff);
  delete from auth.users where email like '%@demo.oberlicht.mx';
  delete from public.staff_invites where email like '%@demo.oberlicht.mx';

  delete from public.settings where key = 'demo_data';
  delete from public.audit_log where id > a0;

  -- Si ya no queda nada real, los folios vuelven a empezar
  if not exists (select 1 from public.families) then perform setval('public.family_number_seq', 1000, true); end if;
  if not exists (select 1 from public.sales) then perform setval('public.sale_folio_seq', 1, false); end if;
  if not exists (select 1 from public.work_orders) then perform setval('public.work_order_seq', 1, false); end if;
end $$;

select 'Datos demo borrados' as resultado,
       (select count(*) from public.families) as familias, (select count(*) from public.visits) as entradas,
       (select count(*) from public.sales) as ventas, (select count(*) from public.profiles) as personal;
