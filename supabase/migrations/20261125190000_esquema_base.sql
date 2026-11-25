-- Oberlicht · Esquema base
-- Plataforma a la medida para el club Oberlicht (natación, Oberfit, ballet, gimnasia rítmica,
-- terapia física, nutrición, barra saludable y tienda).
-- Montos en MXN, zona horaria America/Mexico_City.

create extension if not exists pgcrypto;

-- ─────────────────────────────────────────────────────────────
-- Catálogos
-- ─────────────────────────────────────────────────────────────

create type public.app_role as enum (
  'direccion',      -- consola central, todo el club
  'administracion', -- finanzas, configuración, reportes
  'recepcion',      -- mostrador: familias, inscripciones, cobros, asistencia
  'coordinador',    -- coordina un departamento (natación, ballet, gimnasio)
  'coach',          -- instructor / maestra / coach
  'ventas',         -- barra saludable y tienda (fase 2: punto de venta)
  'titular'         -- padre/tutor o socio adulto (portal)
);

create table public.departments (
  code        text primary key,
  name        text not null,
  is_area     boolean not null default false, -- área que vende servicios (natación, ballet, gimnasio)
  color       text,
  sort_order  int not null default 0
);

insert into public.departments (code, name, is_area, color, sort_order) values
  ('direccion',      'Dirección',          false, null,      1),
  ('administracion', 'Administración',     false, null,      2),
  ('recepcion',      'Recepción',          false, null,      3),
  ('natacion',       'Natación',           true,  '#0E8793', 4),
  ('oberfit',        'Oberfit (gimnasio)', true,  '#D9480F', 5),
  ('ballet',         'Ballet',             true,  '#C2417A', 6),
  ('gimnasia',       'Gimnasia rítmica',   true,  '#7048C2', 7),
  ('terapia',        'Terapia física',     true,  '#1F7A63', 8),
  ('nutricion',      'Nutrición',          true,  '#4D8B1F', 9),
  ('cafeteria',      'Barra saludable',    false, '#9A6B12', 10),
  ('tienda',         'Tienda',             false, '#4C5A6C', 11);

-- Configuración general del club (clave/valor)
create table public.settings (
  key         text primary key,
  value       jsonb not null,
  description text,
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);

insert into public.settings (key, value, description) values
  ('club', '{"nombre":"Oberlicht","sitio":"https://oberlicht.com.mx","telefono":"","correo":"","direccion":""}', 'Datos generales del club'),
  ('fiscal', '{"rfc":"","razon_social":"","regimen_fiscal":"601","cp":"","serie":"OB","pac":"pendiente"}', 'Datos del emisor para CFDI 4.0 (PAC por definir)'),
  ('cobranza', '{"dia_corte":1,"dias_bloqueo_adeudo":10,"reintentos_dias":[3,7],"descuento_hermano_pct":10,"descuento_segundo_plan_pct":5}', 'Reglas de cobro mensual'),
  ('reservas', '{"horas_cancelacion":12,"dias_anticipacion":14}', 'Reglas de reservas'),
  ('procesador', '{"proveedor":"pendiente","modo":"pruebas"}', 'Procesador de pagos (por definir: Openpay, Conekta, Stripe MX, Mercado Pago)');

-- ─────────────────────────────────────────────────────────────
-- Usuarios
-- ─────────────────────────────────────────────────────────────

create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null default '',
  email       text,
  phone       text,
  role        public.app_role not null default 'titular',
  active      boolean not null default true,
  avatar_url  text,
  created_at  timestamptz not null default now()
);

-- Departamentos a los que pertenece cada miembro del personal
create table public.profile_departments (
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  department  text not null references public.departments(code),
  primary key (profile_id, department)
);

-- ─────────────────────────────────────────────────────────────
-- Familias y miembros (expediente único)
-- ─────────────────────────────────────────────────────────────

create sequence public.family_number_seq start 1001;

create table public.families (
  id                uuid primary key default gen_random_uuid(),
  number            int not null unique default nextval('public.family_number_seq'),
  name              text not null,                       -- p. ej. "Familia Pérez López"
  titular_profile_id uuid references public.profiles(id) on delete set null,
  email             text,
  phone             text,
  address           text,
  -- Datos fiscales (CFDI 4.0)
  rfc               text,
  razon_social      text,
  regimen_fiscal    text,
  cp_fiscal         text,
  uso_cfdi          text default 'D10',
  wants_invoice     boolean not null default false,
  -- Cobro
  card_token        text,     -- token del procesador; nunca datos de tarjeta
  card_last4        text,
  card_brand        text,
  status            text not null default 'activa' check (status in ('activa','inactiva','bloqueada')),
  notes             text,
  created_at        timestamptz not null default now(),
  created_by        uuid references public.profiles(id)
);

