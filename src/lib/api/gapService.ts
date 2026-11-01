/**
 * Sin cubrir — the real gaps of the schedule (backend `services/coverage/gaps`).
 *
 *   GET /tenant/:t/coverage/gaps             paged, filtered by date/station/kind
 *   GET /tenant/:t/coverage/gaps/candidates  ranked people for one gap
 */
import { ApiService } from "@/services/api/apiService";

export type GapKind =
  "no_show" | "leave" | "open_shift" | "archived_guard" | "empty_slot";

export const GAP_KINDS: GapKind[] = [
  "no_show",
  "leave",
  "open_shift",
  "archived_guard",
  "empty_slot",
];

export interface Gap {
  key: string;
  kind: GapKind;
  stationId: string;
  stationName: string | null;
  stationNickname: string | null;
  postSiteId: string | null;
  postSiteName: string | null;
  date: string;
  startTime: string;
  endTime: string;
  missing: number;
  need: number | null;
  shiftId: string | null;
  guardId: string | null;
  guardName: string | null;
  absenceReason: string | null;
  coverageEventId: string | null;
  /**
   * `coverageEventId` is an open vacancy: an empty seat opened to be offered
   * (Dobletes). Covering it goes through that event.
   */
  vacancy?: boolean;
  ended: boolean;
}

export interface GapPage {
  from: string;
  to: string;
  tz: string;
  rows: Gap[];
  total: number;
  page: number;
  pageSize: number;
  byKind: Record<GapKind, number>;
}

export interface GapQuery {
  from?: string;
  to?: string;
  stationId?: string;
  postSiteId?: string;
  kinds?: GapKind[];
  includeEnded?: boolean;
  page?: number;
  pageSize?: number;
}

export interface GapCandidate {
  guardId: string;
  securityGuardId: string | null;
  fullName: string | null;
  reason: string;
  score: number;
  availability: "available" | "unavailable" | "unknown";
  hoursThisWeek: number;
  shiftsHere: number;
  restHours: number | null;
  restViolation: boolean;
  weeklyCapExceeded: boolean;
  licenseExpired: boolean;
  blocked: boolean;
  warning: string | null;
}

const tenant = () => localStorage.getItem("tenantId") || "";

const unwrap = (r: any) =>
  r && typeof r === "object" && "data" in r && !("rows" in r) ? r.data : r;

export function queryDeHuecos(q: GapQuery): string {
  const p = new URLSearchParams();

  if (q.from) p.set("from", q.from);
  if (q.to) p.set("to", q.to);
  if (q.stationId) p.set("stationId", q.stationId);
  if (q.postSiteId) p.set("postSiteId", q.postSiteId);
  if (q.kinds?.length) p.set("kind", q.kinds.join(","));
  if (q.includeEnded !== undefined)
    p.set("includeEnded", q.includeEnded ? "1" : "0");
  p.set("page", String(q.page || 1));
  p.set("pageSize", String(q.pageSize || 50));

  return p.toString();
}

export const gapService = {
  async list(q: GapQuery): Promise<GapPage> {
    return unwrap(
      await ApiService.get(
        `/tenant/${tenant()}/coverage/gaps?${queryDeHuecos(q)}`,
      ),
    );
  },
  async candidates(
    g: Pick<Gap, "stationId" | "startTime" | "endTime" | "guardId">,
  ): Promise<GapCandidate[]> {
    const p = new URLSearchParams({
      stationId: g.stationId,
      start: g.startTime,
      end: g.endTime,
    });

    if (g.guardId) p.set("excludeGuardId", g.guardId);
    const r = unwrap(
      await ApiService.get(`/tenant/${tenant()}/coverage/gaps/candidates?${p}`),
    );

    return Array.isArray(r?.rows) ? r.rows : [];
  },
};

export default gapService;
