import { ApiService } from "@/services/api/apiService";

/**
 * The one availability per person (backend services/availability): the same
 * rows the guard app and the Dobletes screens edit.
 */
export interface WeeklyAvailability {
  /** 0 = Sunday … 6 = Saturday */
  weekday: number;
  slots: string[];
  startTime: string | null;
  endTime: string | null;
  stationIds?: string[];
}

export interface PersonAvailability {
  configured: boolean;
  weekly: WeeklyAvailability[];
  dates: Array<{ date: string; slots: string[] }>;
}

const tenant = () => localStorage.getItem("tenantId") || "";

export const availabilityService = {
  get: (userId: string): Promise<PersonAvailability> =>
    ApiService.get(`/tenant/${tenant()}/person/${userId}/availability`),
  setWeekly: (
    userId: string,
    weekly: Array<{ weekday: number; startTime: string | null; endTime: string | null; slots?: string[] }>,
  ): Promise<PersonAvailability> =>
    ApiService.put(`/tenant/${tenant()}/person/${userId}/availability`, { weekly }),
};

export default availabilityService;