create table public.members (
  id                    uuid primary key default gen_random_uuid(),
  family_id             uuid not null references public.families(id) on delete cascade,
  first_name            text not null,
  last_name             text not null default '',
  birthdate             date,
  gender                text check (gender in ('F','M','X')),
  is_titular            boolean not null default false,
  email                 text,
  phone                 text,
  allergies             text,
  medical_notes         text,
  emergency_name        text,
  emergency_phone       text,
  waiver_signed_at      timestamptz,
  waiver_signed_by      text,
  photo_url             text,
  active                boolean not null default true,
  created_at            timestamptz not null default now()
);
create index on public.members (family_id);

-- ─────────────────────────────────────────────────────────────
-- Planes, niveles, ciclos y grupos
-- ─────────────────────────────────────────────────────────────

create table public.plans (
  id                 uuid primary key default gen_random_uuid(),
  department         text not null references public.departments(code),
  name               text not null,
  description        text,
  kind               text not null default 'curso' check (kind in ('curso','membresia','paquete')),
  price_monthly      numeric(10,2) not null default 0,
  enrollment_fee     numeric(10,2) not null default 0,
  sessions_per_month int,           -- bolsa de sesiones (reservas / privadas); null = ilimitado
  classes_per_week   int,
  active             boolean not null default true,
  created_at         timestamptz not null default now()
);

create table public.levels (
  id          uuid primary key default gen_random_uuid(),
  department  text not null references public.departments(code),
  name        text not null,
  description text,
  sort_order  int not null default 0,
  min_age     numeric(4,1) not null default 0,   -- años (admite 0.5 = 6 meses)
  max_age     numeric(4,1) not null default 99,
  active      boolean not null default true
);

create table public.cycles (
  id          uuid primary key default gen_random_uuid(),
  department  text not null references public.departments(code),
  name        text not null,
  starts_on   date not null,
  ends_on     date not null,
  is_current  boolean not null default false,
  check (ends_on >= starts_on)
);

