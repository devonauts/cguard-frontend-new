import ReportPageShell from "./ReportPageShell";
import { Gauge } from "lucide-react";

export default function PostKpi() {
  return <ReportPageShell title="Informe de KPI del Puesto" description="Indicadores de desempeño por puesto: cobertura, rondas e incidentes." icon={Gauge} />;
}
