import { useEffect, useState } from "react";
import { useTranslation } from 'react-i18next';
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  Activity, Clock, Send, ShieldCheck, TrendingUp, AlertTriangle, PhoneCall, Download, Users, RefreshCw, BarChart3,
} from "lucide-react";
import AppLayout from "@/layouts/app-layout";
import { MetricCard, DayBars, HBars, Section, GOLD, TONES } from "@/pages/admin/analytics/_shared";
import { alarmService } from "@/lib/api/alarmService";
import { SeverityBars, categoryTone, priorityTone } from "./shared";
import {
  PageContainer,
  PageHeader,
  Stagger,
  SkeletonCards,
  EmptyState,
  Segmented,
} from "@/components/kit";
import { Button } from "@/components/ui/button";
import i18n from "@/i18n";

const PERIODS = [7, 30, 90, 365];

function fmtDur(sec?: number): string {
  if (!sec || sec <= 0) return "—";
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s ? `${m}m ${s}s` : `${m}m`;
}

const CAT_LABEL: Record<string, string> = {
  burglary: "Robo", fire: "Incendio", holdup: "Atraco", panic: "Pánico", medical: "Médica",
  tamper: "Sabotaje", trouble: "Avería", openclose: "Apertura/Cierre", test: "Prueba",
  supervisory: "Supervisión", restore: "Restauración", desconocido: "Desconocido",
};

/** `raw` conserva la clave original del backend además de la etiqueta ya
 *  traducida: es lo que permite decidir la GRAVEDAD de cada barra después de
 *  ordenarlas, cuando el orden ya no coincide con el del objeto de entrada. */
function toItems(obj: Record<string, number>, labeler?: (k: string) => string) {
  return Object.entries(obj || {})
    .map(([k, v]) => ({ raw: k, label: labeler ? labeler(k) : k, count: v as number }))
    .sort((a, b) => b.count - a.count);
}

