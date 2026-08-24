import ReportPageShell from "./ReportPageShell";
import { useTranslation } from 'react-i18next';
import { TriangleAlert } from "lucide-react";

export default function GuardDeviceFallReport() {
  const { t } = useTranslation();
  return <ReportPageShell title={t("ui.GuardDeviceFallReport.registrosDeAlertaDeCaida", "Registros de Alerta de Caída")} description="Alertas de caída detectadas por el teléfono del vigilante durante el turno." icon={TriangleAlert} tone="bad" />;
}
