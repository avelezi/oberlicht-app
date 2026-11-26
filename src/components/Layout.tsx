import { useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, LayoutGrid, LogOut } from 'lucide-react';
import { AppShell, Avatar, BottomTabs, Sheet } from '@/design-system';
import logoOscuro from '@/design-system/assets/oberlicht-logo-fondo-oscuro.png';
import { useAuth, ROLE_NAME, deptName } from '@/lib/auth';
import { activeIdFor, navFor, tabsFor } from '@/lib/nav';
import { NavIcon } from './Icon';
import { InstallButton, ThemePicker, ThemeToggle, ThemedLogo } from './AppControls';

/** Marco de la plataforma: menú por rol/departamento; en celular, barra de marca arriba y pestañas abajo. */
export function Layout() {
  const { profile, departments, allDepartments, signOut } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [more, setMore] = useState(false);
  // Al cambiar de pantalla: cerrar «Más» y volver arriba, como en una app.
  useEffect(() => { setMore(false); window.scrollTo(0, 0); }, [loc.pathname]);
  if (!profile) return null;
  const groups = navFor(profile.role, departments);
  const items = groups.flatMap((g) => g.items);
  const tabs = tabsFor(profile.role, groups);
  const activeId = activeIdFor(loc.pathname, groups);
  const isSubpage = !items.some((i) => i.href === loc.pathname);
  const inTabs = tabs.some((t) => t.id === activeId);
  const areaNames = departments
    .filter((d) => !['direccion', 'administracion', 'recepcion'].includes(d))
    .map((d) => deptName(allDepartments, d));
  const name = profile.full_name || profile.email || '?';
  const roleLine = `${ROLE_NAME[profile.role]}${areaNames.length ? ` · ${areaNames.join(', ')}` : ''}`;

  return (
    <AppShell
      groups={groups}
      activeId={activeId}
      renderIcon={(n) => <NavIcon name={n} />}
      onNavigate={(href) => nav(href)}
      logo={<img src={logoOscuro} alt="Oberlicht" className="h-14 w-auto" />}
      footer={
        <button onClick={signOut} className="flex min-h-control w-full items-center gap-3 rounded-md px-3 text-base font-medium text-sidebar-fg hover:bg-white/5 hover:text-white">
          <LogOut className="h-5 w-5" aria-hidden /> Cerrar sesión
        </button>
      }
      mobileTopbar={
        <>
          {isSubpage ? (
            <button onClick={() => (window.history.length > 1 ? nav(-1) : nav('/'))} aria-label="Regresar"
              className="-ml-1 flex h-11 items-center gap-0.5 rounded-full pl-1 pr-3 text-[15px] font-semibold text-white/90 active:bg-white/10">
              <ChevronLeft className="h-6 w-6" aria-hidden /> Regresar
            </button>
          ) : (
            <img src={logoOscuro} alt="Oberlicht" className="ml-1 h-9 w-auto" />
          )}
          <div className="flex-1" />
          <button onClick={() => setMore(true)} aria-label="Mi cuenta y menú" className="rounded-full p-1 active:bg-white/10">
            <Avatar name={name} size={34} />
          </button>
        </>
      }
      bottomNav={
        <BottomTabs
          activeId={inTabs && !more ? activeId : 'mas'}
          onNavigate={(href) => nav(href)}
          items={[
            ...tabs.map((t) => ({ id: t.id, label: t.label, href: t.href, icon: <NavIcon name={t.icon} /> })),
            { id: 'mas', label: 'Más', icon: <LayoutGrid className="h-5 w-5" aria-hidden />, onClick: () => setMore(true) },
          ]}
        />
      }
      topbar={
        <div className="flex w-full items-center justify-end gap-2 sm:gap-3">
          <InstallButton compact />
          <ThemeToggle />
          <div className="hidden text-right sm:block">
            <p className="text-base font-semibold leading-tight">{name}</p>
            <p className="text-sm text-fg-muted">{roleLine}</p>
          </div>
          <Avatar name={name} />
        </div>
      }
    >
      <div key={loc.pathname} className="ob-page mx-auto max-w-7xl">
        <Outlet />
      </div>
      <Sheet open={more} onClose={() => setMore(false)} title="Menú">
        <div className="mb-4 flex items-center gap-3 rounded-xl bg-surface p-3 shadow-xs">
          <Avatar name={name} size={48} />
          <div className="min-w-0">
            <p className="truncate text-base font-bold">{name}</p>
            <p className="truncate text-sm text-fg-muted">{roleLine}</p>
          </div>
        </div>
        {groups.map((g, gi) => (
          <section key={gi} className="mb-4">
            {g.label && <h3 className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-wider text-fg-muted">{g.label}</h3>}
            <ul className="overflow-hidden rounded-xl bg-surface shadow-xs">
              {g.items.map((it) => {
                const active = it.id === activeId;
                return (
                  <li key={it.id} className="border-b border-border last:border-0">
                    <button onClick={() => nav(it.href)} aria-current={active ? 'page' : undefined}
                      className={`flex min-h-[52px] w-full items-center gap-3 px-3 text-left text-base font-medium active:bg-surface-sunken ${active ? 'text-primary' : 'text-fg'}`}>
                      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${active ? 'bg-primary text-primary-fg' : 'bg-primary-soft text-primary'}`}><NavIcon name={it.icon} /></span>
                      <span className="flex-1">{it.label}</span>
                      <ChevronRight className="h-4 w-4 text-fg-subtle" aria-hidden />
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
        <section className="mb-4">
          <h3 className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-wider text-fg-muted">Tema</h3>
          <ThemePicker />
        </section>
        <div className="grid gap-2">
          <InstallButton />
          <button onClick={signOut} className="flex min-h-control w-full items-center justify-center gap-2 rounded-md border border-border-strong bg-surface text-base font-semibold text-danger-700">
            <LogOut className="h-5 w-5" aria-hidden /> Cerrar sesión
          </button>
        </div>
      </Sheet>
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
