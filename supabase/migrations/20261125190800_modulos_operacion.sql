-- Módulos de operación elegidos por Dirección:
--   · Punto de venta de barra y tienda con inventario
--   · Cupones, promociones y referidos
--   · Clases privadas con comisión para instructores
--   · Casilleros
--   · Recordatorios (WhatsApp / correo) y seguimiento de alumnos que dejan de venir

create or replace function public.is_seller()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role in ('direccion','administracion','recepcion','ventas') from public.profiles where id = auth.uid() and active), false)
$$;

insert into public.settings (key, value, description) values
  ('privadas', '{"precio":450,"comision_pct":40,"duracion_min":60,"comision_no_asistio":true}', 'Clases privadas: precio y comisión por defecto'),
  ('referidos', '{"tipo":"monto","valor":300,"aplica":"mensualidad","vigencia_dias":90}', 'Recompensa para la familia que recomienda (se activa con el primer pago de la familia nueva)'),
  ('recordatorios', '{"dias_antes_pago":3,"dias_inactividad":14,"dias_aviso_casillero":5,"whatsapp_proveedor":"pendiente","correo_proveedor":"pendiente"}', 'Recordatorios a familias')
on conflict (key) do nothing;

-- ─────────────────────────────────────────────────────────────
-- Cupones y referidos
-- ─────────────────────────────────────────────────────────────
create table public.coupons (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique check (code = upper(code) and code ~ '^[A-Z0-9-]{3,30}$'),
  description text not null default '',
  kind        text not null default 'porcentaje' check (kind in ('porcentaje','monto')),
  value       numeric(10,2) not null check (value > 0),
  applies_to  text not null default 'todo' check (applies_to in ('todo','mensualidad','inscripcion','tienda','privadas','casilleros')),
  starts_on   date,
  ends_on     date,
  max_uses    int check (max_uses > 0),
  uses        int not null default 0,
  once_per_family boolean not null default true,
  family_id   uuid references public.families(id) on delete cascade,  -- cupón exclusivo de una familia (p. ej. recompensa de referido)
  active      boolean not null default true,
  created_by  uuid references public.profiles(id) default auth.uid(),
  created_at  timestamptz not null default now(),
  check (kind <> 'porcentaje' or value <= 100)
);

create table public.coupon_redemptions (
  id          uuid primary key default gen_random_uuid(),
  coupon_id   uuid not null references public.coupons(id) on delete cascade,
  family_id   uuid references public.families(id) on delete set null,
  charge_id   uuid references public.charges(id) on delete set null,
  sale_id     uuid,
  amount      numeric(10,2) not null,
  created_by  uuid references public.profiles(id) default auth.uid(),
  created_at  timestamptz not null default now()
);
create index on public.coupon_redemptions (coupon_id);

create table public.referrals (
  id                 uuid primary key default gen_random_uuid(),
  referrer_family_id uuid not null references public.families(id) on delete cascade,
  referred_family_id uuid not null unique references public.families(id) on delete cascade,
  status             text not null default 'pendiente' check (status in ('pendiente','recompensado','cancelado')),
  reward_coupon_id   uuid references public.coupons(id) on delete set null,
  created_by         uuid references public.profiles(id) default auth.uid(),
  created_at         timestamptz not null default now(),
  rewarded_at        timestamptz,
  check (referrer_family_id <> referred_family_id)
);

alter table public.coupons enable row level security;
alter table public.coupon_redemptions enable row level security;
alter table public.referrals enable row level security;
create policy "ver cupones" on public.coupons for select to authenticated
  using (public.is_seller() or family_id in (select public.my_family_ids()));
create policy "dirección gestiona cupones" on public.coupons for all to authenticated
  using (public.is_manager()) with check (public.is_manager());
create policy "ver canjes" on public.coupon_redemptions for select to authenticated
  using (public.is_seller() or family_id in (select public.my_family_ids()));
create policy "ver referidos" on public.referrals for select to authenticated
  using (public.is_front_office() or referrer_family_id in (select public.my_family_ids()));
create policy "dirección corrige referidos" on public.referrals for update to authenticated
  using (public.is_manager()) with check (public.is_manager());

