import { useTranslation } from "react-i18next";
import { CheckSquare } from "lucide-react";

import DataReport, { type ReportColumn } from "./DataReport";
import {
  formatDateTime,
  rangeBounds,
  REPORT_ROW_LIMIT,
  warnIfCapped,
} from "./reportFormat";

import taskService, { type TaskRow } from "@/lib/api/taskService";
// `columns` es de módulo: no hay `useTranslation` que valga. Se entra por la
// instancia de i18next y SIEMPRE dentro de `value()`, nunca en el cuerpo del
// módulo. Precedente: src/components/AppErrorBoundary.tsx
import i18n from "@/i18n";

/**
 * Mapas de módulo: guardan la CLAVE junto al texto español. Un `t()` aquí se
 * evaluaría al importar el fichero —antes de que i18next sepa el idioma— y
 * dejaría la columna congelada para toda la sesión. Se traducen dentro de
 * `value()`, que sí corre al pintar cada fila.
 */
type Etiqueta = { label: string; labelKey: string };
const STATUS: Record<string, Etiqueta> = {
  pending: { label: "Pendiente", labelKey: "comun.pendiente" },
  approved: { label: "Aprobada", labelKey: "tasks.estado.approved" },
  rejected: { label: "Rechazada", labelKey: "tasks.estado.rejected" },
  completed: { label: "Completada", labelKey: "tasks.estado.completed" },
};
const SOURCE: Record<string, Etiqueta> = {
  client: { label: "Cliente", labelKey: "comun.cliente" },
  staff: { label: "Personal", labelKey: "tasks.origen.staff" },
  passdown: { label: "Relevo", labelKey: "tasks.origen.passdown" },
};
const PRIORITY: Record<string, Etiqueta> = {
  alta: { label: "Alta", labelKey: "comun.alta" },
  media: { label: "Media", labelKey: "comun.media" },
  baja: { label: "Baja", labelKey: "comun.baja" },
};
/** Traduce una entrada del mapa AL PINTAR, nunca al construirlo. */
const etiqueta = (
  mapa: Record<string, Etiqueta>,
  bruto: unknown,
): string | null => {
  const e = mapa[String(bruto ?? "")];

  return e ? i18n.t(e.labelKey, e.label) : null;
};

const columns: ReportColumn<TaskRow>[] = [
  {
    key: "created",
    label: "Creada",
    labelKey: "reports.col.task.created",
    value: (r) => formatDateTime(r.createdAt),
  },
  {
    key: "task",
    label: "Tarea",
    labelKey: "reports.col.task.task",
    value: (r) =>
      r.taskToDo
        ? r.taskToDo.length > 70
          ? r.taskToDo.slice(0, 70) + "…"
          : r.taskToDo
        : "—",
  },
  {
    key: "station",
    label: "Puesto",
    labelKey: "reports.col.task.station",
    value: (r) => r.taskBelongsToStation?.stationName || "—",
    privacy: "stationName",
  },
  {
    key: "source",
    label: "Origen",
    labelKey: "reports.col.task.source",
    value: (r) => etiqueta(SOURCE, r.source) || r.source || "—",
  },
  {
    key: "priority",
    label: "Prioridad",
    labelKey: "reports.col.task.priority",
    value: (r) => etiqueta(PRIORITY, r.priority) || r.priority || "—",
    align: "center",
  },
  {
    key: "due",
    label: "Para",
    labelKey: "reports.col.task.due",
    // The deadline has a time (the form asks for date and hour).
    value: (r) => formatDateTime(r.dateToDoTheTask),
  },
  {
    key: "done",
    label: "Realizada",
    labelKey: "reports.col.task.done",
    value: (r) => (r.wasItDone ? i18n.t("ui.Task.si", "Sí") : i18n.t("ui.Task.no", "No")),
    align: "center",
  },
  {
    key: "status",
    label: "Estado",
    labelKey: "reports.col.task.status",
    value: (r) => etiqueta(STATUS, r.status) || r.status || "—",
  },
];

export default function Task() {
  const { t } = useTranslation();

  return (
    <DataReport<TaskRow>
      columns={columns}
      description={t("ui.Task.descripcion", "Tareas de cliente/personal aprobadas y ejecutadas por los vigilantes en turno.")}
      icon={CheckSquare}
      load={async ({ from, to }) => {
        // El rango (`createdAt`) va EN LA CONSULTA. Antes se pedían las 2000
        // tareas más recientes y se recortaba aquí: un rango antiguo se
        // exportaba vacío.
        const { start, end } = rangeBounds(from, to);
        const res: TaskRow[] | { rows?: TaskRow[] } =
          await taskService.byStatus({
            status: "all",
            from: start,
            to: end,
            limit: REPORT_ROW_LIMIT,
          });
        const rows: TaskRow[] = Array.isArray(res) ? res : res?.rows || [];

        return warnIfCapped(rows);
      }}
      title={t("ui.Task.informeDeTareas", "Informe de Tareas")}
    />
  );
}
