import ReportPageShell from "./ReportPageShell";
import { FileCheck } from "lucide-react";

export default function DocPolicyAck() {
  return <ReportPageShell title="Reconocimiento de Documentos y Políticas" description="Quién ha leído y aceptado cada política o documento de la empresa." icon={FileCheck} />;
}
