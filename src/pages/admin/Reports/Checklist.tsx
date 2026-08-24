import ReportPageShell from "./ReportPageShell";
import { useTranslation } from 'react-i18next';
import { ListChecks } from "lucide-react";

export default function Checklist() {
  const { t } = useTranslation();
  return <ReportPageShell title={t("ui.Checklist.informeDeListaDeVerificacion", "Informe de Lista de Verificación")} description={t("ui.Checklist.listasDeVerificacionCompletadasPor", "Listas de verificación completadas por los vigilantes en cada puesto.")} icon={ListChecks} />;
}
