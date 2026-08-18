import { ApiService } from "@/services/api/apiService";

const tid = (): string => {
  const t = localStorage.getItem("tenantId");
  if (!t) throw new Error("No pudimos identificar tu empresa. Cierra sesión y vuelve a entrar.");
  return t;
};

export interface Supervisor {
  id: string; // the supervisor's USER id — the stable identifier
  profileId: string | null;
  email: string | null;
  fullName: string;
  firstName?: string | null;
  lastName?: string | null;
  phoneNumber?: string | null;
  governmentId?: string | null;
  gender?: string | null;
  bloodType?: string | null;
  birthDate?: string | null;
  birthPlace?: string | null;
  maritalStatus?: string | null;
  academicInstruction?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  hiringContractDate?: string | null;
  guardCredentials?: string | null;
  languages?: string[];
  skills?: string[];
  zone?: string | null;
  assignedVehicle?: string | null;
  // Turno config
  turnoDays?: number[] | null;
  turnoStart?: string | null;
  turnoEnd?: string | null;
  mobileStationId?: string | null;
  photoUrl?: string | null;
  // Live attendance
  isOnDuty: boolean;
  onDutySince?: string | null;
  dutyStatus?: string | null;
  dutyLateMinutes?: number;
  dutyScheduledEnd?: string | null;
  createdAt?: string | null;
  /** Sólo en la respuesta de create: el correo ya tenía cuenta activa (trabaja
   *  con otra empresa) y el alta la ENLAZÓ — entra con su contraseña actual. */
  linkedExistingAccount?: boolean;
}

export interface CreateSupervisorBody {
  email: string;
  firstName?: string;
  lastName?: string;
  governmentId?: string;
  phoneNumber?: string;
  zone?: string;
  assignedVehicle?: string;
  // Turno (recurring shift) set at creation — same fields the detail page edits.
  turnoDays?: number[];
  turnoStart?: string;
  turnoEnd?: string;
}

/** One resolved coverage position (station list + rotation window). */
export interface SupervisorCoveragePosition {
  id: string;
  name: string;
  zone: string | null;
  rotationStyleName: string | null;
  window: string | null;
  mobileStation: { id: string; name: string } | null;
  stations: { id: string; name: string }[];
}

/** A generated upcoming shift row in the supervisor schedule plan. */
export interface SupervisorScheduleRow {
  date: string | null;
  start: string;
  end: string;
  kind: string;
  position: { id: string; name: string; zone: string | null } | null;
}

export const supervisorService = {
  list: (): Promise<{ rows: Supervisor[]; count: number }> =>
    ApiService.get(`/tenant/${tid()}/supervisors`),
  get: (userId: string): Promise<Supervisor> =>
    ApiService.get(`/tenant/${tid()}/supervisors/${userId}`),
  create: (body: CreateSupervisorBody): Promise<Supervisor> =>
    ApiService.post(`/tenant/${tid()}/supervisors`, body),
  update: (userId: string, body: Partial<Supervisor>): Promise<Supervisor> =>
    ApiService.put(`/tenant/${tid()}/supervisors/${userId}`, body),
  remove: (userId: string): Promise<{ deleted: boolean; userId: string }> =>
    ApiService.delete(`/tenant/${tid()}/supervisors/${userId}`),
  // Zone/stations the supervisor covers (resolved from their puesto assignments).
  getCoverage: (userId: string): Promise<{ positions: SupervisorCoveragePosition[] }> =>
    ApiService.get(`/tenant/${tid()}/supervisors/${userId}/coverage`),
  // Generated upcoming schedule (rotation plan) for the supervisor.
  getSchedule: (userId: string): Promise<{ rows: SupervisorScheduleRow[]; position: SupervisorScheduleRow['position'] }> =>
    ApiService.get(`/tenant/${tid()}/supervisors/${userId}/schedule`),
  // (Re)send the app-access invitation so the supervisor can create their account.
  resendInvite: (userId: string): Promise<{ resent: boolean; emailed: boolean; email: string; link: string }> =>
    ApiService.post(`/tenant/${tid()}/supervisors/${userId}/resend-invite`, {}),
  // Admin-triggered password reset (emails a reset link + pushes to devices).
  sendPasswordReset: (userId: string): Promise<{ success: boolean; email: string; emailed: boolean; pushed: number; link: string }> =>
    ApiService.post(`/tenant/${tid()}/supervisors/${userId}/send-password-reset`, {}),
};
