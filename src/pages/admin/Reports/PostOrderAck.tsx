import ReportPageShell from "./ReportPageShell";
import { useTranslation } from 'react-i18next';
import { FileCheck } from "lucide-react";

export default function PostOrderAck() {
  const { t } = useTranslation();
  return <ReportPageShell title={t("ui.PostOrderAck.reconocimientoDeOrdenesDePublicacion", "Reconocimiento de Órdenes de Publicación")} description="Quién ha leído y aceptado las consignas de cada puesto." icon={FileCheck} />;
}
