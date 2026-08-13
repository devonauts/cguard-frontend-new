import ReportPageShell from "./ReportPageShell";
import { Car } from "lucide-react";

export default function VehiclePatrol() {
  return <ReportPageShell title="Informe de Patrulla Vehicular" description="Recorridos de patrullaje vehicular: rutas, paradas y tiempos." icon={Car} />;
}
