import i18n from "@/i18n";
import { ApiService } from "@/services/api/apiService";

const tid = (): string => {
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

export interface PositionAssignment {
  id: string;
  supervisorUserId: string | null;
  supervisorName: string | null;
  platoonOffset: number;
  isRelief: boolean;
  startDate: string | null;
  status: string;
}

export interface SupervisorPosition {
  id: string;
  name: string;
  zone: string | null;
  scheduleType: string;
  rotationStyleId: string | null;
  rotationStyle: {
    id: string;
    name: string;
    dayShifts: number;
    nightShifts: number;
    restDays: number;
  } | null;
  startTime: string | null;
  endTime: string | null;
  guardsNeeded: number;
  mobileStationId: string | null;
  stationIds: string[];
  /** Names resolved by the server (deleted stations included). */
  stations?: { id: string; name: string; postSiteName: string | null; deleted: boolean }[];
  isActive: boolean;
  assignments: PositionAssignment[];
}

export interface SupervisorPositionBody {
  name: string;
  zone?: string;
  scheduleType?: string;
  rotationStyleId?: string | null;
  startTime?: string;
  endTime?: string;
  guardsNeeded?: number;
  stationIds?: string[];
}

const base = () => `/tenant/${tid()}/supervisor-positions`;

export const supervisorPositionService = {
  list: (): Promise<{ rows: SupervisorPosition[]; count: number }> =>
    ApiService.get(base()),
  get: (id: string): Promise<SupervisorPosition> =>
    ApiService.get(`${base()}/${id}`),
  create: (body: SupervisorPositionBody): Promise<SupervisorPosition> =>
    ApiService.post(base(), body),
  update: (
    id: string,
    body: Partial<SupervisorPositionBody> & { isActive?: boolean },
  ): Promise<SupervisorPosition> => ApiService.put(`${base()}/${id}`, body),
  remove: (id: string): Promise<void> => ApiService.delete(`${base()}/${id}`),
  assign: (
    id: string,
    body: {
      supervisorUserId: string;
      platoonOffset?: number;
      isRelief?: boolean;
      startDate?: string;
    },
  ): Promise<SupervisorPosition> =>
    ApiService.post(`${base()}/${id}/assignments`, body),
  unassign: (id: string, assignmentId: string): Promise<SupervisorPosition> =>
    ApiService.delete(`${base()}/${id}/assignments/${assignmentId}`),
};
