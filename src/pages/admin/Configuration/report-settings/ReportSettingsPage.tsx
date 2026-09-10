import { FileBarChart } from "lucide-react";
import { useTranslation } from "react-i18next";

import SettingsPageShell from "../components/SettingsPageShell";

import ReportSettingsForm from "./ReportSettingsForm";

const ReportSettingsPage = () => {
  const { t } = useTranslation();

  return (
    <SettingsPageShell
      icon={<FileBarChart />}
      subtitle={t("settings.reportSettings.pageSubtitle", {
        defaultValue:
          "Controla la privacidad, el encabezado y el pie de página de los informes exportados.",
      })}
      title={t("settings.reportSettings.pageTitle", {
        defaultValue: "Configuración de Informes",
      })}
    >
      <ReportSettingsForm />
    </SettingsPageShell>
  );
};

export default ReportSettingsPage;
