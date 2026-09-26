import { useTranslation } from "react-i18next";
import { Route } from "lucide-react";

import ReportPageShell from "./ReportPageShell";

export default function TourCheckPoint() {
  const { t } = useTranslation();

  return (
    <ReportPageShell
      description={t("ui.TourCheckPoint.descripcion", "Puntos de control escaneados durante las rondas, con fecha y ubicación.")}
      icon={Route}
      title={t(
        "ui.TourCheckPoint.registrosDePuntosDeControl",
        "Registros de Puntos de Control",
      )}
    />
  );
}
