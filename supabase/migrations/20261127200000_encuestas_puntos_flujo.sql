-- ════════════════════════════════════════════════════════════════════
-- Ideas tomadas de ABC EVO (27 nov 2026), sin depender de proveedores:
--   1. Encuesta de satisfacción a familias (0 a 10 + comentario), con tablero
--      y seguimiento; una calificación baja sube el riesgo de baja.
--   2. Puntos Oberlicht: se ganan con rachas, medallas, retos, recomendaciones
--      y encuestas; se canjean en barra y tienda (punto de venta).
--   3. Flujo de caja y cuentas por pagar para Dirección y Administración.
-- Las reglas (puntos por acción, valor del punto, saldo en bancos) son de
-- EJEMPLO y se ajustan en settings: 'encuestas', 'puntos', 'flujo'.
-- ════════════════════════════════════════════════════════════════════

insert into public.settings (key, value, description) values
  ('encuestas', '{"puntos_por_responder":50,"dias_mostrar":30}', 'Encuesta de satisfacción: puntos por responder y días que se muestra a las familias'),
  ('puntos', '{"activo":true,"pesos_por_punto":0.10,"minimo_canje":100,"por_semana_racha":20,"por_medalla":50,"por_reto":150,"por_referido":500,"por_encuesta":50}',
   'Puntos Oberlicht: cuánto vale un punto en pesos, mínimo para canjear y puntos por cada logro (EJEMPLO, ajustable)'),
  ('flujo', '{"saldo_inicial":null,"fecha_saldo":null,"cobranza_esperada_pct":85}', 'Flujo de caja: saldo en bancos a una fecha y % de cobranza esperada para la proyección')
on conflict (key) do nothing;

-- ─────────────────────────────────────────────────────────────
-- 1. Encuestas de satisfacción
-- ─────────────────────────────────────────────────────────────
create table public.surveys (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  question    text not null default '¿Qué tan probable es que recomiendes Oberlicht a un amigo o familiar?',
  starts_on   date not null default public.today_mx(),
  ends_on     date,
  active      boolean not null default true,
  created_by  uuid references public.profiles(id) default auth.uid(),
  created_at  timestamptz not null default now(),
  check (ends_on is null or ends_on >= starts_on)
);

create table public.survey_responses (
  id            uuid primary key default gen_random_uuid(),
  survey_id     uuid not null references public.surveys(id) on delete cascade,
  family_id     uuid not null references public.families(id) on delete cascade,
  department    text references public.departments(code),
  score         int not null check (score between 0 and 10),
  comment       text,
  answered_by   uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at    timestamptz not null default now(),
  follow_status text check (follow_status in ('pendiente','atendida','no_aplica')),
  follow_note   text,
  followed_by   uuid references public.profiles(id) on delete set null,
  followed_at   timestamptz,
  unique (survey_id, family_id)
);
create index on public.survey_responses (family_id, created_at desc);
create index on public.survey_responses (created_at);

alter table public.surveys enable row level security;
alter table public.survey_responses enable row level security;
create policy "ver encuestas" on public.surveys for select to authenticated using (active or public.is_staff());
create policy "dirección crea encuestas" on public.surveys for insert to authenticated with check (public.is_manager());
create policy "dirección edita encuestas" on public.surveys for update to authenticated using (public.is_manager()) with check (public.is_manager());
create policy "ver respuestas" on public.survey_responses for select to authenticated
  using (public.is_front_office()
      or (public.my_role() = 'coordinador' and (department is null or public.has_department(department)))
      or family_id in (select public.my_family_ids()));

-- Clasificación NPS: 9-10 promotor, 7-8 neutral, 0-6 detractor
create or replace function public.nps_tipo(p_score int)
returns text language sql immutable as $$
  select case when p_score >= 9 then 'promotor' when p_score >= 7 then 'neutral' else 'detractor' end
$$;

-- Encuesta vigente que la familia del usuario aún no contesta (para el portal)
create or replace function public.encuesta_pendiente()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', s.id, 'titulo', s.title, 'pregunta', s.question,
                            'puntos', coalesce((public.setting('puntos')->>'por_encuesta')::int, 0) * (coalesce((public.setting('puntos')->>'activo')::boolean, true))::int,
                            'family_id', f.id)
    from public.surveys s
    cross join lateral (select id from public.my_family_ids() id limit 1) f
   where s.active and s.starts_on <= public.today_mx() and (s.ends_on is null or s.ends_on >= public.today_mx())
     and not exists (select 1 from public.survey_responses r where r.survey_id = s.id and r.family_id = f.id)
   order by s.starts_on desc
   limit 1
$$;

-- ─────────────────────────────────────────────────────────────
-- 2. Puntos Oberlicht (el saldo es de la familia; cada logro guarda quién lo ganó)
-- ─────────────────────────────────────────────────────────────
create table public.points_ledger (
  id          bigserial primary key,
  family_id   uuid not null references public.families(id) on delete cascade,
  member_id   uuid references public.members(id) on delete set null,
  points      int not null check (points <> 0),
  kind        text not null check (kind in ('racha','medalla','reto','referido','encuesta','canje','cancelacion','ajuste')),
  source_key  text,
  description text not null,
  sale_id     uuid references public.sales(id) on delete set null,
  created_by  uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now()
);
create unique index points_ledger_source on public.points_ledger (source_key) where source_key is not null;
create index on public.points_ledger (family_id, created_at desc);

alter table public.points_ledger enable row level security;
create policy "ver puntos" on public.points_ledger for select to authenticated
  using (public.is_seller() or family_id in (select public.my_family_ids()));

alter table public.sales add column if not exists points_used int not null default 0;
alter table public.sales add column if not exists points_discount numeric(10,2) not null default 0;

create or replace function public.saldo_puntos(p_family uuid)
returns int language sql stable security definer set search_path = public as $$
  select coalesce(sum(points), 0)::int from public.points_ledger where family_id = p_family
$$;

-- Acredita los puntos que falten (idempotente: cada logro tiene una clave única).
-- p_family nulo = todas las familias activas.
create or replace function public.acreditar_puntos(p_family uuid default null)
returns int language plpgsql security definer set search_path = public as $$
declare
  cfg jsonb := public.setting('puntos'); v_n int := 0; v_k int; m record; w jsonb; md jsonb; c record; r record;
  p_sem int; p_med int; p_reto int; p_ref int;
