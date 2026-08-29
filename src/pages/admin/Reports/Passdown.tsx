import { Package } from "lucide-react";
import { useTranslation } from "react-i18next";
import DataReport, { type ReportColumn } from "./DataReport";
import { formatDateTime, rangeBounds, REPORT_ROW_LIMIT, warnIfCapped } from "./reportFormat";
import passdownService, { type Passdown } from "@/lib/api/passdownService";


const STATUS: Record<string, string> = {
  pending: "Pendiente",
  received: "Recibido",
  acknowledged: "Reconocido",
};

const columns: ReportColumn<Passdown>[] = [
  { key: "created", label: "Fecha", value: (r) => formatDateTime(r.createdAt) },
  { key: "station", label: "Puesto", value: (r) => r.stationName || "—" },
  { key: "outgoing", label: "Vigilante saliente", value: (r) => r.outgoingGuardName || "—", privacy: "guardName" },
  { key: "shift", label: "Turno", value: (r) => r.shiftLabel || "—" },
  { key: "notes", label: "Novedades", value: (r) => (r.notes ? (r.notes.length > 60 ? r.notes.slice(0, 60) + "…" : r.notes) : "Sin novedad") },
  { key: "instr", label: "Instrucciones", value: (r) => String(r.instructionCount ?? 0), align: "right" },
  { key: "status", label: "Estado", value: (r) => STATUS[String(r.status || "")] || r.status || "—" },
  { key: "received", label: "Recibido por", value: (r) => r.receivedByName || "—" },
];

export default function Passdown() {
  const { t } = useTranslation();
  return (
    <DataReport<Passdown>
      title={t('ui.Passdown.registrosDeEntrega', 'Registros de Entrega')}
      description="Pases de turno (relevos): novedades, instrucciones y recepción por el vigilante entrante."
      icon={Package}
      columns={columns}
      load={async ({ from, to }) => {
        // El rango va EN LA CONSULTA. Antes se pedían los 2000 relevos más
        // recientes y se recortaba aquí: un rango antiguo se exportaba vacío.
        const { start, end } = rangeBounds(from, to);
        const res = await passdownService.list({ from: start, to: end, limit: REPORT_ROW_LIMIT });
        return warnIfCapped(res?.rows || []);
      }}
    />
  );
}
