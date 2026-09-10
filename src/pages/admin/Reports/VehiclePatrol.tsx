import { useTranslation } from "react-i18next";
import { Car } from "lucide-react";

import ReportPageShell from "./ReportPageShell";

export default function VehiclePatrol() {
  const { t } = useTranslation();

  return (
    <ReportPageShell
      description={t(
        "ui.VehiclePatrol.recorridosDePatrullajeVehicular",
        "Recorridos de patrullaje vehicular: rutas, paradas y tiempos.",
      )}
      icon={Car}
      title={t(
        "ui.VehiclePatrol.informeDePatrullaVehicular",
        "Informe de Patrulla Vehicular",
      )}
    />
  );
}
