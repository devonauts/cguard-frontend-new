import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Building2, Check, ChevronDown } from 'lucide-react';
import {
  getActiveTenant,
  getAvailableTenants,
  isMultiTenant,
  setActiveTenantId,
  subscribeActiveTenant,
  type AvailableTenant,
} from '@/lib/activeTenant';

/**
 * Selector de empresa.
 *
 * Sólo existe para quien administra MÁS DE UNA empresa de seguridad en
 * CGuardPro — el dueño con dos compañías, o el jefe de operaciones que lleva
 * las dos. Con una sola no renderiza nada: la inmensa mayoría no ve este
 * control jamás.
 *
 * Cambiar de empresa recarga el panel entero, a propósito: decenas de pantallas
 * guardan datos de la empresa anterior en su estado y en la caché de consultas,
 * y re-engancharlas una por una es frágil. Arrancar de cero garantiza que TODO
 * —listas, permisos, marca, indicadores— pertenece a la empresa elegida. Es el
 * mismo patrón del cambio de espacio de Slack.
 */
export default function TenantSwitcher() {
  const { t } = useTranslation();
  const [abierto, setAbierto] = useState(false);
  const [, forzar] = useState(0);
  const caja = useRef<HTMLDivElement | null>(null);

  useEffect(() => subscribeActiveTenant(() => forzar((n) => n + 1)), []);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false);
    };
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false); };
    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', fuera);
      document.removeEventListener('keydown', escape);
    };
  }, [abierto]);

  if (!isMultiTenant()) return null;

  const activa = getActiveTenant();
  const empresas = getAvailableTenants();

  const elegir = (tid: string) => {
    setAbierto(false);
    if (tid === activa?.tenantId) return;
    setActiveTenantId(tid);
    window.location.reload();
  };

  return (
    <div className="relative" ref={caja}>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={abierto}
        className="cg-focus cg-btn-glass flex h-9 max-w-[13rem] items-center gap-2 rounded-xl px-2.5 text-sm font-semibold"
        title={t('tenant.switch', { defaultValue: 'Cambiar de empresa' }) as string}
      >
        {activa?.logoUrl ? (
          <img src={activa.logoUrl} alt="" className="h-5 w-5 shrink-0 rounded-md object-cover" />
        ) : (
          <Building2 className="h-4 w-4 shrink-0" style={{ color: 'var(--brand-text)' }} />
        )}
        <span className="truncate" style={{ color: 'var(--ink)' }}>
          {activa?.name || t('tenant.company', { defaultValue: 'Empresa' })}
        </span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--ink-faint)' }} />
      </button>

      {abierto && (
        <div className="absolute right-0 top-full z-50 mt-2 w-[17rem]">
          <div className="glass-raised cg-flotante cc-rise p-1.5" role="listbox">
            <p
              className="px-2.5 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-wide"
              style={{ color: 'var(--ink-faint)' }}
            >
              {t('tenant.switchHeader', { defaultValue: '¿Con qué empresa vas a trabajar?' })}
            </p>
            {empresas.map((e: AvailableTenant) => {
              const esta = e.tenantId === activa?.tenantId;
              return (
                <button
                  key={e.tenantId}
                  type="button"
                  role="option"
                  aria-selected={esta}
                  onClick={() => elegir(e.tenantId)}
                  className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors"
                  style={esta
                    ? { background: 'var(--brand-wash)', boxShadow: 'inset 0 0 0 1px var(--brand-line)' }
                    : undefined}
                >
                  {e.logoUrl ? (
                    <img src={e.logoUrl} alt="" className="h-6 w-6 shrink-0 rounded-md object-cover" />
                  ) : (
                    <span
                      className="grid h-6 w-6 shrink-0 place-items-center rounded-md"
                      style={{ background: 'var(--glass-sunken)' }}
                    >
                      <Building2 className="h-3.5 w-3.5" style={{ color: 'var(--ink-faint)' }} />
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                    {e.name}
                  </span>
                  {esta && <Check className="h-4 w-4 shrink-0" style={{ color: 'var(--brand-text)' }} />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
