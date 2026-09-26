import {
  ClipboardCheck,
  CheckCircle2,
  AlertCircle,
  CalendarClock,
  Building2,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  useOpsAnalytics,
  AnalyticsShell,
  MetricCard,
  HBars,
  Section,
  GOLD,
  TONES,
  pctColor,
  RangeFooter,
  SiteLink,
} from "./_shared";

import { Stagger, EmptyState, StatsStrip } from "@/components/kit";
import { MeterBar } from "@/components/charts";
import { CHART_VARS, alphaVar } from "@/lib/chartColors";

// Per-day stacked coverage: muted = scheduled, "covered" overlay in the OK tone.
function CoverageBars({
  data,
}: {
  data: { date: string; scheduled: number; covered: number }[];
}) {
  const { t } = useTranslation();
  const max = Math.max(1, ...data.map((d) => d.scheduled));

  return (
    <div>
      <div className="flex h-28 items-end gap-[2px]">
        {data.map((d, i) => (
          <div
            key={i}
            className="relative flex-1 rounded-t"
            style={{
              height: `${(d.scheduled / max) * 100}%`,
              minHeight: d.scheduled > 0 ? 2 : 0,
              background: "var(--glass-sunken)",
            }}
            title={t("ui.Scheduling.diaCubiertos", {
              defaultValue: "{{date}}: {{covered}}/{{scheduled}} cubiertos",
              date: d.date,
              covered: d.covered,
              scheduled: d.scheduled,
            })}
          >
            {/* «Cubierto» es un ESTADO, no una serie: va en el verde semántico,
                que tokens.css deja fijo aunque el acento cambie. */}
            <div
              className="absolute bottom-0 left-0 w-full rounded-t"
              style={{
                height: `${d.scheduled > 0 ? (d.covered / d.scheduled) * 100 : 0}%`,
                background: CHART_VARS.ok,
              }}
            />
          </div>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        <span>{data[0]?.date.slice(5)}</span>
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="flex items-center gap-1">
            <span
              className="h-2.5 w-2.5 rounded"
              style={{ background: CHART_VARS.ok }}
            />{" "}
            {t("ui.Scheduling.cubiertos", "Cubiertos")}
          </span>
          <span className="flex items-center gap-1">
            <span
              className="h-2.5 w-2.5 rounded"
              style={{ background: alphaVar(CHART_VARS.inkFaint, 55) }}
            />{" "}
            {t("ui.Scheduling.programados", "Programados")}
          </span>
        </span>
        <span>{data[data.length - 1]?.date.slice(5)}</span>
      </div>
    </div>
  );
}

export default function Scheduling() {
  const { t } = useTranslation();
  const { days, setDays, data, loading, error, reload } = useOpsAnalytics(30);
  const k = data?.kpis;

  return (
    <AnalyticsShell
      days={days}
      error={error}
      loading={loading}
      reload={reload}
      setDays={setDays}
      subtitle={t("ui.Scheduling.coberturaDeTurnosYHuecos")}
      title={t(
        "ui.Scheduling.planificacionDeTurnos",
        "Planificación de Turnos",
      )}
    >
      {data && k && (
        <>
          <StatsStrip className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              accent={TONES.info}
              icon={<ClipboardCheck size={16} />}
              label={t(
                "ui.Scheduling.coberturaDeTurnos",
                "Cobertura de turnos",
              )}
              pct={k.coveragePct}
              sub={`${k.shiftsCovered}/${k.shiftsTotal}`}
              value={`${k.coveragePct}%`}
            />
            <MetricCard
              accent={TONES.ok}
              icon={<CheckCircle2 size={16} />}
              label={t("ui.Scheduling.turnosCubiertos", "Turnos cubiertos")}
              sub={t("ui.Scheduling.enElPeriodo", "en el período")}
              value={k.shiftsCovered}
            />
            <MetricCard
              accent={TONES.bad}
              icon={<AlertCircle size={16} />}
              label={t("ui.Scheduling.turnosSinCubrir")}
              sub={t("ui.Scheduling.enElPeriodo2", "en el período")}
              value={k.shiftsOpen ?? k.shiftsTotal - k.shiftsCovered}
            />
            <MetricCard
              accent={GOLD}
              icon={<CalendarClock size={16} />}
              label={t(
                "ui.Scheduling.proximosSinCubrir",
                "Próximos sin cubrir",
              )}
              sub={t("ui.Scheduling.proximos7Dias", "próximos 7 días")}
              value={data.upcomingUncoveredTotal}
            />
          </StatsStrip>

          <Section
            icon={<ClipboardCheck size={16} />}
            title={t(
              "ui.Scheduling.coberturaDiaria",
              "Cobertura diaria (programados vs cubiertos)",
            )}
          >
            {data.coverageTrend.every((d) => d.scheduled === 0) ? (
              <EmptyState
                description={t(
                  "ui.Scheduling.noHayTurnosProgramadosEn",
                  "No hay turnos programados en el período.",
                )}
                icon={<CalendarClock />}
                title={t("ui.Scheduling.sinTurnosProgramados")}
              />
            ) : (
              <CoverageBars data={data.coverageTrend} />
            )}
          </Section>

          <div className="grid gap-4 lg:grid-cols-2">
            <Section
              icon={<CalendarClock size={16} />}
              title={t(
                "ui.Scheduling.proximosTurnosSinCubrir7",
                "Próximos turnos sin cubrir (7 días)",
              )}
            >
              <HBars
                color={TONES.bad}
                empty={t(
                  "ui.Scheduling.todosLosTurnosProximosEstan",
                  "¡Todos los turnos próximos están cubiertos!",
                )}
                items={data.upcomingUncovered.map((s) => ({
                  label: s.site,
                  count: s.count,
                }))}
              />
            </Section>
            <Section
              icon={<Building2 size={16} />}
              title={t("ui.Scheduling.coberturaPorSitio")}
            >
              {data.perSite.length === 0 ? (
                <EmptyState
                  description={t(
                    "ui.Scheduling.sinTurnosEnElPeriodo",
                    "Sin turnos en el período.",
                  )}
                  icon={<Building2 />}
                  title={t("ui.Scheduling.sinTurnos")}
                />
              ) : (
                <div className="space-y-2.5">
                  {data.perSite
                    .filter((s) => s.shiftsTotal > 0)
                    .slice(0, 8)
                    .map((s, i) => (
                      <div key={i}>
                        <div className="flex items-center justify-between gap-2 text-xs">
                          {/* Sin `min-w-0` el `truncate` no recorta: el nombre del
                            sitio empujaba el porcentaje fuera de la tarjeta. */}
                          <span className="min-w-0 truncate" title={s.site}>
                            <SiteLink id={s.id} name={s.site} />
                          </span>
                          <span
                            className="shrink-0"
                            style={{ color: pctColor(s.coveragePct) }}
                          >
                            {s.coveragePct}%{" "}
                            <span className="text-muted-foreground">
                              ({s.shiftsCovered}/{s.shiftsTotal})
                            </span>
                          </span>
                        </div>
                        <MeterBar
                          ariaLabel={s.site}
                          className="mt-1"
                          height={8}
                          pct={s.coveragePct}
                          tone={
                            s.coveragePct >= 90
                              ? "ok"
                              : s.coveragePct >= 70
                                ? "warn"
                                : "bad"
                          }
                        />
                      </div>
                    ))}
                </div>
              )}
            </Section>
          </div>

          <RangeFooter data={data} />
        </>
      )}
    </AnalyticsShell>
  );
}
