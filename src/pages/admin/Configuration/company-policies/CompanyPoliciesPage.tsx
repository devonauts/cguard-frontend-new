import { FileText } from "lucide-react";
import SettingsPageShell from "../components/SettingsPageShell";
import CompanyPoliciesTable from "./CompanyPoliciesTable";

export default function CompanyPoliciesIndexPage() {
  return (
    <SettingsPageShell
      kind="table"
      icon={<FileText />}
      title="Políticas y Documentos"
      navTitle="Políticas y Documentos de la Empresa"
      subtitle="Reúne aquí los reglamentos, manuales y comunicados que tu equipo debe conocer."
    >
      <CompanyPoliciesTable />
    </SettingsPageShell>
  );
}
