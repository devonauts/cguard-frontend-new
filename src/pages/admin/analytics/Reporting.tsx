import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import {
  Shield,
  ClipboardCheck,
  MapPin,
  AlertTriangle,
  Clock,
  TrendingUp,
  Building2,
  Award,
  ArrowRight,
} from "lucide-react";

import {
  useOpsAnalytics,
  AnalyticsShell,
  MetricCard,
  DayBars,
  HBars,
  Section,
  GOLD,
  TONES,
  toneInk,
  RangeFooter,
  GuardLink,
  PerSiteTable,
  AttendanceTiles,
} from "./_shared";

import { analyticsService, PerfLeaderboard } from "@/lib/api/analyticsService";
import { Stagger, EmptyState, StatsStrip } from "@/components/kit";

export default function Reporting() {
  const { t } = useTranslation();
  const { days, setDays, data, loading, error, reload } = useOpsAnalytics(30);
  const [lb, setLb] = useState<PerfLeaderboard | null>(null);

  useEffect(() => {
    let on = true;

    analyticsService
      .performanceGuards(days)
      .then((r) => {
        if (on) setLb(r);
      })
      .catch(() => {
        if (on) setLb(null);
      });

    return () => {
      on = false;
    };
  }, [days]);
  const k = data?.kpis;

  return (
    <AnalyticsShell
      days={days}
      error={error}
      loading={loading}
      reload={reload}
      setDays={setDays}
      subtitle={t("ui.Reporting.indicadoresClaveDelServicioDe")}
      title={t(
        "ui.Reporting.analiticasDeOperaciones",
        "Analíticas de Operaciones",
      )}
    >
      {data && k && (
        <>
          <StatsStrip className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <MetricCard
              accent={GOLD}
              icon={<Shield size={16} />}
              label="Vigilantes en servicio"
              sub="ahora mismo"
              value={k.guardsOnDuty}
            />
            <MetricCard
              accent={TONES.info}
              icon={<ClipboardCheck size={16} />}
              label={t("ui.Reporting.coberturaDeTurnos", "Cobertura de turnos")}
              pct={k.coveragePct}
              sub={`${k.shiftsCovered}/${k.shiftsTotal} cubiertos`}
              value={`${k.coveragePct}%`}
            />
            <MetricCard
              accent={TONES.ok}
              icon={<TrendingUp size={16} />}
              label="Rondas completadas"
              pct={k.rondaCompletionPct}
              sub={`${k.rondasCompleted}/${k.rondasTotal}`}
              value={`${k.rondaCompletionPct}%`}
            />
            <MetricCard
              accent={TONES.serie2}
              icon={<MapPin size={16} />}
              label={t(
                "ui.Reporting.cumplimientoDeUbicacion",
                "Cumplimiento de ubicación",
              )}
              pct={k.locationCompliancePct}
              sub={`${k.scansValid}/${k.scansTotal} escaneos`}
              value={`${k.locationCompliancePct}%`}
            />
            <MetricCard
              accent={TONES.bad}
              icon={<AlertTriangle size={16} />}
              label="Incidentes"
              sub={`${k.incidentsOpen} abiertos`}
              value={k.incidentsTotal}
            />
            <MetricCard
              accent={TONES.warn}
              icon={<Clock size={16} />}
              label="Puntualidad"
              pct={k.punctualityPct}
              sub={`${k.clockinsOnTime}/${k.clockinsTotal} a tiempo`}
              value={`${k.punctualityPct}%`}
            />
          </StatsStrip>

          {/* Team performance — official score (links to Vigilantes) */}
          {lb && lb.averageScore != null && (
            <Section
              icon={<Award size={16} />}
              title={t(
                "ui.Reporting.desempenoDelEquipo",
                "Desempeño del equipo",
              )}
            >
              <div className="grid gap-5 md:grid-cols-3">
                <div className="glass-sunken flex flex-col items-center justify-center p-4 text-center">
                  {/* `--brand-text` y no `--brand`: el relleno del acento como
                      letra sobre el lienzo se queda en 2,25:1 e ilegible. */}
                  <p
                    className="font-display text-5xl font-bold tabular-nums"
                    style={{ color: "var(--brand-text)" }}
                  >
                    {lb.averageScore}
                  </p>
                  <p
                    className="mt-1 text-xs"
                    style={{ color: "var(--ink-soft)" }}
                  >
                    {t(
                      "ui.Reporting.puntuacionPromedio100",
                      "Puntuación promedio /100",
                    )}
                  </p>
                  <p
                    className="mt-1 text-xs"
                    style={{ color: "var(--ink-faint)" }}
                  >
                    {lb.counts.scored} vigilantes evaluados ·{" "}
                    {lb.counts.excellent} excelentes
                  </p>
                </div>
                <div className="md:col-span-2">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-sm font-semibold text-foreground">
                      {t(
                        "ui.Reporting.vigilantesConMenorDesempeno",
                        "Vigilantes con menor desempeño",
                      )}
                    </p>
                    <Link
                      className="-my-1.5 inline-flex items-center gap-1 py-1.5 text-xs font-medium hover:underline"
                      style={{ color: "var(--brand-text)" }}
                      to="/analytics/guard"
                    >
                      Ver ranking completo <ArrowRight size={12} />
                    </Link>
                  </div>
                  {lb.guards.filter((g) => g.hasData).length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      {t(
                        "ui.Reporting.sinVigilantesEvaluadosEnEl",
                        "Sin vigilantes evaluados en el período.",
                      )}
                    </p>
                  ) : (
                    <ul className="space-y-1.5">
                      {lb.guards
                        .filter((g) => g.hasData)
                        .slice(-5)
                        .reverse()
                        .map((g) => (
                          // `glass-flat`: son filas repetidas, y el desenfoque por
                          // fila es lo que hunde el desplazamiento de una lista.
                          <li
                            key={g.id}
                            className="glass-flat flex items-center justify-between gap-2 px-3 py-2"
                          >
                            {/* `min-w-0` + `truncate`: un nombre largo empujaba la
                              puntuación fuera de la tarjeta en pantallas
                              estrechas en vez de recortarse. */}
                            <span className="min-w-0 truncate text-sm">
                              <GuardLink id={g.id} name={g.name} />
                            </span>
                            <span
                              className="shrink-0 text-sm font-bold tabular-nums"
                              style={{
                                color: toneInk(
                                  g.score != null && g.score >= 75
                                    ? TONES.info
                                    : g.score != null && g.score >= 60
                                      ? TONES.warn
                                      : TONES.bad,
                                ),
                              }}
                            >
                              {g.score}
                              <span
                                className="text-[10px] font-normal"
                                style={{ color: "var(--ink-faint)" }}
                              >
                                /100
                              </span>
                            </span>
                          </li>
                        ))}
                    </ul>
                  )}
                </div>
              </div>
            </Section>
          )}

          <div className="grid gap-4 lg:grid-cols-3">
            <DayBars
              color={GOLD}
              points={data.trend.map((t) => ({ k: t.date, v: t.scans }))}
              title={t(
                "ui.Reporting.escaneosDeRondaPorDia",
                "Escaneos de ronda por día",
              )}
            />
            <DayBars
              color={TONES.ok}
              points={data.trend.map((t) => ({ k: t.date, v: t.rondas }))}
              title={t(
                "ui.Reporting.rondasCompletadasPorDia",
                "Rondas completadas por día",
              )}
            />
            <DayBars
              color={TONES.bad}
              points={data.trend.map((t) => ({ k: t.date, v: t.incidents }))}
              title={t("ui.Reporting.incidentesPorDia", "Incidentes por día")}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Section
              icon={<AlertTriangle size={16} />}
              title={t("ui.Reporting.incidentesPorPrioridad")}
            >
              <HBars
                color={TONES.bad}
                empty={t(
                  "ui.Reporting.sinIncidentesEnElPeriodo",
                  "Sin incidentes en el período.",
                )}
                items={data.incidentsByPriority}
              />
            </Section>
            <Section
              icon={<Building2 size={16} />}
              title={t(
                "ui.Reporting.sitiosConMasIncidentes",
                "Sitios con más incidentes",
              )}
            >
              <HBars
                color={GOLD}
                empty={t(
                  "ui.Reporting.sinIncidentesEnElPeriodo2",
                  "Sin incidentes en el período.",
                )}
                items={data.topIncidentSites.map((s) => ({
                  label: s.site,
                  count: s.count,
                }))}
              />
            </Section>
            <Section icon={<Clock size={16} />} title={t("comun.asistencia")}>
              <AttendanceTiles attendance={data.attendance} />
            </Section>
          </div>

          <Section
            icon={<Building2 size={16} />}
            title={t("ui.Reporting.resumenPorSitioDeServicio")}
          >
            {data.perSite.length === 0 ? (
              <EmptyState
                description={t(
                  "ui.Reporting.sinActividadRegistradaEnEl",
                  "Sin actividad registrada en el período.",
                )}
                icon={<Building2 />}
                title={t("comun.sinActividad")}
              />
            ) : (
              <PerSiteTable limit={10} rows={data.perSite} />
            )}
          </Section>

          <RangeFooter data={data} />
        </>
      )}
    </AnalyticsShell>
  );
}
