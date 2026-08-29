import ReportPageShell from "./ReportPageShell";
import { useTranslation } from 'react-i18next';
import { BarChart3 } from "lucide-react";

export default function GuardKpi() {
  const { t } = useTranslation();
  return <ReportPageShell title={t("ui.GuardKpi.informeDeKpiDelVigilante", "Informe de KPI del Vigilante")} description={t("ui.GuardKpi.indicadoresDeDesempenoPorVigilante", "Indicadores de desempeño por vigilante: puntualidad, rondas y cumplimiento.")} icon={BarChart3} />;
}
