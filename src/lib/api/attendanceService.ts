import api from "../api";

/**
 * Nómina / Time & Attendance API client. Tenant-scoped; mirrors shiftService.
 * Records are guardShifts with attendance fields.
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
    if (v === undefined || v === null || String(v).trim() === "") continue;
    p.append(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : "";
};

const unwrap = (resp: any) => (resp && resp.data !== undefined ? resp.data : resp);

export interface AttendanceRecord {
  id: string;
  status: string;
  approvalStatus: string;
  punchInTime: string;
  punchOutTime: string | null;
  punchInPhoto?: string | null;
  punchInAddress?: string | null;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  hoursWorked: number | null;
  overtimeMinutes: number;
  lateMinutes: number;
  earlyDepartureMinutes: number;
  punchInDistanceM: number | null;
  punchOutDistanceM: number | null;
  punchInOutsideGeofence: boolean;
  punchInLatitude: number | null;
  punchInLongitude: number | null;
  /** Every clock in/out pair within this shift's record (dedup model). */
  sessions?: Array<{ in: string; out?: string | null }> | null;
  // ── Operational fields (merged from the former Programador · Asistencia view) ──
  shiftSchedule?: "Diurno" | "Nocturno" | null;
  numberOfPatrolsDuringShift?: number | null;
  numberOfIncidentsDurindShift?: number | null;
  observations?: string | null;
  punchOutLatitude?: number | null;
  punchOutLongitude?: number | null;
  guardName?: { id: string; fullName?: string; governmentId?: string } | null;
  stationName?: { id: string; stationName?: string; latitud?: string; longitud?: string; geofenceRadius?: number; geofencePolygon?: { lat: number; lng: number }[] | null } | null;
  /** 'supervisor' for a supervisorShift folded into the list; else guard. */
  role?: "guard" | "supervisor" | "administrative";
}

