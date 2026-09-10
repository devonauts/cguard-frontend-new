import { useTranslation } from "react-i18next";
import { FileCheck } from "lucide-react";

import ReportPageShell from "./ReportPageShell";

export default function PostOrderAck() {
  const { t } = useTranslation();

  return (
    <ReportPageShell
      description={t(
        "ui.PostOrderAck.quienHaLeidoYAceptado",
        "Quién ha leído y aceptado las consignas de cada puesto.",
      )}
      icon={FileCheck}
      title={t(
        "ui.PostOrderAck.reconocimientoDeOrdenesDePublicacion",
        "Reconocimiento de Órdenes de Publicación",
      )}
    />
  );
}
