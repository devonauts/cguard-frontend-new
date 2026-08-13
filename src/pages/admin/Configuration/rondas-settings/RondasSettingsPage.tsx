import { Route } from "lucide-react";
import SettingsPageShell from "../components/SettingsPageShell";
import RondaSettingsForm from "./RondaSettingsForm";

export default function RondasSettingsPage() {
  return (
    <SettingsPageShell
      icon={<Route />}
      title="Configuraciones de Rondas"
      subtitle="Define la cadencia, validación y notificaciones predeterminadas para las rondas."
    >
      {/* Tenant-wide default (no postSiteId) */}
      <RondaSettingsForm />
    </SettingsPageShell>
  );
}
