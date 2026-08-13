import ReportPageShell from "./ReportPageShell";
import { PauseCircle } from "lucide-react";

export default function GuardIdleLog() {
  return <ReportPageShell title="Registros de Vigilante Inactivo" description="Periodos en los que un vigilante dejó de reportar actividad estando de servicio." icon={PauseCircle} />;
}
