import { PauseCircle } from "lucide-react";
import { useTranslation } from "react-i18next";

import ReportPageShell from "./ReportPageShell";

export default function GuardIdleLog() {
  const { t } = useTranslation();

  return (
    <ReportPageShell
      description="Periodos en los que un vigilante dejó de reportar actividad estando de servicio."
      icon={PauseCircle}
      title={t(
        "ui.GuardIdleLog.registrosDeVigilanteInactivo",
        "Registros de Vigilante Inactivo",
      )}
    />
  );
}
