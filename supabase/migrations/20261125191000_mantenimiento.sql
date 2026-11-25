-- Mantenimiento por especialidad (alberca primero): bitácora del agua, equipos, plan preventivo,
-- órdenes de trabajo, materiales e insumos, proveedores, compras con factura (PDF/XML) y comparativos.

create or replace function public.is_maintenance()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_manager() or coalesce((select role::text = 'mantenimiento' from public.profiles where id = auth.uid() and active), false)
      or public.has_department('mantenimiento')
$$;

-- Quién puede capturar lecturas de la alberca: mantenimiento y el personal de natación
create or replace function public.can_log_pool()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_maintenance() or public.has_department('natacion')
$$;

insert into public.settings (key, value, description) values
  ('alberca_rangos', '{
     "ph":{"min":7.2,"max":7.8,"label":"pH"},
     "free_chlorine":{"min":1,"max":3,"label":"Cloro libre (ppm)"},
     "combined_chlorine":{"min":0,"max":0.2,"label":"Cloro combinado (ppm)"},
     "alkalinity":{"min":80,"max":120,"label":"Alcalinidad (ppm)"},
     "hardness":{"min":200,"max":400,"label":"Dureza cálcica (ppm)"},
     "cya":{"min":0,"max":50,"label":"Ácido cianúrico (ppm)"},
     "temperature":{"min":27,"max":30,"label":"Temperatura (°C)"}
   }', 'Rangos ideales del agua de la alberca; fuera de rango se marca en rojo'),
  ('alberca_cuerpos', '["Alberca principal","Chapoteadero"]', 'Cuerpos de agua que se registran en la bitácora')
on conflict (key) do nothing;

create table public.maint_areas (
  code        text primary key,
  name        text not null,
  icon        text,
  responsible uuid references public.profiles(id) on delete set null,
  sort_order  int not null default 0,
  active      boolean not null default true
);
insert into public.maint_areas (code, name, icon, sort_order) values
  ('alberca', 'Alberca', 'Waves', 1),
  ('gimnasio', 'Equipos de gimnasio', 'Dumbbell', 2),
  ('electrico', 'Eléctrico e iluminación', 'Zap', 3),
  ('plomeria', 'Plomería y regaderas', 'Droplets', 4),
  ('clima', 'Clima y calentadores', 'Thermometer', 5),
  ('edificio', 'Edificio, pintura y salones', 'Building2', 6),
  ('limpieza', 'Limpieza e higiene', 'Sparkles', 7),
  ('jardin', 'Jardinería y exteriores', 'Trees', 8);

create table public.maint_assets (
  id             uuid primary key default gen_random_uuid(),
  area           text not null references public.maint_areas(code),
  name           text not null,
  brand          text,
  model          text,
  serial         text,
  location       text,
  purchase_date  date,
  warranty_until date,
  status         text not null default 'operando' check (status in ('operando','falla','fuera_servicio','baja')),
  notes          text,
  created_at     timestamptz not null default now()
);

create table public.suppliers (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  rfc           text,
  contact       text,
  phone         text,
  email         text,
  areas         text[] not null default '{}',
  payment_terms text,
  delivery_days int,
  rating        int check (rating between 1 and 5),
  notes         text,
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);
create unique index suppliers_rfc on public.suppliers (upper(rfc)) where rfc is not null and rfc <> '';

create table public.supplies (
  id                 uuid primary key default gen_random_uuid(),
  area               text not null references public.maint_areas(code),
  name               text not null,
  category           text,                       -- químicos, refacciones, limpieza…
  unit               text not null default 'pieza',
  stock              numeric(12,2) not null default 0,
  min_stock          numeric(12,2) not null default 0,
  reorder_qty        numeric(12,2),
  daily_use          numeric(12,3),              -- consumo diario estimado (para pronosticar)
  purchase_every_days int,                       -- periodicidad de compra
  last_purchase_on   date,
  preferred_supplier uuid references public.suppliers(id) on delete set null,
  notes              text,
  active             boolean not null default true,
  created_at         timestamptz not null default now()
);

