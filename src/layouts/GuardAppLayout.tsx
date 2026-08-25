import React from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { Shield, Calendar, CalendarOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function GuardAppLayout() {
  const { t } = useTranslation();
  const navItems = [
    { to: '/guard', icon: Shield, label: t('guard.nav.home') },
    { to: '/guard/schedule', icon: Calendar, label: t('guard.nav.schedule') },
    { to: '/guard/time-off', icon: CalendarOff, label: t('guard.nav.timeOff') },
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="bg-card border-b px-4 py-3 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-2">
          <Shield size={20} className="text-primary" />
          <span className="font-bold text-foreground text-sm">CGuard Pro</span>
        </div>
        <span className="text-xs text-muted-foreground">{t('guard.roleLabel')}</span>
      </header>

      {/* Content */}
      {/* El hueco de abajo cuenta la barra fija MÁS la franja del gesto de inicio
          (iPhone/Android con navegación por gestos): sin ella, el último elemento
          de cada pantalla quedaba tapado por la barra. */}
      <main className="flex-1 overflow-y-auto pb-[calc(5rem+env(safe-area-inset-bottom))]">
        <Outlet />
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-card border-t flex items-center justify-around pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] z-50">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/guard'}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg transition-colors ${
                isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
              }`
            }
          >
            <Icon size={20} />
            <span className="text-[10px] font-medium">{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
