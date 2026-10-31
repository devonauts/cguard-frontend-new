import i18n from "@/i18n";
import api from "../api";

import { tablaDeEtiquetas } from "@/lib/i18nLabel";

// Station labels live in one place — the nominativo is what disambiguates
// posts that share a stationName. Re-exported so existing imports keep working.
export { stationLabel } from "../stationName";

/**
 * Coverage / novedades de turno — the office view of "who is actually standing
 * at each post, and what to do about the ones that are empty".
 *
 * The same endpoints back the supervisor app under /supervisor/me/coverage; the
 * CRM uses the /coverage root. One backend code path, one set of rules.
 */

const getTenantId = (): string => {
  const t = localStorage.getItem("tenantId");

  if (!t)
    throw new Error(
      i18n.t(
        "ui.apiService.noPudimosIdentificarTuEmpresa",
        "No pudimos identificar tu empresa. Cierra sesión y vuelve a entrar.",
      ),
    );

  return t;
};

const buildQuery = (params?: Record<string, unknown>): string => {
  if (!params) return "";
  const p = new URLSearchParams();

  for (const k of Object.keys(params)) {
    const v = params[k];

    if (v !== undefined && v !== null && String(v).trim() !== "")
      p.append(k, String(v));
  }
  const s = p.toString();

  return s ? `?${s}` : "";
};

export type CoverageStatus = "covered" | "at_risk" | "uncovered" | "idle";

export interface StationCoverage {
  stationId: string;
  stationName: string | null;
  /** Internal call-sign ("nominativo", e.g. P-031) — how operations names posts,
   *  and the only way to tell apart several that share a stationName. */
  nickname: string | null;
  postSiteId: string | null;
  status: CoverageStatus;
  expected: Array<{
    guardId: string;
    fullName: string | null;
    startTime: string;
    endTime: string;
    shiftId: string;
    /** Reemplazo recién mandado, sin fichar y dentro de su gracia: «va en camino». */
    enCamino?: boolean;
    /** Cuándo se le mandó (ISO), o null si no es una cobertura. */
    enCaminoDesde?: string | null;
  }>;
  present: Array<{
    guardId: string;
    fullName: string | null;
    punchInTime: string;
  }>;
  openEvents: Array<{
    id: string;
    reason: string;
    absentGuardId: string | null;
    minutesOpen: number;
  }>;
  minutesSinceStart: number | null;
}

export interface LiveCoverage {
  at: string;
  tz: string;
  stations: StationCoverage[];
  summary: Record<string, number>;
}

export interface CoverageEvent {
  id: string;
  date: string;
  kind: "absence" | "transfer" | "reinforcement";
  reason: string;
  reasonNote: string | null;
  status: "open" | "covered" | "resolved" | "cancelled";
  windowStart: string;
  windowEnd: string;
  paid: boolean;
  countsAgainstGuard: boolean;
  absentGuard?: { id: string; firstName?: string; lastName?: string } | null;
  coveringGuard?: { id: string; firstName?: string; lastName?: string } | null;
  originStation?: {
    id: string;
    stationName?: string;
    nickname?: string | null;
  } | null;
  targetStation?: {
    id: string;
    stationName?: string;
    nickname?: string | null;
  } | null;
}

/**
 * Kept in sync with COVERAGE_REASONS in
 * backend/src/services/coverageService.ts, which decides the payroll and
 * disciplinary treatment of each one.
 */
export const COVERAGE_REASONS = [
  "permiso_con_sueldo",
  "permiso_sin_sueldo",
  "no_call_no_show",
  "enfermedad",
  "calamidad_domestica",
  "vacaciones",
  "suspension",
  "abandono_puesto",
  "transporte",
  "transferencia_operativa",
  "refuerzo_cliente",
  "otro",
] as const;
export type CoverageReason = (typeof COVERAGE_REASONS)[number];

/** Etiquetas del motivo de cobertura. Se resuelven AL LEERLAS: este módulo lo
 *  importan varias páginas y se evalúa mucho antes de saber el idioma. */
export const REASON_LABEL: Record<string, string> = tablaDeEtiquetas({
  permiso_con_sueldo: "coverage.reason.permiso_con_sueldo",
  permiso_sin_sueldo: "coverage.reason.permiso_sin_sueldo",
  no_call_no_show: "coverage.reason.no_call_no_show",
  enfermedad: "coverage.reason.enfermedad",
  calamidad_domestica: "coverage.reason.calamidad_domestica",
  vacaciones: "coverage.reason.vacaciones",
  suspension: "coverage.reason.suspension",
  abandono_puesto: "coverage.reason.abandono_puesto",
  transporte: "coverage.reason.transporte",
  transferencia_operativa: "coverage.reason.transferencia_operativa",
  refuerzo_cliente: "coverage.reason.refuerzo_cliente",
  otro: "coverage.reason.otro",
});

export const STATUS_LABEL: Record<CoverageStatus, string> = tablaDeEtiquetas({
  covered: "coverage.status.covered",
  at_risk: "coverage.status.at_risk",
  uncovered: "coverage.status.uncovered",
  idle: "coverage.status.idle",
}) as Record<CoverageStatus, string>;

