import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ShieldAlert,
  ShieldCheck,
  Siren,
  FlaskConical,
  RefreshCw,
  BarChart3,
} from "lucide-react";
import AppLayout from "@/layouts/app-layout";
import { Button } from "@/components/ui/button";
import { alarmService } from "@/lib/api/alarmService";
import {
  PageContainer,
  PageHeader,
  Section,
  StatCard,
  StatsStrip,
  Stagger,
  SkeletonCards,
  EmptyState,
  Segmented,
} from "@/components/kit";

const PERIODS = [7, 30, 90, 365];

interface FalseAlarmOverall {
  total: number;
  real: number;
  false: number;
  test: number;
  runaway: number;
  cancelled: number;
  falseRate: number;
}
interface FalseAlarmPanelRow {
  panelId: string;
  panelName: string;
  accountNumber?: string;
  total: number;
  real: number;
  false: number;
  runaway: number;
  falseRate: number;
}
interface FalseAlarmReport {
  days: number;
  overall: FalseAlarmOverall;
  panels: FalseAlarmPanelRow[];
}

export default function AlarmReports() {
  const { t } = useTranslation();
  const [days, setDays] = useState(30);
  const [data, setData] = useState<FalseAlarmReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    alarmService
      .falseAlarmReport({ days })
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [days]);

  const o = data?.overall || {
    total: 0,
    real: 0,
    false: 0,
    test: 0,
    runaway: 0,
    cancelled: 0,
    falseRate: 0,
  };

  return (
    <AppLayout>
      <PageContainer width="wide">
        <PageHeader
          icon={<BarChart3 />}
          title={t(
            "ui.AlarmReports.reportesDeFalsasAlarmas",
            "Reportes de falsas alarmas",
          )}
          subtitle={t(
            "ui.AlarmReports.comoSeCerroCadaCaso",
            "Cómo se cerró cada caso y qué proporción resultó ser falsa, panel por panel.",
          )}
          actions={
            <>
              <Segmented
                value={String(days)}
                onChange={(v) => setDays(Number(v))}
                options={PERIODS.map((dd) => ({
                  value: String(dd),
                  label:
                    dd === 365
                      ? t("ui.AlarmAnalytics.unAnio", "1 año")
                      : t("ui.AlarmAnalytics.nDias", {
                          defaultValue: "{{count}} días",
                          count: dd,
                        }),
                }))}
              />
              <Button asChild variant="outline" size="sm">
                <Link to="/alarm/queue">{t("ui.AlarmReports.cola", "Cola")}</Link>
              </Button>
            </>
          }
        />

        {loading ? (
          <SkeletonCards count={6} className="lg:grid-cols-6" />
        ) : (
          <>
            <StatsStrip className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <StatCard
                label={t("comun.total", "Total")}
                value={o.total}
                icon={<BarChart3 />}
                accent="neutral"
              />
              <StatCard
                label={t("ui.AlarmReports.reales", "Reales")}
                value={o.real}
                icon={<ShieldCheck />}
                accent="ok"
              />
              <StatCard
                label={t("ui.AlarmReports.falsas", "Falsas")}
                value={o.false}
                icon={<ShieldAlert />}
                accent="warn"
              />
              <StatCard
                label={t("ui.AlarmReports.reincidentes", "Reincidentes")}
                value={o.runaway}
                icon={<Siren />}
                accent="bad"
              />
              <StatCard
                label={t("ui.AlarmReports.pruebas", "Pruebas")}
                value={o.test}
                icon={<FlaskConical />}
                accent="neutral"
              />
              {/* La cifra que resume la salud de la cuenta lleva la MISMA escala que
                  las celdas de la tabla de abajo (50 % / 25 %). Iba en el acento
                  de marca, contradiciendo su propia tabla en la misma página. */}
              <StatCard
                label={t("ui.AlarmReports.tasaFalsas", "Tasa falsas")}
                value={`${o.falseRate}%`}
                icon={<ShieldAlert />}
                accent={
                  o.falseRate >= 50 ? "bad" : o.falseRate >= 25 ? "warn" : "ok"
                }
              />
            </StatsStrip>

            <Section title={t("ui.AlarmReports.porPanel", "Por panel")} icon={<BarChart3 />}>
              {!data?.panels || data.panels.length === 0 ? (
                <EmptyState
                  icon={<BarChart3 />}
                  title={t("comun.sinDatos", "Sin datos")}
                  description={t(
                    "ui.AlarmReports.sinCasosCerradosConDisposicionEnElPeriodo",
                    "Sin casos cerrados con disposición en el período.",
                  )}
                />
              ) : (
                <div className="overflow-x-auto -mx-1">
                  <table className="cg-tabla-fichas w-full text-sm">
                    <thead>
                      <tr
                        className="border-b text-left text-xs uppercase tracking-wide"
                        style={{
                          borderColor: "var(--hairline)",
                          color: "var(--ink-faint)",
                        }}
                      >
                        <th className="px-4 py-2 font-medium">
                          {t("ui.AlarmCaseDetail.panel", "Panel")}
                        </th>
                        <th className="px-3 py-2 font-medium">
                          {t("ui.AlarmCaseDetail.cuenta", "Cuenta")}
                        </th>
                        <th className="px-3 py-2 text-right font-medium">
                          {t("comun.total", "Total")}
                        </th>
                        <th className="px-3 py-2 text-right font-medium">
                          {t("ui.AlarmReports.reales", "Reales")}
                        </th>
                        <th className="px-3 py-2 text-right font-medium">
                          {t("ui.AlarmReports.falsas", "Falsas")}
                        </th>
                        <th className="px-3 py-2 text-right font-medium">
                          {t("ui.AlarmReports.reincidentes", "Reincidentes")}
                        </th>
                        <th className="px-3 py-2 text-right font-medium">
                          {t("ui.AlarmReports.tasaFalsas", "Tasa falsas")}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.panels.map((p) => (
                        <tr
                          key={p.panelId}
                          className="border-b transition-colors"
                          style={{ borderColor: "var(--hairline)" }}
                        >
                          <td className="px-4 py-2 font-medium text-foreground" data-rotulo={t("ui.AlarmCaseDetail.panel", "Panel")}>
                            {p.panelName}
                          </td>
                          <td
                            data-rotulo={t("ui.AlarmCaseDetail.cuenta", "Cuenta")}
                            className="px-3 py-2"
                            style={{ color: "var(--ink-soft)" }}
                          >
                            {p.accountNumber || "—"}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums" data-rotulo={t("comun.total", "Total")}>
                            {p.total}
                          </td>
                          <td
                            data-rotulo={t("ui.AlarmReports.reales", "Reales")}
                            className="px-3 py-2 text-right tabular-nums"
                            style={{ color: "var(--ok-text)" }}
                          >
                            {p.real}
                          </td>
                          <td
                            data-rotulo={t("ui.AlarmReports.falsas", "Falsas")}
                            className="px-3 py-2 text-right tabular-nums"
                            style={{ color: "var(--warn-text)" }}
                          >
                            {p.false}
                          </td>
                          <td
                            data-rotulo={t("ui.AlarmReports.reincidentes", "Reincidentes")}
                            className="px-3 py-2 text-right tabular-nums"
                            style={{ color: "var(--bad-text)" }}
                          >
                            {p.runaway}
                          </td>
                          <td
                            data-rotulo={t("ui.AlarmReports.tasaFalsas", "Tasa falsas")}
                            className="px-3 py-2 text-right font-semibold tabular-nums"
                            style={{
                              color:
                                p.falseRate >= 50
                                  ? "var(--bad-text)"
                                  : p.falseRate >= 25
                                    ? "var(--warn-text)"
                                    : "var(--ink-soft)",
                            }}
                          >
                            {p.falseRate}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>
          </>
        )}
      </PageContainer>
    </AppLayout>
  );
}
