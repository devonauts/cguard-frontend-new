import type { GuardAssignment } from "./schedule";
export interface Station {
  id: string;
  stationName: string;
  /** Internal call-sign ("nominativo", e.g. P-031) — how operations refers to a post, and the only way to tell apart several sharing a stationName. */ nickname?:
    | string
    | null;
  scheduleType?: string;
  rotationStyleId?: string;
  postSiteId?: string;
  latitud?: number | string | null;
  longitud?: number | string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  address?: string;
  active?: boolean;
  startDate?: string | null;
  endDate?: string | null;
  assignedGuards?: GuardAssignment[];
  guardsCount?: number;
  tenantId?: string;
}
