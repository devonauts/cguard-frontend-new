import ReportPageShell from "./ReportPageShell";
import { Route } from "lucide-react";

export default function TourCheckPoint() {
  return <ReportPageShell title="Registros de Puntos de Control" description="Puntos de control escaneados durante las rondas, con fecha y ubicación." icon={Route} />;
}
