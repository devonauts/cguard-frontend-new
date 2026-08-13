import { useNavigate } from 'react-router-dom';
import { Smartphone, LogOut } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { FadeIn, IconTile } from '@/components/kit';

/**
 * Friendly landing for accounts whose access is through a mobile app, not the
 * CRM (guards → worker app, supervisors → supervisor app). Shown instead of the
 * dashboard so a field user never sees a raw error. The backend also blocks these
 * accounts — this is defense-in-depth + UX.
 */
export default function AppAccessPending() {
  const navigate = useNavigate();
  let signOut: undefined | (() => Promise<void> | void);
  try { signOut = useAuth()?.signOut as any; } catch { signOut = undefined; }

  const logo = typeof localStorage !== 'undefined'
    ? (localStorage.getItem('tenantLogoUrl') || localStorage.getItem('tenantLogo') || '')
    : '';

  const handleSignOut = async () => {
    try { if (signOut) await signOut(); } catch { /* ignore */ }
    navigate('/login', { replace: true });
  };

  return (
    <div className="app-shell flex min-h-screen items-center justify-center px-4 py-10">
      <FadeIn className="w-full max-w-md">
        <div className="glass p-8 text-center">
          {logo ? (
            <img
              src={logo}
              alt=""
              className="mx-auto mb-6 h-14 w-14 rounded-2xl border object-contain p-1"
              style={{ borderColor: 'var(--hairline)', background: 'var(--glass-sunken)' }}
            />
          ) : (
            <div className="mx-auto mb-6 w-fit">
              <IconTile size="lg"><Smartphone /></IconTile>
            </div>
          )}

          <h1 className="font-display text-xl font-bold tracking-tight">
            Tu acceso es desde la aplicación
          </h1>
          <p className="mt-3 text-sm leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
            Este panel es solo para el personal administrativo. Tu trabajo se
            gestiona desde la aplicación móvil.
          </p>
          <p className="mt-3 text-sm leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
            Si todavía no tienes acceso a la app, tu administrador te lo enviará
            pronto. Cuando lo recibas, inicia sesión desde la app.
          </p>

          <Button variant="outline" className="mt-6 w-full" onClick={handleSignOut}>
            <LogOut className="mr-2 h-4 w-4" /> Cerrar sesión
          </Button>
        </div>
      </FadeIn>
    </div>
  );
}
