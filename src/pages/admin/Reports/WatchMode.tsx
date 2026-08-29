import { useTranslation } from "react-i18next";
import ReportPageShell from "./ReportPageShell";
import { Video } from "lucide-react";

export default function WatchMode() {
  const { t } = useTranslation();
  return <ReportPageShell title={t("ui.WatchMode.registrosDeModoVigilancia", "Registros de Modo Vigilancia")} description="Sesiones de modo vigilancia iniciadas desde la aplicación del vigilante." icon={Video} />;
}
