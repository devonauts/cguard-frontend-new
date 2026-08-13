import ReportPageShell from "./ReportPageShell";
import { BarChart3 } from "lucide-react";

export default function GuardKpi() {
  return <ReportPageShell title="Informe de KPI del Vigilante" description="Indicadores de desempeño por vigilante: puntualidad, rondas y cumplimiento." icon={BarChart3} />;
}
