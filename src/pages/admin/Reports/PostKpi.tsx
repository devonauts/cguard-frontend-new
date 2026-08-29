import ReportPageShell from "./ReportPageShell";
import { useTranslation } from 'react-i18next';
import { Gauge } from "lucide-react";

export default function PostKpi() {
  const { t } = useTranslation();
  return <ReportPageShell title={t("ui.PostKpi.informeDeKpiDelPuesto", "Informe de KPI del Puesto")} description={t("ui.PostKpi.indicadoresDeDesempenoPorPuesto", "Indicadores de desempeño por puesto: cobertura, rondas e incidentes.")} icon={Gauge} />;
}
