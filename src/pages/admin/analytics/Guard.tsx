import { Fragment, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Shield,
  Clock,
  Award,
  Timer,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import {
  useOpsAnalytics,
  AnalyticsShell,
  MetricCard,
  Section,
  GOLD,
  TONES,
  toneInk,
  pctColor,
  RangeFooter,
  GuardLink,
  AttendanceTiles,
} from "./_shared";
import {
  analyticsService,
  PerfLeaderboard,
  GuardPerformance,
} from "@/lib/api/analyticsService";
import {
  Stagger,
  EmptyState,
  StatusBadge,
  SkeletonBlock,
  StatsStrip,
} from "@/components/kit";
import { MeterBar } from "@/components/charts";
import { CHART_VARS, alphaVar } from "@/lib/chartColors";
import i18n from "@/i18n";

/** Tramos de desempeño. Son ESTADOS (bien/regular/mal), así que van con los
 *  colores semánticos, que el sistema deja fijos aunque cambie el acento.
 *  `color` rellena (barras, puntos) y `ink` escribe: el mismo tono a la
 *  luminosidad que cada trabajo necesita. */
const TIER: Record<
  string,
  {
    label: string;
    labelKey: string;
    tone: "ok" | "info" | "warn" | "bad";
    color: string;
    ink: string;
    bg: string;
  }
> = {
  excellent: {
    label: "Excelente",
    labelKey: "ui.Guard.tier.excellent",
    tone: "ok",
    color: CHART_VARS.ok,
    ink: toneInk(CHART_VARS.ok),
    bg: alphaVar(CHART_VARS.ok, 12),
  },
  good: {
    label: "Bueno",
    labelKey: "ui.Guard.tier.good",
    tone: "info",
    color: CHART_VARS.info,
    ink: toneInk(CHART_VARS.info),
    bg: alphaVar(CHART_VARS.info, 12),
  },
  fair: {
    label: "Regular",
    labelKey: "ui.Guard.tier.fair",
    tone: "warn",
    color: CHART_VARS.warn,
    ink: toneInk(CHART_VARS.warn),
    bg: alphaVar(CHART_VARS.warn, 12),
  },
  poor: {
    label: "Bajo",
    labelKey: "ui.Guard.tier.poor",
    tone: "bad",
    color: CHART_VARS.bad,
    ink: toneInk(CHART_VARS.bad),
    bg: alphaVar(CHART_VARS.bad, 12),
  },
};
const tierOf = (t: string) => TIER[t] || TIER.poor;
/** Se traduce al pintar, no al importar el módulo. */
const tierLabel = (t: string) => {
  const tier = tierOf(t);

  return i18n.t(tier.labelKey, tier.label);
};

/** Constante de módulo: guarda la CLAVE, no la etiqueta. Un t() aquí se
 *  evaluaría al importar el fichero y congelaría el idioma de arranque; el
 *  español queda como valor por defecto y se traduce donde se pinta. */
const FACTOR_ES: Record<string, { clave: string; etiqueta: string }> = {
  punctuality: {
    clave: "performance.factor.punctuality",
    etiqueta: "Puntualidad",
  },
  uniform: { clave: "performance.factor.uniform", etiqueta: "Uniforme" },
  inventory: { clave: "performance.factor.inventory", etiqueta: "Inventario" },
  consignas: { clave: "performance.factor.consignas", etiqueta: "Consignas" },
  rondas: { clave: "performance.factor.rondas", etiqueta: "Rondas" },
  quiz: { clave: "performance.factor.quiz", etiqueta: "Examen" },
  training: { clave: "performance.factor.training", etiqueta: "Capacitación" },
};

function ScoreBadge({
  score,
  tier,
  enabled = true,
}: {
  score: number | null;
  tier: string;
  enabled?: boolean;
}) {
  const t = tierOf(tier);
  // «No se le mide» y «no hay datos» son cosas distintas, y la diferencia
  // importa: la primera es una decisión de la empresa, la segunda un vacío que
  // se llena solo trabajando.
  if (!enabled)
    return (
      <StatusBadge tone="neutral" dot={false}>
        {i18n.t("ui.Guard.sinMedir")}
      </StatusBadge>
    );
  if (score == null)
    return (
      <StatusBadge tone="neutral" dot={false}>
        {i18n.t("comun.sinDatos")}
      </StatusBadge>
    );
  return (
    <StatusBadge tone={t.tone} dot={false} className="text-sm font-bold">
      {score}
      <span className="text-[10px] font-medium opacity-80">/100</span>
    </StatusBadge>
  );
}

function FactorBars({ g }: { g: GuardPerformance }) {
  const { t } = useTranslation();
  if (g.enabled === false) {
    return (
      <p className="text-xs text-muted-foreground">
        {t(
          "ui.Guard.aEstaPersonaNoSeLeMide",
          "A esta persona no se le mide el desempeño. Puedes volver a activarlo desde su ficha, en Desempeño.",
        )}
      </p>
    );
  }
  if (!g.components?.length) {
    return (
      <p className="text-xs text-muted-foreground">
        {t(
          "ui.Guard.todaviaNoHayNingunFactor",
          "Todavía no hay ningún factor medido en el período. La puntuación parte de 100 y baja sólo por lo que se mide.",
        )}
      </p>
    );
  }
  return (
    <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
      {g.components.map((c) => {
        const f = FACTOR_ES[c.key];
        const etiqueta = f ? t(f.clave, f.etiqueta) : c.key;
        return (
          <div key={c.key} className="flex items-center gap-2">
            <span className="w-24 shrink-0 text-xs text-foreground/80">
              {etiqueta}
            </span>
            <MeterBar
              className="flex-1"
              height={8}
              pct={c.score}
              ariaLabel={etiqueta}
              tone={c.score >= 75 ? "ok" : c.score >= 50 ? "warn" : "bad"}
            />
            <span className="w-8 shrink-0 text-right text-xs font-semibold text-foreground">
              {c.score}
            </span>
            <span className="w-10 shrink-0 text-right text-[10px] text-muted-foreground">
              ×{Math.round(c.weight * 100)}%
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function Guard() {
  const { t } = useTranslation();
  const ops = useOpsAnalytics(30);
  const [lb, setLb] = useState<PerfLeaderboard | null>(null);
  const [lbLoading, setLbLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const loadLb = (period: number) => {
    setLbLoading(true);
    analyticsService
      .performanceGuards(period)
      .then(setLb)
      .catch(() => setLb(null))
      .finally(() => setLbLoading(false));
  };
  useEffect(() => {
    loadLb(ops.days); /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [ops.days]);

  const k = ops.data?.kpis;
  const counts = lb?.counts;
  const tierTotal = counts
    ? counts.excellent + counts.good + counts.fair + counts.poor
    : 0;

  return (
    <AnalyticsShell
      title={t("ui.Guard.analiticasDeVigilantes", "Analíticas de Vigilantes")}
      subtitle={t("ui.Guard.puntuacionDeDesempenoMismoAlgoritmo")}
      days={ops.days}
      setDays={ops.setDays}
      loading={ops.loading}
      error={ops.error}
      reload={() => {
        ops.reload();
        loadLb(ops.days);
      }}
    >
      {ops.data && k && (
        <>
          {/* KPIs */}
          <StatsStrip className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              icon={<Award size={16} />}
              accent={GOLD}
              value={lb?.averageScore ?? "—"}
              label={t("ui.Guard.puntuacionPromedio", "Puntuación promedio")}
              sub={t("ui.Guard.nVigilantesEvaluados", {
                defaultValue: "{{count}} vigilantes evaluados",
                count: counts?.scored ?? 0,
              })}
              pct={lb?.averageScore ?? undefined}
            />
            <MetricCard
              icon={<Shield size={16} />}
              accent={TONES.ok}
              value={counts?.excellent ?? 0}
              label={t("ui.Guard.excelentes", "Excelentes")}
              sub={t("ui.Guard.buenosBajos", {
                defaultValue: "{{good}} buenos · {{poor}} bajos",
                good: counts?.good ?? 0,
                poor: counts?.poor ?? 0,
              })}
            />
            <MetricCard
              icon={<Shield size={16} />}
              accent={TONES.info}
              value={k.guardsOnDuty}
              label={t("ui.Guard.enServicio", "En servicio")}
              sub={t("ui.Guard.ahoraMismo", "ahora mismo")}
            />
            <MetricCard
              icon={<Clock size={16} />}
              accent={TONES.warn}
              value={`${k.punctualityPct}%`}
              label={t("performance.factor.punctuality", "Puntualidad")}
              sub={t("ui.Guard.aTiempo", {
                defaultValue: "{{onTime}}/{{total}} a tiempo",
                onTime: k.clockinsOnTime,
                total: k.clockinsTotal,
              })}
              pct={k.punctualityPct}
            />
          </StatsStrip>

          {/* Tier distribution */}
          {!!tierTotal && (
            <Section
              title={t(
                "ui.Guard.distribucionDeDesempeno",
                "Distribución de desempeño",
              )}
              icon={<Award size={16} />}
            >
              <div className="flex h-3 w-full overflow-hidden rounded-full">
                {(["excellent", "good", "fair", "poor"] as const).map((t) => {
                  const v = counts![t];
                  if (!v) return null;
                  return (
                    <div
                      key={t}
                      title={`${tierLabel(t)}: ${v}`}
                      style={{
                        width: `${(v / tierTotal) * 100}%`,
                        background: tierOf(t).color,
                      }}
                    />
                  );
                })}
              </div>
              <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted-foreground">
                {(["excellent", "good", "fair", "poor"] as const).map((t) => (
                  <span key={t} className="flex items-center gap-1.5">
                    <span
                      className="h-2.5 w-2.5 rounded"
                      style={{ background: tierOf(t).color }}
                    />{" "}
                    {tierLabel(t)}:{" "}
                    <span className="font-semibold text-foreground">
                      {counts![t]}
                    </span>
                  </span>
                ))}
              </div>
            </Section>
          )}

          {/* Leaderboard */}
          <Section
            title={t("ui.Guard.rankingDeDesempeno", "Ranking de desempeño")}
            icon={<Award size={16} />}
          >
            {lbLoading ? (
              <div className="space-y-3 py-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-4">
                    <SkeletonBlock className="h-3 w-2/5" />
                    <SkeletonBlock className="h-3 w-1/5" />
                    <SkeletonBlock className="h-3 w-1/5" />
                    <SkeletonBlock className="h-3 w-1/5" />
                  </div>
                ))}
              </div>
            ) : lb && lb.enabled === false ? (
              <EmptyState
                icon={<Award />}
                title={t(
                  "ui.Guard.tuEmpresaNoEstaMidiendo",
                  "Tu empresa no está midiendo el desempeño",
                )}
                description={t(
                  "ui.Guard.laMedicionEstaDesactivada",
                  "La medición está desactivada para toda la empresa en Configuración › Vigilantes en turno. Mientras siga así, nadie tiene puntuación.",
                )}
              />
            ) : !lb || lb.guards.length === 0 ? (
              <EmptyState
                icon={<Award />}
                title={t("ui.Guard.sinEvaluaciones")}
                description={t("ui.Guard.noHayVigilantesParaEvaluar")}
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="cg-tabla-fichas min-w-full text-sm">
                  <thead className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold">#</th>
                      <th className="px-3 py-2 text-left font-semibold">
                        {t("comun.vigilante")}
                      </th>
                      <th className="px-3 py-2 text-left font-semibold">
                        {t("ui.Guard.puntuacion", "Puntuación")}
                      </th>
                      <th className="px-3 py-2 text-left font-semibold">
                        {t("ui.Guard.nivel", "Nivel")}
                      </th>
                      <th className="px-3 py-2 text-right font-semibold">
                        {t("comun.asistencia")}
                      </th>
                      <th className="px-3 py-2 text-right font-semibold">
                        {t("ui.Guard.faltas", "Faltas")}
                      </th>
                      <th className="px-3 py-2 text-right font-semibold">
                        {t("ui.Guard.atrasos", "Atrasos")}
                      </th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {lb.guards.map((g, i) => {
                      const open = expanded === g.id;
                      return (
                        <Fragment key={g.id}>
                          <tr
                            className="cursor-pointer transition-colors hover:bg-[var(--glass-sunken)]"
                            onClick={() => setExpanded(open ? null : g.id)}
                          >
                            <td className="px-3 py-2 text-muted-foreground" data-rotulo="#">
                              {g.enabled !== false && g.hasData ? i + 1 : "—"}
                            </td>
                            <td
                              data-rotulo={t("comun.vigilante")}
                          data-titulo
                              className="px-3 py-2"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <GuardLink id={g.id} name={g.name} />
                            </td>
                            <td className="px-3 py-2" data-rotulo={t("ui.Guard.puntuacion", "Puntuación")}>
                              <ScoreBadge
                                score={g.score}
                                tier={g.tier}
                                enabled={g.enabled !== false}
                              />
                            </td>
                            <td className="px-3 py-2" data-rotulo={t("ui.Guard.nivel", "Nivel")}>
                              <span
                                style={{ color: tierOf(g.tier).ink }}
                                className="text-xs font-semibold"
                              >
                                {g.enabled !== false && g.hasData
                                  ? tierLabel(g.tier)
                                  : "—"}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-right" data-rotulo={t("comun.asistencia")}>
                              {g.attendanceRate != null ? (
                                <span
                                  style={{ color: pctColor(g.attendanceRate) }}
                                >
                                  {g.attendanceRate}%
                                </span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right text-muted-foreground" data-rotulo={t("ui.Guard.faltas", "Faltas")}>
                              {g.absences}
                            </td>
                            <td className="px-3 py-2 text-right text-muted-foreground" data-rotulo={t("ui.Guard.atrasos", "Atrasos")}>
                              {g.tardies}
                            </td>
                            <td className="px-3 py-2 text-right text-muted-foreground">
                              {open ? (
                                <ChevronDown size={15} />
                              ) : (
                                <ChevronRight size={15} />
                              )}
                            </td>
                          </tr>
                          {open && (
                            <tr style={{ background: "var(--glass-sunken)" }}>
                              <td colSpan={8} className="px-6 py-3">
                                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                  {t(
                                    "ui.Guard.desgloseDeFactores",
                                    "Desglose de factores (puntaje × peso)",
                                  )}
                                </p>
                                <FactorBars g={g} />
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          {/* Attendance summary (raw) */}
          <Section
            title={t("ui.Guard.asistenciaRegistrosDeLaApp")}
            icon={<Timer size={16} />}
          >
            <AttendanceTiles
              attendance={ops.data.attendance}
              className="grid grid-cols-2 gap-3 sm:grid-cols-4"
            />
          </Section>

          <RangeFooter data={ops.data} />
        </>
      )}
    </AnalyticsShell>
  );
}
