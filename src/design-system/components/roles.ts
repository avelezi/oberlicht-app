/**
 * Roles y departamentos de Oberlicht, y qué módulos ve cada uno en el menú lateral.
 * Es configuración de interfaz; los permisos reales viven en Supabase (RLS).
 * Íconos: nombres de lucide-react.
 */
export type RoleKey =
  | 'direccion' | 'administracion' | 'recepcion' | 'coord_natacion' | 'coord_danza'
  | 'coach' | 'oberfit' | 'barra' | 'tienda' | 'salud' | 'socio';

export interface NavItem { id: string; label: string; icon: string; href: string }
export interface NavGroup { label?: string; items: NavItem[] }

export const ROLE_LABEL: Record<RoleKey, string> = {
  direccion: 'Dirección', administracion: 'Administración y finanzas', recepcion: 'Recepción',
  coord_natacion: 'Coordinación de natación', coord_danza: 'Coordinación de ballet y gimnasia',
  coach: 'Instructor / coach', oberfit: 'Oberfit (gimnasio)', barra: 'Barra saludable', tienda: 'Tienda deportiva',
  salud: 'Terapia física y nutrición', socio: 'Socio / familia',
};

const I = {
  inicio: { id: 'inicio', label: 'Inicio', icon: 'LayoutDashboard', href: '/' },
  checkin: { id: 'checkin', label: 'Registrar entrada', icon: 'ScanLine', href: '/entrada' },
  socios: { id: 'socios', label: 'Socios y familias', icon: 'Users', href: '/socios' },
  inscripciones: { id: 'inscripciones', label: 'Inscripciones', icon: 'UserPlus', href: '/inscripciones' },
  clases: { id: 'clases', label: 'Clases y horarios', icon: 'CalendarDays', href: '/clases' },
  niveles: { id: 'niveles', label: 'Niveles y grupos', icon: 'Layers', href: '/niveles' },
  asistencia: { id: 'asistencia', label: 'Pasar lista', icon: 'ClipboardCheck', href: '/asistencia' },
  evaluaciones: { id: 'evaluaciones', label: 'Evaluaciones', icon: 'Award', href: '/evaluaciones' },
  cobros: { id: 'cobros', label: 'Cobros', icon: 'Wallet', href: '/cobros' },
  facturas: { id: 'facturas', label: 'Facturación (CFDI)', icon: 'FileText', href: '/facturacion' },
  planes: { id: 'planes', label: 'Planes y precios', icon: 'Tags', href: '/planes' },
  reservas: { id: 'reservas', label: 'Reservas', icon: 'CalendarCheck', href: '/reservas' },
  avisos: { id: 'avisos', label: 'Avisos', icon: 'Megaphone', href: '/avisos' },
  reportes: { id: 'reportes', label: 'Reportes', icon: 'BarChart3', href: '/reportes' },
  personal: { id: 'personal', label: 'Personal', icon: 'IdCard', href: '/personal' },
  ventas: { id: 'ventas', label: 'Punto de venta', icon: 'ShoppingCart', href: '/venta' },
  inventario: { id: 'inventario', label: 'Inventario', icon: 'Package', href: '/inventario' },
  citas: { id: 'citas', label: 'Citas', icon: 'Stethoscope', href: '/citas' },
  ajustes: { id: 'ajustes', label: 'Configuración', icon: 'Settings', href: '/configuracion' },
  micuenta: { id: 'micuenta', label: 'Mi cuenta', icon: 'CircleUser', href: '/mi-cuenta' },
  mispagos: { id: 'mispagos', label: 'Mis pagos', icon: 'Receipt', href: '/mis-pagos' },
  misclases: { id: 'misclases', label: 'Mis clases', icon: 'CalendarDays', href: '/mis-clases' },
} satisfies Record<string, NavItem>;

export const NAV_BY_ROLE: Record<RoleKey, NavGroup[]> = {
  direccion: [
    { items: [I.inicio] },
    { label: 'Operación', items: [I.socios, I.clases, I.reservas, I.asistencia] },
    { label: 'Dinero', items: [I.cobros, I.facturas, I.planes] },
    { label: 'Club', items: [I.reportes, I.avisos, I.personal, I.ajustes] },
  ],
  administracion: [
    { items: [I.inicio] },
    { label: 'Dinero', items: [I.cobros, I.facturas, I.planes] },
    { label: 'Socios', items: [I.socios, I.inscripciones] },
    { label: 'Análisis', items: [I.reportes] },
  ],
  recepcion: [
    { items: [I.checkin, I.inicio] },
    { label: 'Atención', items: [I.socios, I.inscripciones, I.cobros, I.reservas] },
    { label: 'Consulta', items: [I.clases, I.avisos] },
  ],
  coord_natacion: [
    { items: [I.inicio] },
    { label: 'Escuela de natación', items: [I.niveles, I.clases, I.asistencia, I.evaluaciones] },
    { label: 'Socios', items: [I.socios, I.avisos, I.reportes] },
  ],
  coord_danza: [
    { items: [I.inicio] },
    { label: 'Ballet y gimnasia', items: [I.niveles, I.clases, I.asistencia, I.evaluaciones] },
    { label: 'Socios', items: [I.socios, I.avisos, I.reportes] },
  ],
  coach: [{ items: [I.inicio, I.asistencia, I.clases, I.evaluaciones] }],
  oberfit: [{ items: [I.inicio, I.checkin, I.clases, I.reservas, I.asistencia] }],
  barra: [{ items: [I.ventas, I.inventario, I.reportes] }],
  tienda: [{ items: [I.ventas, I.inventario, I.reportes] }],
  salud: [{ items: [I.inicio, I.citas, I.socios] }],
  socio: [{ items: [I.inicio, I.misclases, I.reservas, I.mispagos, I.micuenta] }],
};

/** Pantalla con la que abre cada rol: la tarea que más hace, a un toque. */
export const HOME_BY_ROLE: Record<RoleKey, string> = {
  direccion: '/', administracion: '/cobros', recepcion: '/entrada', coord_natacion: '/', coord_danza: '/',
  coach: '/asistencia', oberfit: '/entrada', barra: '/venta', tienda: '/venta', salud: '/citas', socio: '/',
};
