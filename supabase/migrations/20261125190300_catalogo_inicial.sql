-- Oberlicht · Catálogo inicial (SUPUESTO: niveles, edades, cupos y precios provisionales
-- hasta que el club confirme los suyos; se editan desde Configuración sin tocar código).

-- Niveles de natación
insert into public.levels (department, name, description, sort_order, min_age, max_age) values
  ('natacion', 'Bebés',          'Matronatación con mamá o papá en el agua', 1, 0.5, 3),
  ('natacion', 'Preescolar',     'Familiarización y flotación',              2, 3,   5.9),
  ('natacion', 'Principiante',   'Patada, respiración y crol básico',        3, 5,   8.9),
  ('natacion', 'Intermedio',     'Crol y dorso completos',                   4, 6,   12.9),
  ('natacion', 'Avanzado',       'Cuatro estilos y vueltas',                 5, 8,   17.9),
  ('natacion', 'Pre-equipo',     'Técnica y resistencia para competir',      6, 9,   17.9),
  ('natacion', 'Adultos',        'Aprende o perfecciona a cualquier edad',   7, 16,  99);

-- Niveles de ballet
insert into public.levels (department, name, description, sort_order, min_age, max_age) values
  ('ballet', 'Baby ballet',  'Expresión corporal y musicalidad', 1, 3,  4.9),
  ('ballet', 'Pre-ballet',   'Posiciones básicas y coordinación', 2, 5,  6.9),
  ('ballet', 'Nivel I',      'Barra y centro inicial',            3, 7,  9.9),
  ('ballet', 'Nivel II',     'Técnica clásica intermedia',        4, 9,  12.9),
  ('ballet', 'Nivel III',    'Técnica avanzada y puntas',         5, 12, 17.9),
  ('ballet', 'Adultos',      'Ballet para adultos',               6, 16, 99);

-- Niveles de gimnasia rítmica
insert into public.levels (department, name, description, sort_order, min_age, max_age) values
  ('gimnasia', 'Iniciación',   'Flexibilidad, coordinación y manos libres', 1, 4,  6.9),
  ('gimnasia', 'Básico',       'Aparatos: cuerda y aro',                    2, 6,  9.9),
  ('gimnasia', 'Intermedio',   'Aparatos: pelota, mazas y cinta',           3, 8,  12.9),
  ('gimnasia', 'Pre-equipo',   'Montaje de rutinas y competencia',          4, 9,  17.9);

-- Nivel único de Oberfit (clases grupales)
insert into public.levels (department, name, description, sort_order, min_age, max_age) values
  ('oberfit', 'General', 'Clases grupales de Oberfit', 1, 15, 99);

-- Planes
insert into public.plans (department, name, description, kind, price_monthly, enrollment_fee, classes_per_week, sessions_per_month) values
  ('natacion', 'Natación 2 clases por semana',  'Mensualidad por alumno, ciclo vigente', 'curso', 1350, 600, 2, null),
  ('natacion', 'Natación 3 clases por semana',  'Mensualidad por alumno, ciclo vigente', 'curso', 1750, 600, 3, null),
  ('natacion', 'Natación bebés',                'Una clase por semana con adulto',       'curso', 990,  600, 1, null),
  ('ballet',   'Ballet 2 clases por semana',    'Mensualidad por alumna, temporada',     'curso', 1200, 500, 2, null),
  ('ballet',   'Ballet 3 clases por semana',    'Mensualidad por alumna, temporada',     'curso', 1550, 500, 3, null),
  ('gimnasia', 'Gimnasia 2 clases por semana',  'Mensualidad por alumna, temporada',     'curso', 1250, 500, 2, null),
  ('gimnasia', 'Gimnasia 3 clases por semana',  'Mensualidad por alumna, temporada',     'curso', 1600, 500, 3, null),
  ('terapia',  'Paquete 4 sesiones de terapia', 'Terapia física con especialista',      'paquete',   2200, 0, null, 4),
  ('nutricion','Consulta de nutrición mensual', 'Una consulta y seguimiento',           'paquete',   850,  0, null, 1),
  ('oberfit', 'Oberfit mensual',               'Acceso libre al gimnasio Oberfit',    'membresia', 1100, 0, null, null),
  ('oberfit', 'Oberfit + 8 clases',                'Acceso libre y 8 clases grupales',      'membresia', 1490, 0, null, 8),
  ('oberfit', 'Paquete 4 sesiones personales', 'Entrenamiento personal',                'paquete',   1800, 0, null, 4),
  ('natacion', 'Paquete 4 clases privadas',     'Clases privadas de natación',           'paquete',   2000, 0, null, 4);

