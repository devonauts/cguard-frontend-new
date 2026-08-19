import { useParams, useNavigate } from 'react-router-dom';
import AppLayout from '@/layouts/app-layout';
import GuardsLayout from '@/layouts/GuardsLayout';
import GuardSummary from '@/pages/admin/security-guards/components/GuardSummary/GuardSummarypage';
import { useEffect, useState } from 'react';
import securityGuardService from '@/lib/api/securityGuardService';
import guardRatingService from '@/lib/api/guardRatingService';
import GuardRatingLevel from '@/pages/admin/security-guards/GuardRatingLevel';
import { fileUrlFromFile, type FileLike } from '@/lib/fileUrl';
import { AlertCircle } from 'lucide-react';
import { StatCard, EmptyState, SkeletonBlock, SkeletonCards } from '@/components/kit';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import type { GuardDetail } from '../../guardDetailTypes';


// The loaded guard record, flattened with the derived photo URL. The linked app
// `user` (under `guard`) may carry live duty/account fields.
type OverviewGuard = GuardDetail & {
  guard?: GuardDetail['guard'] & { isOnDuty?: boolean; status?: string; hasPassword?: boolean };
};

// ── Tonos del sistema para los indicadores rápidos ──────────────────────────
type TileAccent = 'brand' | 'ok' | 'info' | 'neutral';