begin
  if not coalesce((cfg->>'activo')::boolean, true) then return 0; end if;
  p_sem := coalesce((cfg->>'por_semana_racha')::int, 0); p_med := coalesce((cfg->>'por_medalla')::int, 0);
  p_reto := coalesce((cfg->>'por_reto')::int, 0); p_ref := coalesce((cfg->>'por_referido')::int, 0);

  for m in select x.id, x.family_id, x.first_name from public.members x join public.families f on f.id = x.family_id
            where x.active and f.status <> 'inactiva' and (p_family is null or x.family_id = p_family) loop
    if p_sem > 0 then
      for w in select * from jsonb_array_elements((select semanas from public.racha_socio(m.id))) loop
        continue when w->>'estado' <> 'cumplida';
        insert into public.points_ledger (family_id, member_id, points, kind, source_key, description, created_by, created_at)
        values (m.family_id, m.id, p_sem, 'racha', 'racha:' || m.id || ':' || (w->>'semana'),
                m.first_name || ' cumplió su meta la semana del ' || to_char((w->>'semana')::date, 'DD/MM'), null,
                least(now(), ((w->>'semana')::date + 6)::timestamp at time zone 'America/Mexico_City' + interval '20 hours'))
        on conflict (source_key) where source_key is not null do nothing;
        get diagnostics v_k = row_count; v_n := v_n + v_k;
      end loop;
    end if;
    if p_med > 0 then
      for md in select * from jsonb_array_elements(public.medallas_socio(m.id)) loop
        continue when not (md->>'logrado')::boolean;
        insert into public.points_ledger (family_id, member_id, points, kind, source_key, description, created_by, created_at)
        values (m.family_id, m.id, p_med, 'medalla', 'medalla:' || m.id || ':' || (md->>'k'),
                m.first_name || ' ganó la medalla «' || (md->>'titulo') || '»', null,
                coalesce(least(now(), ((md->>'fecha')::date)::timestamp at time zone 'America/Mexico_City' + interval '20 hours'), now()))
        on conflict (source_key) where source_key is not null do nothing;
        get diagnostics v_k = row_count; v_n := v_n + v_k;
      end loop;
    end if;
    if p_reto > 0 then
      for c in select ch.id, ch.title, ch.target, ch.ends_on from public.challenge_entries e join public.challenges ch on ch.id = e.challenge_id
                where e.member_id = m.id and e.status = 'activo' and not ch.collective and ch.starts_on <= public.today_mx() loop
        if public.avance_reto(c.id, m.id) >= c.target then
          insert into public.points_ledger (family_id, member_id, points, kind, source_key, description, created_by)
          values (m.family_id, m.id, p_reto, 'reto', 'reto:' || m.id || ':' || c.id, m.first_name || ' completó el reto «' || c.title || '»', null)
          on conflict (source_key) where source_key is not null do nothing;
          get diagnostics v_k = row_count; v_n := v_n + v_k;
        end if;
      end loop;
    end if;
  end loop;

  if p_ref > 0 then
    for r in select rf.id, rf.referrer_family_id, rf.rewarded_at, f.name from public.referrals rf join public.families f on f.id = rf.referred_family_id
              where rf.status = 'recompensado' and (p_family is null or rf.referrer_family_id = p_family) loop
      insert into public.points_ledger (family_id, points, kind, source_key, description, created_by, created_at)
      values (r.referrer_family_id, p_ref, 'referido', 'referido:' || r.id, 'Recomendaste a ' || r.name, null, coalesce(r.rewarded_at, now()))
      on conflict (source_key) where source_key is not null do nothing;
      get diagnostics v_k = row_count; v_n := v_n + v_k;
    end loop;
  end if;
  return v_n;
end $$;

-- Saldo, reglas y movimientos de una familia (acredita lo pendiente primero)
create or replace function public.puntos_familia(p_family uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare cfg jsonb := public.setting('puntos'); v_saldo int; v_val numeric;
begin
  if not (public.is_seller() or public.is_staff() or p_family in (select public.my_family_ids())) then raise exception 'Sin permiso'; end if;
  perform public.acreditar_puntos(p_family);
  v_saldo := public.saldo_puntos(p_family);
  v_val := coalesce((cfg->>'pesos_por_punto')::numeric, 0.1);
  return jsonb_build_object(
    'activo', coalesce((cfg->>'activo')::boolean, true),
    'saldo', v_saldo, 'valor', round(v_saldo * v_val, 2), 'pesos_por_punto', v_val,
    'minimo_canje', coalesce((cfg->>'minimo_canje')::int, 0),
    'reglas', jsonb_build_object('racha', cfg->'por_semana_racha', 'medalla', cfg->'por_medalla', 'reto', cfg->'por_reto',
                                 'referido', cfg->'por_referido', 'encuesta', cfg->'por_encuesta'),
    'ganados', (select coalesce(sum(points), 0) from public.points_ledger where family_id = p_family and points > 0),
    'canjeados', (select coalesce(-sum(points), 0) from public.points_ledger where family_id = p_family and kind = 'canje'),
    'movimientos', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'puntos', points, 'tipo', kind, 'desc', description, 'fecha', created_at) order by created_at desc, id desc), '[]')
                      from (select * from public.points_ledger where family_id = p_family order by created_at desc, id desc limit 40) x)
  );
end $$;

-- Ajuste manual (Dirección o Administración), con motivo
create or replace function public.ajustar_puntos(p_family uuid, p_points int, p_reason text)
returns int language plpgsql security definer set search_path = public as $$
begin
  if not public.is_manager() then raise exception 'Solo Dirección o Administración ajustan puntos'; end if;
  if coalesce(p_points, 0) = 0 then raise exception 'Escribe cuántos puntos sumar o restar'; end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then raise exception 'Escribe el motivo del ajuste'; end if;
  if public.saldo_puntos(p_family) + p_points < 0 then raise exception 'La familia no tiene tantos puntos'; end if;
  insert into public.points_ledger (family_id, points, kind, description) values (p_family, p_points, 'ajuste', 'Ajuste: ' || btrim(p_reason));
  return public.saldo_puntos(p_family);
