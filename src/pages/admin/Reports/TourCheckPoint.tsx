import { useTranslation } from "react-i18next";
import ReportPageShell from "./ReportPageShell";
import { Route } from "lucide-react";

export default function TourCheckPoint() {
  const { t } = useTranslation();
  return <ReportPageShell title={t("ui.TourCheckPoint.registrosDePuntosDeControl", "Registros de Puntos de Control")} description="Puntos de control escaneados durante las rondas, con fecha y ubicación." icon={Route} />;
}
