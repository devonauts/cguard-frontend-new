import { getTenantTimezone } from "@/utils/tenantLocation";
import { StatusBadge as KitStatusBadge } from "@/components/kit";
import { conEtiqueta, tablaDeEtiquetas } from "@/lib/i18nLabel";
import i18n from "@/i18n";
import { localeActual } from "@/lib/localeActual";
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
  on_time: conEtiqueta("nomina.estado.on_time", { tone: "ok" as PillTone }),
  late: conEtiqueta("nomina.estado.late", { tone: "warn" as PillTone }),
  early_departure: conEtiqueta("nomina.estado.early_departure", {
    tone: "warn" as PillTone,
  }),
  missed_clockin: conEtiqueta("nomina.estado.missed_clockin", {
    tone: "bad" as PillTone,
  }),
  missed_clockout: conEtiqueta("nomina.estado.missed_clockout", {
    tone: "bad" as PillTone,
  }),
  no_call_no_show: conEtiqueta("nomina.estado.no_call_no_show", {
    tone: "bad" as PillTone,
  }),
  overtime: conEtiqueta("nomina.estado.overtime", { tone: "info" as PillTone }),
  no_schedule: conEtiqueta("nomina.estado.no_schedule", {
    tone: "neutral" as PillTone,
  }),
  pending_review: conEtiqueta("nomina.estado.pending_review", {
    tone: "brand" as PillTone,
  }),
  /* Jornadas SIN fichaje que genera la novedad del Horario (V / PM / F). No son
     marcajes: son el día declarado en el timesheet — vacaciones y permiso son
     ausencias aprobadas (papel neutro/info), la falta no. Ver
     backend `attendanceAbsenceService`. */
  vacation: conEtiqueta("nomina.estado.vacation", { tone: "info" as PillTone }),
  permission: conEtiqueta("nomina.estado.permission", {
    tone: "info" as PillTone,
  }),
  absent: conEtiqueta("nomina.estado.absent", { tone: "bad" as PillTone }),
  approved: conEtiqueta("nomina.estado.approved", { tone: "ok" as PillTone }),
  rejected: conEtiqueta("nomina.estado.rejected", { tone: "bad" as PillTone }),
};

/**
 * ── EL CAMINO DE LA TARJETA HASTA EL PAGO ──────────────────────────────────
 * `STATUS_META` dice lo que PASÓ ese día (atraso, falta, vacaciones). Esto dice
 * DÓNDE VA la tarjeta. Son dos preguntas distintas y por eso son dos píldoras.
 *
 * El tono sube con el compromiso: en revisión es neutro, revisada informativa,
 * aprobada es de marca (alguien la firmó), pagada verde (se acabó) y rechazada
 * roja. Nada de esto deriva del acento salvo «aprobada», que es la única que
 * representa una decisión de la empresa.
 */
export const PAYROLL_FLOW_META: Record<
  string,
  { label: string; tone: PillTone }
> = {
  pending_review: { label: "Espera de revisión", tone: "neutral" },
  reviewed: { label: "Revisada", tone: "info" },
  approved: { label: "Aprobada — a gestionar pago", tone: "brand" },
  paid: { label: "Pagada", tone: "ok" },
  rejected: { label: "Rechazada", tone: "bad" },
};

/** A qué estados se puede pasar desde cada uno (espejo del servidor). */
export const PAYROLL_FLOW_NEXT: Record<string, string[]> = {
  pending_review: ["reviewed", "rejected"],
  reviewed: ["approved", "rejected", "pending_review"],
  approved: ["paid", "rejected", "reviewed"],
  paid: ["approved"],
  rejected: ["pending_review"],
};

/** Píldora del ciclo de nómina. `null` = no es una tarjeta (ausencia). */
export function PayrollBadge({
  status,
}: {
  status: string | null | undefined;
}) {
  if (!status) return <span style={{ color: "var(--ink-faint)" }}>—</span>;
  const m = PAYROLL_FLOW_META[status] || PAYROLL_FLOW_META.pending_review;

  return <KitStatusBadge tone={m.tone}>{m.label}</KitStatusBadge>;
}