-- Calcula el descuento de un cupón sin aplicarlo. Lanza un mensaje claro si no se puede usar.
create or replace function public.cupon_calcular(p_code text, p_scope text, p_amount numeric, p_family uuid)
returns table(coupon_id uuid, descuento numeric, descripcion text)
language plpgsql stable security definer set search_path = public as $$
declare c public.coupons;
begin
  select * into c from public.coupons where code = upper(btrim(p_code));
  if not found or not c.active then raise exception 'El cupón % no existe o ya no está activo', upper(btrim(p_code)); end if;
  if c.starts_on is not null and public.today_mx() < c.starts_on then raise exception 'El cupón empieza a valer el %', to_char(c.starts_on, 'DD/MM/YYYY'); end if;
  if c.ends_on is not null and public.today_mx() > c.ends_on then raise exception 'El cupón venció el %', to_char(c.ends_on, 'DD/MM/YYYY'); end if;
  if c.max_uses is not null and c.uses >= c.max_uses then raise exception 'El cupón ya se usó todas las veces permitidas'; end if;
  if c.applies_to <> 'todo' and c.applies_to <> p_scope then raise exception 'Este cupón solo aplica a %', c.applies_to; end if;
  if c.family_id is not null and c.family_id is distinct from p_family then raise exception 'Este cupón es exclusivo de otra familia'; end if;
  if c.once_per_family and p_family is not null and exists (select 1 from public.coupon_redemptions r where r.coupon_id = c.id and r.family_id = p_family) then
    raise exception 'Esta familia ya usó el cupón';
  end if;
  coupon_id := c.id;
  descuento := least(p_amount, round(case when c.kind = 'porcentaje' then p_amount * c.value / 100 else c.value end, 2));
  descripcion := coalesce(nullif(c.description, ''), c.code);
  return next;
end $$;

-- Tipo de cargo para validar cupones
create or replace function public.cargo_tipo(c public.charges)
returns text language sql immutable as $$
  select case when c.period is not null then 'mensualidad'
              when c.concept ilike '%inscrip%' then 'inscripcion'
              when c.concept ilike 'clase privada%' then 'privadas'
              when c.concept ilike 'casillero%' then 'casilleros'
              when c.concept ilike 'barra%' or c.concept ilike 'tienda%' then 'tienda'
              else 'otro' end
$$;

create or replace function public.aplicar_cupon_cargo(p_charge uuid, p_code text)
returns public.charges
language plpgsql security definer set search_path = public as $$
declare c public.charges; d record;
begin
  if not public.is_front_office() then raise exception 'Solo recepción o administración aplican cupones'; end if;
  select * into c from public.charges where id = p_charge for update;
  if not found or c.status not in ('pendiente','vencido') then raise exception 'Solo se aplican cupones a cargos pendientes'; end if;
  select * into d from public.cupon_calcular(p_code, public.cargo_tipo(c), c.amount, c.family_id);
  insert into public.charge_items (charge_id, description, amount) values (c.id, 'Descuento: ' || d.descripcion, -d.descuento);
  update public.charges set amount = amount - d.descuento where id = c.id returning * into c;
  insert into public.coupon_redemptions (coupon_id, family_id, charge_id, amount) values (d.coupon_id, c.family_id, c.id, d.descuento);
  update public.coupons set uses = uses + 1 where id = d.coupon_id;
  if c.amount = 0 then update public.charges set status = 'pagado', paid_at = now() where id = c.id returning * into c; end if;
  return c;
end $$;

create or replace function public.registrar_referido(p_referrer uuid, p_referred uuid)
returns public.referrals
language plpgsql security definer set search_path = public as $$
declare r public.referrals;
begin
  if not public.is_front_office() then raise exception 'Solo recepción o administración registran recomendaciones'; end if;
  if exists (select 1 from public.payments where family_id = p_referred and status = 'aprobado') then
    raise exception 'La familia nueva ya pagó antes; la recomendación se registra al darla de alta';
  end if;
  insert into public.referrals (referrer_family_id, referred_family_id) values (p_referrer, p_referred) returning * into r;
  return r;
end $$;

-- Al primer pago de una familia recomendada, se genera el cupón de recompensa para quien la recomendó
create or replace function public.premiar_referido()
returns trigger language plpgsql security definer set search_path = public as $$
declare r public.referrals; cfg jsonb; v_code text; v_coupon uuid;
begin
  if new.status <> 'aprobado' then return new; end if;
  select * into r from public.referrals where referred_family_id = new.family_id and status = 'pendiente' for update;
  if not found then return new; end if;
  select value into cfg from public.settings where key = 'referidos';
  v_code := 'REF-' || (select number from public.families where id = r.referrer_family_id) || '-' || upper(substr(md5(r.id::text), 1, 4));
  insert into public.coupons (code, description, kind, value, applies_to, ends_on, max_uses, family_id, created_by)
  values (v_code, 'Gracias por recomendar a ' || (select name from public.families where id = r.referred_family_id),
          coalesce(cfg->>'tipo', 'monto'), coalesce((cfg->>'valor')::numeric, 300), coalesce(cfg->>'aplica', 'mensualidad'),
          public.today_mx() + coalesce((cfg->>'vigencia_dias')::int, 90), 1, r.referrer_family_id, null)
  returning id into v_coupon;
  update public.referrals set status = 'recompensado', reward_coupon_id = v_coupon, rewarded_at = now() where id = r.id;
  return new;