end $$;

-- Resumen del programa para el personal
create or replace function public.puntos_resumen()
returns jsonb language sql stable security definer set search_path = public as $$
  select case when public.is_seller() then jsonb_build_object(
    'emitidos', (select coalesce(sum(points), 0) from public.points_ledger where points > 0 and kind <> 'cancelacion'),
    'canjeados', (select coalesce(-sum(points), 0) from public.points_ledger where kind in ('canje','cancelacion')),
    'en_circulacion', (select coalesce(sum(points), 0) from public.points_ledger),
    'pesos_por_punto', coalesce((public.setting('puntos')->>'pesos_por_punto')::numeric, 0.1),
    'familias_con_saldo', (select count(*) from (select family_id from public.points_ledger group by family_id having sum(points) > 0) x),
    'canjes_mes', (select count(*) from public.points_ledger where kind = 'canje' and created_at >= date_trunc('month', now() at time zone 'America/Mexico_City') at time zone 'America/Mexico_City'),
    'por_tipo', (select coalesce(jsonb_object_agg(kind, n), '{}') from (select kind, sum(points) n from public.points_ledger where points > 0 and kind <> 'cancelacion' group by kind) x),
    'top', (select coalesce(jsonb_agg(jsonb_build_object('family_id', f.id, 'familia', f.name, 'numero', f.number, 'saldo', x.saldo) order by x.saldo desc), '[]')
              from (select family_id, sum(points) saldo from public.points_ledger group by family_id having sum(points) > 0 order by 2 desc limit 15) x
              join public.families f on f.id = x.family_id),
    'reglas', public.setting('puntos')
  ) end
$$;

-- Responder la encuesta (titular de la familia o recepción en su nombre)
create or replace function public.responder_encuesta(p_survey uuid, p_family uuid, p_score int, p_comment text default null, p_department text default null)
returns public.survey_responses language plpgsql security definer set search_path = public as $$
declare s public.surveys; v_r public.survey_responses; v_pts int;
begin
  if not (public.is_front_office() or p_family in (select public.my_family_ids())) then raise exception 'Sin permiso para responder por esta familia'; end if;
  select * into s from public.surveys where id = p_survey;
  if not found or not s.active or s.starts_on > public.today_mx() or (s.ends_on is not null and s.ends_on < public.today_mx()) then
    raise exception 'Esta encuesta ya no está abierta';
  end if;
  if p_score is null or p_score not between 0 and 10 then raise exception 'Elige una calificación del 0 al 10'; end if;
  if exists (select 1 from public.survey_responses where survey_id = p_survey and family_id = p_family) then
    raise exception 'Esta familia ya respondió la encuesta. ¡Gracias!';
  end if;
  insert into public.survey_responses (survey_id, family_id, department, score, comment, follow_status)
  values (p_survey, p_family, nullif(p_department, ''), p_score, nullif(btrim(coalesce(p_comment, '')), ''),
          case when p_score <= 6 then 'pendiente' end)
  returning * into v_r;
  v_pts := coalesce((public.setting('puntos')->>'por_encuesta')::int, 0);
  if v_pts > 0 and coalesce((public.setting('puntos')->>'activo')::boolean, true) then
    insert into public.points_ledger (family_id, points, kind, source_key, description)
    values (p_family, v_pts, 'encuesta', 'encuesta:' || v_r.id, 'Gracias por responder «' || s.title || '»')
    on conflict (source_key) where source_key is not null do nothing;
  end if;
  return v_r;
end $$;

-- Seguimiento a una respuesta (sobre todo calificaciones bajas)
create or replace function public.atender_respuesta(p_response uuid, p_status text, p_note text default null)
returns public.survey_responses language plpgsql security definer set search_path = public as $$
declare v_r public.survey_responses;
begin
  if p_status not in ('pendiente','atendida','no_aplica') then raise exception 'Estado no válido'; end if;
  select * into v_r from public.survey_responses where id = p_response for update;
  if not found then raise exception 'Respuesta no encontrada'; end if;
  if not (public.is_front_office() or (public.my_role() = 'coordinador' and (v_r.department is null or public.has_department(v_r.department)))) then
    raise exception 'Sin permiso';
  end if;
  update public.survey_responses set follow_status = p_status,
         follow_note = coalesce(nullif(btrim(coalesce(p_note, '')), ''), follow_note),
         followed_by = case when p_status = 'pendiente' then null else auth.uid() end,
         followed_at = case when p_status = 'pendiente' then null else now() end
   where id = p_response returning * into v_r;
  return v_r;
end $$;

-- Tablero de satisfacción: NPS, tendencia, áreas y pendientes
create or replace function public.encuestas_resumen(p_survey uuid default null, p_area text default null)
returns jsonb language sql stable security definer set search_path = public as $$
  with r as (
    select sr.*, public.nps_tipo(sr.score) tipo from public.survey_responses sr
     where (p_survey is null or sr.survey_id = p_survey) and (p_area is null or sr.department = p_area)
       and (public.is_front_office() or (public.my_role() = 'coordinador' and (sr.department is null or public.has_department(sr.department))))
  )
  select case when public.is_front_office() or public.my_role() = 'coordinador' then jsonb_build_object(
    'respuestas', (select count(*) from r),
    'promedio', (select round(avg(score), 1) from r),
    'promotores', (select count(*) from r where tipo = 'promotor'),
    'neutrales', (select count(*) from r where tipo = 'neutral'),
    'detractores', (select count(*) from r where tipo = 'detractor'),
    'nps', (select round(100.0 * (count(*) filter (where tipo = 'promotor') - count(*) filter (where tipo = 'detractor')) / nullif(count(*), 0)) from r),
    'familias_activas', (select count(*) from public.families where status = 'activa'),
    'pendientes', (select count(*) from r where follow_status = 'pendiente'),
    'distribucion', (select jsonb_agg(jsonb_build_object('score', g, 'n', (select count(*) from r where score = g)) order by g) from generate_series(0, 10) g),
    'por_mes', (select coalesce(jsonb_agg(jsonb_build_object('mes', mes, 'n', n, 'nps', nps, 'promedio', prom) order by mes), '[]') from (
                  select to_char(created_at at time zone 'America/Mexico_City', 'YYYY-MM') mes, count(*) n, round(avg(score), 1) prom,
                         round(100.0 * (count(*) filter (where tipo = 'promotor') - count(*) filter (where tipo = 'detractor')) / count(*)) nps
                    from r where created_at > now() - interval '12 months' group by 1) x),
    'por_area', (select coalesce(jsonb_agg(jsonb_build_object('area', department, 'n', n, 'nps', nps, 'promedio', prom) order by n desc), '[]') from (
                  select coalesce(department, 'general') department, count(*) n, round(avg(score), 1) prom,
                         round(100.0 * (count(*) filter (where tipo = 'promotor') - count(*) filter (where tipo = 'detractor')) / count(*)) nps
                    from r group by 1) x)
  ) end