create table public.maint_tasks (
  id             uuid primary key default gen_random_uuid(),
  area           text not null references public.maint_areas(code),
  asset_id       uuid references public.maint_assets(id) on delete set null,
  title          text not null,
  instructions   text,
  frequency_days int not null check (frequency_days > 0),
  last_done_on   date,
  next_due_on    date not null default current_date,
  assigned_to    uuid references public.profiles(id) on delete set null,
  est_minutes    int,
  active         boolean not null default true,
  created_at     timestamptz not null default now()
);

create sequence public.work_order_seq start 1;
create table public.work_orders (
  id              uuid primary key default gen_random_uuid(),
  folio           int not null unique default nextval('public.work_order_seq'),
  area            text not null references public.maint_areas(code),
  asset_id        uuid references public.maint_assets(id) on delete set null,
  task_id         uuid references public.maint_tasks(id) on delete set null,
  kind            text not null default 'correctivo' check (kind in ('preventivo','correctivo','mejora')),
  title           text not null,
  description     text,
  priority        text not null default 'media' check (priority in ('baja','media','alta','urgente')),
  status          text not null default 'abierta' check (status in ('abierta','en_proceso','en_espera','terminada','cancelada')),
  reported_by     uuid references public.profiles(id) default auth.uid(),
  assigned_to     uuid references public.profiles(id) on delete set null,
  supplier_id     uuid references public.suppliers(id) on delete set null,
  due_on          date,
  started_at      timestamptz,
  completed_at    timestamptz,
  labor_cost      numeric(10,2) not null default 0,
  materials_cost  numeric(10,2) not null default 0,
  resolution      text,
  created_at      timestamptz not null default now()
);
create index on public.work_orders (status, area);

create table public.purchases (
  id             uuid primary key default gen_random_uuid(),
  area           text not null references public.maint_areas(code),
  supplier_id    uuid references public.suppliers(id) on delete set null,
  invoice_number text,
  invoice_uuid   text,
  invoice_date   date not null default current_date,
  subtotal       numeric(12,2),
  tax            numeric(12,2),
  total          numeric(12,2) not null check (total >= 0),
  pdf_path       text,
  xml_path       text,
  work_order_id  uuid references public.work_orders(id) on delete set null,
  status         text not null default 'por_pagar' check (status in ('por_pagar','pagada','cancelada')),
  paid_at        date,
  notes          text,
  created_by     uuid references public.profiles(id) default auth.uid(),
  created_at     timestamptz not null default now()
);
create unique index purchases_uuid on public.purchases (upper(invoice_uuid)) where invoice_uuid is not null and invoice_uuid <> '';
create index on public.purchases (invoice_date);

create table public.purchase_items (
  id          uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.purchases(id) on delete cascade,
  supply_id   uuid references public.supplies(id) on delete set null,
  description text not null,
  qty         numeric(12,2) not null check (qty > 0),
  unit_price  numeric(12,4) not null check (unit_price >= 0),
  total       numeric(12,2) generated always as (round(qty * unit_price, 2)) stored
);