end $$;
create trigger premiar_referido after insert on public.payments for each row execute function public.premiar_referido();

-- ─────────────────────────────────────────────────────────────
-- Punto de venta e inventario
-- ─────────────────────────────────────────────────────────────
create table public.products (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  category    text not null default 'barra' check (category in ('barra','tienda')),
  sku         text unique,
  price       numeric(10,2) not null check (price >= 0),
  cost        numeric(10,2) check (cost >= 0),
  stock       int not null default 0,
  min_stock   int not null default 0,
  track_stock boolean not null default true,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create sequence public.sale_folio_seq start 1;
create table public.sales (
  id          uuid primary key default gen_random_uuid(),
  folio       int not null unique default nextval('public.sale_folio_seq'),
  family_id   uuid references public.families(id) on delete set null,
  member_id   uuid references public.members(id) on delete set null,
  subtotal    numeric(10,2) not null,
  discount    numeric(10,2) not null default 0,
  total       numeric(10,2) not null,
  method      text not null check (method in ('efectivo','tarjeta','terminal','transferencia','cuenta')),
  coupon_id   uuid references public.coupons(id) on delete set null,
  charge_id   uuid references public.charges(id) on delete set null,
  status      text not null default 'pagada' check (status in ('pagada','a_cuenta','cancelada')),
  sold_by     uuid references public.profiles(id) default auth.uid(),
  created_at  timestamptz not null default now(),
  cancelled_at timestamptz,
  cancel_reason text
);
create index on public.sales (created_at);

create table public.sale_items (
  id          uuid primary key default gen_random_uuid(),
  sale_id     uuid not null references public.sales(id) on delete cascade,
  product_id  uuid references public.products(id) on delete set null,
  name        text not null,
  category    text not null,
  qty         int not null check (qty > 0),
  unit_price  numeric(10,2) not null,
  total       numeric(10,2) not null
);

create table public.inventory_moves (
  id          bigserial primary key,
  product_id  uuid not null references public.products(id) on delete cascade,
  qty         int not null,
  kind        text not null check (kind in ('compra','ajuste','merma','venta','cancelacion')),
  note        text,
  sale_id     uuid references public.sales(id) on delete set null,
  created_by  uuid references public.profiles(id) default auth.uid(),
  created_at  timestamptz not null default now()
);
create index on public.inventory_moves (product_id, created_at desc);

alter table public.products enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.inventory_moves enable row level security;
create policy "ver productos" on public.products for select to authenticated using (public.is_staff());
create policy "gestionar productos" on public.products for insert to authenticated with check (public.is_manager() or public.my_role() = 'ventas');
create policy "editar productos" on public.products for update to authenticated using (public.is_manager() or public.my_role() = 'ventas') with check (public.is_manager() or public.my_role() = 'ventas');
create policy "ver ventas" on public.sales for select to authenticated using (public.is_seller() or family_id in (select public.my_family_ids()));
create policy "ver partidas" on public.sale_items for select to authenticated
  using (exists (select 1 from public.sales s where s.id = sale_id and (public.is_seller() or s.family_id in (select public.my_family_ids()))));
create policy "ver movimientos" on public.inventory_moves for select to authenticated using (public.is_seller());

create or replace function public.vender(p_items jsonb, p_method text, p_family uuid default null, p_member uuid default null, p_coupon text default null)
returns public.sales
language plpgsql security definer set search_path = public as $$
declare it jsonb; p public.products; v_sale public.sales; v_sub numeric := 0; v_disc numeric := 0; v_coupon uuid; d record;
        v_charge uuid; v_qty int; v_cats text;
begin
  if not public.is_seller() then raise exception 'Tu usuario no puede registrar ventas'; end if;
  if jsonb_array_length(coalesce(p_items, '[]')) = 0 then raise exception 'Agrega al menos un producto'; end if;
  if p_method = 'cuenta' and p_family is null then raise exception 'Para cargar a la cuenta elige a la familia'; end if;
  if p_member is not null and p_family is null then select family_id into p_family from public.members where id = p_member; end if;

  -- Totales y existencias
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

  insert into public.sales (family_id, member_id, subtotal, discount, total, method, coupon_id, status)
  values (p_family, p_member, v_sub, v_disc, v_sub - v_disc, p_method, v_coupon, case when p_method = 'cuenta' then 'a_cuenta' else 'pagada' end)
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

  if p_method = 'cuenta' then
    select string_agg(distinct case category when 'barra' then 'Barra' else 'Tienda' end, ' y ') into v_cats from public.sale_items where sale_id = v_sale.id;
    insert into public.charges (family_id, concept, amount, due_date, created_by)
    values (p_family, v_cats || ' · ticket ' || v_sale.folio, v_sale.total, public.today_mx() + 7, auth.uid()) returning id into v_charge;
    insert into public.charge_items (charge_id, member_id, department, description, amount, sat_product_key, sat_unit_key)
    select v_charge, p_member, case category when 'barra' then 'cafeteria' else 'tienda' end, name || ' x' || qty, total, '90101500', 'H87'
      from public.sale_items where sale_id = v_sale.id;
    if v_disc > 0 then insert into public.charge_items (charge_id, description, amount) values (v_charge, 'Descuento', -v_disc); end if;
    update public.sales set charge_id = v_charge where id = v_sale.id returning * into v_sale;
  end if;
  return v_sale;
end $$;

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
  update public.sales set status = 'cancelada', cancelled_at = now(), cancel_reason = p_reason where id = s.id returning * into s;
  return s;
end $$;

create or replace function public.mover_inventario(p_product uuid, p_qty int, p_kind text, p_note text default null)
returns public.products
language plpgsql security definer set search_path = public as $$
declare p public.products;
begin
  if not (public.is_manager() or public.my_role() = 'ventas') then raise exception 'Sin permiso para mover inventario'; end if;
  if p_kind not in ('compra','ajuste','merma') then raise exception 'Movimiento no válido'; end if;
  if p_kind = 'merma' then p_qty := -abs(p_qty); end if;
  if p_kind = 'compra' then p_qty := abs(p_qty); end if;
  update public.products set stock = stock + p_qty where id = p_product returning * into p;
  insert into public.inventory_moves (product_id, qty, kind, note) values (p_product, p_qty, p_kind, p_note);
  return p;
end $$;

-- ─────────────────────────────────────────────────────────────
-- Clases privadas y comisiones
-- ─────────────────────────────────────────────────────────────
create table public.instructor_rates (
  profile_id     uuid not null references public.profiles(id) on delete cascade,
  department     text not null references public.departments(code),
  price          numeric(10,2),
  commission_pct numeric(5,2) not null default 40 check (commission_pct between 0 and 100),
  primary key (profile_id, department)
);

create table public.private_sessions (
  id             uuid primary key default gen_random_uuid(),
  member_id      uuid not null references public.members(id) on delete cascade,
  family_id      uuid not null references public.families(id) on delete cascade,
  instructor_id  uuid not null references public.profiles(id),
  department     text not null references public.departments(code),
  starts_at      timestamptz not null,
  duration_min   int not null default 60 check (duration_min between 15 and 240),
  price          numeric(10,2) not null check (price >= 0),
  commission_pct numeric(5,2) not null,
  status         text not null default 'programada' check (status in ('programada','realizada','cancelada','no_asistio')),
  charge_id      uuid references public.charges(id) on delete set null,
  notes          text,
  created_by     uuid references public.profiles(id) default auth.uid(),
  created_at     timestamptz not null default now()
);
create index on public.private_sessions (instructor_id, starts_at);
create index on public.private_sessions (starts_at);

alter table public.instructor_rates enable row level security;
alter table public.private_sessions enable row level security;
create policy "ver tarifas" on public.instructor_rates for select to authenticated
  using (public.is_front_office() or profile_id = auth.uid() or public.is_dept_coordinator(department));
create policy "dirección define tarifas" on public.instructor_rates for all to authenticated
  using (public.is_manager()) with check (public.is_manager());
create policy "ver privadas" on public.private_sessions for select to authenticated
  using (public.is_front_office() or instructor_id = auth.uid() or public.is_dept_coordinator(department)
         or family_id in (select public.my_family_ids()));

create or replace function public.agendar_privada(p_member uuid, p_instructor uuid, p_department text, p_starts timestamptz,
  p_duration int default null, p_price numeric default null, p_notes text default null)
returns public.private_sessions
language plpgsql security definer set search_path = public as $$
declare cfg jsonb; r public.instructor_rates; m public.members; s public.private_sessions; v_charge uuid; v_dur int; v_price numeric;
begin
  if not (public.is_front_office() or public.is_dept_coordinator(p_department)) then raise exception 'Sin permiso para agendar clases privadas'; end if;
  select * into m from public.members where id = p_member;
  if not found then raise exception 'Socio no encontrado'; end if;
  if not exists (select 1 from public.profile_departments where profile_id = p_instructor and department = p_department) then
    raise exception 'Ese instructor no pertenece al área elegida';
  end if;
  select value into cfg from public.settings where key = 'privadas';
  select * into r from public.instructor_rates where profile_id = p_instructor and department = p_department;
  v_dur := coalesce(p_duration, (cfg->>'duracion_min')::int, 60);
  v_price := coalesce(p_price, r.price, (cfg->>'precio')::numeric, 0);
  if exists (select 1 from public.private_sessions x where x.instructor_id = p_instructor and x.status = 'programada'
              and tstzrange(x.starts_at, x.starts_at + make_interval(mins => x.duration_min)) && tstzrange(p_starts, p_starts + make_interval(mins => v_dur))) then
    raise exception 'El instructor ya tiene una clase privada en ese horario';
  end if;
  insert into public.charges (family_id, concept, amount, due_date, created_by)
  values (m.family_id, 'Clase privada · ' || m.first_name || ' · ' || to_char(p_starts at time zone 'America/Mexico_City', 'DD/MM HH24:MI'),
          v_price, (p_starts at time zone 'America/Mexico_City')::date, auth.uid()) returning id into v_charge;
  insert into public.charge_items (charge_id, member_id, department, description, amount)
  values (v_charge, p_member, p_department, 'Clase privada ' || v_dur || ' min', v_price);
  insert into public.private_sessions (member_id, family_id, instructor_id, department, starts_at, duration_min, price, commission_pct, charge_id, notes)
  values (p_member, m.family_id, p_instructor, p_department, p_starts, v_dur, v_price,
          coalesce(r.commission_pct, (cfg->>'comision_pct')::numeric, 40), v_charge, p_notes)
  returning * into s;
  return s;
end $$;

create or replace function public.marcar_privada(p_session uuid, p_status text, p_notes text default null)
returns public.private_sessions
language plpgsql security definer set search_path = public as $$
declare s public.private_sessions;
begin
  select * into s from public.private_sessions where id = p_session for update;
  if not found then raise exception 'Clase no encontrada'; end if;
  if not (public.is_front_office() or s.instructor_id = auth.uid() or public.is_dept_coordinator(s.department)) then raise exception 'Sin permiso'; end if;
  if p_status not in ('programada','realizada','cancelada','no_asistio') then raise exception 'Estado no válido'; end if;
  if p_status = 'cancelada' and s.instructor_id = auth.uid() and not public.is_front_office() and not public.is_dept_coordinator(s.department) then
    raise exception 'Para cancelar pide apoyo a recepción';
  end if;
  if p_status = 'cancelada' and s.charge_id is not null then
    update public.charges set status = 'cancelado' where id = s.charge_id and status in ('pendiente','vencido');
  end if;
  update public.private_sessions set status = p_status, notes = coalesce(p_notes, notes) where id = s.id returning * into s;
  return s;
end $$;

create or replace function public.comisiones_privadas(p_from date, p_to date)
returns table(instructor_id uuid, instructor text, sesiones int, realizadas int, no_asistio int, ingresos numeric, comision numeric)
language sql stable security definer set search_path = public as $$
  with cfg as (select coalesce((value->>'comision_no_asistio')::boolean, true) as pay_ns from public.settings where key = 'privadas')
  select p.id, p.full_name, count(*)::int,
         count(*) filter (where s.status = 'realizada')::int,
         count(*) filter (where s.status = 'no_asistio')::int,
         coalesce(sum(s.price) filter (where s.status in ('realizada','no_asistio')), 0),
         round(coalesce(sum(s.price * s.commission_pct / 100) filter (where s.status = 'realizada' or (s.status = 'no_asistio' and (select pay_ns from cfg))), 0), 2)
    from public.private_sessions s join public.profiles p on p.id = s.instructor_id
   where (s.starts_at at time zone 'America/Mexico_City')::date between p_from and p_to
     and s.status <> 'cancelada'
     and (public.is_manager() or s.instructor_id = auth.uid() or public.is_dept_coordinator(s.department))
   group by p.id, p.full_name order by 7 desc
$$;

-- ─────────────────────────────────────────────────────────────
-- Casilleros
-- ─────────────────────────────────────────────────────────────
create table public.lockers (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,
  zone          text not null default 'General',
  size          text not null default 'chico' check (size in ('chico','mediano','grande')),
  monthly_price numeric(10,2) not null default 0,
  status        text not null default 'disponible' check (status in ('disponible','ocupado','mantenimiento')),
  notes         text
);

create table public.locker_rentals (
  id            uuid primary key default gen_random_uuid(),
  locker_id     uuid not null references public.lockers(id) on delete cascade,
  family_id     uuid not null references public.families(id) on delete cascade,
  member_id     uuid references public.members(id) on delete set null,
  starts_on     date not null default current_date,
  ends_on       date not null,
  monthly_price numeric(10,2) not null,
  status        text not null default 'activa' check (status in ('activa','terminada')),
  created_by    uuid references public.profiles(id) default auth.uid(),
  created_at    timestamptz not null default now()
);
create unique index locker_one_active on public.locker_rentals (locker_id) where status = 'activa';

alter table public.lockers enable row level security;
alter table public.locker_rentals enable row level security;
create policy "ver casilleros" on public.lockers for select to authenticated using (public.is_staff());
create policy "dirección gestiona casilleros" on public.lockers for all to authenticated using (public.is_manager()) with check (public.is_manager());
create policy "ver rentas" on public.locker_rentals for select to authenticated
  using (public.is_front_office() or family_id in (select public.my_family_ids()));

create or replace function public.rentar_casillero(p_locker uuid, p_family uuid, p_member uuid default null, p_months int default 1)
returns public.locker_rentals
language plpgsql security definer set search_path = public as $$
declare l public.lockers; r public.locker_rentals; v_charge uuid;
begin
  if not public.is_front_office() then raise exception 'Solo recepción o administración rentan casilleros'; end if;
  if p_months not between 1 and 12 then raise exception 'Elige de 1 a 12 meses'; end if;
  select * into l from public.lockers where id = p_locker for update;
  if not found or l.status <> 'disponible' then raise exception 'El casillero no está disponible'; end if;
  insert into public.locker_rentals (locker_id, family_id, member_id, starts_on, ends_on, monthly_price)
  values (l.id, p_family, p_member, public.today_mx(), (public.today_mx() + make_interval(months => p_months))::date, l.monthly_price)
  returning * into r;
  if l.monthly_price > 0 then
    insert into public.charges (family_id, concept, amount, due_date, created_by)
    values (p_family, 'Casillero ' || l.code || ' · ' || p_months || (case when p_months = 1 then ' mes' else ' meses' end),
            l.monthly_price * p_months, public.today_mx(), auth.uid()) returning id into v_charge;
    insert into public.charge_items (charge_id, member_id, description, amount) values (v_charge, p_member, 'Renta de casillero ' || l.code, l.monthly_price * p_months);
  end if;
  update public.lockers set status = 'ocupado' where id = l.id;
  return r;
end $$;

create or replace function public.renovar_casillero(p_rental uuid, p_months int default 1)
returns public.locker_rentals
language plpgsql security definer set search_path = public as $$
declare r public.locker_rentals; l public.lockers; v_charge uuid;
begin
  if not public.is_front_office() then raise exception 'Solo recepción o administración renuevan casilleros'; end if;
  if p_months not between 1 and 12 then raise exception 'Elige de 1 a 12 meses'; end if;
  select * into r from public.locker_rentals where id = p_rental and status = 'activa' for update;
  if not found then raise exception 'La renta no está activa'; end if;
  select * into l from public.lockers where id = r.locker_id;
  if r.monthly_price > 0 then
    insert into public.charges (family_id, concept, amount, due_date, created_by)
    values (r.family_id, 'Casillero ' || l.code || ' · renovación ' || p_months || (case when p_months = 1 then ' mes' else ' meses' end),
            r.monthly_price * p_months, public.today_mx(), auth.uid()) returning id into v_charge;
    insert into public.charge_items (charge_id, member_id, description, amount) values (v_charge, r.member_id, 'Renta de casillero ' || l.code, r.monthly_price * p_months);
  end if;
  update public.locker_rentals set ends_on = (greatest(ends_on, public.today_mx()) + make_interval(months => p_months))::date where id = r.id returning * into r;
  return r;
end $$;

create or replace function public.liberar_casillero(p_rental uuid)
returns public.locker_rentals
language plpgsql security definer set search_path = public as $$
declare r public.locker_rentals;
begin
  if not public.is_front_office() then raise exception 'Solo recepción o administración liberan casilleros'; end if;
  update public.locker_rentals set status = 'terminada', ends_on = least(ends_on, public.today_mx()) where id = p_rental and status = 'activa' returning * into r;
  if not found then raise exception 'La renta no está activa'; end if;
  update public.lockers set status = 'disponible' where id = r.locker_id;
  return r;
end $$;

-- ─────────────────────────────────────────────────────────────
-- Recordatorios y seguimiento
-- ─────────────────────────────────────────────────────────────
create table public.message_templates (
  key        text primary key,
  name       text not null,
  body       text not null,
  updated_at timestamptz not null default now()
);
insert into public.message_templates (key, name, body) values
  ('pago_por_vencer', 'Pago por vencer', 'Hola {nombre}, te recordamos que tu pago de {monto} en {club} vence el {fecha}. Puedes pagar en recepción o en el portal. ¡Gracias!'),
  ('pago_vencido', 'Pago vencido', 'Hola {nombre}, tienes un saldo vencido de {monto} en {club}. Mientras haya adeudo vencido no se pueden hacer reservas. Si ya pagaste, ignora este mensaje.'),
  ('clase_manana', 'Clase de mañana', 'Hola {nombre}, te recordamos la clase de {detalle} mañana a las {hora}. ¡Te esperamos en {club}!'),
  ('te_extranamos', 'Te extrañamos', 'Hola {nombre}, en {club} notamos que {detalle} no ha venido en {dias} días. ¿Todo bien? Si necesitas cambiar de horario o tienes alguna duda, con gusto te ayudamos.'),
  ('casillero_vence', 'Casillero por vencer', 'Hola {nombre}, la renta de tu casillero {detalle} en {club} vence el {fecha}. ¿Deseas renovarla?');

alter table public.message_templates enable row level security;
create policy "ver plantillas" on public.message_templates for select to authenticated using (public.is_staff());
create policy "dirección edita plantillas" on public.message_templates for update to authenticated using (public.is_manager()) with check (public.is_manager());

alter table public.notifications add column if not exists member_id uuid references public.members(id) on delete set null;
alter table public.notifications add column if not exists sent_by uuid references public.profiles(id) default auth.uid();
create index if not exists notifications_family_template on public.notifications (family_id, template, created_at desc);

-- Lista de a quién recordar hoy, por tipo. El personal envía con un toque (WhatsApp/correo) y queda registrado.
create or replace function public.recordatorios(p_tipo text, p_area text default null)
returns table(family_id uuid, member_id uuid, nombre text, familia text, telefono text, correo text,
              detalle text, monto numeric, fecha date, hora text, dias int, ultimo_envio timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare cfg jsonb; v_today date := public.today_mx();
begin
  select value into cfg from public.settings where key = 'recordatorios';
  if p_tipo in ('pago_por_vencer','pago_vencido','casillero_vence') and not public.is_front_office() then raise exception 'Sin permiso'; end if;
  if p_tipo in ('clase_manana','te_extranamos') and not (public.is_front_office() or (p_area is not null and public.has_department(p_area))) then
    raise exception 'Sin permiso';
  end if;

  if p_tipo in ('pago_por_vencer','pago_vencido') then
    return query
    select f.id, null::uuid, coalesce(t.first_name, split_part(f.name, ' ', 2), f.name), f.name, coalesce(f.phone, t.phone), coalesce(f.email, t.email),
           string_agg(c.concept, ', ' order by c.due_date), sum(c.amount), min(c.due_date), null::text, (v_today - min(c.due_date))::int,
           (select max(n.created_at) from public.notifications n where n.family_id = f.id and n.template = p_tipo)
      from public.charges c join public.families f on f.id = c.family_id
      left join lateral (select * from public.members m where m.family_id = f.id and m.is_titular limit 1) t on true
     where (p_tipo = 'pago_vencido' and (c.status = 'vencido' or (c.status = 'pendiente' and c.due_date < v_today)))
        or (p_tipo = 'pago_por_vencer' and c.status = 'pendiente' and c.due_date between v_today and v_today + coalesce((cfg->>'dias_antes_pago')::int, 3))
     group by f.id, f.name, f.phone, f.email, t.first_name, t.phone, t.email
     order by min(c.due_date);

  elsif p_tipo = 'clase_manana' then
    return query
    select f.id, m.id, m.first_name, f.name, coalesce(f.phone, m.phone), coalesce(f.email, m.email),
           string_agg(distinct l.name || ' (' || d.name || ')', ', '), null::numeric, v_today + 1, min(to_char(g.start_time, 'HH24:MI')), null::int,
           (select max(n.created_at) from public.notifications n where n.member_id = m.id and n.template = p_tipo)
      from public.enrollments e join public.groups g on g.id = e.group_id and g.active
      join public.levels l on l.id = g.level_id join public.departments d on d.code = l.department
      join public.members m on m.id = e.member_id join public.families f on f.id = m.family_id
     where e.status = 'activa' and extract(isodow from v_today + 1)::int = any (g.weekdays)
       and (p_area is null or l.department = p_area) and (public.is_front_office() or public.has_department(l.department))
     group by f.id, f.name, f.phone, f.email, m.id, m.first_name, m.phone, m.email
     order by min(g.start_time);

  elsif p_tipo = 'te_extranamos' then
    return query
    with act as (
      select distinct e.member_id from public.enrollments e join public.groups g on g.id = e.group_id join public.levels l on l.id = g.level_id
       where e.status = 'activa' and (p_area is null or l.department = p_area) and (public.is_front_office() or public.has_department(l.department))
         and (e.enrolled_at at time zone 'America/Mexico_City')::date < v_today - coalesce((cfg->>'dias_inactividad')::int, 14)
      union
      select ms.member_id from public.memberships ms join public.plans pl on pl.id = ms.plan_id
       where ms.status = 'activa' and (p_area is null or pl.department = p_area) and (public.is_front_office() or public.has_department(pl.department))
         and ms.starts_on < v_today - coalesce((cfg->>'dias_inactividad')::int, 14)
    ), last as (
      select a.member_id, greatest(
        (select max((v.check_in_at at time zone 'America/Mexico_City')::date) from public.visits v where v.member_id = a.member_id),
        (select max(t.date) from public.attendance t where t.member_id = a.member_id and t.status in ('presente','retardo'))) as d
      from act a
    )
    select f.id, m.id, coalesce(t.first_name, m.first_name), f.name, coalesce(f.phone, t.phone, m.phone), coalesce(f.email, t.email, m.email),
           m.first_name, null::numeric, last.d, null::text,
           case when last.d is null then null else (v_today - last.d)::int end,
           (select max(n.created_at) from public.notifications n where n.member_id = m.id and n.template = p_tipo)
      from last join public.members m on m.id = last.member_id join public.families f on f.id = m.family_id
      left join lateral (select * from public.members x where x.family_id = f.id and x.is_titular limit 1) t on true
     where last.d is null or last.d < v_today - coalesce((cfg->>'dias_inactividad')::int, 14)
     order by last.d nulls first limit 300;

  elsif p_tipo = 'casillero_vence' then
    return query
    select f.id, r.member_id, coalesce(t.first_name, f.name), f.name, coalesce(f.phone, t.phone), coalesce(f.email, t.email),
           l.code, r.monthly_price, r.ends_on, null::text, (r.ends_on - v_today)::int,
           (select max(n.created_at) from public.notifications n where n.family_id = f.id and n.template = p_tipo)
      from public.locker_rentals r join public.lockers l on l.id = r.locker_id join public.families f on f.id = r.family_id
      left join lateral (select * from public.members x where x.family_id = f.id and x.is_titular limit 1) t on true
     where r.status = 'activa' and r.ends_on <= v_today + coalesce((cfg->>'dias_aviso_casillero')::int, 5)
     order by r.ends_on;
  else
    raise exception 'Tipo de recordatorio no válido';
  end if;
end $$;

create or replace function public.registrar_recordatorio(p_family uuid, p_member uuid, p_template text, p_channel text, p_body text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'Sin permiso'; end if;
  insert into public.notifications (family_id, member_id, channel, template, body, status, sent_at)
  values (p_family, p_member, p_channel, p_template, p_body, 'enviado', now());
end $$;

-- Permisos de ejecución
do $$
declare f text;
begin
  foreach f in array array[
    'aplicar_cupon_cargo(uuid, text)', 'registrar_referido(uuid, uuid)', 'cupon_calcular(text, text, numeric, uuid)',
    'vender(jsonb, text, uuid, uuid, text)', 'cancelar_venta(uuid, text)', 'mover_inventario(uuid, int, text, text)',
    'agendar_privada(uuid, uuid, text, timestamptz, int, numeric, text)', 'marcar_privada(uuid, text, text)', 'comisiones_privadas(date, date)',
    'rentar_casillero(uuid, uuid, uuid, int)', 'renovar_casillero(uuid, int)', 'liberar_casillero(uuid)',
    'recordatorios(text, text)', 'registrar_recordatorio(uuid, uuid, text, text, text)', 'is_seller()'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
revoke execute on function public.premiar_referido() from public, anon, authenticated;
