import { Siren } from "lucide-react";
import { useTranslation } from 'react-i18next';
import DataReport, { type ReportColumn } from "./DataReport";
import { formatDateTime, rangeBounds, REPORT_ROW_LIMIT, warnIfCapped } from "./reportFormat";
import { alarmService, type AlarmCase } from "@/lib/api/alarmService";


const ORIGIN: Record<string, string> = {
  alarm_panel: "Panel de alarma",
  client_app: "App cliente (SOS)",
  worker_app: "Botón de pánico (vigilante)",
  manual: "Manual",
};

const STATUS: Record<string, string> = {
  open: "Abierto",
  acknowledged: "Reconocido",
  dispatched: "Despachado",
  resolved: "Resuelto",
  closed: "Cerrado",
};

// La prioridad llega como número (1 = la más grave). Mostrarla cruda no le dice
// nada a nadie, ni en pantalla ni en el archivo exportado.
const PRIORITY: Record<number, string> = {
  1: "P1 · Crítica",
  2: "P2 · Alta",
  3: "P3 · Media",
  4: "P4 · Baja",
  5: "P5 · Informativa",
};

const columns: ReportColumn<AlarmCase>[] = [
  { key: "created", label: "Fecha", value: (r) => formatDateTime(r.createdAt) },
  { key: "title", label: "Título", value: (r) => r.title || "Alerta de pánico" },
  { key: "origin", label: "Origen", value: (r) => ORIGIN[String(r.source || "")] || r.source || "—" },
  { key: "priority", label: "Prioridad", value: (r) => (r.priority != null ? PRIORITY[r.priority] || String(r.priority) : "—"), align: "center" },
  { key: "status", label: "Estado", value: (r) => STATUS[String(r.status || "")] || r.status || "—" },
  { key: "ack", label: "Reconocido", value: (r) => formatDateTime(r.ackAt) },
  { key: "resolved", label: "Resuelto", value: (r) => formatDateTime(r.resolvedAt) },
];

export default function PanicButtonLog() {
  const { t } = useTranslation();
  return (
    <DataReport<AlarmCase>
      title={t("ui.PanicButtonLog.registrosDelBotonDePanico", "Registros del Botón de Pánico")}
      description="Alertas de pánico y SOS: origen, prioridad, reconocimiento y resolución."
      icon={Siren}
      // Un pánico va en `--bad` SIEMPRE, elija la empresa el acento que elija.
      tone="bad"
      columns={columns}
      // Crítica/Alta sin cerrar → regla roja en el canto de la fila. Una vez
      // resuelto deja de ser una emergencia y baja a aviso.
      rowTone={(r) => {
        const grave = (r.priority ?? 3) <= 2;
        if (!grave) return undefined;
        const cerrado = r.status === "resolved" || r.status === "closed";
        return cerrado ? "warn" : "bad";
      }}
      load={async ({ from, to }) => {
        // Rango y categoría van EN LA CONSULTA. Antes se pedían los casos más
        // recientes y se recortaba aquí: un rango antiguo se exportaba vacío.
        const { start, end } = rangeBounds(from, to);
        const cases = await alarmService.cases({
          category: "panic",
          from: start,
          to: end,
          limit: REPORT_ROW_LIMIT,
        });
        // El `category` de arriba es el filtro real; esta línea es sólo un
        // seguro contra un servidor anterior a él, que devolvería TODAS las
        // categorías y convertiría este informe en la cola de alarmas entera.
        return warnIfCapped((cases || []).filter((c) => c.category === "panic"));
      }}
    />
  );
}