const attendanceService = {
  async dashboard(params?: Record<string, unknown>) {
    const t = getTenantId();
    return unwrap(await api.get(`/tenant/${t}/attendance/dashboard${buildQuery(params)}`));
  },

  async list(params?: Record<string, unknown>): Promise<{ rows: AttendanceRecord[]; count: number }> {
    const t = getTenantId();
    return unwrap(await api.get(`/tenant/${t}/attendance${buildQuery(params)}`));
  },

  async find(id: string): Promise<AttendanceRecord> {
    const t = getTenantId();
    return unwrap(await api.get(`/tenant/${t}/attendance/${id}`));
  },

  async exceptions(params?: Record<string, unknown>) {
    const t = getTenantId();
    return unwrap(await api.get(`/tenant/${t}/attendance/exceptions${buildQuery(params)}`));
  },

  async resolveException(id: string, data: { status?: string; resolutionNotes?: string }) {
    const t = getTenantId();
    return unwrap(await api.patch(`/tenant/${t}/attendance/exceptions/${id}/resolve`, { data }));
  },

  async corrections(params?: Record<string, unknown>) {
    const t = getTenantId();
    return unwrap(await api.get(`/tenant/${t}/attendance/corrections${buildQuery(params)}`));
  },

  async approveCorrection(id: string, data: { decision: "approved" | "rejected"; notes?: string }) {
    const t = getTenantId();
    return unwrap(await api.patch(`/tenant/${t}/attendance/corrections/${id}/approve`, { data }));
  },

  // ── Early clock-out approval requests ──────────────────────────────────────
  async clockOutRequests(params?: Record<string, unknown>) {
    const t = getTenantId();
    return unwrap(
      await api.get(`/tenant/${t}/attendance/clock-out-requests${buildQuery(params)}`),
    );
  },

  async decideClockOutRequest(
    id: string,
    data: { status: "approved" | "rejected"; notes?: string },
  ) {
    const t = getTenantId();
    return unwrap(await api.patch(`/tenant/${t}/attendance/clock-out-requests/${id}`, { data }));
  },

  // ── Late clock-in approval requests ────────────────────────────────────────
  async clockInRequests(params?: Record<string, unknown>) {
    const t = getTenantId();
    return unwrap(
      await api.get(`/tenant/${t}/attendance/clock-in-requests${buildQuery(params)}`),
    );
  },

  async decideClockInRequest(
    id: string,
    data: { status: "approved" | "rejected"; notes?: string },
  ) {
    const t = getTenantId();
    return unwrap(
      await api.post(`/tenant/${t}/attendance/clock-in-requests/${id}/decision`, { data }),
    );
  },

  async approve(id: string, notes?: string) {
    const t = getTenantId();
    return unwrap(await api.patch(`/tenant/${t}/attendance/${id}/approve`, { data: { notes } }));
  },

  async reject(id: string, notes?: string) {
    const t = getTenantId();
    return unwrap(await api.patch(`/tenant/${t}/attendance/${id}/reject`, { data: { notes } }));
  },

  async correct(id: string, data: { field: string; correctedValue: unknown; reason: string }) {
    const t = getTenantId();
    return unwrap(await api.post(`/tenant/${t}/attendance/${id}/correct`, { data }));
  },

  /**
   * El periodo de nómina vigente del tenant.
   *
   * La Hoja de horas mandaba 14 días fijos, así que el selector «semanal /
   * quincenal / mensual» de Configuración no cambiaba una sola cifra: se
   * guardaba y no lo leía nadie.
   */
  async currentPeriod(): Promise<{ periodType: string; label: string; from: string; to: string }> {
    const t = getTenantId();
    return unwrap(await api.get(`/tenant/${t}/attendance/current-period`));
  },

  async payrollSummary(params?: Record<string, unknown>) {
    const t = getTenantId();
    return unwrap(await api.get(`/tenant/${t}/attendance/payroll-summary${buildQuery(params)}`));
  },

  async closePeriod(cutoff: string) {
    const t = getTenantId();
    return unwrap(await api.post(`/tenant/${t}/attendance/close-period`, { data: { cutoff } }));
  },


  /** Current guard's clock status + assigned stations (worker-app endpoint). */
  async myStatus() {
    const t = getTenantId();
    return unwrap(await api.get(`/tenant/${t}/guard/me`));
  },

  /**
   * Sube la selfie del fichaje y devuelve su `privateUrl`, que es lo que el
   * servidor espera en `selfiePhoto`.
   *
   * Hacía falta porque activar «Requerir selfie» ROMPÍA el reloj web: el
   * servidor la exigía y este cliente no la mandaba nunca, así que devolvía 400
   * sin salida posible. Sólo fallaba por el camino web —la app del vigilante sí
   * la manda— que es el más difícil de reproducir.
   */
  async uploadClockInSelfie(file: File): Promise<string> {
    const t = getTenantId();
    const filename = `selfie-${Date.now()}.jpg`;
    const creds: any = await api.get(
      `/tenant/${t}/file/credentials?filename=${encodeURIComponent(filename)}&storageId=guardShiftSelfie`,
    );
    const d = creds?.data ?? creds;
    const uploadUrl = d?.uploadCredentials?.url;
    if (!uploadUrl) throw new Error("No se pudo preparar la subida de la foto");

    const form = new FormData();
    form.append("filename", filename);
    form.append("file", file);
    const resp = await fetch(uploadUrl, { method: "POST", body: form });
    if (!resp.ok) throw new Error("No se pudo subir la foto");
    return d?.privateUrl as string;
  },

  async clockIn(data: {
    stationId: string;
    latitude?: number;
    longitude?: number;
    selfiePhoto?: string;
  }) {
    const t = getTenantId();
    return unwrap(await api.post(`/tenant/${t}/guard/me/clock-in`, { data: { ...data, platform: "web" } }));
  },

  async clockOut(data: { latitude?: number; longitude?: number }) {
    const t = getTenantId();
    return unwrap(await api.post(`/tenant/${t}/guard/me/clock-out`, { data }));
  },

  // ── Staff (administrative/office) self-attendance — web time clock. Used when
  //    the logged-in user is NOT a field guard but may punch their own timesheet. ──
  /** Staff clock status + optional office-geofence config. */
  async staffStatus() {
    const t = getTenantId();
    return unwrap(await api.get(`/tenant/${t}/staff/me`));
  },
  async staffClockIn(data: { latitude?: number; longitude?: number; selfiePhoto?: string; address?: string; battery?: number }) {
    const t = getTenantId();
    return unwrap(await api.post(`/tenant/${t}/staff/me/clock-in`, { data }));
  },
  async staffClockOut(data: { latitude?: number; longitude?: number; observations?: string }) {
    const t = getTenantId();
    return unwrap(await api.post(`/tenant/${t}/staff/me/clock-out`, { data }));
  },

  async getSettings() {
    const t = getTenantId();
    return unwrap(await api.get(`/tenant/${t}/attendance/settings`));
  },

  async saveSettings(data: Record<string, unknown>) {
    const t = getTenantId();
    return unwrap(await api.put(`/tenant/${t}/attendance/settings`, { data }));
  },
};

export default attendanceService;