export default function GuardResumenPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [guard, setGuard] = useState<OverviewGuard | null>(null);
  const [loading, setLoading] = useState(false);
  const [rating, setRating] = useState<{ average: number; count: number } | null>(null);
  // Expediente laboral: la antigüedad se calcula en el servidor POR CICLOS
  // (quien se fue y volvió no se lleva de regalo los meses que estuvo fuera) y
  // las bajas viajan con la etiqueta del motivo ya resuelta.
  const [expediente, setExpediente] = useState<any | null>(null);
  useEffect(() => {
    if (!id) return;
    securityGuardService.employment(id)
      .then((d: any) => setExpediente(d))
      .catch(() => { /* la tarjeta simplemente no se pinta */ });
  }, [id]);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    guardRatingService.summary([id]).then((m) => { if (alive) setRating(m[id] || null); }).catch(() => {});
    return () => { alive = false; };
  }, [id]);

  useEffect(() => {
    if (!id) return;
    let mounted = true;
    setLoading(true);
    securityGuardService
      .get(id)
      .then((data: OverviewGuard & { profileImage?: unknown; photoUrl?: string | null }) => {
        if (!mounted) return;
        const g = (data.guard ?? data) as OverviewGuard & { profileImage?: unknown; photoUrl?: string | null };
        const fullName = g.fullName ?? `${g.firstName ?? ''} ${g.lastName ?? ''}`.trim();
        // The photo comes back on the TOP-LEVEL response as `profileImage` (a signed
        // file array), NOT on the nested `guard` user — flatten it to `photoUrl` so the
        // avatar here AND the <GuardSummary guard={guard}> child both render it.
        const pi = (data.profileImage ?? g.profileImage) as FileLike | FileLike[];
        const photoFile = (Array.isArray(pi) ? pi[0] : pi) as FileLike;
        const photoUrl = data.photoUrl ?? g.photoUrl ?? fileUrlFromFile(photoFile) ?? null;
        setGuard({ ...g, fullName, photoUrl });
      })
      .catch((err: any) => {
        console.error('Error cargando vigilante:', err);
        toast.error(t('guards.overview.loadError'));
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [id]);

  // ── Derived presentation values (from data the page already loads) ──────────
  const fullName = guard?.fullName || t('guards.profile.nav') || 'Vigilante';
  const initials =
    (fullName || '')
      .split(' ')
      .map((s: string) => s[0] || '')
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'G';
  const avatar = guard?.photoUrl || null;
  const onDuty = !!(guard?.isOnDuty ?? guard?.guard?.isOnDuty);
  const gStatus = guard?.status ?? guard?.guard?.status;
  const hasPassword = guard?.hasPassword ?? guard?.guard?.hasPassword;
  const isActivated = hasPassword && gStatus === 'active';

  // Tono del acceso a la app: verde cuando ya entró, ámbar mientras esté pendiente.
  const accessTone: TileAccent = isActivated ? 'ok' : 'neutral';
  const dutyTone: TileAccent = onDuty ? 'ok' : 'neutral';

  return (
    <AppLayout>
      <GuardsLayout navKey="keep-safe" title={t('guards.nav.resumen')}>
        <div className="mx-auto max-w-5xl space-y-6">
          {loading ? (
            <div className="space-y-6">
              <SkeletonBlock className="h-44 rounded-3xl" />
              <SkeletonCards count={4} className="grid-cols-2 sm:grid-cols-4" />
              <div className="text-center text-sm" style={{ color: 'var(--ink-soft)' }}>{t('guards.overview.loading')}</div>
            </div>
          ) : guard ? (
            <>
              {/* Identity (avatar/name/status/rating) now lives in the shared
                  GuardsLayout header card. These two tiles are REAL quick-status
                  signals derived from the loaded guard; the rest of the resumen
                  (station, performance, schedule, activity) lives in GuardSummary. */}
              <div className="grid grid-cols-2 gap-4">
                <StatCard
                  label={t('guards.profile.cards.appAccess') || 'Acceso a la app'}
                  value={isActivated ? (t('guards.profile.access.statusActive') || 'Activa') : (t('guards.profile.access.statusPending') || 'Pendiente')}
                  accent={accessTone}
                  icon={
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11c0-1.105.895-2 2-2s2 .895 2 2v2M5 13h14a2 2 0 012 2v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4a2 2 0 012-2z" />
                    </svg>
                  }
                />
                <StatCard
                  label={onDuty ? t('guards.summary.onDuty', 'En servicio') : t('guards.summary.offDuty', 'Fuera de servicio')}
                  value={onDuty ? t('guards.summary.onDutyYes', 'Sí') : t('guards.summary.onDutyNo', 'No')}
                  accent={dutyTone}
                  icon={
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  }
                />
              </div>

              {/* ── REAL STATION / PERFORMANCE / SCHEDULE / ACTIVITY ───────── */}
              <GuardSummary guard={guard} />

              {/* ── EXPEDIENTE LABORAL ─────────────────────────────────────── */}
              {expediente?.seniority && (
                <div className="glass-flat rounded-3xl p-5">
                  <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--ink-soft)' }}>
                    {t('guards.employment.title', 'Expediente laboral')}
                  </h3>
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                    <div>
                      <div className="text-xs" style={{ color: 'var(--ink-soft)' }}>{t('guards.employment.seniority', 'Antigüedad')}</div>
                      <div className="text-lg font-semibold">{expediente.seniority.label || '—'}</div>
                    </div>
                    <div>
                      <div className="text-xs" style={{ color: 'var(--ink-soft)' }}>{t('guards.employment.hiredOn', 'Fecha de ingreso')}</div>
                      <div className="text-lg font-semibold">{expediente.guard?.hiredOn || '—'}</div>
                    </div>
                    <div>
                      <div className="text-xs" style={{ color: 'var(--ink-soft)' }}>{t('guards.employment.cycles', 'Ciclos en la empresa')}</div>
                      <div className="text-lg font-semibold">{expediente.seniority.cycles ?? 1}</div>
                    </div>
                  </div>
                  {Array.isArray(expediente.terminations) && expediente.terminations.length > 0 && (
                    <div className="mt-4 space-y-2">
                      <div className="text-xs font-semibold" style={{ color: 'var(--ink-soft)' }}>
                        {t('guards.employment.terminations', 'Historial de bajas')}
                      </div>
                      {expediente.terminations.map((b: any) => (
                        <div key={b.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm" style={{ background: 'var(--glass-raised)' }}>
                          <span>
                            <strong>{String(b.terminationDate).slice(0, 10)}</strong> · {b.reasonLabel}
                            {b.reasonNote ? <span style={{ color: 'var(--ink-soft)' }}> — {b.reasonNote}</span> : null}
                          </span>
                          <span className="flex items-center gap-2 text-xs">
                            {typeof b.equipmentPending === 'number' && b.equipmentPending > 0 && (
                              <span className="rounded-full px-2 py-0.5 font-semibold" style={{ background: 'color-mix(in oklab, var(--warn) 18%, transparent)', color: 'var(--warn)' }}>
                                {t('guards.employment.equipmentPending', '{{n}} artículos sin devolver', { n: b.equipmentPending })}
                              </span>
                            )}
                            {b.rehireEligible === false && (
                              <span className="rounded-full px-2 py-0.5 font-semibold" style={{ background: 'color-mix(in oklab, var(--bad) 15%, transparent)', color: 'var(--bad)' }}>
                                {t('guards.employment.noRehire', 'No recontratable')}
                              </span>
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <EmptyState
              icon={<AlertCircle />}
              title={t('guards.overview.loadError')}
              description={t('guards.overview.empty') || 'Sin información del vigilante todavía.'}
            />
          )}
        </div>
      </GuardsLayout>
    </AppLayout>
  );
}
