import { useTranslation } from "react-i18next";
import ReportPageShell from "./ReportPageShell";
import { IdCard } from "lucide-react";

export default function License() {
  const { t } = useTranslation();
  return <ReportPageShell title={t('ui.License.registroDeLicencias', 'Registro de Licencias')} description={t('ui.License.credencialesYLicenciasDelPersonal', 'Credenciales y licencias del personal, con sus fechas de vencimiento.')} icon={IdCard} />;
}
