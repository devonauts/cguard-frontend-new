import { ApiService } from "@/services/api/apiService";

const tid = (): string => localStorage.getItem("tenantId") || "";

export interface OpsAnalytics {
  /** start/end: the UTC window; startDay/endDay: the company days asked for. */
  range: {
    start: string;
    end: string;
    startDay?: string;
    endDay?: string;
    days: number;
  };
  kpis: {
    guardsOnDuty: number;
    shiftsTotal: number;
    shiftsCovered: number;
    coveragePct: number;
    shiftsOpen?: number;
    rondasTotal: number;
    rondasCompleted: number;
    rondaCompletionPct: number;
    scansTotal: number;
    scansValid: number;
    locationCompliancePct: number;
    incidentsTotal: number;
    incidentsOpen: number;
    clockinsTotal: number;
    clockinsOnTime: number;
    punctualityPct: number;
  };
  attendance: {
    hoursWorked: number;
    late: number;
    earlyDeparture: number;
    geofenceViolations: number;
  };
  trend: Array<{
    date: string;
    incidents: number;
    scans: number;
    rondas: number;
  }>;
  incidentsByPriority: Array<{ label: string; count: number }>;
  topIncidentSites: Array<{ site: string; count: number }>;
  perSite: Array<{
    id: string;
    site: string;
    guards: number;
    shiftsTotal: number;
    shiftsCovered: number;
    coveragePct: number;
    rondasCompleted: number;
    incidents: number;
    locationCompliancePct: number;
  }>;
  perGuard: Array<{
    name: string;
    shifts: number;
    hoursWorked: number;
    onTimePct: number;
    late: number;
    incidents: number;
  }>;
  coverageTrend: Array<{ date: string; scheduled: number; covered: number }>;
  upcomingUncovered: Array<{ site: string; count: number }>;
  upcomingUncoveredTotal: number;
}

export interface GuardPerformance {
  id: string;
  name: string;
  score: number | null;
  base?: number;
  tier: string;
  hasData: boolean;
  /** ¿Se le mide el desempeño a esta persona? Apagado ⇒ sin nota, no un cero. */
  enabled?: boolean;
  /** ¿Hay algo real detrás de la nota, o es el 100 con el que se arranca? */
  hasSignals?: boolean;
  attendanceRate: number | null;
  shiftsWorked: number | null;
  onTimeShifts: number | null;
  absences: number;
  tardies: number;
  components: { key: string; score: number; weight: number }[];
}
export interface PerfLeaderboard {
  period: number;
  averageScore: number | null;
  /** `false` cuando la empresa tiene apagada la medición entera. */
  enabled?: boolean;
  disabledBy?: "tenant" | null;
  counts: {
    total: number;
    scored: number;
    excellent: number;
    good: number;
    fair: number;
    poor: number;
  };
  guards: GuardPerformance[];
}

export const analyticsService = {
  operations(params?: {
    startDate?: string;
    endDate?: string;
  }): Promise<OpsAnalytics> {
    const qs = new URLSearchParams();

    if (params?.startDate) qs.set("startDate", params.startDate);
    if (params?.endDate) qs.set("endDate", params.endDate);
    const q = qs.toString();

    return ApiService.get(
      `/tenant/${tid()}/operations/analytics${q ? `?${q}` : ""}`,
    );
  },
  // Official guard performance scores (same algorithm as the worker app).
  performanceGuards(period: number): Promise<PerfLeaderboard> {
    return ApiService.get(
      `/tenant/${tid()}/performance/guards?period=${period}`,
    );
  },
};
