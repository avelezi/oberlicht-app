import type { NavGroup, NavItem } from '@/design-system';
import type { AppRole, DeptCode } from './types';

// Rutas de la app y qué ve cada rol. Los permisos reales viven en Supabase (RLS);
// este menú solo muestra a cada persona las ventanas de su trabajo.

const I = {
  consola:     { id: 'inicio', label: 'Consola central', icon: 'LayoutDashboard', href: '/' },
  inicio:      { id: 'inicio', label: 'Inicio', icon: 'LayoutDashboard', href: '/' },
  midia:       { id: 'inicio', label: 'Mi día', icon: 'Sun', href: '/' },
  entrada:     { id: 'entrada', label: 'Registrar entrada', icon: 'ScanLine', href: '/entrada' },
  socios:      { id: 'socios', label: 'Socios y familias', icon: 'Users', href: '/socios' },
  niveles:     { id: 'niveles', label: 'Niveles y grupos', icon: 'Layers', href: '/niveles' },
  clases:      { id: 'clases', label: 'Horario de clases', icon: 'CalendarDays', href: '/clases' },
  asistencia:  { id: 'asistencia', label: 'Pasar lista', icon: 'ClipboardCheck', href: '/asistencia' },
  reservas:    { id: 'reservas', label: 'Reservas', icon: 'CalendarCheck', href: '/reservas' },
  cobros:      { id: 'cobros', label: 'Cobros', icon: 'Wallet', href: '/cobros' },
  facturas:    { id: 'facturas', label: 'Facturación (CFDI)', icon: 'FileText', href: '/facturacion' },
  planes:      { id: 'planes', label: 'Planes y precios', icon: 'Tags', href: '/planes' },
  reportes:    { id: 'reportes', label: 'Reportes', icon: 'BarChart3', href: '/reportes' },
  analiticas:  { id: 'analiticas', label: 'Analíticas', icon: 'LineChart', href: '/analiticas' },
  avisos:      { id: 'avisos', label: 'Avisos', icon: 'Megaphone', href: '/avisos' },
  personal:    { id: 'personal', label: 'Personal y permisos', icon: 'IdCard', href: '/personal' },
  ajustes:     { id: 'ajustes', label: 'Configuración', icon: 'Settings', href: '/configuracion' },
  ventas:      { id: 'ventas', label: 'Punto de venta', icon: 'ShoppingCart', href: '/venta' },
  productos:   { id: 'productos', label: 'Productos e inventario', icon: 'Package', href: '/productos' },
  cupones:     { id: 'cupones', label: 'Promociones y referidos', icon: 'TicketPercent', href: '/cupones' },
  privadas:    { id: 'privadas', label: 'Clases privadas', icon: 'UserCheck', href: '/privadas' },
  casilleros:  { id: 'casilleros', label: 'Casilleros', icon: 'KeyRound', href: '/casilleros' },
  recordatorios: { id: 'recordatorios', label: 'Recordatorios', icon: 'BellRing', href: '/recordatorios' },
  evaluar:     { id: 'evaluar', label: 'Evaluar habilidades', icon: 'Award', href: '/evaluar' },
  prospectos:  { id: 'prospectos', label: 'Prospectos y pruebas', icon: 'UserPlus', href: '/prospectos' },
  retencion:   { id: 'retencion', label: 'Retención', icon: 'HeartHandshake', href: '/retencion' },
  mant:        { id: 'mant', label: 'Mantenimiento', icon: 'Wrench', href: '/mantenimiento' },
  misclases:   { id: 'misclases', label: 'Clases e inscripciones', icon: 'CalendarDays', href: '/mis-clases' },
  misreservas: { id: 'reservas', label: 'Reservar', icon: 'CalendarCheck', href: '/reservas' },
  mispagos:    { id: 'mispagos', label: 'Pagos y facturas', icon: 'Receipt', href: '/mis-pagos' },
  micuenta:    { id: 'micuenta', label: 'Mi familia', icon: 'CircleUser', href: '/mi-cuenta' },
  progreso:    { id: 'progreso', label: 'Mi progreso y retos', icon: 'Trophy', href: '/progreso' },
  progresoclub: { id: 'progresoclub', label: 'Progreso y retos', icon: 'Trophy', href: '/progreso-club' },
  rutinas:     { id: 'rutinas', label: 'Rutinas con IA', icon: 'Sparkles', href: '/rutinas' },
  biblioteca:  { id: 'biblioteca', label: 'Biblioteca de ejercicios', icon: 'BookOpen', href: '/biblioteca' },
  programas:   { id: 'programas', label: 'Programas por ciclo', icon: 'CalendarRange', href: '/programas' },
  eventos:     { id: 'eventos', label: 'Eventos y competencias', icon: 'CalendarHeart', href: '/eventos' },
  escuela:     { id: 'escuela', label: 'Escuela de coaches', icon: 'GraduationCap', href: '/escuela-coaches' },
  encasa:      { id: 'encasa', label: 'En casa y eventos', icon: 'House', href: '/en-casa' },
} satisfies Record<string, NavItem>;

const BOOKABLE: DeptCode[] = ['oberfit', 'terapia', 'nutricion', 'natacion'];

