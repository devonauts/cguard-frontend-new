import ReportPageShell from "./ReportPageShell";
import { useTranslation } from 'react-i18next';
import { FileCheck } from "lucide-react";

export default function DocPolicyAck() {
  const { t } = useTranslation();
  return <ReportPageShell title={t("ui.DocPolicyAck.reconocimientoDeDocumentosYPoliticas", "Reconocimiento de Documentos y Políticas")} description="Quién ha leído y aceptado cada política o documento de la empresa." icon={FileCheck} />;
}
