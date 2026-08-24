import { Building2, AlertTriangle, ClipboardCheck, MapPin } from "lucide-react";
import { useTranslation } from 'react-i18next';
import {
  useOpsAnalytics, AnalyticsShell, MetricCard, HBars, Section, GOLD, TONES, RangeFooter, PerSiteTable,
} from "./_shared";
import { Stagger, EmptyState } from "@/components/kit";

export default function PostSite() {
  const { t } = useTranslation();
  const { days, setDays, data, loading, error, reload } = useOpsAnalytics(30);
  const k = data?.kpis;

  return (
    <AnalyticsShell
      title={t("ui.PostSite.analiticasPorSitioDeServicio", "Analíticas por Sitio de Servicio")}
      subtitle="Desempeño operativo de cada sitio: cobertura, rondas, ubicación e incidentes."
      days={days} setDays={setDays} loading={loading} error={error} reload={reload}
    >
      {data && k && (
        <>
          <Stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard icon={<Building2 size={16} />} accent={GOLD} value={data.perSite.length} label="Sitios con actividad" sub="en el período" />
            <MetricCard icon={<ClipboardCheck size={16} />} accent={TONES.info} value={`${k.coveragePct}%`} label="Cobertura promedio" sub={`${k.shiftsCovered}/${k.shiftsTotal}`} pct={k.coveragePct} />
            <MetricCard icon={<MapPin size={16} />} accent={TONES.serie2} value={`${k.locationCompliancePct}%`} label="Cumplimiento de ubicación" sub={`${k.scansValid}/${k.scansTotal} escaneos`} pct={k.locationCompliancePct} />
            <MetricCard icon={<AlertTriangle size={16} />} accent={TONES.bad} value={k.incidentsTotal} label="Incidentes" sub={`${k.incidentsOpen} abiertos`} />
          </Stagger>

          <Section title={t("ui.PostSite.sitiosConMasIncidentes", "Sitios con más incidentes")} icon={<AlertTriangle size={16} />}>
            <HBars items={data.topIncidentSites.map((s) => ({ label: s.site, count: s.count }))} color={TONES.bad} empty="Sin incidentes en el período." />
          </Section>

          <Section title={t("ui.PostSite.desempenoPorSitioDeServicio", "Desempeño por sitio de servicio")} icon={<Building2 size={16} />}>
            {data.perSite.length === 0 ? (
              <EmptyState icon={<Building2 />} title="Sin actividad" description="Sin actividad registrada en el período." />
            ) : (
              <PerSiteTable rows={data.perSite} showShifts />
            )}
          </Section>

          <RangeFooter data={data} />
        </>
      )}
    </AnalyticsShell>
  );
}
