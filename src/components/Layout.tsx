import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { AppShell, Avatar } from '@/design-system';
import logoOscuro from '@/design-system/assets/oberlicht-logo-fondo-oscuro.png';
import { useAuth, ROLE_NAME, deptName } from '@/lib/auth';
import { activeIdFor, navFor } from '@/lib/nav';
import { NavIcon } from './Icon';
import { InstallButton, ThemeToggle, ThemedLogo } from './AppControls';

/** Marco de la plataforma: menú por rol/departamento y barra superior con el usuario. */
export function Layout() {
  const { profile, departments, allDepartments, signOut } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  if (!profile) return null;
  const groups = navFor(profile.role, departments);
  const areaNames = departments
    .filter((d) => !['direccion', 'administracion', 'recepcion'].includes(d))
    .map((d) => deptName(allDepartments, d));

  return (
    <AppShell
      groups={groups}
      activeId={activeIdFor(loc.pathname, groups)}
      renderIcon={(n) => <NavIcon name={n} />}
      onNavigate={(href) => nav(href)}
      logo={<img src={logoOscuro} alt="Oberlicht" className="h-14 w-auto" />}
      footer={
        <button onClick={signOut} className="flex min-h-control w-full items-center gap-3 rounded-md px-3 text-base font-medium text-sidebar-fg hover:bg-white/5 hover:text-white">
          <LogOut className="h-5 w-5" aria-hidden /> Cerrar sesión
        </button>
      }
      topbar={
        <div className="flex w-full items-center justify-end gap-2 sm:gap-3">
          <InstallButton compact />
          <ThemeToggle />
          <div className="hidden text-right sm:block">
            <p className="text-base font-semibold leading-tight">{profile.full_name || profile.email}</p>
            <p className="text-sm text-fg-muted">
              {ROLE_NAME[profile.role]}{areaNames.length ? ` · ${areaNames.join(', ')}` : ''}
            </p>
          </div>
          <Avatar name={profile.full_name || profile.email || '?'} />
        </div>
      }
    >
      <div className="mx-auto max-w-7xl">
        <Outlet />
      </div>
    </AppShell>
  );
}

export function FullPageMessage({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="grid min-h-screen place-items-center bg-bg p-6">
      <div className="w-full max-w-lg rounded-xl border border-border bg-surface p-8 shadow-md">
        <div className="mb-6"><ThemedLogo className="mx-auto h-14 w-auto" /></div>
        <h1 className="text-2xl font-extrabold">{title}</h1>
        <div className="mt-3 text-base text-fg-muted">{children}</div>
      </div>
    </div>
  );
}
