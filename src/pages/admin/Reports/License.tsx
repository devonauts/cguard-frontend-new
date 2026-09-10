import { useTranslation } from "react-i18next";
import { IdCard } from "lucide-react";

import ReportPageShell from "./ReportPageShell";

export default function License() {
  const { t } = useTranslation();

  return (
    <ReportPageShell
      description={t(
        "ui.License.credencialesYLicenciasDelPersonal",
        "Credenciales y licencias del personal, con sus fechas de vencimiento.",
      )}
      icon={IdCard}
      title={t("ui.License.registroDeLicencias", "Registro de Licencias")}
    />
  );
}
