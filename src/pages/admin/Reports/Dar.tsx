import { Activity } from "lucide-react";

import ReportPageShell from "./ReportPageShell";

export default function Dar() {
  return (
    <ReportPageShell
      description="Informe diario de actividad (DAR): el resumen de la jornada por puesto."
      icon={Activity}
      title="Informe DAR"
    />
  );
}
