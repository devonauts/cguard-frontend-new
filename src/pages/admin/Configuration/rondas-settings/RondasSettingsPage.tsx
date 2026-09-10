import { useTranslation } from "react-i18next";
import { Route } from "lucide-react";

import SettingsPageShell from "../components/SettingsPageShell";

import RondaSettingsForm from "./RondaSettingsForm";

export default function RondasSettingsPage() {
  const { t } = useTranslation();

  return (
    <SettingsPageShell
      icon={<Route />}
      subtitle={t("settings.rondas.pageSubtitle", {
        defaultValue:
          "Define la cadencia, validación y notificaciones predeterminadas para las rondas.",
      })}
      title={t("settings.rondas.pageTitle", {
        defaultValue: "Configuraciones de Rondas",
      })}
    >
      {/* Tenant-wide default (no postSiteId) */}
      <RondaSettingsForm />
    </SettingsPageShell>
  );
}
