import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ShieldAlert,
  ShieldCheck,
  Siren,
  FlaskConical,
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
          actions={
            <>
              <Segmented
                options={PERIODS.map((dd) => ({
                  value: String(dd),
                  label: dd === 365 ? "1 año" : `${dd} días`,
                }))}
                value={String(days)}
                onChange={(v) => setDays(Number(v))}
              />
              <Button asChild size="sm" variant="outline">
                <Link to="/alarm/queue">Cola</Link>
              </Button>
            </>
          }
          icon={<BarChart3 />}
          subtitle="Cómo se cerró cada caso y qué proporción resultó ser falsa, panel por panel."
          title={t(
            "ui.AlarmReports.reportesDeFalsasAlarmas",
            "Reportes de falsas alarmas",
          )}
        />

        {loading ? (
          <SkeletonCards className="lg:grid-cols-6" count={6} />
        ) : (
          <>
            <Stagger className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <StatCard
                accent="neutral"
                icon={<BarChart3 />}
                label="Total"
                value={o.total}
              />
              <StatCard
                accent="ok"
                icon={<ShieldCheck />}
                label="Reales"
                value={o.real}
              />
              <StatCard
                accent="warn"
                icon={<ShieldAlert />}
                label="Falsas"
                value={o.false}
              />
              <StatCard
                accent="bad"
                icon={<Siren />}
                label="Reincidentes"
                value={o.runaway}
              />
              <StatCard
                accent="neutral"
                icon={<FlaskConical />}
                label="Pruebas"
                value={o.test}
              />
              {/* La cifra que resume la salud de la cuenta lleva la MISMA escala que
                  las celdas de la tabla de abajo (50 % / 25 %). Iba en el acento
                  de marca, contradiciendo su propia tabla en la misma página. */}
              <StatCard
                accent={
                  o.falseRate >= 50 ? "bad" : o.falseRate >= 25 ? "warn" : "ok"
                }
                icon={<ShieldAlert />}
                label="Tasa falsas"
                value={`${o.falseRate}%`}
              />
            </Stagger>

            <Section icon={<BarChart3 />} title="Por panel">
              {!data?.panels || data.panels.length === 0 ? (
                <EmptyState
                  description={t(
                    "ui.AlarmReports.sinCasosCerradosConDisposicionEnElPeriodo",
                    "Sin casos cerrados con disposición en el período.",
                  )}
                  icon={<BarChart3 />}
                  title={t("comun.sinDatos", "Sin datos")}
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