/**
 * Rules violations come back as `{ error: code }` with a 400. They are operator
 * decisions ("está en descanso"), not faults — the caller turns some of them
 * into a confirm-and-retry rather than an error toast.
 */
export function coverageErrorCode(e: any): string | null {
  return e?.response?.data?.error || null;
}

export const coverageService = {
  live: (stationIds?: string[]): Promise<LiveCoverage> =>
    api
      .get(
        `/tenant/${getTenantId()}/coverage/live${buildQuery({ stationIds: stationIds?.join(",") })}`,
      )
      .then((r) => r.data?.data ?? r.data),

  events: (params?: {
    from?: string;
    to?: string;
    status?: string;
    kind?: string;
    stationId?: string;
    guardId?: string;
  }) =>
    api
      .get(`/tenant/${getTenantId()}/coverage/events${buildQuery(params)}`)
      .then(
        (r) =>
          (r.data?.data ?? r.data) as { rows: CoverageEvent[]; count: number },
      ),

  candidates: (params: {
    eventId?: string;
    stationId?: string;
    windowStart?: string;
    windowEnd?: string;
    excludeGuardId?: string;
    limit?: number;
  }) =>
    api
      .get(`/tenant/${getTenantId()}/coverage/candidates${buildQuery(params)}`)
      .then(
        (r) =>
          (r.data?.data ?? r.data) as Array<{
            guardId: string;
            fullName: string | null;
            reason: string;
            score: number;
            /** They said they cannot work this window (one availability per person). */
            outsideAvailability?: boolean;
            warning?: string | null;
          }>,
      ),

  reportAbsence: (body: {
    guardId: string;
    reason: CoverageReason;
    reasonNote?: string;
    shiftId?: string;
    stationId?: string;
    paid?: boolean;
  }) =>
    api
      .post(`/tenant/${getTenantId()}/coverage/absence`, body)
      .then((r) => r.data?.data ?? r.data),

  transfer: (body: {
    guardId: string;
    toStationId: string;
    fromStationId?: string;
    shiftIds?: string[];
    windowStart?: string;
    windowEnd?: string;
    /** Tenant-local calendar range, inclusive — resolved server-side in the
     *  tenant's timezone so "hasta el 9" includes the whole of the 9th. */
    dateFrom?: string;
    dateTo?: string;
    reason?: CoverageReason;
    reasonNote?: string;
    allowRestDay?: boolean;
  }) =>
    api
      .post(`/tenant/${getTenantId()}/coverage/transfer`, body)
      .then((r) => r.data?.data ?? r.data),

  /**
   * EXTENDER TURNO: el vigilante que ya cubrió el día se queda además con la
   * noche porque su relevo no llegó. El servidor crea el turno en el horario
   * (marcado como extensión) y registra el motivo, quién faltó y quién lo
   * autorizó. Devuelve además los `warnings` que se mostraron.
   */
  extension: (body: {
    guardId: string;
    /** Hasta qué hora se queda (ISO). */
    until: string;
    /** Desde cuándo; por defecto, donde terminó su último turno. */
    from?: string;
    stationId?: string;
    reason?: CoverageReason;
    reasonNote?: string;
    /** Quién faltó, si faltó alguien. Opcional. */
    absentGuardId?: string;
    notifyClient?: boolean;
    acknowledgedWarnings?: string[];
    /** El fichaje abierto que se alarga, si se conoce. */
    guardShiftId?: string;
  }) =>
    api
      .post(`/tenant/${getTenantId()}/coverage/extension`, body)
      .then((r) => r.data?.data ?? r.data),

  /** Reemplazo por vacaciones/permiso: X sale por un rango, Y cubre todo el
   *  periodo en una acción. El servidor marca la ausencia, deja a Y con los
   *  turnos del puesto y lo hace figurar en la estación. */
  replacement: (body: {
    absentGuardId: string;
    replacementGuardId: string;
    dateFrom: string;
    dateTo: string;
    reason?: CoverageReason;
    stationId?: string;
    reasonNote?: string;
    allowDoubleShift?: boolean;
  }) =>
    api
      .post(`/tenant/${getTenantId()}/coverage/replacement`, body)
      .then((r) => r.data?.data ?? r.data),

  /** `flags` carries the operator's confirmations (descanso, doblar turno). */
  cover: (
    eventId: string,
    coveringGuardId: string,
    flags: { allowRestDay?: boolean; allowDoubleShift?: boolean } = {},
  ) =>
    api
      .post(`/tenant/${getTenantId()}/coverage/events/${eventId}/cover`, {
        coveringGuardId,
        ...flags,
      })
      .then((r) => r.data?.data ?? r.data),

  cancel: (eventId: string) =>
    api
      .post(`/tenant/${getTenantId()}/coverage/events/${eventId}/cancel`, {})
      .then((r) => r.data?.data ?? r.data),
};

export default coverageService;
