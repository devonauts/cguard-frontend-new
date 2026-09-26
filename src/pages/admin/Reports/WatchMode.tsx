import { useTranslation } from "react-i18next";
import { Video } from "lucide-react";

import ReportPageShell from "./ReportPageShell";

export default function WatchMode() {
  const { t } = useTranslation();

  return (
    <ReportPageShell
      description={t("ui.WatchMode.descripcion", "Sesiones de modo vigilancia iniciadas desde la aplicación del vigilante.")}
      icon={Video}
      title={t(
        "ui.WatchMode.registrosDeModoVigilancia",
        "Registros de Modo Vigilancia",
      )}
    />
  );
}
