import ReportPageShell from "./ReportPageShell";
import { PauseCircle } from "lucide-react";
import { useTranslation } from "react-i18next";

export default function GuardIdleLog() {
  const { t } = useTranslation();
  return <ReportPageShell title={t('ui.GuardIdleLog.registrosDeVigilanteInactivo', 'Registros de Vigilante Inactivo')} description="Periodos en los que un vigilante dejó de reportar actividad estando de servicio." icon={PauseCircle} />;
}
