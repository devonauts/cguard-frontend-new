import type { ExportFormat } from "@/lib/export/reportExport";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  Activity,
  Clock,
  Send,
  ShieldCheck,
  TrendingUp,
  AlertTriangle,
  PhoneCall,
  Users,
  BarChart3,
} from "lucide-react";

import { SeverityBars, categoryTone, priorityTone } from "./shared";

import AppLayout from "@/layouts/app-layout";
import {
  MetricCard,
  DayBars,
  HBars,
  Section,
  GOLD,
  TONES,
} from "@/pages/admin/analytics/_shared";
import { alarmService } from "@/lib/api/alarmService";
import ExportMenu from "@/components/reports/ExportMenu";
import {
  PageContainer,
  PageHeader,
  Stagger,
  SkeletonCards,
  EmptyState,
  Segmented,
} from "@/components/kit";
import { Button } from "@/components/ui/button";
import { tablaDeEtiquetas } from "@/lib/i18nLabel";

const PERIODS = [7, 30, 90, 365];

function fmtDur(sec?: number): string {
  if (!sec || sec <= 0) return "—";
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;

  return s ? `${m}m ${s}s` : `${m}m`;
}

/** Se resuelven AL LEERLAS: la tabla se evalúa al importar el módulo, antes de
 *  que i18next sepa qué idioma quiere el usuario. Comparte las claves con
 *  `CATEGORY_META` de ./shared para que la misma categoría no salga con dos
 *  nombres en dos pantallas hermanas. */
const CAT_LABEL: Record<string, string> = tablaDeEtiquetas({
  burglary: "alarm.category.burglary",
  fire: "alarm.category.fire",
  holdup: "alarm.category.holdup",
  panic: "alarm.category.panic",
  medical: "alarm.category.medical",
  tamper: "alarm.category.tamper",
  trouble: "alarm.category.trouble",
  openclose: "alarm.category.openclose",
  test: "alarm.category.test",
  supervisory: "alarm.category.supervisory",
  restore: "alarm.category.restore",
  desconocido: "alarm.category.desconocido",
});

/** `raw` conserva la clave original del backend además de la etiqueta ya
 *  traducida: es lo que permite decidir la GRAVEDAD de cada barra después de
 *  ordenarlas, cuando el orden ya no coincide con el del objeto de entrada. */
function toItems(obj: Record<string, number>, labeler?: (k: string) => string) {
  return Object.entries(obj || {})
    .map(([k, v]) => ({
      raw: k,
      label: labeler ? labeler(k) : k,
      count: v as number,
    }))
    .sort((a, b) => b.count - a.count);
}

interface AlarmAnalyticsData {
  total: number;
  open: number;
  avgTtaSec: number;
  avgTtdSec: number;
  avgTtrSec: number;
  slaAckCompliance: number;
  escalationRate: number;
  falseRate: number;
  ecvSatisfiedCases: number;
  totalCalls: number;
  trend?: Array<{ k: string; v: number }>;
  byCategory: Record<string, number>;
  byPriority: Record<string, number>;
  dispatchByType: Record<string, number>;
  operators?: Array<{
    operatorId: string;
    name: string;
    handled: number;
    avgTtaSec: number;
    avgTtdSec: number;
  }>;
}

