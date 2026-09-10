import { useTranslation } from "react-i18next";
import { TriangleAlert } from "lucide-react";

import ReportPageShell from "./ReportPageShell";

export default function GuardDeviceFallReport() {
  const { t } = useTranslation();

  return (
    <ReportPageShell
      description={t(
        "ui.GuardDeviceFallReport.alertasDeCaidaDetectadasPor",
        "Alertas de caída detectadas por el teléfono del vigilante durante el turno.",
      )}
      icon={TriangleAlert}
      title={t(
        "ui.GuardDeviceFallReport.registrosDeAlertaDeCaida",
        "Registros de Alerta de Caída",
      )}
      tone="bad"
    />
  );
}
