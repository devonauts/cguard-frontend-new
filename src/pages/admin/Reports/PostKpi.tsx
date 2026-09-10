import { useTranslation } from "react-i18next";
import { Gauge } from "lucide-react";

import ReportPageShell from "./ReportPageShell";

export default function PostKpi() {
  const { t } = useTranslation();

  return (
    <ReportPageShell
      description={t(
        "ui.PostKpi.indicadoresDeDesempenoPorPuesto",
        "Indicadores de desempeño por puesto: cobertura, rondas e incidentes.",
      )}
      icon={Gauge}
      title={t("ui.PostKpi.informeDeKpiDelPuesto", "Informe de KPI del Puesto")}
    />
  );
}