-- Precios conocidos por proveedor (de facturas o cotizaciones) para el comparativo
create table public.supplier_prices (
  id          uuid primary key default gen_random_uuid(),
  supply_id   uuid not null references public.supplies(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  unit_price  numeric(12,4) not null check (unit_price >= 0),
  source      text not null default 'cotizacion' check (source in ('cotizacion','factura')),
  quoted_on   date not null default current_date,
  purchase_id uuid references public.purchases(id) on delete cascade,
  notes       text,
  created_at  timestamptz not null default now()
);
create index on public.supplier_prices (supply_id, supplier_id, quoted_on desc);

create table public.supply_moves (
  id            bigserial primary key,
  supply_id     uuid not null references public.supplies(id) on delete cascade,
  qty           numeric(12,2) not null,
  kind          text not null check (kind in ('compra','uso','ajuste')),
  work_order_id uuid references public.work_orders(id) on delete set null,
  purchase_id   uuid references public.purchases(id) on delete cascade,
  note          text,
  created_by    uuid references public.profiles(id) default auth.uid(),
  created_at    timestamptz not null default now()
);
create index on public.supply_moves (supply_id, created_at desc);

create table public.pool_logs (
  id                uuid primary key default gen_random_uuid(),
  pool              text not null default 'Alberca principal',
  taken_at          timestamptz not null default now(),
  ph                numeric(4,2),
  free_chlorine     numeric(5,2),
  combined_chlorine numeric(5,2),
  alkalinity        numeric(6,1),
  hardness          numeric(6,1),
  cya               numeric(6,1),
  temperature       numeric(4,1),
  clarity           text check (clarity in ('cristalina','ligeramente_turbia','turbia')),
  chemicals_added   text,
  backwash          boolean not null default false,
  notes             text,
  taken_by          uuid references public.profiles(id) default auth.uid()
);
create index on public.pool_logs (pool, taken_at desc);

-- RLS
alter table public.maint_areas enable row level security;
alter table public.maint_assets enable row level security;
alter table public.suppliers enable row level security;
alter table public.supplies enable row level security;
alter table public.maint_tasks enable row level security;
alter table public.work_orders enable row level security;
alter table public.purchases enable row level security;
alter table public.purchase_items enable row level security;
alter table public.supplier_prices enable row level security;
alter table public.supply_moves enable row level security;
alter table public.pool_logs enable row level security;

create policy "ver áreas" on public.maint_areas for select to authenticated using (public.is_staff());
create policy "dirección edita áreas" on public.maint_areas for update to authenticated using (public.is_manager()) with check (public.is_manager());

do $$
declare t text;
begin
  foreach t in array array['maint_assets','suppliers','supplies','maint_tasks','purchases','purchase_items','supplier_prices'] loop
    execute format('create policy "mantenimiento ve" on public.%I for select to authenticated using (public.is_maintenance())', t);
    execute format('create policy "mantenimiento crea" on public.%I for insert to authenticated with check (public.is_maintenance())', t);
    execute format('create policy "mantenimiento edita" on public.%I for update to authenticated using (public.is_maintenance()) with check (public.is_maintenance())', t);
    execute format('create policy "dirección borra" on public.%I for delete to authenticated using (public.is_manager())', t);
  end loop;
end $$;
-- Órdenes de trabajo: cualquier persona del personal puede reportar una falla y ver las que reportó
create policy "ver órdenes" on public.work_orders for select to authenticated
  using (public.is_maintenance() or reported_by = auth.uid() or assigned_to = auth.uid());
create policy "reportar falla" on public.work_orders for insert to authenticated with check (public.is_staff());
create policy "mantenimiento atiende" on public.work_orders for update to authenticated
  using (public.is_maintenance() or assigned_to = auth.uid()) with check (public.is_maintenance() or assigned_to = auth.uid());
create policy "ver movimientos insumos" on public.supply_moves for select to authenticated using (public.is_maintenance());
create policy "ver bitácora alberca" on public.pool_logs for select to authenticated using (public.can_log_pool());
create policy "capturar bitácora alberca" on public.pool_logs for insert to authenticated with check (public.can_log_pool() and taken_by = auth.uid());
create policy "corregir bitácora" on public.pool_logs for update to authenticated using (public.is_maintenance()) with check (public.is_maintenance());

-- Al registrar partidas de una compra: sube existencias, fecha de última compra y guarda el precio para el comparativo
create or replace function public.al_registrar_partida()
returns trigger language plpgsql security definer set search_path = public as $$
declare p public.purchases;
begin
  if new.supply_id is null then return new; end if;
  select * into p from public.purchases where id = new.purchase_id;
  update public.supplies set stock = stock + new.qty,
         last_purchase_on = greatest(coalesce(last_purchase_on, p.invoice_date), p.invoice_date)
   where id = new.supply_id;
  insert into public.supply_moves (supply_id, qty, kind, purchase_id, note) values (new.supply_id, new.qty, 'compra', p.id, coalesce('Factura ' || p.invoice_number, 'Compra'));
  if p.supplier_id is not null then
    insert into public.supplier_prices (supply_id, supplier_id, unit_price, source, quoted_on, purchase_id)
    values (new.supply_id, p.supplier_id, new.unit_price, 'factura', p.invoice_date, p.id);
  end if;
  return new;
end $$;
create trigger al_registrar_partida after insert on public.purchase_items for each row execute function public.al_registrar_partida();

-- Al borrar una partida se revierte la existencia
create or replace function public.al_borrar_partida()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.supply_id is not null then
    update public.supplies set stock = stock - old.qty where id = old.supply_id;
  end if;
  return old;
end $$;
create trigger al_borrar_partida after delete on public.purchase_items for each row execute function public.al_borrar_partida();

-- Usar material (descuenta existencias, opcionalmente ligado a una orden de trabajo y suma su costo)
create or replace function public.usar_insumo(p_supply uuid, p_qty numeric, p_work_order uuid default null, p_note text default null)
returns public.supplies
language plpgsql security definer set search_path = public as $$
declare s public.supplies; v_price numeric;
begin
  if not public.is_maintenance() then raise exception 'Solo mantenimiento registra consumo de material'; end if;
  if p_qty is null or p_qty <= 0 then raise exception 'Cantidad no válida'; end if;
  update public.supplies set stock = stock - p_qty where id = p_supply returning * into s;
  if not found then raise exception 'Material no encontrado'; end if;
  insert into public.supply_moves (supply_id, qty, kind, work_order_id, note) values (p_supply, -p_qty, 'uso', p_work_order, p_note);
  if p_work_order is not null then
    select unit_price into v_price from public.supplier_prices where supply_id = p_supply order by quoted_on desc, created_at desc limit 1;
    update public.work_orders set materials_cost = materials_cost + round(coalesce(v_price, 0) * p_qty, 2) where id = p_work_order;
  end if;
  return s;
end $$;

create or replace function public.ajustar_insumo(p_supply uuid, p_new_stock numeric, p_note text default null)
returns public.supplies
language plpgsql security definer set search_path = public as $$
declare s public.supplies; v_old numeric;
begin
  if not public.is_maintenance() then raise exception 'Solo mantenimiento ajusta existencias'; end if;
  select stock into v_old from public.supplies where id = p_supply for update;
  update public.supplies set stock = p_new_stock where id = p_supply returning * into s;
  insert into public.supply_moves (supply_id, qty, kind, note) values (p_supply, p_new_stock - v_old, 'ajuste', coalesce(p_note, 'Conteo físico'));
  return s;
end $$;

-- Completar una tarea preventiva: crea la orden terminada y programa la siguiente
create or replace function public.completar_tarea(p_task uuid, p_resolution text default null, p_labor numeric default 0, p_done_on date default null)
returns public.maint_tasks
language plpgsql security definer set search_path = public as $$
declare t public.maint_tasks; v_day date := coalesce(p_done_on, public.today_mx());
begin
  if not public.is_maintenance() then raise exception 'Solo mantenimiento completa tareas'; end if;
  select * into t from public.maint_tasks where id = p_task for update;
  if not found then raise exception 'Tarea no encontrada'; end if;
  insert into public.work_orders (area, asset_id, task_id, kind, title, status, assigned_to, started_at, completed_at, labor_cost, resolution, due_on)
  values (t.area, t.asset_id, t.id, 'preventivo', t.title, 'terminada', coalesce(t.assigned_to, auth.uid()), now(), now(), coalesce(p_labor, 0), p_resolution, t.next_due_on);
  update public.maint_tasks set last_done_on = v_day, next_due_on = v_day + frequency_days where id = t.id returning * into t;
  return t;
end $$;

-- Estado de materiales: a qué ritmo se compran y cuándo toca reordenar
create or replace view public.supply_status with (security_invoker = true) as
select s.*,
  sp.name as preferred_supplier_name,
  (select p.unit_price from public.supplier_prices p where p.supply_id = s.id order by p.quoted_on desc, p.created_at desc limit 1) as last_price,
  (select min(x.price) from (select distinct on (p.supplier_id) p.unit_price as price from public.supplier_prices p
                             where p.supply_id = s.id order by p.supplier_id, p.quoted_on desc, p.created_at desc) x) as best_price,
  case when s.last_purchase_on is not null and s.purchase_every_days is not null then s.last_purchase_on + s.purchase_every_days end as next_purchase_on,
  case when s.daily_use > 0 then floor(s.stock / s.daily_use)::int end as days_left,
  (s.stock <= s.min_stock
    or (s.last_purchase_on is not null and s.purchase_every_days is not null and s.last_purchase_on + s.purchase_every_days <= public.today_mx() + 3)
    or (s.daily_use > 0 and s.stock / s.daily_use <= coalesce(sp.delivery_days, 3) + 2)) as needs_reorder
from public.supplies s left join public.suppliers sp on sp.id = s.preferred_supplier;

-- Comparativo: último precio de cada proveedor por material
create or replace view public.supplier_price_compare with (security_invoker = true) as
select distinct on (p.supply_id, p.supplier_id)
  p.supply_id, s.name as supply_name, s.unit, s.area, p.supplier_id, su.name as supplier_name, su.delivery_days, su.rating,
  p.unit_price, p.quoted_on, p.source
from public.supplier_prices p join public.supplies s on s.id = p.supply_id join public.suppliers su on su.id = p.supplier_id
order by p.supply_id, p.supplier_id, p.quoted_on desc, p.created_at desc;

-- Resumen para el tablero de mantenimiento
create or replace function public.mantenimiento_resumen(p_area text default null)
returns jsonb
language sql stable security definer set search_path = public as $$
  select case when not public.is_maintenance() then null else jsonb_build_object(
    'ordenes_abiertas', (select count(*) from public.work_orders where status in ('abierta','en_proceso','en_espera') and (p_area is null or area = p_area)),
    'urgentes', (select count(*) from public.work_orders where status in ('abierta','en_proceso','en_espera') and priority in ('alta','urgente') and (p_area is null or area = p_area)),
    'tareas_vencidas', (select count(*) from public.maint_tasks where active and next_due_on < public.today_mx() and (p_area is null or area = p_area)),
    'tareas_hoy', (select count(*) from public.maint_tasks where active and next_due_on = public.today_mx() and (p_area is null or area = p_area)),
    'por_reordenar', (select count(*) from public.supply_status where active and needs_reorder and (p_area is null or area = p_area)),
    'facturas_por_pagar', (select coalesce(sum(total), 0) from public.purchases where status = 'por_pagar' and (p_area is null or area = p_area)),
    'gasto_mes', (select coalesce(sum(total), 0) from public.purchases where status <> 'cancelada' and date_trunc('month', invoice_date) = date_trunc('month', public.today_mx()) and (p_area is null or area = p_area)),
    'gasto_mes_anterior', (select coalesce(sum(total), 0) from public.purchases where status <> 'cancelada' and date_trunc('month', invoice_date) = date_trunc('month', public.today_mx()) - interval '1 month' and (p_area is null or area = p_area)),
    'equipos_falla', (select count(*) from public.maint_assets where status in ('falla','fuera_servicio') and (p_area is null or area = p_area)),
    'ultima_lectura', (select to_jsonb(l) from public.pool_logs l order by taken_at desc limit 1),
    'horas_sin_lectura', (select round(extract(epoch from now() - max(taken_at)) / 3600) from public.pool_logs)
  ) end
$$;

-- Gasto por área y mes (últimos 12)
create or replace function public.mantenimiento_gasto()
returns table(mes text, area text, compras numeric, mano_obra numeric)
language sql stable security definer set search_path = public as $$
  with m as (select generate_series(date_trunc('month', public.today_mx()) - interval '11 months', date_trunc('month', public.today_mx()), interval '1 month')::date as m0)
  select to_char(m.m0, 'YYYY-MM'), a.code,
    (select coalesce(sum(p.total), 0) from public.purchases p where p.area = a.code and p.status <> 'cancelada' and date_trunc('month', p.invoice_date) = m.m0),
    (select coalesce(sum(w.labor_cost), 0) from public.work_orders w where w.area = a.code and w.status = 'terminada' and date_trunc('month', w.completed_at at time zone 'America/Mexico_City') = m.m0)
  from m cross join public.maint_areas a
  where public.is_maintenance()
  order by 1, a.sort_order
$$;

do $$
declare f text;
begin
  foreach f in array array['usar_insumo(uuid, numeric, uuid, text)', 'ajustar_insumo(uuid, numeric, text)', 'completar_tarea(uuid, text, numeric, date)',
                           'mantenimiento_resumen(text)', 'mantenimiento_gasto()', 'is_maintenance()', 'can_log_pool()'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
revoke execute on function public.al_registrar_partida() from public, anon, authenticated;
revoke execute on function public.al_borrar_partida() from public, anon, authenticated;

-- Archivos de facturas de compra (PDF/XML) en un bucket privado
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('facturas-compras', 'facturas-compras', false, 10485760, array['application/pdf','text/xml','application/xml','image/jpeg','image/png'])
    on conflict (id) do nothing;
    execute $p$create policy "mantenimiento sube facturas" on storage.objects for insert to authenticated
      with check (bucket_id = 'facturas-compras' and public.is_maintenance())$p$;
    execute $p$create policy "mantenimiento ve facturas" on storage.objects for select to authenticated
      using (bucket_id = 'facturas-compras' and public.is_maintenance())$p$;
    execute $p$create policy "dirección borra facturas" on storage.objects for delete to authenticated
      using (bucket_id = 'facturas-compras' and public.is_manager())$p$;
  end if;
end $$;

-- Plan preventivo inicial de la alberca (editable)
insert into public.maint_tasks (area, title, instructions, frequency_days, next_due_on) values
  ('alberca', 'Medir pH, cloro y temperatura', 'Tomar muestra a 45 cm de profundidad lejos de las boquillas. Registrar en la bitácora.', 1, current_date),
  ('alberca', 'Aspirar fondo y cepillar paredes', 'Incluye escalones y líneas de flotación.', 2, current_date),
  ('alberca', 'Retrolavado de filtros', 'Cuando la presión suba 8–10 psi sobre la presión limpia o cada semana.', 7, current_date),
  ('alberca', 'Limpiar canastillas de desnatadores y prefiltro de bomba', null, 3, current_date),
  ('alberca', 'Medir alcalinidad, dureza y ácido cianúrico', 'Registrar en la bitácora y ajustar químicos si sale de rango.', 7, current_date),
  ('alberca', 'Revisar bombas, motores y fugas', 'Ruido, temperatura del motor, sellos y empaques.', 30, current_date),
  ('alberca', 'Revisar calentador / caldera', 'Encendido, termostato, quemadores o bomba de calor.', 30, current_date),
  ('alberca', 'Cambio o limpieza profunda de medio filtrante', 'Arena/zeolita cada 3–5 años; cartucho según fabricante.', 365, current_date + 180),
  ('alberca', 'Supercloración (choque)', 'Fuera de horario de clases; reabrir cuando el cloro libre baje de 3 ppm.', 14, current_date + 7);