export default function AlarmAnalytics() {
  const { t } = useTranslation();
  const [days, setDays] = useState(30);
  const [d, setD] = useState<AlarmAnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    setLoading(true);
    alarmService
      .analytics({ days })
      .then(setD)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [days]);

  /**
   * El rastro de cumplimiento de la central, en CSV, Excel o PDF.
   *
   * Antes esta pantalla se bajaba el JSON de la auditoría y montaba el CSV a
   * mano, con una consecuencia fea: las columnas del archivo eran las claves
   * crudas del JSON (`caseId`, `disposition`, `at`), no rótulos legibles. Ahora
   * el archivo lo arma el servidor —con nombres de columna de verdad— y esta
   * pantalla sólo pide el formato. El PDF es lo que se le entrega a un auditor
   * de central receptora, que es a quien va dirigido este informe.
   */
  const exportAudit = async (format: ExportFormat) => {
    setExporting(true);
    try {
      await alarmService.auditExportFile(format, { days });
      toast.success(t("alarm.analytics.exportAuditOk", "Auditoría exportada"));
    } catch (e) {
      toast.error(
        (e as Error)?.message ||
          t(
            "alarm.analytics.exportAuditFailed",
            "No se pudo exportar la auditoría",
          ),
      );
    } finally {
      setExporting(false);
    }
  };

  return (
    <AppLayout>
      <PageContainer width="wide">
        <PageHeader
          actions={
            <>
              <Segmented
                options={PERIODS.map((p) => ({
                  value: String(p),
                  label: p === 365 ? "1 año" : `${p} días`,
                }))}
                value={String(days)}
                onChange={(v) => setDays(Number(v))}
              />
              <ExportMenu
                busy={exporting}
                label={t("alarm.analytics.exportAudit", "Exportar historial")}
                size="sm"
                onExport={exportAudit}
              />
              <Button asChild size="sm" variant="ghost">
                <Link to="/alarm/reports">Falsas alarmas →</Link>
              </Button>
            </>
          }
          icon={<Activity />}
          subtitle={t("ui.AlarmAnalytics.tiemposDeRespuestaCumplimientoDe")}
          title={t(
            "ui.AlarmAnalytics.analisisDeMonitoreo",
            "Análisis de Monitoreo",
          )}
        />

        {loading || !d ? (
          <SkeletonCards className="lg:grid-cols-4" count={8} />
        ) : (
          <>
            <Stagger className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              <MetricCard
                accent={GOLD}
                icon={<BarChart3 size={16} />}
                label="Casos"
                sub={`${d.open} abiertos`}
                value={d.total}
              />
              <MetricCard
                accent={TONES.info}
                icon={<Clock size={16} />}
                label="Reconocimiento prom."
                sub="tiempo a reconocer"
                value={fmtDur(d.avgTtaSec)}
              />
              <MetricCard
                accent={TONES.serie2}
                icon={<Send size={16} />}
                label="Despacho prom."
                sub="tiempo a despachar"
                value={fmtDur(d.avgTtdSec)}
              />
              <MetricCard
                accent={TONES.ok}
                icon={<TrendingUp size={16} />}
                label={t(
                  "ui.AlarmAnalytics.resolucionProm",
                  "Resolución prom.",
                )}
                sub="tiempo a resolver"
                value={fmtDur(d.avgTtrSec)}
              />
              <MetricCard
                accent={TONES.ok}
                icon={<ShieldCheck size={16} />}
                label="Plazos cumplidos"
                pct={d.slaAckCompliance}
                sub="reconocidos a tiempo"
                value={`${d.slaAckCompliance}%`}
              />
              <MetricCard
                accent={TONES.warn}
                icon={<AlertTriangle size={16} />}
                label={t(
                  "ui.AlarmAnalytics.tasaDeEscalado",
                  "Tasa de escalado",
                )}
                pct={d.escalationRate}
                sub={t("ui.AlarmAnalytics.superaronElPlazo")}
                value={`${d.escalationRate}%`}
              />
              <MetricCard
                accent={TONES.bad}
                icon={<AlertTriangle size={16} />}
                label={t("ui.AlarmAnalytics.tasaDeFalsas", "Tasa de falsas")}
                pct={d.falseRate}
                sub="falsas y reincidentes"
                value={`${d.falseRate}%`}
              />
              <MetricCard
                accent={TONES.info}
                icon={<PhoneCall size={16} />}
                label={t(
                  "ui.AlarmAnalytics.verificacionPorLlamada",
                  "Verificación por llamada",
                )}
                sub={`${d.totalCalls} llamadas`}
                value={d.ecvSatisfiedCases}
              />
            </Stagger>

            <div className="mt-5">
              <DayBars
                color={GOLD}
                points={(d.trend || []).map((t) => ({ k: t.k, v: t.v }))}
                title={t(
                  "ui.AlarmAnalytics.casosDeAlarmaPorDia",
                  "Casos de alarma por día",
                )}
              />
            </div>

            <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
              {/* Categoría y prioridad SON severidad: cada barra lleva su tono
                  del sistema. Iban las dos series de un color plano —dorado de
                  marca y azul decorativo—, así que «Incendio» se pintaba igual
                  que «Prueba» y una P1 igual que una P5. */}
              <Section
                icon={<AlertTriangle size={16} />}
                title={t("ui.AlarmAnalytics.porCategoria", "Por categoría")}
              >
                <SeverityBars
                  items={toItems(d.byCategory, (k) => CAT_LABEL[k] || k).map(
                    (i) => ({ ...i, tone: categoryTone(i.raw) }),
                  )}
                />
              </Section>
              <Section
                icon={<BarChart3 size={16} />}
                title={t("ui.AlarmAnalytics.porPrioridad")}
              >
                <SeverityBars
                  items={toItems(d.byPriority).map((i) => ({
                    ...i,
                    tone: priorityTone(i.raw),
                  }))}
                />
              </Section>
              <Section icon={<Send size={16} />} title="Despachos">
                <HBars
                  color={TONES.info}
                  empty={t("ui.AlarmAnalytics.sinDespachos")}
                  items={toItems(
                    d.dispatchByType,
                    (k) =>
                      ({
                        guard: "Vigilante",
                        police: "Policía",
                        fire: "Bomberos",
                        medical: "Médico",
                      })[k] || k,
                  )}
                />
              </Section>
            </div>

            <div className="mt-5">
              <Section
                icon={<Users size={16} />}
                title={t(
                  "ui.AlarmAnalytics.desempenoDeOperadores",
                  "Desempeño de operadores",
                )}
              >
                {!d.operators || d.operators.length === 0 ? (
                  <EmptyState
                    description={t(
                      "ui.AlarmAnalytics.sinCasosAsignadosAOperadores",
                    )}
                    icon={<Users />}
                    title={t("ui.AlarmAnalytics.sinOperadores")}
                  />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-left text-xs text-muted-foreground">
                          <th className="px-2 py-2">Operador</th>
                          <th className="px-2 py-2 text-right">Casos</th>
                          <th className="px-2 py-2 text-right">
                            Reconoc. prom.
                          </th>
                          <th className="px-2 py-2 text-right">
                            Despacho prom.
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {d.operators.map((o) => (
                          <tr
                            key={o.operatorId}
                            className="border-b"
                            style={{ borderColor: "var(--hairline)" }}
                          >
                            <td className="px-2 py-2 font-medium text-foreground">
                              {o.name}
                            </td>
                            <td className="px-2 py-2 text-right tabular-nums">
                              {o.handled}
                            </td>
                            <td
                              className="px-2 py-2 text-right tabular-nums"
                              style={{ color: "var(--ink-soft)" }}
                            >
                              {fmtDur(o.avgTtaSec)}
                            </td>
                            <td
                              className="px-2 py-2 text-right tabular-nums"
                              style={{ color: "var(--ink-soft)" }}
                            >
                              {fmtDur(o.avgTtdSec)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Section>
            </div>
          </>
        )}
      </PageContainer>
    </AppLayout>
  );
}
