import ReportPageShell from "./ReportPageShell";
import { useTranslation } from 'react-i18next';
import { Car } from "lucide-react";

export default function VehiclePatrol() {
  const { t } = useTranslation();
  return <ReportPageShell title={t("ui.VehiclePatrol.informeDePatrullaVehicular", "Informe de Patrulla Vehicular")} description={t("ui.VehiclePatrol.recorridosDePatrullajeVehicular", "Recorridos de patrullaje vehicular: rutas, paradas y tiempos.")} icon={Car} />;
}