/** guardShift.approvalStatus → etiqueta + tono. "none" (el valor por defecto en
 *  la base) significa que no hizo falta aprobación — no es un valor crudo que
 *  deba salir en pantalla. */
export const APPROVAL_META: Record<string, { label: string; tone: PillTone }> =
  {
    none: conEtiqueta("nomina.aprobacion.none", {
      tone: "neutral" as PillTone,
    }),
    pending: conEtiqueta("nomina.aprobacion.pending", {
      tone: "warn" as PillTone,
    }),
    approved: conEtiqueta("nomina.aprobacion.approved", {
      tone: "ok" as PillTone,
    }),
    rejected: conEtiqueta("nomina.aprobacion.rejected", {
      tone: "bad" as PillTone,
    }),
  };

/** Etiqueta legible de un estado de aprobación (para texto / CSV). */
export function approvalLabel(v: string | null | undefined): string {
  return (APPROVAL_META[v || "none"] || APPROVAL_META.none).label;
}

/** Píldora de estado de aprobación. */
export function ApprovalBadge({
  status,
}: {
  status: string | null | undefined;
}) {
  const m = APPROVAL_META[status || "none"] || APPROVAL_META.none;

  return <KitStatusBadge tone={m.tone}>{m.label}</KitStatusBadge>;
}

export const EXCEPTION_LABEL: Record<string, string> = tablaDeEtiquetas({
  late_arrival: "nomina.excepcion.late_arrival",
  early_departure: "nomina.excepcion.early_departure",
  missed_clockin: "nomina.excepcion.missed_clockin",
  missed_clockout: "nomina.excepcion.missed_clockout",
  no_call_no_show: "nomina.excepcion.no_call_no_show",
  outside_geofence: "nomina.excepcion.outside_geofence",
  missing_location: "nomina.excepcion.missing_location",
  overtime: "nomina.excepcion.overtime",
  correction_pending: "nomina.excepcion.correction_pending",
});

/** attendanceException.status → etiqueta + tono (de abierta a resuelta). */
export const EXC_STATUS_META: Record<
  string,
  { label: string; tone: PillTone }
> = {
  open: conEtiqueta("nomina.excEstado.open", { tone: "warn" as PillTone }),
  acknowledged: conEtiqueta("nomina.excEstado.acknowledged", {
    tone: "info" as PillTone,
  }),
  resolved: conEtiqueta("nomina.excEstado.resolved", {
    tone: "ok" as PillTone,
  }),
  approved: conEtiqueta("nomina.excEstado.approved", {
    tone: "ok" as PillTone,
  }),
  rejected: conEtiqueta("nomina.excEstado.rejected", {
    tone: "bad" as PillTone,
  }),
};

export const SEVERITY_META: Record<string, { label: string; tone: PillTone }> =
  {
    low: conEtiqueta("nomina.severidad.low", { tone: "neutral" as PillTone }),
    medium: conEtiqueta("nomina.severidad.medium", {
      tone: "warn" as PillTone,
    }),
    high: conEtiqueta("nomina.severidad.high", { tone: "warn" as PillTone }),
    critical: conEtiqueta("nomina.severidad.critical", {
      tone: "bad" as PillTone,
    }),
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
        {approval === "approved"
          ? i18n.t("nomina.estado.revisado")
          : i18n.t("nomina.estado.revisadoRechazado")}
      </KitStatusBadge>
    );
  }
  const m = STATUS_META[status] || {
    label: status,
    tone: "neutral" as PillTone,
  };

  return <KitStatusBadge tone={m.tone}>{m.label}</KitStatusBadge>;
}

export function fmtDateTime(v: string | null | undefined): string {
  if (!v) return "—";
  try {
    return new Date(v).toLocaleString(localeActual(), {
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
    return new Date(v).toLocaleTimeString(localeActual(), {
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