create table public.groups (
  id          uuid primary key default gen_random_uuid(),
  level_id    uuid not null references public.levels(id) on delete restrict,
  cycle_id    uuid references public.cycles(id) on delete set null,
  plan_id     uuid references public.plans(id) on delete set null,
  name        text not null,
  coach_id    uuid references public.profiles(id) on delete set null,
  weekdays    int[] not null default '{}',   -- 1=lunes … 7=domingo
  start_time  time not null,
  end_time    time not null,
  capacity    int not null default 10 check (capacity > 0),
  location    text,        -- carril, salón
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table public.enrollments (
  id            uuid primary key default gen_random_uuid(),
  member_id     uuid not null references public.members(id) on delete cascade,
  group_id      uuid not null references public.groups(id) on delete cascade,
  status        text not null default 'activa' check (status in ('activa','lista_espera','congelada','baja')),
  monthly_price numeric(10,2) not null default 0,
  discount_pct  numeric(5,2) not null default 0,
  enrolled_at   timestamptz not null default now(),
  ended_at      timestamptz,
  created_by    uuid references public.profiles(id),
  notes         text
);
create index on public.enrollments (group_id, status);
create index on public.enrollments (member_id);
create unique index enrollments_unique_active on public.enrollments (member_id, group_id) where status in ('activa','lista_espera','congelada');

-- Membresías sin grupo (gimnasio, paquetes de sesiones)
create table public.memberships (
  id                 uuid primary key default gen_random_uuid(),
  member_id          uuid not null references public.members(id) on delete cascade,
  plan_id            uuid not null references public.plans(id),
  status             text not null default 'activa' check (status in ('activa','congelada','baja')),
  starts_on          date not null default current_date,
  ends_on            date,
  monthly_price      numeric(10,2) not null default 0,
  discount_pct       numeric(5,2) not null default 0,
  sessions_remaining int,
  created_at         timestamptz not null default now(),
  created_by         uuid references public.profiles(id)
);
create index on public.memberships (member_id);

-- Historial de nivel (pase de nivel por el coach)
create table public.level_history (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references public.members(id) on delete cascade,
  department  text not null references public.departments(code),
  level_id    uuid not null references public.levels(id),
  decided_by  uuid references public.profiles(id),
  notes       text,
  created_at  timestamptz not null default now()
);
create index on public.level_history (member_id, department, created_at desc);

-- Notas de avance del alumno
create table public.progress_notes (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references public.members(id) on delete cascade,
  department  text not null references public.departments(code),
  note        text not null,
  visible_to_family boolean not null default true,
  created_by  uuid references public.profiles(id),
  created_at  timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- Reservas (clases de gimnasio y sesiones privadas)
-- ─────────────────────────────────────────────────────────────

create table public.slots (
  id          uuid primary key default gen_random_uuid(),
  department  text not null references public.departments(code),
  title       text not null,
  kind        text not null default 'clase' check (kind in ('clase','privada','espacio')),
  coach_id    uuid references public.profiles(id) on delete set null,
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  capacity    int not null default 1 check (capacity > 0),
  price       numeric(10,2) not null default 0,
  location    text,
  cancelled   boolean not null default false,
  created_at  timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index on public.slots (starts_at);

create table public.bookings (
  id            uuid primary key default gen_random_uuid(),
  slot_id       uuid not null references public.slots(id) on delete cascade,
  member_id     uuid not null references public.members(id) on delete cascade,
  status        text not null default 'reservada' check (status in ('reservada','cancelada','asistio','no_asistio')),
  used_session  boolean not null default false,
  membership_id uuid references public.memberships(id),
  created_by    uuid references public.profiles(id),
  created_at    timestamptz not null default now(),
  cancelled_at  timestamptz
);
create unique index bookings_unique_active on public.bookings (slot_id, member_id) where status <> 'cancelada';

-- ─────────────────────────────────────────────────────────────
-- Asistencia
-- ─────────────────────────────────────────────────────────────

create table public.attendance (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references public.members(id) on delete cascade,
  group_id    uuid references public.groups(id) on delete cascade,
  department  text not null references public.departments(code),
  date        date not null default (now() at time zone 'America/Mexico_City')::date,
  status      text not null default 'presente' check (status in ('presente','ausente','retardo','justificada')),
  recorded_by uuid references public.profiles(id),
  recorded_at timestamptz not null default now()
);
create unique index attendance_unique on public.attendance (member_id, coalesce(group_id, '00000000-0000-0000-0000-000000000000'::uuid), date);

-- ─────────────────────────────────────────────────────────────
-- Cobranza, pagos y CFDI
-- ─────────────────────────────────────────────────────────────

create table public.charges (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid not null references public.families(id) on delete cascade,
  period      text,                 -- 'AAAA-MM' para mensualidades
  concept     text not null,
  amount      numeric(10,2) not null check (amount >= 0),
  due_date    date not null default current_date,
  status      text not null default 'pendiente' check (status in ('pendiente','pagado','vencido','cancelado')),
  attempts    int not null default 0,
  last_attempt_at timestamptz,
  paid_at     timestamptz,
  created_at  timestamptz not null default now(),
  created_by  uuid references public.profiles(id)
);
create index on public.charges (family_id, status);
create unique index charges_unique_period on public.charges (family_id, period) where period is not null and status <> 'cancelado';

create table public.charge_items (
  id          uuid primary key default gen_random_uuid(),
  charge_id   uuid not null references public.charges(id) on delete cascade,
  member_id   uuid references public.members(id) on delete set null,
  department  text references public.departments(code),
  description text not null,
  amount      numeric(10,2) not null,
  -- claves SAT para el concepto del CFDI
  sat_product_key text default '86121700',
  sat_unit_key    text default 'E48'
);

create table public.payments (
  id            uuid primary key default gen_random_uuid(),
  family_id     uuid not null references public.families(id) on delete cascade,
  charge_id     uuid references public.charges(id) on delete set null,
  amount        numeric(10,2) not null check (amount > 0),
  method        text not null check (method in ('efectivo','tarjeta','terminal','transferencia','liga')),
  status        text not null default 'aprobado' check (status in ('aprobado','rechazado','reembolsado','pendiente')),
  processor_ref text,
  reference     text,
  received_by   uuid references public.profiles(id),
  paid_at       timestamptz not null default now(),
  notes         text
);
create index on public.payments (family_id, paid_at desc);
create index on public.payments (paid_at);

create table public.invoices (
  id            uuid primary key default gen_random_uuid(),
  family_id     uuid references public.families(id) on delete set null,
  payment_id    uuid references public.payments(id) on delete set null,
  kind          text not null default 'individual' check (kind in ('individual','global')),
  period        text,
  serie         text,
  folio         int,
  uuid_sat      text,
  total         numeric(10,2) not null,
  receptor_rfc  text,
  receptor_nombre text,
  uso_cfdi      text,
  status        text not null default 'pendiente' check (status in ('pendiente','timbrada','cancelada','error')),
  pac           text,
  pdf_url       text,
  xml_url       text,
  error_message text,
  cancel_reason text,   -- motivo SAT 01-04
  issued_at     timestamptz,
  cancelled_at  timestamptz,
  created_at    timestamptz not null default now()
);
create sequence public.invoice_folio_seq start 1;

-- ─────────────────────────────────────────────────────────────
-- Avisos y bitácora
-- ─────────────────────────────────────────────────────────────

create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid references public.families(id) on delete cascade,
  channel     text not null default 'correo' check (channel in ('correo','whatsapp','sms','interno')),
  template    text not null,
  subject     text,
  body        text,
  status      text not null default 'pendiente' check (status in ('pendiente','enviado','error')),
  created_at  timestamptz not null default now(),
  sent_at     timestamptz
);

create table public.announcements (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  body        text not null,
  department  text references public.departments(code),  -- null = todo el club
  audience    text not null default 'todos' check (audience in ('todos','personal','familias')),
  starts_on   date not null default current_date,
  ends_on     date,
  created_by  uuid references public.profiles(id),
  created_at  timestamptz not null default now()
);

create table public.audit_log (
  id          bigserial primary key,
  table_name  text not null,
  record_id   text,
  action      text not null,
  changed_by  uuid,
  old_data    jsonb,
  new_data    jsonb,
  at          timestamptz not null default now()
);
