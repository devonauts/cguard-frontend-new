import { FileText } from "lucide-react";
import { useTranslation } from "react-i18next";

import SettingsPageShell from "../components/SettingsPageShell";

import CompanyPoliciesTable from "./CompanyPoliciesTable";

export default function CompanyPoliciesIndexPage() {
  const { t } = useTranslation();

  return (
    <SettingsPageShell
      icon={<FileText />}
      kind="table"
      navTitle={t("settings.companyPolicies.pageNavTitle", {
        defaultValue: "Políticas y Documentos de la Empresa",
      })}
      subtitle={t("settings.companyPolicies.pageSubtitle", {
        defaultValue:
          "Reúne aquí los reglamentos, manuales y comunicados que tu equipo debe conocer.",
      })}
      title={t("settings.companyPolicies.pageTitle", {
        defaultValue: "Políticas y Documentos",
      })}
    >
      <CompanyPoliciesTable />
    </SettingsPageShell>
  );
}