export function navFor(role: AppRole, depts: DeptCode[]): NavGroup[] {
  const book = depts.some((d) => BOOKABLE.includes(d)) ? [I.reservas] : [];
  const pool = depts.includes('natacion') || depts.includes('mantenimiento') ? [I.mant] : [];
  switch (role) {
    case 'direccion':
      return [
        { items: [I.consola] },
        { label: 'Operación', items: [I.entrada, I.socios, I.niveles, I.clases, I.reservas, I.asistencia, I.evaluar, I.privadas, I.casilleros] },
        { label: 'Crecer', items: [I.prospectos, I.retencion, I.progresoclub] },
        { label: 'Academia', items: [I.rutinas, I.biblioteca, I.programas, I.eventos, I.escuela] },
        { label: 'Dinero', items: [I.cobros, I.facturas, I.planes, I.ventas, I.productos, I.cupones] },
        { label: 'Club', items: [I.analiticas, I.recordatorios, I.mant, I.reportes, I.avisos, I.personal, I.ajustes] },
      ];
    case 'administracion':
      return [
        { items: [I.consola] },
        { label: 'Dinero', items: [I.cobros, I.facturas, I.planes, I.ventas, I.productos, I.cupones] },
        { label: 'Socios', items: [I.socios, I.prospectos, I.retencion, I.progresoclub, I.niveles, I.privadas, I.casilleros, I.recordatorios] },
        { label: 'Academia', items: [I.rutinas, I.biblioteca, I.programas, I.eventos, I.escuela] },
        { label: 'Club', items: [I.analiticas, I.mant, I.reportes, I.avisos, I.personal, I.ajustes] },
      ];
    case 'recepcion':
      return [
        { items: [I.entrada, I.inicio] },
        { label: 'Atención', items: [I.socios, I.prospectos, I.cobros, I.reservas, I.ventas, I.privadas, I.casilleros, I.recordatorios, I.retencion, I.progresoclub, I.eventos] },
        { label: 'Consulta', items: [I.niveles, I.clases, I.avisos, I.mant] },
      ];
    case 'coordinador':
      return [
        { items: [I.inicio] },
        { label: 'Mi departamento', items: [I.niveles, I.clases, I.asistencia, I.evaluar, ...book, I.privadas] },
        { label: 'Academia', items: [I.rutinas, I.biblioteca, I.programas, I.eventos, I.escuela] },
        { label: 'Seguimiento', items: [I.socios, I.prospectos, I.retencion, I.progresoclub, I.recordatorios, I.analiticas, I.avisos, I.reportes, I.mant] },
      ];
    case 'coach':
      return [
        { items: [I.midia, I.asistencia, I.evaluar, I.progresoclub, I.clases, ...book, I.privadas, ...pool] },
        { label: 'Academia', items: [I.rutinas, I.biblioteca, I.programas, I.escuela, I.eventos] },
      ];
    case 'ventas':
      return [{ items: [I.ventas, I.productos, I.prospectos, I.avisos] }];
    case 'mantenimiento':
      return [{ items: [I.mant, I.avisos] }];
    case 'titular':
    default:
      return [{ items: [I.inicio, I.misclases, I.progreso, I.encasa, I.misreservas, I.mispagos, I.micuenta] }];
  }
}

/** Pantalla con la que abre cada rol: su tarea más frecuente. */
export const HOME_BY_ROLE: Record<AppRole, string> = {
  direccion: '/', administracion: '/', recepcion: '/entrada', coordinador: '/', coach: '/', ventas: '/venta', mantenimiento: '/mantenimiento', titular: '/',
};

export function activeIdFor(pathname: string, groups: NavGroup[]): string {
  const items = groups.flatMap((g) => g.items);
  const exact = items.find((i) => i.href === pathname);
  if (exact) return exact.id;
  const pref = items.filter((i) => i.href !== '/' && pathname.startsWith(i.href)).sort((a, b) => b.href.length - a.href.length)[0];
  if (pref) return pref.id;
  if (pathname.startsWith('/familias')) return 'socios';
  if (pathname.startsWith('/grupos')) return 'niveles';
  return 'inicio';
}

/** Barra inferior en celular: las 4 pantallas que cada rol usa más. El resto vive en «Más». */
const TABS_BY_ROLE: Record<AppRole, string[]> = {
  direccion: ['inicio', 'socios', 'cobros', 'analiticas'],
  administracion: ['inicio', 'cobros', 'socios', 'ventas'],
  recepcion: ['entrada', 'socios', 'cobros', 'ventas'],
  coordinador: ['inicio', 'asistencia', 'niveles', 'socios'],
  coach: ['inicio', 'asistencia', 'rutinas', 'evaluar'],
  ventas: ['ventas', 'productos', 'prospectos', 'avisos'],
  mantenimiento: ['mant', 'avisos'],
  titular: ['inicio', 'misclases', 'reservas', 'mispagos'],
};

/** Nombres cortos para la barra inferior (las etiquetas del menú no caben). */
const SHORT: Record<string, string> = {
  inicio: 'Inicio', entrada: 'Entrada', socios: 'Socios', cobros: 'Cobros', analiticas: 'Analíticas', ventas: 'Venta',
  asistencia: 'Lista', niveles: 'Grupos', clases: 'Horario', privadas: 'Privadas', productos: 'Inventario', avisos: 'Avisos',
  mant: 'Mantenim.', rutinas: 'Rutinas', biblioteca: 'Biblioteca', eventos: 'Eventos', escuela: 'Escuela', encasa: 'En casa', misclases: 'Clases', reservas: 'Reservar', mispagos: 'Pagos',
  evaluar: 'Evaluar', prospectos: 'Prospectos', retencion: 'Retención', progreso: 'Progreso', progresoclub: 'Retos',
};

export function tabsFor(role: AppRole, groups: NavGroup[]): NavItem[] {
  const items = groups.flatMap((g) => g.items);
  return TABS_BY_ROLE[role]
    .map((id) => items.find((i) => i.id === id))
    .filter((i): i is NavItem => !!i)
    .map((i) => ({ ...i, label: SHORT[i.id] ?? i.label }));
}
