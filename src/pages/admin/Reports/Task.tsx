import { CheckSquare } from "lucide-react";
import DataReport, { type ReportColumn } from "./DataReport";
import { formatDate, rangeBounds, REPORT_ROW_LIMIT, warnIfCapped } from "./reportFormat";
import taskService, { type TaskRow } from "@/lib/api/taskService";


const STATUS: Record<string, string> = {
  pending: "Pendiente",
  approved: "Aprobada",
  rejected: "Rechazada",
  completed: "Completada",
};
const SOURCE: Record<string, string> = { client: "Cliente", staff: "Personal", passdown: "Relevo" };
const PRIORITY: Record<string, string> = { alta: "Alta", media: "Media", baja: "Baja" };

const columns: ReportColumn<TaskRow>[] = [
  { key: "created", label: "Creada", value: (r) => formatDate(r.createdAt) },
  { key: "task", label: "Tarea", value: (r) => (r.taskToDo ? (r.taskToDo.length > 70 ? r.taskToDo.slice(0, 70) + "…" : r.taskToDo) : "—") },
  { key: "station", label: "Puesto", value: (r) => r.taskBelongsToStation?.stationName || "—" },
  { key: "source", label: "Origen", value: (r) => SOURCE[String(r.source || "")] || r.source || "—" },
  { key: "priority", label: "Prioridad", value: (r) => PRIORITY[String(r.priority || "")] || r.priority || "—", align: "center" },
  { key: "due", label: "Para", value: (r) => formatDate(r.dateToDoTheTask) },
  { key: "done", label: "Realizada", value: (r) => (r.wasItDone ? "Sí" : "No"), align: "center" },
  { key: "status", label: "Estado", value: (r) => STATUS[String(r.status || "")] || r.status || "—" },
];

export default function Task() {
  return (
    <DataReport<TaskRow>
      title="Informe de Tareas"
      description="Tareas de cliente/personal aprobadas y ejecutadas por los vigilantes en turno."
      icon={CheckSquare}
      columns={columns}
      load={async ({ from, to }) => {
        // El rango (`createdAt`) va EN LA CONSULTA. Antes se pedían las 2000
        // tareas más recientes y se recortaba aquí: un rango antiguo se
        // exportaba vacío.
        const { start, end } = rangeBounds(from, to);
        const res: TaskRow[] | { rows?: TaskRow[] } = await taskService.byStatus({
          status: "all",
          from: start,
          to: end,
          limit: REPORT_ROW_LIMIT,
        });
        const rows: TaskRow[] = Array.isArray(res) ? res : res?.rows || [];
        return warnIfCapped(rows);
      }}
    />
  );
}
