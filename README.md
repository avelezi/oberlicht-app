# Oberlicht · Plataforma del club

Plataforma web a la medida para Oberlicht (natación, ballet, gimnasia rítmica, Oberfit, terapia, nutrición, barra y tienda).
Basada en las funciones de operación y administración de PerfectGym que sirven al club.

## Qué incluye (etapa 1)

| Ventana | Quién la ve | Para qué |
|---|---|---|
| Consola central | Dirección, Administración | KPIs, ingresos por área, cobros diarios, ocupación, alertas |
| Resumen del día / Registrar entrada | Recepción | Buscar socio, ver adeudo y salud, registrar entrada |
| Socios y familias + expediente | Recepción, Dirección (coordinación ve a sus alumnos) | Alta de familia y miembros, deslinde, clases, membresías, pagos, facturas |
| Niveles y grupos / Grupo | Todos los de su área | Niveles por edad, cupo, lista de espera, pase de nivel |
| Horario de clases / Pasar lista | Coordinación, coaches | Horario semanal y lista en tablet |
| Mi día | Coaches | Clases de hoy con acceso a pasar lista |
| Reservas | Recepción, coordinación, coaches | Abrir horarios, reservar por socio, marcar asistencia |
| Cobros | Recepción, Administración | Adeudos, cobro en mostrador, corte de caja, generar mensualidades |
| Facturación (CFDI 4.0) | Recepción, Administración | Individuales y global mensual; timbrado listo para conectar PAC |
| Planes, Personal, Configuración | Dirección, Administración | Precios, roles y departamentos, reglas, niveles y ciclos |
| Reportes, Avisos | Personal | Ingresos, asistencia, ocupación (CSV) y comunicados |
| Portal de familias | Titulares | Alta de familia, hijos, inscripción por edad, reservas, pagos y facturas |

Los permisos se aplican en la base de datos con RLS (no solo en el menú).

## Supuestos pendientes de confirmar con el club

- Catálogo inicial de niveles, edades, cupos, precios, ciclos y grupos (migración `catalogo_inicial`): **son ejemplos**.
- Una sola sede; los menores no tienen cuenta propia (la maneja el titular).
- PAC para timbrar CFDI y procesador de pagos: por definir. La app deja las facturas «por timbrar» y el pago en línea desactivado.
- Descuento por hermanos 10 %, días de gracia 10, cancelación de reservas con 12 h.
- Punto de venta de barra y tienda: etapa 2.

## Desarrollo

```bash
npm install
cp .env.example .env.local   # VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY
npm run dev
```

- Stack: Vite + React 19 + TypeScript + Tailwind 3 + Supabase + React Router 7.
- Design system: `src/design-system/` (se mantiene en `/mnt/project-files/oberlicht-design-system/`).
- Base de datos: `supabase/migrations/` (esquema, RLS, funciones de negocio, catálogo, permisos, ajustes).
- Netlify: `netlify.toml` publica `dist/` con redirección SPA.

## Dar acceso al personal

1. La persona crea su cuenta en la pantalla de entrada («Crear cuenta»).
2. Dirección entra a **Personal y permisos → Dar acceso a alguien**, escribe su correo y elige rol y departamentos.

El primer usuario de Dirección se asigna una vez desde el editor SQL de Supabase:
`update profiles set role = 'direccion' where email = '<correo>';`
