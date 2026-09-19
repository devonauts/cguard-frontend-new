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
          subtitle="Cómo se cerró cada caso y qué proporción resultó ser falsa, panel por panel."
          actions={
            <>
              <Segmented
                value={String(days)}
                onChange={(v) => setDays(Number(v))}
                options={PERIODS.map((dd) => ({
                  value: String(dd),
                  label: dd === 365 ? "1 año" : `${dd} días`,
                }))}
              />
              <Button asChild variant="outline" size="sm">
                <Link to="/alarm/queue">Cola</Link>
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
                label="Total"
                value={o.total}
                icon={<BarChart3 />}
                accent="neutral"
              />
              <StatCard
                label="Reales"
                value={o.real}
                icon={<ShieldCheck />}
                accent="ok"
              />
              <StatCard
                label="Falsas"
                value={o.false}
                icon={<ShieldAlert />}
                accent="warn"
              />
              <StatCard
                label="Reincidentes"
                value={o.runaway}
                icon={<Siren />}
                accent="bad"
              />
              <StatCard
                label="Pruebas"
                value={o.test}
                icon={<FlaskConical />}
                accent="neutral"
              />
              {/* La cifra que resume la salud de la cuenta lleva la MISMA escala que
                  las celdas de la tabla de abajo (50 % / 25 %). Iba en el acento
                  de marca, contradiciendo su propia tabla en la misma página. */}
              <StatCard
                label="Tasa falsas"
                value={`${o.falseRate}%`}
                icon={<ShieldAlert />}
                accent={
                  o.falseRate >= 50 ? "bad" : o.falseRate >= 25 ? "warn" : "ok"
                }
              />
            </StatsStrip>

            <Section title="Por panel" icon={<BarChart3 />}>
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
                  <table className="w-full text-sm">
                    <thead>
                      <tr
                        className="border-b text-left text-xs uppercase tracking-wide"
                        style={{
                          borderColor: "var(--hairline)",
                          color: "var(--ink-faint)",
                        }}
                      >
                        <th className="px-4 py-2 font-medium">Panel</th>
                        <th className="px-3 py-2 font-medium">Cuenta</th>
                        <th className="px-3 py-2 text-right font-medium">
                          Total
                        </th>
                        <th className="px-3 py-2 text-right font-medium">
                          Reales
                        </th>
                        <th className="px-3 py-2 text-right font-medium">
                          Falsas
                        </th>
                        <th className="px-3 py-2 text-right font-medium">
                          Reincidentes
                        </th>
                        <th className="px-3 py-2 text-right font-medium">
                          Tasa falsas
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
                          <td className="px-4 py-2 font-medium text-foreground">
                            {p.panelName}
                          </td>
                          <td
                            className="px-3 py-2"
                            style={{ color: "var(--ink-soft)" }}
                          >
                            {p.accountNumber || "—"}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {p.total}
                          </td>
                          <td
                            className="px-3 py-2 text-right tabular-nums"
                            style={{ color: "var(--ok-text)" }}
                          >
                            {p.real}
                          </td>
                          <td
                            className="px-3 py-2 text-right tabular-nums"
                            style={{ color: "var(--warn-text)" }}
                          >
                            {p.false}
                          </td>
                          <td
                            className="px-3 py-2 text-right tabular-nums"
                            style={{ color: "var(--bad-text)" }}
                          >
                            {p.runaway}
                          </td>
                          <td
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
