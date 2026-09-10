import { useTranslation } from "react-i18next";
import { FileCheck } from "lucide-react";

import ReportPageShell from "./ReportPageShell";

export default function DocPolicyAck() {
  const { t } = useTranslation();

  return (
    <ReportPageShell
      description={t(
        "ui.DocPolicyAck.quienHaLeidoYAceptado",
        "Quién ha leído y aceptado cada política o documento de la empresa.",
      )}
      icon={FileCheck}
      title={t(
        "ui.DocPolicyAck.reconocimientoDeDocumentosYPoliticas",
        "Reconocimiento de Documentos y Políticas",
      )}
    />
  );
}