$$;

-- ─────────────────────────────────────────────────────────────
-- Punto de venta con puntos
-- ─────────────────────────────────────────────────────────────
create or replace function public.vender_pos(p_items jsonb, p_method text, p_family uuid default null, p_member uuid default null,
                                             p_coupon text default null, p_points int default 0)
returns public.sales
language plpgsql security definer set search_path = public as $$
declare it jsonb; p public.products; v_sale public.sales; v_sub numeric := 0; v_disc numeric := 0; v_coupon uuid; d record;
        v_charge uuid; v_qty int; v_cats text; cfg jsonb := public.setting('puntos'); v_val numeric; v_pdisc numeric := 0; v_pts int := 0;
begin
  if not public.is_seller() then raise exception 'Tu usuario no puede registrar ventas'; end if;
  if jsonb_array_length(coalesce(p_items, '[]')) = 0 then raise exception 'Agrega al menos un producto'; end if;
  if p_member is not null and p_family is null then select family_id into p_family from public.members where id = p_member; end if;
  if p_method = 'cuenta' and p_family is null then raise exception 'Para cargar a la cuenta elige a la familia'; end if;

  for it in select * from jsonb_array_elements(p_items) loop
    v_qty := (it->>'qty')::int;
    if v_qty is null or v_qty <= 0 then raise exception 'Cantidad no válida'; end if;
    select * into p from public.products where id = (it->>'product_id')::uuid and active for update;
    if not found then raise exception 'Producto no disponible'; end if;
    if p.track_stock and p.stock < v_qty then raise exception 'No hay suficientes "%" (quedan %)', p.name, p.stock; end if;
    v_sub := v_sub + p.price * v_qty;
  end loop;

  if nullif(btrim(coalesce(p_coupon, '')), '') is not null then
    select * into d from public.cupon_calcular(p_coupon, 'tienda', v_sub, p_family);
    v_disc := d.descuento; v_coupon := d.coupon_id;
  end if;

  if coalesce(p_points, 0) > 0 then
    if not coalesce((cfg->>'activo')::boolean, true) then raise exception 'El programa de puntos está pausado'; end if;
    if p_family is null then raise exception 'Para pagar con puntos elige al socio'; end if;
    if p_points < coalesce((cfg->>'minimo_canje')::int, 0) then raise exception 'El mínimo para canjear es de % puntos', (cfg->>'minimo_canje'); end if;
    perform 1 from public.families where id = p_family for update;
    if public.saldo_puntos(p_family) < p_points then raise exception 'La familia solo tiene % puntos', public.saldo_puntos(p_family); end if;
    v_val := coalesce((cfg->>'pesos_por_punto')::numeric, 0.1);
    v_pdisc := least(v_sub - v_disc, round(p_points * v_val, 2));
    v_pts := ceil(v_pdisc / v_val)::int;
  end if;

  insert into public.sales (family_id, member_id, subtotal, discount, total, method, coupon_id, status, points_used, points_discount)
  values (p_family, p_member, v_sub, v_disc, v_sub - v_disc - v_pdisc, p_method, v_coupon,
          case when p_method = 'cuenta' and v_sub - v_disc - v_pdisc > 0 then 'a_cuenta' else 'pagada' end, v_pts, v_pdisc)
  returning * into v_sale;

  for it in select * from jsonb_array_elements(p_items) loop
    v_qty := (it->>'qty')::int;
    select * into p from public.products where id = (it->>'product_id')::uuid;
    insert into public.sale_items (sale_id, product_id, name, category, qty, unit_price, total)
    values (v_sale.id, p.id, p.name, p.category, v_qty, p.price, p.price * v_qty);
    if p.track_stock then
      update public.products set stock = stock - v_qty where id = p.id;
      insert into public.inventory_moves (product_id, qty, kind, sale_id) values (p.id, -v_qty, 'venta', v_sale.id);
    end if;
  end loop;

  if v_coupon is not null then
    insert into public.coupon_redemptions (coupon_id, family_id, sale_id, amount) values (v_coupon, p_family, v_sale.id, v_disc);
    update public.coupons set uses = uses + 1 where id = v_coupon;
  end if;

  if v_pts > 0 then
    insert into public.points_ledger (family_id, member_id, points, kind, source_key, description, sale_id)
    values (p_family, p_member, -v_pts, 'canje', 'canje:' || v_sale.id, 'Canje en barra y tienda · ticket ' || v_sale.folio, v_sale.id);
  end if;

  if p_method = 'cuenta' and v_sale.total > 0 then
    select string_agg(distinct case category when 'barra' then 'Barra' else 'Tienda' end, ' y ') into v_cats from public.sale_items where sale_id = v_sale.id;
    insert into public.charges (family_id, concept, amount, due_date, created_by)
    values (p_family, v_cats || ' · ticket ' || v_sale.folio, v_sale.total, public.today_mx() + 7, auth.uid()) returning id into v_charge;
    insert into public.charge_items (charge_id, member_id, department, description, amount, sat_product_key, sat_unit_key)
    select v_charge, p_member, case category when 'barra' then 'cafeteria' else 'tienda' end, name || ' x' || qty, total, '90101500', 'H87'
      from public.sale_items where sale_id = v_sale.id;
    if v_disc > 0 then insert into public.charge_items (charge_id, description, amount) values (v_charge, 'Descuento', -v_disc); end if;
    if v_pdisc > 0 then insert into public.charge_items (charge_id, description, amount) values (v_charge, 'Pagado con ' || v_pts || ' puntos', -v_pdisc); end if;
    update public.sales set charge_id = v_charge where id = v_sale.id returning * into v_sale;
  end if;
  return v_sale;
