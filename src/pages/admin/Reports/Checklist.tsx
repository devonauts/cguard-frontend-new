import { useTranslation } from "react-i18next";
import { ListChecks } from "lucide-react";

import ReportPageShell from "./ReportPageShell";

export default function Checklist() {
  const { t } = useTranslation();

  return (
    <ReportPageShell
      description={t(
        "ui.Checklist.listasDeVerificacionCompletadasPor",
        "Listas de verificación completadas por los vigilantes en cada puesto.",
      )}
      icon={ListChecks}
      title={t(
        "ui.Checklist.informeDeListaDeVerificacion",
        "Informe de Lista de Verificación",
      )}
    />
  );
}
