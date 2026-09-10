import { useTranslation } from "react-i18next";
import { BarChart3 } from "lucide-react";

import ReportPageShell from "./ReportPageShell";

export default function GuardKpi() {
  const { t } = useTranslation();

  return (
    <ReportPageShell
      description={t(
        "ui.GuardKpi.indicadoresDeDesempenoPorVigilante",
        "Indicadores de desempeño por vigilante: puntualidad, rondas y cumplimiento.",
      )}
      icon={BarChart3}
      title={t(
        "ui.GuardKpi.informeDeKpiDelVigilante",
        "Informe de KPI del Vigilante",
      )}
    />
  );
}