end $$;

-- La función anterior sigue funcionando (sin puntos)
create or replace function public.vender(p_items jsonb, p_method text, p_family uuid default null, p_member uuid default null, p_coupon text default null)
returns public.sales language sql security definer set search_path = public as $$
  select public.vender_pos(p_items, p_method, p_family, p_member, p_coupon, 0)
$$;

-- Cancelar una venta también regresa los puntos usados
create or replace function public.cancelar_venta(p_sale uuid, p_reason text)
returns public.sales
language plpgsql security definer set search_path = public as $$
declare s public.sales; it record;
begin
  if not (public.is_front_office() or public.my_role() = 'ventas') then raise exception 'Sin permiso para cancelar ventas'; end if;
  select * into s from public.sales where id = p_sale for update;
  if not found or s.status = 'cancelada' then raise exception 'La venta no existe o ya estaba cancelada'; end if;
  if not public.is_manager() and (s.created_at at time zone 'America/Mexico_City')::date <> public.today_mx() then
    raise exception 'Solo Dirección o Administración cancelan ventas de días anteriores';
  end if;
  for it in select si.* from public.sale_items si join public.products p on p.id = si.product_id and p.track_stock where si.sale_id = s.id loop
    update public.products set stock = stock + it.qty where id = it.product_id;
    insert into public.inventory_moves (product_id, qty, kind, sale_id, note) values (it.product_id, it.qty, 'cancelacion', s.id, p_reason);
  end loop;
  if s.charge_id is not null then
    update public.charges set status = 'cancelado' where id = s.charge_id and status in ('pendiente','vencido');
  end if;
  if s.coupon_id is not null then
    update public.coupons set uses = greatest(uses - 1, 0) where id = s.coupon_id;
    delete from public.coupon_redemptions where sale_id = s.id;
  end if;
  if s.points_used > 0 and s.family_id is not null then
    insert into public.points_ledger (family_id, member_id, points, kind, source_key, description, sale_id)
    values (s.family_id, s.member_id, s.points_used, 'cancelacion', 'cancelacion:' || s.id, 'Se regresan puntos del ticket ' || s.folio || ' (cancelado)', s.id)
    on conflict (source_key) where source_key is not null do nothing;
  end if;
  update public.sales set status = 'cancelada', cancelled_at = now(), cancel_reason = p_reason where id = s.id returning * into s;
  return s;
end $$;

-- ─────────────────────────────────────────────────────────────
-- 3. Flujo de caja y cuentas por pagar
-- ─────────────────────────────────────────────────────────────
create table public.payables (
  id             uuid primary key default gen_random_uuid(),
  supplier_id    uuid references public.suppliers(id) on delete set null,
  payee          text,
  category       text not null default 'otros' check (category in ('nomina','renta','servicios','mantenimiento','alberca','insumos','impuestos','marketing','honorarios','financiero','otros')),
  concept        text not null,
  amount         numeric(12,2) not null check (amount > 0),
  due_date       date not null,
  status         text not null default 'pendiente' check (status in ('pendiente','pagada','cancelada')),
  paid_on        date,
  paid_method    text check (paid_method in ('transferencia','efectivo','tarjeta','cheque','domiciliacion')),
  reference      text,
  invoice_number text,
  recurrence     text not null default 'no' check (recurrence in ('no','semanal','quincenal','mensual','bimestral','anual')),
  department     text references public.departments(code),
  notes          text,
  created_by     uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at     timestamptz not null default now(),
  check (status <> 'pagada' or paid_on is not null)
);
create index on public.payables (status, due_date);
create index on public.payables (paid_on);

alter table public.payables enable row level security;
create policy "dirección ve cuentas por pagar" on public.payables for select to authenticated using (public.is_manager());
create policy "dirección captura cuentas por pagar" on public.payables for insert to authenticated with check (public.is_manager());
create policy "dirección edita cuentas por pagar" on public.payables for update to authenticated using (public.is_manager()) with check (public.is_manager());

create or replace function public.siguiente_fecha(p_date date, p_rec text)
returns date language sql immutable as $$
  select case p_rec when 'semanal' then p_date + 7 when 'quincenal' then p_date + 15
                    when 'mensual' then (p_date + interval '1 month')::date when 'bimestral' then (p_date + interval '2 months')::date
                    when 'anual' then (p_date + interval '1 year')::date end
$$;

-- Marcar como pagada. Si se repite, deja lista la siguiente.
create or replace function public.pagar_cuenta(p_id uuid, p_fecha date default null, p_metodo text default 'transferencia', p_referencia text default null)
returns public.payables language plpgsql security definer set search_path = public as $$
declare v public.payables;
begin
  if not public.is_manager() then raise exception 'Solo Dirección o Administración registran pagos a proveedores'; end if;
  select * into v from public.payables where id = p_id for update;
  if not found or v.status <> 'pendiente' then raise exception 'Esta cuenta ya no está pendiente'; end if;
  update public.payables set status = 'pagada', paid_on = coalesce(p_fecha, public.today_mx()), paid_method = p_metodo,
         reference = coalesce(nullif(btrim(coalesce(p_referencia, '')), ''), reference)
   where id = p_id returning * into v;
  if v.recurrence <> 'no' and not exists (select 1 from public.payables x where x.concept = v.concept and x.status = 'pendiente'
                                              and x.due_date = public.siguiente_fecha(v.due_date, v.recurrence)) then
    insert into public.payables (supplier_id, payee, category, concept, amount, due_date, recurrence, department, notes)
    values (v.supplier_id, v.payee, v.category, v.concept, v.amount, public.siguiente_fecha(v.due_date, v.recurrence), v.recurrence, v.department, v.notes);
  end if;
  return v;
end $$;