function downloadCsv(rows: Record<string, unknown>[], filename: string) {
  if (!rows.length) { toast.info(i18n.t('ui.AlarmAnalytics.sinRegistrosParaExportar')); return; }
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

interface AlarmAnalyticsData {
  total: number; open: number;
  avgTtaSec: number; avgTtdSec: number; avgTtrSec: number;
  slaAckCompliance: number; escalationRate: number; falseRate: number;
  ecvSatisfiedCases: number; totalCalls: number;
  trend?: Array<{ k: string; v: number }>;
  byCategory: Record<string, number>;
  byPriority: Record<string, number>;
  dispatchByType: Record<string, number>;
  operators?: Array<{ operatorId: string; name: string; handled: number; avgTtaSec: number; avgTtdSec: number }>;
}

export default function AlarmAnalytics() {
  const { t } = useTranslation();
  const [days, setDays] = useState(30);
  const [d, setD] = useState<AlarmAnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    setLoading(true);
    alarmService.analytics({ days }).then(setD).catch(() => {}).finally(() => setLoading(false));
  }, [days]);

  const exportAudit = async () => {
    setExporting(true);
    try {
      const r = await alarmService.auditExport({ days });
      downloadCsv(r.rows || [], `auditoria-alarmas-${days}d.csv`);
      toast.success(`${r.count} registros exportados`);
    } catch (e) {
      toast.error((e as Error)?.message || "No se pudo exportar la auditoría");
    } finally {
      setExporting(false);
    }
  };

  return (
    <AppLayout>
      <PageContainer width="wide">
        <PageHeader
          icon={<Activity />}
          title={t("ui.AlarmAnalytics.analisisDeMonitoreo", "Análisis de Monitoreo")}
          subtitle={t('ui.AlarmAnalytics.tiemposDeRespuestaCumplimientoDe')}
          actions={
            <>
              <Segmented
                value={String(days)}
                onChange={(v) => setDays(Number(v))}
                options={PERIODS.map((p) => ({ value: String(p), label: p === 365 ? "1 año" : `${p} días` }))}
              />
              <Button variant="outline" size="sm" onClick={exportAudit} disabled={exporting}>
                {exporting ? <RefreshCw className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
                Exportar historial
              </Button>
              <Button asChild variant="ghost" size="sm">
                <Link to="/alarm/reports">Falsas alarmas →</Link>
              </Button>
            </>
          }
        />

        {loading || !d ? (
          <SkeletonCards count={8} className="lg:grid-cols-4" />
        ) : (
          <>
            <Stagger className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              <MetricCard icon={<BarChart3 size={16} />} accent={GOLD} value={d.total} label="Casos" sub={`${d.open} abiertos`} />
              <MetricCard icon={<Clock size={16} />} accent={TONES.info} value={fmtDur(d.avgTtaSec)} label="Reconocimiento prom." sub="tiempo a reconocer" />
              <MetricCard icon={<Send size={16} />} accent={TONES.serie2} value={fmtDur(d.avgTtdSec)} label="Despacho prom." sub="tiempo a despachar" />
              <MetricCard icon={<TrendingUp size={16} />} accent={TONES.ok} value={fmtDur(d.avgTtrSec)} label={t("ui.AlarmAnalytics.resolucionProm", "Resolución prom.")} sub="tiempo a resolver" />
              <MetricCard icon={<ShieldCheck size={16} />} accent={TONES.ok} value={`${d.slaAckCompliance}%`} label="Plazos cumplidos" sub="reconocidos a tiempo" pct={d.slaAckCompliance} />
              <MetricCard icon={<AlertTriangle size={16} />} accent={TONES.warn} value={`${d.escalationRate}%`} label="Tasa de escalado" sub={t('ui.AlarmAnalytics.superaronElPlazo')} pct={d.escalationRate} />
              <MetricCard icon={<AlertTriangle size={16} />} accent={TONES.bad} value={`${d.falseRate}%`} label="Tasa de falsas" sub="falsas y reincidentes" pct={d.falseRate} />
              <MetricCard icon={<PhoneCall size={16} />} accent={TONES.info} value={d.ecvSatisfiedCases} label={t("ui.AlarmAnalytics.verificacionPorLlamada", "Verificación por llamada")} sub={`${d.totalCalls} llamadas`} />
            </Stagger>

            <div className="mt-5">
              <DayBars title={t("ui.AlarmAnalytics.casosDeAlarmaPorDia", "Casos de alarma por día")} color={GOLD} points={(d.trend || []).map((t) => ({ k: t.k, v: t.v }))} />
            </div>

            <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
              {/* Categoría y prioridad SON severidad: cada barra lleva su tono
                  del sistema. Iban las dos series de un color plano —dorado de
                  marca y azul decorativo—, así que «Incendio» se pintaba igual
                  que «Prueba» y una P1 igual que una P5. */}
              <Section title={t("ui.AlarmAnalytics.porCategoria", "Por categoría")} icon={<AlertTriangle size={16} />}>
                <SeverityBars
                  items={toItems(d.byCategory, (k) => CAT_LABEL[k] || k)
                    .map((i) => ({ ...i, tone: categoryTone(i.raw) }))}
                />
              </Section>
              <Section title={t('ui.AlarmAnalytics.porPrioridad')} icon={<BarChart3 size={16} />}>
                <SeverityBars items={toItems(d.byPriority).map((i) => ({ ...i, tone: priorityTone(i.raw) }))} />
              </Section>
              <Section title="Despachos" icon={<Send size={16} />}>
                <HBars
                  items={toItems(d.dispatchByType, (k) => ({ guard: "Vigilante", police: "Policía", fire: "Bomberos", medical: "Médico" }[k] || k))}
                  color={TONES.info} empty={t('ui.AlarmAnalytics.sinDespachos')} />
              </Section>
            </div>

            <div className="mt-5">
              <Section title={t("ui.AlarmAnalytics.desempenoDeOperadores", "Desempeño de operadores")} icon={<Users size={16} />}>
                {(!d.operators || d.operators.length === 0) ? (
                  <EmptyState
                    icon={<Users />}
                    title={t('ui.AlarmAnalytics.sinOperadores')}
                    description={t('ui.AlarmAnalytics.sinCasosAsignadosAOperadores')}
                  />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-left text-xs text-muted-foreground">
                          <th className="px-2 py-2">Operador</th>
                          <th className="px-2 py-2 text-right">Casos</th>
                          <th className="px-2 py-2 text-right">Reconoc. prom.</th>
                          <th className="px-2 py-2 text-right">Despacho prom.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {d.operators.map((o) => (
                          <tr key={o.operatorId} className="border-b" style={{ borderColor: 'var(--hairline)' }}>
                            <td className="px-2 py-2 font-medium text-foreground">{o.name}</td>
                            <td className="px-2 py-2 text-right tabular-nums">{o.handled}</td>
                            <td className="px-2 py-2 text-right tabular-nums" style={{ color: 'var(--ink-soft)' }}>{fmtDur(o.avgTtaSec)}</td>
                            <td className="px-2 py-2 text-right tabular-nums" style={{ color: 'var(--ink-soft)' }}>{fmtDur(o.avgTtdSec)}</td>
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