-- Ciclo vigente de cada escuela
insert into public.cycles (department, name, starts_on, ends_on, is_current) values
  ('natacion', 'Ciclo Invierno 2027', date '2027-01-05', date '2027-03-27', true),
  ('ballet',   'Temporada 2026-2027', date '2026-09-01', date '2027-06-30', true),
  ('gimnasia', 'Temporada 2026-2027', date '2026-09-01', date '2027-06-30', true);

-- Grupos de ejemplo (sin coach asignado; se asignan en Configuración)
insert into public.groups (level_id, cycle_id, plan_id, name, weekdays, start_time, end_time, capacity, location)
select l.id, c.id, p.id, x.gname, x.days, x.st::time, x.et::time, x.cap, x.loc
from (values
  ('natacion','Bebés',        'Natación bebés',              'Sábado 9:00',          '{6}'::int[],     '09:00','09:45', 8,  'Chapoteadero'),
  ('natacion','Preescolar',   'Natación 2 clases por semana','Lun-Mié 16:00',        '{1,3}'::int[],   '16:00','16:45', 6,  'Carril 1'),
  ('natacion','Preescolar',   'Natación 2 clases por semana','Mar-Jue 16:00',        '{2,4}'::int[],   '16:00','16:45', 6,  'Carril 1'),
  ('natacion','Principiante', 'Natación 2 clases por semana','Lun-Mié 17:00',        '{1,3}'::int[],   '17:00','17:45', 8,  'Carril 2'),
  ('natacion','Principiante', 'Natación 3 clases por semana','Lun-Mié-Vie 16:00',    '{1,3,5}'::int[], '16:00','16:45', 8,  'Carril 2'),
  ('natacion','Intermedio',   'Natación 2 clases por semana','Mar-Jue 17:00',        '{2,4}'::int[],   '17:00','17:50', 10, 'Carril 3'),
  ('natacion','Avanzado',     'Natación 3 clases por semana','Lun-Mié-Vie 18:00',    '{1,3,5}'::int[], '18:00','19:00', 10, 'Carril 4'),
  ('natacion','Pre-equipo',   'Natación 3 clases por semana','Lun-Mié-Vie 19:00',    '{1,3,5}'::int[], '19:00','20:30', 12, 'Carriles 4-5'),
  ('natacion','Adultos',      'Natación 2 clases por semana','Mar-Jue 7:00',         '{2,4}'::int[],   '07:00','08:00', 10, 'Carril 5'),
  ('ballet',  'Baby ballet',  'Ballet 2 clases por semana',  'Mar-Jue 16:00',        '{2,4}'::int[],   '16:00','16:45', 12, 'Salón A'),
  ('ballet',  'Pre-ballet',   'Ballet 2 clases por semana',  'Lun-Mié 16:00',        '{1,3}'::int[],   '16:00','17:00', 12, 'Salón A'),
  ('ballet',  'Nivel I',      'Ballet 2 clases por semana',  'Lun-Mié 17:00',        '{1,3}'::int[],   '17:00','18:00', 14, 'Salón A'),
  ('ballet',  'Nivel II',     'Ballet 3 clases por semana',  'Lun-Mié-Vie 18:00',    '{1,3,5}'::int[], '18:00','19:30', 14, 'Salón B'),
  ('ballet',  'Nivel III',    'Ballet 3 clases por semana',  'Mar-Jue-Sáb 17:30',    '{2,4,6}'::int[], '17:30','19:30', 12, 'Salón B'),
  ('ballet',  'Adultos',      'Ballet 2 clases por semana',  'Mar-Jue 20:00',        '{2,4}'::int[],   '20:00','21:00', 14, 'Salón A'),
  ('gimnasia','Iniciación',   'Gimnasia 2 clases por semana','Mar-Jue 16:00',        '{2,4}'::int[],   '16:00','17:00', 12, 'Salón C'),
  ('gimnasia','Básico',       'Gimnasia 2 clases por semana','Lun-Mié 17:00',        '{1,3}'::int[],   '17:00','18:00', 12, 'Salón C'),
  ('gimnasia','Intermedio',   'Gimnasia 3 clases por semana','Lun-Mié-Vie 18:00',    '{1,3,5}'::int[], '18:00','19:30', 12, 'Salón C'),
  ('gimnasia','Pre-equipo',   'Gimnasia 3 clases por semana','Mar-Jue-Sáb 17:00',    '{2,4,6}'::int[], '17:00','19:30', 10, 'Salón C')
) as x(dep, lname, pname, gname, days, st, et, cap, loc)
join public.levels l on l.department = x.dep and l.name = x.lname
join public.plans p on p.department = x.dep and p.name = x.pname
left join public.cycles c on c.department = x.dep and c.is_current;
