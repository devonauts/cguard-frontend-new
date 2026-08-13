import ReportPageShell from "./ReportPageShell";
import { FileCheck } from "lucide-react";

export default function PostOrderAck() {
  return <ReportPageShell title="Reconocimiento de Órdenes de Publicación" description="Quién ha leído y aceptado las consignas de cada puesto." icon={FileCheck} />;
}
