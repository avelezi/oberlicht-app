import { lazy, Suspense, type ReactElement } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/lib/auth';
import { ToastProvider } from '@/lib/hooks';
import { isConfigured } from '@/lib/supabase';
import { Layout, FullPageMessage } from '@/components/Layout';
import { Loading } from '@/components/common';
import Login, { NewPassword } from '@/pages/Login';
import Instalar from '@/pages/Instalar';

const Consola = lazy(() => import('@/pages/staff/Consola'));
const Entrada = lazy(() => import('@/pages/staff/Entrada'));
const Socios = lazy(() => import('@/pages/staff/Socios'));
const Familia = lazy(() => import('@/pages/staff/Familia'));
const Niveles = lazy(() => import('@/pages/staff/Niveles'));
const Grupo = lazy(() => import('@/pages/staff/Grupo'));
const Asistencia = lazy(() => import('@/pages/staff/Asistencia'));
const Clases = lazy(() => import('@/pages/staff/Clases'));
const Reservas = lazy(() => import('@/pages/staff/Reservas'));
const Cobros = lazy(() => import('@/pages/staff/Cobros'));
const Facturacion = lazy(() => import('@/pages/staff/Facturacion'));
const Planes = lazy(() => import('@/pages/staff/Planes'));
const Reportes = lazy(() => import('@/pages/staff/Reportes'));
const Avisos = lazy(() => import('@/pages/staff/Avisos'));
const Personal = lazy(() => import('@/pages/staff/Personal'));
const Configuracion = lazy(() => import('@/pages/staff/Configuracion'));
const MiDia = lazy(() => import('@/pages/staff/MiDia'));
const Venta = lazy(() => import('@/pages/staff/Venta'));
const Analiticas = lazy(() => import('@/pages/staff/Analiticas'));
const Mantenimiento = lazy(() => import('@/pages/staff/Mantenimiento'));
const Recordatorios = lazy(() => import('@/pages/staff/Recordatorios'));
const Productos = lazy(() => import('@/pages/staff/Productos'));
const Cupones = lazy(() => import('@/pages/staff/Cupones'));
const Privadas = lazy(() => import('@/pages/staff/Privadas'));
const Casilleros = lazy(() => import('@/pages/staff/Casilleros'));
const Evaluar = lazy(() => import('@/pages/staff/Evaluar'));
const Prospectos = lazy(() => import('@/pages/staff/Prospectos'));
const Retencion = lazy(() => import('@/pages/staff/Retencion'));
const Boleta = lazy(() => import('@/pages/docs/Boleta'));
const Certificado = lazy(() => import('@/pages/docs/Certificado'));
const Prueba = lazy(() => import('@/pages/Prueba'));
const PortalInicio = lazy(() => import('@/pages/portal/Inicio'));
const PortalClases = lazy(() => import('@/pages/portal/MisClases'));
const PortalReservas = lazy(() => import('@/pages/portal/Reservar'));
const PortalPagos = lazy(() => import('@/pages/portal/MisPagos'));
const PortalCuenta = lazy(() => import('@/pages/portal/MiCuenta'));

function Home() {
  const { profile } = useAuth();
  switch (profile?.role) {
    case 'direccion': case 'administracion': case 'recepcion': case 'coordinador': return <Consola />;
    case 'coach': return <MiDia />;
    case 'ventas': return <Navigate to="/venta" replace />;
    case 'mantenimiento': return <Navigate to="/mantenimiento" replace />;
    default: return <PortalInicio />;
  }
}

function Gate() {
  const { loading, session, profile, isStaff, isFrontOffice, isManager } = useAuth();
  if (!isConfigured) {
    return (
      <FullPageMessage title="Falta conectar la base de datos">
        Configura <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_ANON_KEY</code> en Netlify (o en <code>.env.local</code>) y vuelve a publicar.
      </FullPageMessage>
    );
  }
  if (loading) return <Loading label="Abriendo Oberlicht…" />;
  if (!session) {
    return (
      <Routes>
        <Route path="/nueva-contrasena" element={<NewPassword />} />
        <Route path="/instalar" element={<Instalar />} />
        <Route path="/prueba" element={<Suspense fallback={<Loading />}><Prueba /></Suspense>} />
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }
  if (!profile) return <FullPageMessage title="Preparando tu cuenta">Vuelve a cargar la página en unos segundos.</FullPageMessage>;
  if (!profile.active) return <FullPageMessage title="Tu acceso está desactivado">Pide a Dirección que lo reactive.</FullPageMessage>;

  const staff = (el: ReactElement) => (isStaff ? el : <Navigate to="/" replace />);
  const front = (el: ReactElement) => (isFrontOffice ? el : <Navigate to="/" replace />);
  const manager = (el: ReactElement) => (isManager ? el : <Navigate to="/" replace />);
  const seller = (el: ReactElement) => (isFrontOffice || profile.role === 'ventas' ? el : <Navigate to="/" replace />);

  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/nueva-contrasena" element={<NewPassword />} />
        <Route path="/instalar" element={<Instalar />} />
        <Route path="/prueba" element={<Prueba />} />
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          {/* Personal */}
          <Route path="/entrada" element={front(<Entrada />)} />
          <Route path="/socios" element={staff(<Socios />)} />
          <Route path="/familias/:id" element={staff(<Familia />)} />
          <Route path="/niveles" element={staff(<Niveles />)} />
          <Route path="/grupos/:id" element={staff(<Grupo />)} />
          <Route path="/asistencia" element={staff(<Asistencia />)} />
          <Route path="/clases" element={staff(<Clases />)} />
          <Route path="/cobros" element={front(<Cobros />)} />
          <Route path="/facturacion" element={front(<Facturacion />)} />
          <Route path="/planes" element={manager(<Planes />)} />
          <Route path="/reportes" element={staff(<Reportes />)} />
          <Route path="/avisos" element={staff(<Avisos />)} />
          <Route path="/personal" element={manager(<Personal />)} />
          <Route path="/configuracion" element={manager(<Configuracion />)} />
          <Route path="/venta" element={seller(<Venta />)} />
          <Route path="/productos" element={(isManager || profile.role === 'ventas') ? <Productos /> : <Navigate to="/" replace />} />
          <Route path="/cupones" element={front(<Cupones />)} />
          <Route path="/privadas" element={staff(<Privadas />)} />
          <Route path="/casilleros" element={front(<Casilleros />)} />
          <Route path="/recordatorios" element={staff(<Recordatorios />)} />
          <Route path="/mantenimiento" element={staff(<Mantenimiento />)} />
          <Route path="/evaluar" element={staff(<Evaluar />)} />
          <Route path="/prospectos" element={(isFrontOffice || ['ventas', 'coordinador'].includes(profile.role)) ? <Prospectos /> : <Navigate to="/" replace />} />
          <Route path="/retencion" element={(isFrontOffice || profile.role === 'coordinador') ? <Retencion /> : <Navigate to="/" replace />} />
          <Route path="/boleta/:id" element={<Boleta />} />
          <Route path="/certificado/:id" element={<Certificado />} />
          <Route path="/analiticas" element={(isManager || profile.role === 'coordinador') ? <Analiticas /> : <Navigate to="/" replace />} />
          {/* Reservas: personal o familias */}
          <Route path="/reservas" element={isStaff ? <Reservas /> : <PortalReservas />} />
          {/* Portal de familias */}
          <Route path="/mis-clases" element={<PortalClases />} />
          <Route path="/mis-pagos" element={<PortalPagos />} />
          <Route path="/mi-cuenta" element={<PortalCuenta />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Gate />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
