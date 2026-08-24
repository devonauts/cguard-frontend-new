import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TrendingUp, GaugeCircle } from 'lucide-react';
import { toast } from 'sonner';
import PerformanceService from '@/services/performance.service';
import { ProgressRing, MeterBar } from '@/components/charts';
import { CHART_VARS, seriesVar, type ChartTone } from '@/lib/chartColors';
import { Section, StatusBadge, DeltaPill, EmptyState, SkeletonCards, InfoNote } from '@/components/kit';
import { Switch } from '@/components/ui/switch';
import { usePermissions } from '@/hooks/usePermissions';
import type { GuardPerformance } from '../../guardDetailTypes';

type FactorKey =
  | 'punctuality'
  | 'uniform'
  | 'inventory'
  | 'consignas'
  | 'rondas'
  | 'quiz'
  | 'training'
  | 'clientRating';

/* Ocho factores = ocho categorías sin estado propio. Antes eran colores fijos
   (celeste, verde, turquesa, dorado, violeta…) que convertían el panel en un
   arcoíris ajeno al acento. Ahora son escalones del acento asignados en orden
   fijo: el factor 3 es el factor 3 aunque falten datos del 1. */
const FACTOR_COLOR: Record<FactorKey, string> = {
  punctuality: seriesVar(0),
  uniform: seriesVar(1),
  inventory: seriesVar(2),
  consignas: seriesVar(3),
  rondas: seriesVar(4),
  quiz: seriesVar(0),
  training: seriesVar(1),
  clientRating: seriesVar(2),
};

/* El TRAMO sí es un estado —bien / regular / mal— y por eso mantiene los
   colores semánticos, que el sistema deja fijos aunque el acento cambie. */
const TIER_TONE: Record<string, ChartTone> = {
  excellent: 'ok',
  good: 'brand',
  fair: 'warn',
  needs_improvement: 'bad',
};
type Props = {
  securityGuardId?: string;
  /** When set, scores a supervisor user id instead of a guard record. */
  supervisorUserId?: string;
  period?: number;
};

/**
 * Panel de desempeño de la ficha del empleado (vigilante o supervisor).
 *
 * LA NOTA PARTE DE 100 y sólo baja por lo que se mide, así que quien entró ayer
 * ve 100 —con el aviso de que aún no hay historial detrás— en vez del 0 que
 * mostraba la media ponderada cuando no había ningún factor con dato.
 *
 * Además, aquí es donde se APAGA la medición de esta persona concreta. Apagarla
 * no pone la nota a cero: la quita. Y si lo que está apagado es el interruptor
 * general de la empresa, el interruptor de la persona no se ofrece — no se
 * arregla desde aquí, y fingir que sí sería un control que no hace nada.
 */
