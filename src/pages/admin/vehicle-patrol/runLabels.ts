/**
 * Etiquetas y tonos compartidos por el tablero en vivo, el historial y el
 * detalle de una ejecución. Los valores crudos (`in_progress`, `stop.arrived`)
 * son el contrato con el servidor; aquí se convierten en palabras.
 *
 * Los tonos son los del sistema (`ok` / `warn` / `bad` / `info` / `brand` /
 * `neutral`). Un tono inventado —`danger`— caía en `neutral` dentro de
 * `StatusBadge` y los estados críticos salían grises.
 */
export const RUN_STATUS_LABEL: Record<string, string> = {
  scheduled: "Programada",
  in_progress: "En curso",
  paused: "En pausa",
  completed: "Completada",
  partially_completed: "Parcial",
  aborted: "Abortada",
  cancelled: "Cancelada",
  skipped: "No realizada",
};
export const RUN_STATUS_TONE: Record<string, string> = {
  scheduled: "neutral",
  in_progress: "brand",
  paused: "warn",
  completed: "ok",
  partially_completed: "warn",
  aborted: "bad",
  cancelled: "neutral",
  skipped: "bad",
};
export const VISIT_STATUS_LABEL: Record<string, string> = {
  pending: "Pendiente",
  en_route: "En camino",
  arrived: "En el sitio",
  inspection_in_progress: "Inspeccionando",
  completed: "Completada",
  skipped: "Omitida",
  missed: "No visitada",
  exception: "Excepción",
};
export const VISIT_STATUS_TONE: Record<string, string> = {
  pending: "neutral",
  en_route: "brand",
  arrived: "brand",
  inspection_in_progress: "brand",
  completed: "ok",
  skipped: "warn",
  missed: "bad",
  exception: "bad",
};
export const SCHEDULE_LABEL: Record<string, string> = {
  on_time: "A tiempo",
  delayed: "Retrasada",
  at_risk: "En riesgo",
};
export const SCHEDULE_TONE: Record<string, string> = {
  on_time: "ok",
  delayed: "warn",
  at_risk: "bad",
};
export const EVENT_LABEL: Record<string, string> = {
  "route.started": "Ruta iniciada",
  "route.paused": "Ruta en pausa",
  "route.resumed": "Ruta reanudada",
  "route.completed": "Ruta finalizada",
  "route.aborted": "Ruta abortada",
  "route.plan_updated": "Plan modificado",
  "route.delayed": "Ruta retrasada",
  "route.at_risk": "Ruta en riesgo",
  "stop.en_route": "En camino a la parada",
  "stop.arrived": "Llegada",
  "stop.geofence_override": "Llegada fuera de zona (con motivo)",
  "stop.inspection_started": "Inspección iniciada",
  "stop.completed": "Parada completada",
  "stop.skipped": "Parada omitida",
  "stop.missed": "Parada no visitada",
  "observation.created": "Novedad",
  "incident.created": "Incidente creado",
  "photo.added": "Foto añadida",
  "guard.discrepancy": "Discrepancia de personal",
  "visit.corrected": "Corrección",
};
export const SKIP_REASON_LABEL: Record<string, string> = {
  site_inaccessible: "Sitio inaccesible",
  emergency: "Emergencia",
  client_requested: "A petición del cliente",
  unsafe_conditions: "Condiciones inseguras",
  wrong_assignment: "Asignación equivocada",
  road_closure: "Vía cerrada",
  schedule_constraint: "Restricción de horario",
  operations_instruction: "Instrucción de operaciones",
  other: "Otro",
};
export const SEVERITY_LABEL: Record<string, string> = {
  info: "Info",
  low: "Baja",
  medium: "Media",
  high: "Alta",
  critical: "Crítica",
};
export const SEVERITY_TONE: Record<string, string> = {
  info: "neutral",
  low: "ok",
  medium: "warn",
  high: "bad",
  critical: "bad",
};

export const fmtHora = (iso: string | null | undefined, locale: string) =>
  iso
    ? new Date(iso).toLocaleTimeString(locale, {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";
/** «2026-09-05» → «vie, 5 sept 2026». El día de la ruta se lee, no se descifra. */
export const fmtFecha = (ymd: string | null | undefined, locale: string) => {
  if (!ymd) return "—";
  const d = new Date(`${String(ymd).slice(0, 10)}T12:00:00`);

  return Number.isNaN(d.getTime())
    ? String(ymd)
    : d.toLocaleDateString(locale, {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
      });
};
export const fmtDur = (sec: number | null | undefined) => {
  if (sec == null) return "—";
  const m = Math.round(sec / 60);

  return m >= 60
    ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min`
    : `${m} min`;
};
export const nombreDe = (u: any) =>
  (
    u?.fullName ||
    [u?.firstName, u?.lastName].filter(Boolean).join(" ") ||
    u?.email ||
    ""
  ).trim();
