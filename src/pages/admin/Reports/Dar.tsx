import { Activity } from "lucide-react";
import { useTranslation } from "react-i18next";

import ReportPageShell from "./ReportPageShell";

export default function Dar() {
  const { t } = useTranslation();

  return (
    <ReportPageShell
      description={t("ui.Dar.descripcion", "Informe diario de actividad (DAR): el resumen de la jornada por puesto.")}
      icon={Activity}
      title={t("ui.Dar.informeDar", "Informe DAR")}
    />
  );
}
