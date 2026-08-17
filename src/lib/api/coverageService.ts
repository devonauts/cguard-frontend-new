import api from "../api";

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
  if (!t) throw new Error("No pudimos identificar tu empresa. Cierra sesión y vuelve a entrar.");
  return t;
};

const buildQuery = (params?: Record<string, unknown>): string => {
  if (!params) return "";
  const p = new URLSearchParams();
  for (const k of Object.keys(params)) {
    const v = params[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") p.append(k, String(v));
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
  expected: Array<{ guardId: string; fullName: string | null; startTime: string; endTime: string; shiftId: string }>;
  present: Array<{ guardId: string; fullName: string | null; punchInTime: string }>;
  openEvents: Array<{ id: string; reason: string; absentGuardId: string | null; minutesOpen: number }>;
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
  originStation?: { id: string; stationName?: string; nickname?: string | null } | null;
  targetStation?: { id: string; stationName?: string; nickname?: string | null } | null;
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

/** Spanish labels for the operator-facing UI (this CRM is Spanish-first). */
export const REASON_LABEL: Record<string, string> = {
  permiso_con_sueldo: "Permiso con sueldo",
  permiso_sin_sueldo: "Permiso sin sueldo",
  no_call_no_show: "No se presentó ni avisó",
  enfermedad: "Enfermedad",
  calamidad_domestica: "Calamidad doméstica",
  vacaciones: "Vacaciones",
  suspension: "Suspensión",
  abandono_puesto: "Abandono del puesto",
  transporte: "Problema de transporte",
  transferencia_operativa: "Traslado operativo",
  refuerzo_cliente: "Refuerzo solicitado",
  otro: "Otro",
};

export const STATUS_LABEL: Record<CoverageStatus, string> = {
  covered: "Cubierto",
  at_risk: "En riesgo",
  uncovered: "Sin cubrir",
  idle: "Sin turno",
};

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
      .get(`/tenant/${getTenantId()}/coverage/live${buildQuery({ stationIds: stationIds?.join(",") })}`)
      .then((r) => r.data?.data ?? r.data),

  events: (params?: { from?: string; to?: string; status?: string; kind?: string; stationId?: string; guardId?: string }) =>
    api
      .get(`/tenant/${getTenantId()}/coverage/events${buildQuery(params)}`)
      .then((r) => (r.data?.data ?? r.data) as { rows: CoverageEvent[]; count: number }),

  candidates: (params: { eventId?: string; stationId?: string; windowStart?: string; windowEnd?: string; excludeGuardId?: string }) =>
    api
      .get(`/tenant/${getTenantId()}/coverage/candidates${buildQuery(params)}`)
      .then((r) => (r.data?.data ?? r.data) as Array<{ guardId: string; fullName: string | null; reason: string; score: number }>),

  reportAbsence: (body: {
    guardId: string;
    reason: CoverageReason;
    reasonNote?: string;
    shiftId?: string;
    stationId?: string;
    paid?: boolean;
  }) => api.post(`/tenant/${getTenantId()}/coverage/absence`, body).then((r) => r.data?.data ?? r.data),

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
  }) => api.post(`/tenant/${getTenantId()}/coverage/transfer`, body).then((r) => r.data?.data ?? r.data),

  /** `flags` carries the operator's confirmations (descanso, doblar turno). */
  cover: (
    eventId: string,
    coveringGuardId: string,
    flags: { allowRestDay?: boolean; allowDoubleShift?: boolean } = {},
  ) =>
    api
      .post(`/tenant/${getTenantId()}/coverage/events/${eventId}/cover`, { coveringGuardId, ...flags })
      .then((r) => r.data?.data ?? r.data),

  cancel: (eventId: string) =>
    api.post(`/tenant/${getTenantId()}/coverage/events/${eventId}/cancel`, {}).then((r) => r.data?.data ?? r.data),
};

export default coverageService;
