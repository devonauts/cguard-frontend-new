import { useEffect, useState } from "react";
import { useTranslation } from 'react-i18next';
import { Link } from "react-router-dom";
import {
  Shield, ClipboardCheck, MapPin, AlertTriangle, Clock, TrendingUp, Building2, Award, ArrowRight,
} from "lucide-react";
import {
  useOpsAnalytics, AnalyticsShell, MetricCard, DayBars, HBars, Section, GOLD, TONES, toneInk,
  RangeFooter, GuardLink, PerSiteTable, AttendanceTiles,
} from "./_shared";
import { analyticsService, PerfLeaderboard } from "@/lib/api/analyticsService";
import { Stagger, EmptyState } from "@/components/kit";

export default function Reporting() {
  const { t } = useTranslation();
  const { days, setDays, data, loading, error, reload } = useOpsAnalytics(30);
  const [lb, setLb] = useState<PerfLeaderboard | null>(null);
  useEffect(() => {
    let on = true;
    analyticsService.performanceGuards(days).then((r) => { if (on) setLb(r); }).catch(() => { if (on) setLb(null); });
    return () => { on = false; };
  }, [days]);
  const k = data?.kpis;

  return (
    <AnalyticsShell
      title={t("ui.Reporting.analiticasDeOperaciones", "Analíticas de Operaciones")}
      subtitle="Indicadores clave del servicio de vigilante para tu operación."
      days={days} setDays={setDays} loading={loading} error={error} reload={reload}
    >
      {data && k && (
        <>
          <Stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <MetricCard icon={<Shield size={16} />} accent={GOLD} value={k.guardsOnDuty} label="Vigilantes en servicio" sub="ahora mismo" />
            <MetricCard icon={<ClipboardCheck size={16} />} accent={TONES.info} value={`${k.coveragePct}%`} label="Cobertura de turnos" sub={`${k.shiftsCovered}/${k.shiftsTotal} cubiertos`} pct={k.coveragePct} />
            <MetricCard icon={<TrendingUp size={16} />} accent={TONES.ok} value={`${k.rondaCompletionPct}%`} label="Rondas completadas" sub={`${k.rondasCompleted}/${k.rondasTotal}`} pct={k.rondaCompletionPct} />
            <MetricCard icon={<MapPin size={16} />} accent={TONES.serie2} value={`${k.locationCompliancePct}%`} label={t("ui.Reporting.cumplimientoDeUbicacion", "Cumplimiento de ubicación")} sub={`${k.scansValid}/${k.scansTotal} escaneos`} pct={k.locationCompliancePct} />
            <MetricCard icon={<AlertTriangle size={16} />} accent={TONES.bad} value={k.incidentsTotal} label="Incidentes" sub={`${k.incidentsOpen} abiertos`} />
            <MetricCard icon={<Clock size={16} />} accent={TONES.warn} value={`${k.punctualityPct}%`} label="Puntualidad" sub={`${k.clockinsOnTime}/${k.clockinsTotal} a tiempo`} pct={k.punctualityPct} />
          </Stagger>

          {/* Team performance — official score (links to Vigilantes) */}
          {lb && lb.averageScore != null && (
            <Section title={t("ui.Reporting.desempenoDelEquipo", "Desempeño del equipo")} icon={<Award size={16} />}>
              <div className="grid gap-5 md:grid-cols-3">
                <div className="glass-sunken flex flex-col items-center justify-center p-4 text-center">
                  {/* `--brand-text` y no `--brand`: el relleno del acento como
                      letra sobre el lienzo se queda en 2,25:1 e ilegible. */}
                  <p className="font-display text-5xl font-bold tabular-nums" style={{ color: "var(--brand-text)" }}>{lb.averageScore}</p>
                  <p className="mt-1 text-xs" style={{ color: "var(--ink-soft)" }}>{t("ui.Reporting.puntuacionPromedio100", "Puntuación promedio /100")}</p>
                  <p className="mt-1 text-xs" style={{ color: "var(--ink-faint)" }}>{lb.counts.scored} vigilantes evaluados · {lb.counts.excellent} excelentes</p>
                </div>
                <div className="md:col-span-2">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-sm font-semibold text-foreground">{t("ui.Reporting.vigilantesConMenorDesempeno", "Vigilantes con menor desempeño")}</p>
                    <Link to="/analytics/guard" className="inline-flex items-center gap-1 text-xs font-medium hover:underline" style={{ color: "var(--brand-text)" }}>Ver ranking completo <ArrowRight size={12} /></Link>
                  </div>
                  {lb.guards.filter((g) => g.hasData).length === 0 ? (
                    <p className="text-sm text-muted-foreground">{t("ui.Reporting.sinVigilantesEvaluadosEnEl", "Sin vigilantes evaluados en el período.")}</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {lb.guards.filter((g) => g.hasData).slice(-5).reverse().map((g) => (
                        // `glass-flat`: son filas repetidas, y el desenfoque por
                        // fila es lo que hunde el desplazamiento de una lista.
                        <li key={g.id} className="glass-flat flex items-center justify-between px-3 py-2">
                          <GuardLink id={g.id} name={g.name} />
                          <span
                            className="text-sm font-bold tabular-nums"
                            style={{ color: toneInk(g.score != null && g.score >= 75 ? TONES.info : g.score != null && g.score >= 60 ? TONES.warn : TONES.bad) }}
                          >
                            {g.score}<span className="text-[10px] font-normal" style={{ color: "var(--ink-faint)" }}>/100</span>
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
            <DayBars title={t("ui.Reporting.escaneosDeRondaPorDia", "Escaneos de ronda por día")} color={GOLD} points={data.trend.map((t) => ({ k: t.date, v: t.scans }))} />
            <DayBars title={t("ui.Reporting.rondasCompletadasPorDia", "Rondas completadas por día")} color={TONES.ok} points={data.trend.map((t) => ({ k: t.date, v: t.rondas }))} />
            <DayBars title={t("ui.Reporting.incidentesPorDia", "Incidentes por día")} color={TONES.bad} points={data.trend.map((t) => ({ k: t.date, v: t.incidents }))} />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Section title="Incidentes por prioridad" icon={<AlertTriangle size={16} />}>
              <HBars items={data.incidentsByPriority} color={TONES.bad} empty={t("ui.Reporting.sinIncidentesEnElPeriodo", "Sin incidentes en el período.")} />
            </Section>
            <Section title={t("ui.Reporting.sitiosConMasIncidentes", "Sitios con más incidentes")} icon={<Building2 size={16} />}>
              <HBars items={data.topIncidentSites.map((s) => ({ label: s.site, count: s.count }))} color={GOLD} empty={t("ui.Reporting.sinIncidentesEnElPeriodo2", "Sin incidentes en el período.")} />
            </Section>
            <Section title="Asistencia" icon={<Clock size={16} />}>
              <AttendanceTiles attendance={data.attendance} />
            </Section>
          </div>

          <Section title="Resumen por sitio de servicio" icon={<Building2 size={16} />}>
            {data.perSite.length === 0 ? (
              <EmptyState icon={<Building2 />} title="Sin actividad" description={t("ui.Reporting.sinActividadRegistradaEnEl", "Sin actividad registrada en el período.")} />
            ) : (
              <PerSiteTable rows={data.perSite} limit={10} />
            )}
          </Section>

          <RangeFooter data={data} />
        </>
      )}
    </AnalyticsShell>
  );
}