-- Movimientos de dinero (ingresos y egresos ya ocurridos), en hora de México
create or replace function public.flujo_movimientos(p_desde date, p_hasta date)
returns table(fecha date, tipo text, categoria text, concepto text, monto numeric)
language sql stable security definer set search_path = public as $$
  select (p.paid_at at time zone 'America/Mexico_City')::date, 'ingreso', 'cobros', 'Pago ' || coalesce(f.name, ''), p.amount
    from public.payments p left join public.families f on f.id = p.family_id
   where p.status = 'aprobado' and (p.paid_at at time zone 'America/Mexico_City')::date between p_desde and p_hasta
  union all
  select (s.created_at at time zone 'America/Mexico_City')::date, 'ingreso', 'barra_tienda', 'Ticket ' || s.folio, s.total
    from public.sales s
   where s.status = 'pagada' and s.method <> 'cuenta' and s.total > 0 and (s.created_at at time zone 'America/Mexico_City')::date between p_desde and p_hasta
  union all
  select py.paid_on, 'egreso', py.category, py.concept, py.amount
    from public.payables py where py.status = 'pagada' and py.paid_on between p_desde and p_hasta
  union all
  select pu.paid_at, 'egreso', case when pu.area = 'alberca' then 'alberca' else 'mantenimiento' end,
         'Compra ' || coalesce(sp.name, '') || coalesce(' · ' || pu.invoice_number, ''), pu.total
    from public.purchases pu left join public.suppliers sp on sp.id = pu.supplier_id
   where pu.status = 'pagada' and pu.paid_at between p_desde and p_hasta
$$;

create or replace function public.flujo_resumen(p_meses int default 6)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  cfg jsonb := public.setting('flujo'); hoy date := public.today_mx(); v_mes date := date_trunc('month', public.today_mx())::date;
  v_desde date; v_saldo numeric; v_pct numeric; v_semana_ventas numeric; v_out jsonb; v_proy jsonb := '[]'; v_run numeric; w date; i int;
  v_in numeric; v_eg numeric; v_mens numeric; v_corte int;
begin
  if not public.is_manager() then raise exception 'Solo Dirección o Administración ven el flujo de caja'; end if;
  v_desde := (v_mes - make_interval(months => p_meses - 1))::date;
  v_pct := coalesce((cfg->>'cobranza_esperada_pct')::numeric, 85) / 100;

  if cfg->>'fecha_saldo' is not null and cfg->>'saldo_inicial' is not null then
    select (cfg->>'saldo_inicial')::numeric + coalesce(sum(case when tipo = 'ingreso' then monto else -monto end), 0) into v_saldo
      from public.flujo_movimientos(((cfg->>'fecha_saldo')::date) + 1, hoy);
  end if;

  -- Venta promedio semanal de barra y tienda (últimas 4 semanas) para la proyección
  select coalesce(sum(monto), 0) / 4 into v_semana_ventas from public.flujo_movimientos(hoy - 28, hoy - 1) where categoria = 'barra_tienda';

  v_corte := coalesce((public.setting('cobranza')->>'dia_corte')::int, 1);
  v_run := coalesce(v_saldo, 0);
  for i in 0..7 loop
    w := hoy + i * 7;
    -- Cargos ya generados que vencen esa semana, por el % de cobranza esperada
    select coalesce(sum(c.amount), 0) * v_pct into v_in from public.charges c
     where c.status = 'pendiente' and c.due_date between w and w + 6;
    -- Mensualidades que aún no se generan: se estiman con el último mes facturado
    select coalesce(sum(est), 0) * v_pct into v_mens from (
      select (select sum(c.amount) from public.charges c where c.status <> 'cancelado'
                 and c.period = (select max(c2.period) from public.charges c2 where c2.period is not null and c2.status <> 'cancelado')) est
        from generate_series(w, w + 6, interval '1 day') d
       where extract(day from d) = v_corte
         and not exists (select 1 from public.charges c where c.period = to_char(d, 'YYYY-MM') and c.status <> 'cancelado')) x;
    v_in := v_in + coalesce(v_mens, 0) + v_semana_ventas;
    -- Cuentas por pagar (las que se repiten se proyectan hacia adelante) y compras de mantenimiento por pagar
    with recursive occ(due, amount, rec, n) as (
      select py.due_date, py.amount, py.recurrence, 0 from public.payables py where py.status = 'pendiente'
      union all
      select public.siguiente_fecha(o.due, o.rec), o.amount, o.rec, o.n + 1 from occ o
       where o.rec <> 'no' and public.siguiente_fecha(o.due, o.rec) <= hoy + 55 and o.n < 60
    )
    select coalesce(sum(amount), 0) into v_eg from (
      select o.amount from occ o where o.due between w and w + 6 or (i = 0 and o.due < w)
      union all
      select pu.total from public.purchases pu where pu.status = 'por_pagar'
         and ((pu.invoice_date + 30) between w and w + 6 or (i = 0 and pu.invoice_date + 30 < w))) e;
    v_run := v_run + v_in - v_eg;
    v_proy := v_proy || jsonb_build_object('semana', w, 'entra', round(v_in, 2), 'mensualidades_estimadas', round(coalesce(v_mens, 0), 2),
                                           'sale', round(v_eg, 2), 'saldo', round(v_run, 2));
  end loop;

  v_out := jsonb_build_object(
    'saldo_inicial', cfg->'saldo_inicial', 'fecha_saldo', cfg->'fecha_saldo', 'saldo_actual', round(v_saldo, 2),
    'cobranza_esperada_pct', round(v_pct * 100),
    'meses', (select coalesce(jsonb_agg(jsonb_build_object('mes', to_char(mm, 'YYYY-MM'),
                 'cobros', coalesce((select sum(monto) from public.flujo_movimientos(mm::date, (mm + interval '1 month')::date - 1) x where x.categoria = 'cobros'), 0),
                 'ventas', coalesce((select sum(monto) from public.flujo_movimientos(mm::date, (mm + interval '1 month')::date - 1) x where x.categoria = 'barra_tienda'), 0),
                 'egresos', coalesce((select sum(monto) from public.flujo_movimientos(mm::date, (mm + interval '1 month')::date - 1) x where x.tipo = 'egreso'), 0)) order by mm), '[]')
               from generate_series(v_desde, v_mes, interval '1 month') mm),
    'categorias_mes', (select coalesce(jsonb_object_agg(categoria, total), '{}') from (
                         select categoria, sum(monto) total from public.flujo_movimientos(v_mes, hoy) where tipo = 'egreso' group by 1) x),
    'por_cobrar', (select coalesce(sum(amount), 0) from public.charges where status = 'pendiente'),
    'por_cobrar_vencido', (select coalesce(sum(amount), 0) from public.charges where status = 'vencido'),
    'por_pagar', (select coalesce(sum(amount), 0) from public.payables where status = 'pendiente')
                 + (select coalesce(sum(total), 0) from public.purchases where status = 'por_pagar'),
    'por_pagar_vencido', (select coalesce(sum(amount), 0) from public.payables where status = 'pendiente' and due_date < hoy),
    'por_pagar_7dias', (select coalesce(sum(amount), 0) from public.payables where status = 'pendiente' and due_date between hoy and hoy + 7),
    'venta_semanal_promedio', round(v_semana_ventas, 2),
    'proyeccion', v_proy
  );
  return v_out;
