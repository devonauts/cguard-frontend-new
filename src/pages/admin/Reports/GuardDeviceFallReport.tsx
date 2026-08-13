import ReportPageShell from "./ReportPageShell";
import { TriangleAlert } from "lucide-react";

export default function GuardDeviceFallReport() {
  return <ReportPageShell title="Registros de Alerta de Caída" description="Alertas de caída detectadas por el teléfono del vigilante durante el turno." icon={TriangleAlert} tone="bad" />;
}
