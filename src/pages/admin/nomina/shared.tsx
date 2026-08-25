import { getTenantTimezone } from "@/utils/tenantLocation";
import { StatusBadge as KitStatusBadge } from "@/components/kit";

/**
 * Vocabulario de estados de asistencia.
 *
 * El tono NO es un color escrito a mano: es uno de los papeles del sistema
 * (`ok` / `warn` / `bad` / `info` / `neutral` / `brand`). La píldora la pinta el
 * kit a partir de los tokens, así que se lee igual en claro y en oscuro y sigue
 * funcionando cuando el usuario cambia el acento.
 */
export type PillTone = "ok" | "warn" | "bad" | "info" | "neutral" | "brand";

export const STATUS_META: Record<string, { label: string; tone: PillTone }> = {
  on_time: { label: "A tiempo", tone: "ok" },
  late: { label: "Tarde", tone: "warn" },
  early_departure: { label: "Salida anticipada", tone: "warn" },
  missed_clockin: { label: "Sin entrada", tone: "bad" },
  missed_clockout: { label: "Sin salida", tone: "bad" },
  no_call_no_show: { label: "Inasistencia", tone: "bad" },
  overtime: { label: "Tiempo extra", tone: "info" },
  no_schedule: { label: "Sin horario", tone: "neutral" },
  pending_review: { label: "En revisión", tone: "brand" },
  approved: { label: "Aprobado", tone: "ok" },
  rejected: { label: "Rechazado", tone: "bad" },
};

/** guardShift.approvalStatus → etiqueta + tono. "none" (el valor por defecto en
 *  la base) significa que no hizo falta aprobación — no es un valor crudo que
 *  deba salir en pantalla. */
export const APPROVAL_META: Record<string, { label: string; tone: PillTone }> = {
  none: { label: "Sin aprobación", tone: "neutral" },
  pending: { label: "Pendiente", tone: "warn" },
  approved: { label: "Aprobada", tone: "ok" },
  rejected: { label: "Rechazada", tone: "bad" },
};

/** Etiqueta legible de un estado de aprobación (para texto / CSV). */
export function approvalLabel(v: string | null | undefined): string {
  return (APPROVAL_META[v || "none"] || APPROVAL_META.none).label;
}

/** Píldora de estado de aprobación. */
export function ApprovalBadge({ status }: { status: string | null | undefined }) {
  const m = APPROVAL_META[status || "none"] || APPROVAL_META.none;
  return <KitStatusBadge tone={m.tone}>{m.label}</KitStatusBadge>;
}

export const EXCEPTION_LABEL: Record<string, string> = {
  late_arrival: "Llegada tarde",
  early_departure: "Salida anticipada",
  missed_clockin: "Sin marcar entrada",
  missed_clockout: "Sin marcar salida",
  no_call_no_show: "Inasistencia (no-show)",
  outside_geofence: "Fuera de geocerca",
  overtime: "Tiempo extra",
  correction_pending: "Corrección pendiente",
};

/** attendanceException.status → etiqueta + tono (de abierta a resuelta). */
export const EXC_STATUS_META: Record<string, { label: string; tone: PillTone }> = {
  open: { label: "Abierta", tone: "warn" },
  acknowledged: { label: "Reconocida", tone: "info" },
  resolved: { label: "Resuelta", tone: "ok" },
  approved: { label: "Aprobada", tone: "ok" },
  rejected: { label: "Rechazada", tone: "bad" },
};

export const SEVERITY_META: Record<string, { label: string; tone: PillTone }> = {
  low: { label: "Baja", tone: "neutral" },
  medium: { label: "Media", tone: "warn" },
  high: { label: "Alta", tone: "warn" },
  critical: { label: "Crítica", tone: "bad" },
};

/**
 * Píldora del estado de la marcación.
 *
 * `approval` es opcional y sólo cambia UN caso: `pending_review` —«En revisión»—
 * cuando la revisión YA ocurrió. El estado se conserva a propósito en la base
 * (la nómina necesita saber que la marcación tuvo novedad, ver
 * attendanceAdminService.setApproval), pero seguir diciendo «En revisión»
 * después de aprobarla hace pensar que la aprobación no se guardó. Lo que
 * cambia es la etiqueta, no el dato.
 */
export function StatusBadge({
  status,
  approval,
}: {
  status: string;
  approval?: string | null;
}) {
  const decidida = approval === "approved" || approval === "rejected";
  if (status === "pending_review" && decidida) {
    return (
      <KitStatusBadge tone={approval === "approved" ? "ok" : "bad"}>
        {approval === "approved" ? "Revisado" : "Revisado (rechazado)"}
      </KitStatusBadge>
    );
  }
  const m = STATUS_META[status] || { label: status, tone: "neutral" as PillTone };
  return <KitStatusBadge tone={m.tone}>{m.label}</KitStatusBadge>;
}

export function fmtDateTime(v: string | null | undefined): string {
  if (!v) return "—";
  try {
    return new Date(v).toLocaleString("es-ES", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: getTenantTimezone(),
    });
  } catch {
    return "—";
  }
}

export function fmtTime(v: string | null | undefined): string {
  if (!v) return "—";
  try {
    return new Date(v).toLocaleTimeString("es-ES", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: getTenantTimezone(),
    });
  } catch {
    return "—";
  }
}

export function fmtHours(h: number | null | undefined): string {
  if (h == null) return "—";
  return `${Number(h).toFixed(2)} h`;
}