end $$;

-- Saldo en bancos para arrancar el flujo
create or replace function public.fijar_saldo_flujo(p_saldo numeric, p_fecha date, p_pct numeric default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  if not public.is_manager() then raise exception 'Solo Dirección o Administración'; end if;
  if p_fecha > public.today_mx() then raise exception 'La fecha del saldo no puede ser futura'; end if;
  update public.settings set value = value || jsonb_build_object('saldo_inicial', p_saldo, 'fecha_saldo', p_fecha)
           || case when p_pct is not null then jsonb_build_object('cobranza_esperada_pct', least(greatest(p_pct, 0), 100)) else '{}'::jsonb end,
         updated_at = now(), updated_by = auth.uid()
   where key = 'flujo' returning value into v;
  return v;
end $$;

-- ─────────────────────────────────────────────────────────────
-- Riesgo de baja: ahora también cuenta la última calificación de la familia
-- ─────────────────────────────────────────────────────────────
alter table public.churn_actions drop constraint if exists churn_actions_action_check;
alter table public.churn_actions add constraint churn_actions_action_check
  check (action in ('whatsapp','llamada_cobranza','llamada_bienvenida','boleta_coach','llamada_regreso','oferta_retencion','llamada_satisfaccion'));

create or replace function public.calcular_riesgo(p_area text default null)
returns table(member_id uuid, family_id uuid, nombre text, familia text, telefono text, area text, edad numeric,
              ultima_visita date, puntaje int, nivel text, factores jsonb, accion text, coach_id uuid)
language sql stable security definer set search_path = public as $$
  with act as (select a as member_id from public.activos_en(public.today_mx(), p_area) a),
  base as (
    select m.id, m.family_id, m.first_name || ' ' || m.last_name as nombre, f.name as familia,
           coalesce(f.phone, m.phone) as telefono, public.age_at(m.birthdate, public.today_mx()) as edad,
           (select l.department from public.enrollments e join public.groups g on g.id = e.group_id join public.levels l on l.id = g.level_id
             where e.member_id = m.id and e.status in ('activa','congelada') and (p_area is null or l.department = p_area) order by e.enrolled_at limit 1) as dep_e,
           (select p.department from public.memberships ms join public.plans p on p.id = ms.plan_id
             where ms.member_id = m.id and ms.status in ('activa','congelada') and (p_area is null or p.department = p_area) limit 1) as dep_m,
           (select g.coach_id from public.enrollments e join public.groups g on g.id = e.group_id
             where e.member_id = m.id and e.status = 'activa' order by e.enrolled_at limit 1) as coach_id,
           greatest((select max((v.check_in_at at time zone 'America/Mexico_City')::date) from public.visits v where v.member_id = m.id),
                    (select max(t.date) from public.attendance t where t.member_id = m.id and t.status in ('presente','retardo'))) as ultima,
           (select min(s.started) from public.suscripciones(p_area) s where s.member_id = m.id) as desde,
           (select count(*) filter (where t.status in ('presente','retardo'))::numeric / nullif(count(*), 0)
              from public.attendance t where t.member_id = m.id and t.date > public.today_mx() - 28) as tasa_rec,
           (select count(*) filter (where t.status in ('presente','retardo'))::numeric / nullif(count(*), 0)
              from public.attendance t where t.member_id = m.id and t.date <= public.today_mx() - 28 and t.date > public.today_mx() - 84) as tasa_prev,
           (select count(*) from public.attendance t where t.member_id = m.id and t.status = 'ausente' and t.date > public.today_mx() - 28) as faltas,
           coalesce((select fb.days_overdue from public.family_balances fb where fb.family_id = m.family_id and fb.balance > 0), 0) as dias_adeudo,
           exists (select 1 from public.enrollments e where e.member_id = m.id and e.status = 'congelada') as congelado,
           exists (select 1 from public.retention_cases rc where rc.member_id = m.id and rc.created_at > now() - interval '180 days') as pidio_baja,
           greatest((select max(lh.created_at)::date from public.level_history lh where lh.member_id = m.id),
                    (select max(sp.achieved_at)::date from public.skill_progress sp where sp.member_id = m.id)) as ultimo_avance,
           exists (select 1 from public.enrollments e join public.groups g on g.id = e.group_id join public.levels l on l.id = g.level_id
                    where e.member_id = m.id and e.status = 'activa' and l.department in ('natacion','ballet','gimnasia')) as escuela,
           (select sr.score from public.survey_responses sr where sr.family_id = m.family_id and sr.created_at > now() - interval '180 days'
             order by sr.created_at desc limit 1) as calif,
           (select sr.follow_status from public.survey_responses sr where sr.family_id = m.family_id and sr.created_at > now() - interval '180 days'
             order by sr.created_at desc limit 1) as calif_seguimiento
      from act join public.members m on m.id = act.member_id join public.families f on f.id = m.family_id
     where m.active
  ),
  fac as (
    select b.*, (public.today_mx() - coalesce(b.ultima, b.desde)) as dias_sin_venir,
      jsonb_strip_nulls(jsonb_build_array(
        case when public.today_mx() - coalesce(b.ultima, b.desde) >= 21 then jsonb_build_object('k','inactividad','p',30,'t','No viene hace ' || (public.today_mx() - coalesce(b.ultima, b.desde)) || ' días')
             when public.today_mx() - coalesce(b.ultima, b.desde) >= 14 then jsonb_build_object('k','inactividad','p',20,'t','No viene hace ' || (public.today_mx() - coalesce(b.ultima, b.desde)) || ' días')
             when public.today_mx() - coalesce(b.ultima, b.desde) >= 8 then jsonb_build_object('k','inactividad','p',8,'t','Una semana sin venir') end,
        case when b.tasa_prev > 0 and coalesce(b.tasa_rec, 0) < b.tasa_prev * 0.6 then jsonb_build_object('k','caida','p',20,'t','Asistencia bajó de ' || round(b.tasa_prev * 100) || '% a ' || round(coalesce(b.tasa_rec, 0) * 100) || '%') end,
        case when b.faltas >= 3 then jsonb_build_object('k','faltas','p',10,'t', b.faltas || ' faltas sin avisar en 4 semanas') end,
        case when b.dias_adeudo >= 30 then jsonb_build_object('k','adeudo','p',20,'t','Adeudo de ' || b.dias_adeudo || ' días')
             when b.dias_adeudo > 0 then jsonb_build_object('k','adeudo','p',12,'t','Pago atrasado ' || b.dias_adeudo || ' días') end,
        case when b.calif <= 4 then jsonb_build_object('k','encuesta','p', case when b.calif_seguimiento = 'atendida' then 12 else 25 end,'t','Calificó al club con ' || b.calif || ' de 10')
             when b.calif <= 6 then jsonb_build_object('k','encuesta','p', case when b.calif_seguimiento = 'atendida' then 8 else 15 end,'t','Calificó al club con ' || b.calif || ' de 10') end,
        case when b.desde > public.today_mx() - 90 then jsonb_build_object('k','nuevo','p',10,'t','Menos de 3 meses en el club') end,
        case when b.escuela and b.desde < public.today_mx() - 180 and coalesce(b.ultimo_avance, b.desde) < public.today_mx() - 180
             then jsonb_build_object('k','sin_avance','p',10,'t','Sin avance registrado en 6 meses') end,
        case when b.congelado then jsonb_build_object('k','congelado','p',10,'t','Tiene una clase congelada') end,
        case when b.pidio_baja then jsonb_build_object('k','pidio_baja','p',10,'t','Pidió la baja en los últimos 6 meses') end,
        case when b.edad between 13 and 17 then jsonb_build_object('k','edad','p',5,'t','Adolescente (mayor abandono)') end
      )) as fs
      from base b
  ),
  sc as (
    select fac.*, coalesce((select jsonb_agg(x order by (x->>'p')::int desc) from jsonb_array_elements(fac.fs) x where x <> 'null'::jsonb), '[]') as fs2
      from fac
  )
  select s.id, s.family_id, s.nombre, s.familia, s.telefono, coalesce(s.dep_e, s.dep_m), s.edad, s.ultima,
         least(100, coalesce((select sum((x->>'p')::int) from jsonb_array_elements(s.fs2) x), 0))::int as puntaje,
         case when least(100, coalesce((select sum((x->>'p')::int) from jsonb_array_elements(s.fs2) x), 0)) >= 50 then 'alto'
              when least(100, coalesce((select sum((x->>'p')::int) from jsonb_array_elements(s.fs2) x), 0)) >= 30 then 'medio' else 'bajo' end,
         s.fs2,
         case s.fs2->0->>'k'
           when 'adeudo' then 'llamada_cobranza' when 'nuevo' then 'llamada_bienvenida' when 'sin_avance' then 'boleta_coach'
           when 'congelado' then 'llamada_regreso' when 'pidio_baja' then 'oferta_retencion' when 'encuesta' then 'llamada_satisfaccion' else 'whatsapp' end,
         s.coach_id
    from sc s
   where jsonb_array_length(s.fs2) > 0
$$;

-- ─────────────────────────────────────────────────────────────
-- Rutina diaria: además acredita los puntos de todas las familias una vez al día
-- ─────────────────────────────────────────────────────────────
insert into public.settings (key, value, description) values
  ('puntos_corrida', '{"fecha":null}', 'Uso interno: último día en que se acreditaron puntos a todas las familias')
on conflict (key) do nothing;

create or replace function public.rutina_diaria()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_ofertas int; v_reac int; v_venc int; v_acc int := 0; v_pts int := 0;
begin
  if auth.uid() is null then return null; end if;
  v_reac := public.aplicar_vencimientos_retencion();
  v_ofertas := public.procesar_lista_espera();
  update public.makeup_credits set status = 'vencida' where status = 'disponible' and expires_on < public.today_mx();
  get diagnostics v_venc = row_count;
  update public.makeup_credits set status = 'usada' where status = 'agendada' and used_date < public.today_mx();
  if public.is_front_office() or public.my_role() = 'coordinador' then v_acc := public.generar_acciones_riesgo(); end if;
  if public.is_staff() and coalesce((public.setting('puntos_corrida')->>'fecha')::date, '2000-01-01') < public.today_mx() then
    update public.settings set value = jsonb_build_object('fecha', public.today_mx()), updated_at = now() where key = 'puntos_corrida';
    v_pts := public.acreditar_puntos(null);
  end if;
  return jsonb_build_object('ofertas', v_ofertas, 'reactivados', v_reac, 'creditos_vencidos', v_venc, 'acciones', v_acc, 'puntos', v_pts);
end $$;

-- ─────────────────────────────────────────────────────────────
-- Permisos
-- ─────────────────────────────────────────────────────────────
do $$
declare f text;
begin
  foreach f in array array[
    'encuesta_pendiente()', 'responder_encuesta(uuid, uuid, int, text, text)', 'atender_respuesta(uuid, text, text)', 'encuestas_resumen(uuid, text)',
    'puntos_familia(uuid)', 'ajustar_puntos(uuid, int, text)', 'puntos_resumen()',
    'vender_pos(jsonb, text, uuid, uuid, text, int)', 'vender(jsonb, text, uuid, uuid, text)', 'cancelar_venta(uuid, text)',
    'pagar_cuenta(uuid, date, text, text)', 'flujo_resumen(int)', 'fijar_saldo_flujo(numeric, date, numeric)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  foreach f in array array['acreditar_puntos(uuid)', 'saldo_puntos(uuid)', 'flujo_movimientos(date, date)', 'calcular_riesgo(text)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
end $$;

grant select on public.surveys, public.survey_responses, public.points_ledger, public.payables to authenticated;
grant insert, update on public.surveys, public.payables to authenticated;
