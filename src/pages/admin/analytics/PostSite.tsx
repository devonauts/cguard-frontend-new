import { Building2, AlertTriangle, ClipboardCheck, MapPin } from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  useOpsAnalytics,
  AnalyticsShell,
  MetricCard,
  HBars,
  Section,
  GOLD,
  TONES,
  RangeFooter,
  PerSiteTable,
} from "./_shared";

import { Stagger, EmptyState, StatsStrip } from "@/components/kit";

export default function PostSite() {
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
      subtitle={t("ui.PostSite.desempenoOperativoDeCadaSitio")}
      title={t(
        "ui.PostSite.analiticasPorSitioDeServicio",
        "Analíticas por Sitio de Servicio",
      )}
    >
      {data && k && (
        <>
          <StatsStrip className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              accent={GOLD}
              icon={<Building2 size={16} />}
              label={t("ui.PostSite.sitiosConActividad")}
              sub={t("ui.PostSite.enElPeriodo", "en el período")}
              value={data.perSite.length}
            />
            <MetricCard
              accent={TONES.info}
              icon={<ClipboardCheck size={16} />}
              label={t("ui.PostSite.coberturaPromedio", "Cobertura promedio")}
              pct={k.coveragePct}
              sub={`${k.shiftsCovered}/${k.shiftsTotal}`}
              value={`${k.coveragePct}%`}
            />
            <MetricCard
              accent={TONES.serie2}
              icon={<MapPin size={16} />}
              label={t(
                "ui.PostSite.cumplimientoDeUbicacion",
                "Cumplimiento de ubicación",
              )}
              pct={k.locationCompliancePct}
              sub={t("ui.PostSite.escaneos", {
                defaultValue: "{{valid}}/{{total}} escaneos",
                valid: k.scansValid,
                total: k.scansTotal,
              })}
              value={`${k.locationCompliancePct}%`}
            />
            <MetricCard
              accent={TONES.bad}
              icon={<AlertTriangle size={16} />}
              label={t("ui.shared.incidentes", "Incidentes")}
              sub={t("ui.AlarmAnalytics.nAbiertos", {
                defaultValue: "{{count}} abiertos",
                count: k.incidentsOpen,
              })}
              value={k.incidentsTotal}
            />
          </StatsStrip>

          <Section
            icon={<AlertTriangle size={16} />}
            title={t(
              "ui.PostSite.sitiosConMasIncidentes",
              "Sitios con más incidentes",
            )}
          >
            <HBars
              color={TONES.bad}
              empty={t(
                "ui.PostSite.sinIncidentesEnElPeriodo",
                "Sin incidentes en el período.",
              )}
              items={data.topIncidentSites.map((s) => ({
                label: s.site,
                count: s.count,
              }))}
            />
          </Section>

          <Section
            icon={<Building2 size={16} />}
            title={t(
              "ui.PostSite.desempenoPorSitioDeServicio",
              "Desempeño por sitio de servicio",
            )}
          >
            {data.perSite.length === 0 ? (
              <EmptyState
                description={t(
                  "ui.PostSite.sinActividadRegistradaEnEl",
                  "Sin actividad registrada en el período.",
                )}
                icon={<Building2 />}
                title={t("comun.sinActividad")}
              />
            ) : (
              <PerSiteTable showShifts rows={data.perSite} />
            )}
          </Section>

          <RangeFooter data={data} />
        </>
      )}
    </AnalyticsShell>
  );
}
