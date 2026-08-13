import ReportPageShell from "./ReportPageShell";
import { ListChecks } from "lucide-react";

export default function Checklist() {
  return <ReportPageShell title="Informe de Lista de Verificación" description="Listas de verificación completadas por los vigilantes en cada puesto." icon={ListChecks} />;
}