export default function GuardPerformancePanel({
  securityGuardId,
  supervisorUserId,
  period = 30,
}: Props) {
  const { t } = useTranslation();
  const { hasPermission } = usePermissions();
  const canEdit = hasPermission('securityGuardEdit');

  const [loading, setLoading] = useState(false);
  const [perf, setPerf] = useState<GuardPerformance | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  /**
   * Una sola función de carga, usada por el montaje y por el interruptor.
   * El testigo evita que una respuesta lenta de la ficha anterior pise a la de
   * la ficha que se está mirando ahora.
   */
  const peticion = useRef(0);
  const load = useCallback(() => {
    const id = supervisorUserId || securityGuardId;
    if (!id) return Promise.resolve();
    const testigo = ++peticion.current;
    setLoading(true);
    setError(null);
    const req = supervisorUserId
      ? PerformanceService.getSupervisor(supervisorUserId, period)
      : PerformanceService.getGuard(securityGuardId as string, period);
    return req
      .then((res: { data?: GuardPerformance } | GuardPerformance) => {
        if (testigo !== peticion.current) return;
        const p = (res && 'data' in res ? res.data : res) as GuardPerformance | undefined;
        // Con la medición apagada `score` llega NULO a propósito, así que ya no
        // sirve de criterio para saber si la respuesta es utilizable.
        setPerf(p && (typeof p.score === 'number' || p.enabled === false) ? p : null);
      })
      .catch((e: unknown) => {
        if (testigo !== peticion.current) return;
        setError((e instanceof Error ? e.message : null) || 'error');
      })
      .finally(() => {
        if (testigo === peticion.current) setLoading(false);
      });
  }, [securityGuardId, supervisorUserId, period]);

  useEffect(() => {
    void load();
  }, [load]);

  const subjectUserId = perf?.subjectUserId || supervisorUserId || null;
  const measured = perf?.enabled !== false;
  const offByTenant = perf?.enabled === false && perf?.disabledBy === 'tenant';

  const toggleSubject = async (next: boolean) => {
    if (!subjectUserId) return;
    setSaving(true);
    try {
      await PerformanceService.setSubject(subjectUserId, next);
      await load();
      toast.success(
        next
          ? t('performance.toggleOn', { defaultValue: 'Se volverá a medir el desempeño de esta persona.' })
          : t('performance.toggleOff', { defaultValue: 'Se dejó de medir el desempeño de esta persona.' }),
      );
    } catch (e: any) {
      toast.error(
        e?.response?.data?.message ||
          t('performance.toggleError', { defaultValue: 'No se pudo cambiar la medición de desempeño.' }),
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Section title={t('performance.title', 'Indicador de desempeño')} icon={<TrendingUp />}>
        <SkeletonCards count={2} className="sm:grid-cols-2" />
      </Section>
    );
  }
  if (error || !perf) return null;

  /* El interruptor de la persona. No se ofrece cuando el que está apagado es el
     de la empresa: sería un control que parece resolver algo y no resuelve. */
  const subjectSwitch =
    canEdit && subjectUserId && !offByTenant ? (
      <label className="flex cursor-pointer items-center gap-2 text-xs" style={{ color: 'var(--ink-soft)' }}>
        <span>{t('performance.measureThisPerson', { defaultValue: 'Medir desempeño' })}</span>
        <Switch
          checked={measured}
          onCheckedChange={toggleSubject}
          disabled={saving}
          aria-label={t('performance.measureThisPerson', { defaultValue: 'Medir desempeño' }) as string}
        />
      </label>
    ) : null;

  const headerAction = (
    <div className="flex items-center gap-3">
      {subjectSwitch}
      <span className="text-xs tabular-nums" style={{ color: 'var(--ink-soft)' }}>
        {t('performance.period', 'Últimos {{n}} días', { n: period })}
      </span>
    </div>
  );

  if (!measured) {
    return (
      <Section title={t('performance.title', 'Indicador de desempeño')} icon={<TrendingUp />} action={headerAction}>
        <EmptyState
          icon={<GaugeCircle />}
          title={
            offByTenant
              ? t('performance.offTenantTitle', { defaultValue: 'Tu empresa no está midiendo el desempeño' })
              : t('performance.offSubjectTitle', { defaultValue: 'A esta persona no se le mide el desempeño' })
          }
          description={
            offByTenant
              ? (t('performance.offTenantHint', {
                  defaultValue:
                    'La medición está desactivada para toda la empresa en Configuración › Configuración Global de Vigilantes. Mientras siga así, nadie ve puntaje —ni aquí ni en su aplicación.',
                }) as string)
              : (t('performance.offSubjectHint', {
                  defaultValue:
                    'Ni esta ficha ni su aplicación muestran puntaje. No es una calificación de cero: simplemente no se le mide. Puedes volver a activarlo con el interruptor de arriba.',
                }) as string)
          }
        />
      </Section>
    );
  }

  const tierTone = TIER_TONE[perf.tier] || 'neutral';
  const penalty = perf.penalty || { points: 0, absences: 0, tardies: 0 };
  const bonus = perf.bonus || { points: 0, volunteerCount: 0, coverCount: 0 };
  const components: Array<{ key: FactorKey; score: number; weight: number; deduction?: number; maxDeduction?: number }> =
    perf.components || [];

  return (
    <Section title={t('performance.title', 'Indicador de desempeño')} icon={<TrendingUp />} action={headerAction}>
      <div className="space-y-4">
        {/* Todo el mundo arranca en 100. Decirlo evita que un 100 recién
            contratado se lea como un expediente impecable de años. */}
        {perf.hasSignals === false ? (
          <InfoNote tone="info">
            {t('performance.freshStart', {
              defaultValue:
                'Todo el personal arranca en 100. Aún no hay turnos ni evaluaciones en este periodo, así que no hay nada que descontar todavía.',
            })}
          </InfoNote>
        ) : null}

        <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] gap-6">
          {/* Score + tier */}
          <div className="flex flex-col items-center justify-center">
            {/* La puntuación es un valor sobre 100: un anillo lo dice y además
                enseña CUÁNTO falta, cosa que un círculo con un número no hace. */}
            <ProgressRing
              value={perf.score ?? 0}
              max={100}
              size={116}
              thickness={10}
              tone={tierTone}
              centerLabel={perf.score ?? 0}
              ariaLabel={t('performance.title', 'Indicador de desempeño') as string}
            />
            <StatusBadge tone={tierTone} dot={false} className="mt-3">
              {t(`performance.tier.${perf.tier}`, perf.tier) as string}
            </StatusBadge>
            {/* Penalización y bonificación son variaciones sobre la nota: la
                píldora del sistema para eso es `DeltaPill`, que ya trae la
                flecha, el tono y `tabular-nums`. */}
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              {penalty.points > 0 && (
                <DeltaPill direction="down">
                  {penalty.points} ({penalty.absences}
                  {t('performance.absShort', 'f')}/{penalty.tardies}
                  {t('performance.lateShort', 'a')})
                </DeltaPill>
              )}
              {bonus.points > 0 && <DeltaPill direction="up">{bonus.points}</DeltaPill>}
            </div>
            <p className="mt-2 text-center text-[11px]" style={{ color: 'var(--ink-faint)' }}>
              {t('performance.startsAt100', {
                defaultValue: 'Parte de 100 · descontado {{n}}',
                n: perf.deduction ?? 0,
              })}
            </p>
          </div>

          {/* Factor breakdown */}
          <div className="space-y-2.5">
            {components.length === 0 ? (
              <EmptyState
                icon={<TrendingUp />}
                variant="inline"
                title={t('performance.noFactors', {
                  defaultValue: 'Todavía no hay ningún factor medido en este periodo.',
                })}
              />
            ) : (
              components.map((c) => (
                <div key={c.key}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span>{t(`performance.factor.${c.key}`, c.key)}</span>
                    <span className="tabular-nums" style={{ color: 'var(--ink-soft)' }}>
                      {/* Cuánto resta de los 100, que es la pregunta que
                          realmente se hace quien mira esta barra. */}
                      {c.deduction ? `−${c.deduction} · ` : ''}
                      {c.score}
                    </span>
                  </div>
                  <MeterBar
                    height={8}
                    pct={c.score}
                    color={FACTOR_COLOR[c.key] || CHART_VARS.inkFaint}
                    ariaLabel={t(`performance.factor.${c.key}`, c.key) as string}
                  />
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </Section>
  );
}
