import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TrendingUp } from 'lucide-react';
import PerformanceService from '@/services/performance.service';
import { ProgressRing, MeterBar } from '@/components/charts';
import { CHART_VARS, seriesVar, type ChartTone } from '@/lib/chartColors';
import { Section, StatusBadge, DeltaPill, EmptyState, SkeletonCards } from '@/components/kit';
import type { GuardPerformance } from '../../guardDetailTypes';

type FactorKey =
  | 'punctuality'
  | 'uniform'
  | 'inventory'
  | 'consignas'
  | 'rondas'
  | 'quiz'
  | 'training';

/* Siete factores = siete categorías sin estado propio. Antes eran siete colores
   fijos (celeste, verde, turquesa, dorado, violeta…) que convertían el panel en
   un arcoíris ajeno al acento. Ahora son escalones del acento asignados en
   orden fijo: el factor 3 es el factor 3 aunque falten datos del 1. */
const FACTOR_COLOR: Record<FactorKey, string> = {
  punctuality: seriesVar(0),
  uniform: seriesVar(1),
  inventory: seriesVar(2),
  consignas: seriesVar(3),
  rondas: seriesVar(4),
  quiz: seriesVar(0),
  training: seriesVar(1),
};

/* El TRAMO sí es un estado —bien / regular / mal— y por eso mantiene los
   colores semánticos, que el sistema deja fijos aunque el acento cambie. */
const TIER_TONE: Record<string, ChartTone> = {
  excellent: 'ok',
  good: 'brand',
  fair: 'warn',
  needs_improvement: 'bad',
};
const TIER_COLOR: Record<string, string> = {
  excellent: CHART_VARS.ok,
  good: CHART_VARS.series[0],
  fair: CHART_VARS.warn,
  needs_improvement: CHART_VARS.bad,
};

type Props = {
  securityGuardId?: string;
  /** When set, scores a supervisor user id instead of a guard record. */
  supervisorUserId?: string;
  period?: number;
};

/**
 * Read-only 8-factor performance panel for the admin guard detail. Additive —
 * sits alongside the existing KPI tooling.
 */
export default function GuardPerformancePanel({
  securityGuardId,
  supervisorUserId,
  period = 30,
}: Props) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [perf, setPerf] = useState<GuardPerformance | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const id = supervisorUserId || securityGuardId;
    if (!id) return;
    setLoading(true);
    setError(null);
    const req = supervisorUserId
      ? PerformanceService.getSupervisor(supervisorUserId, period)
      : PerformanceService.getGuard(securityGuardId as string, period);
    req
      .then((res: { data?: GuardPerformance } | GuardPerformance) => {
        if (!active) return;
        const p = (res && 'data' in res ? res.data : res) as GuardPerformance | undefined;
        setPerf(p && typeof p.score === 'number' ? p : null);
      })
      .catch((e: unknown) => active && setError((e instanceof Error ? e.message : null) || 'error'))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [securityGuardId, supervisorUserId, period]);

  if (loading) {
    return (
      <Section title={t('performance.title', 'Indicador de desempeño')} icon={<TrendingUp />}>
        <SkeletonCards count={2} className="sm:grid-cols-2" />
      </Section>
    );
  }
  if (error || !perf) return null;

  const tierColor = TIER_COLOR[perf.tier] || CHART_VARS.inkFaint;
  const tierTone = TIER_TONE[perf.tier] || 'neutral';
  const penalty = perf.penalty || { points: 0, absences: 0, tardies: 0 };
  const bonus = perf.bonus || { points: 0, volunteerCount: 0, coverCount: 0 };
  const components: Array<{ key: FactorKey; score: number; weight: number }> =
    perf.components || [];

  return (
    <Section
      title={t('performance.title', 'Indicador de desempeño')}
      icon={<TrendingUp />}
      action={
        <span className="text-xs tabular-nums" style={{ color: 'var(--ink-soft)' }}>
          {t('performance.period', 'Últimos {{n}} días', { n: period })}
        </span>
      }
    >
      {!perf.hasData ? (
        <EmptyState
          icon={<TrendingUp />}
          title={t('performance.noData', 'Aún no hay datos suficientes para calcular el desempeño.')}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] gap-6">
          {/* Score + tier */}
          <div className="flex flex-col items-center justify-center">
            {/* La puntuación es un valor sobre 100: un anillo lo dice y además
                enseña CUÁNTO falta, cosa que un círculo con un número no hace. */}
            <ProgressRing
              value={perf.score}
              max={100}
              size={116}
              thickness={10}
              tone={tierTone}
              centerLabel={perf.score}
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
              {bonus.points > 0 && (
                <DeltaPill direction="up">{bonus.points}</DeltaPill>
              )}
            </div>
          </div>

          {/* Factor breakdown */}
          <div className="space-y-2.5">
            {components.map((c) => (
              <div key={c.key}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span>
                    {t(`performance.factor.${c.key}`, c.key)}
                  </span>
                  <span className="tabular-nums" style={{ color: 'var(--ink-soft)' }}>
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
            ))}
          </div>
        </div>
      )}
    </Section>
  );
}
