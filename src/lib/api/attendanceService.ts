import i18n from "@/i18n";
import type { ExportFormat } from "@/lib/export/reportExport";

import api from "../api";

import { descargarInforme } from "@/lib/export/serverDownload";
import { hoyEnLaEmpresa } from "@/lib/horaDeLaEmpresa";

/**
 * Nómina / Time & Attendance API client. Tenant-scoped; mirrors shiftService.
 * Records are guardShifts with attendance fields.
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

    if (v === undefined || v === null || String(v).trim() === "") continue;
    p.append(k, String(v));
  }
  const s = p.toString();

  return s ? `?${s}` : "";
};

const unwrap = (resp: any) =>
  resp && resp.data !== undefined ? resp.data : resp;

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
  /**
   * Reconocimiento facial al fichar la entrada (módulo de pago). `null` cuando
   * la empresa no lo usa o el turno es anterior.
   */
  rostroResultado?:
    | "coincide"
    | "dudoso"
    | "no_coincide"
    | "reto_fallido"
    | "sin_cara"
    | "sin_registro"
    | "no_verificado"
    | null;
  /** 0-1: cuánto se parece la cara de la selfie a la registrada. */
  rostroPuntuacion?: number | null;
  punchInLatitude: number | null;
  punchInLongitude: number | null;
  /**
   * Cómo se marcó la entrada: 'app' | 'auto_location' | 'supervisor'.
   * Null en los turnos anteriores al relevo v2 (todos fueron desde la app).
   */
  punchInMethod?: string | null;
  /** Cómo se cerró: 'app' | 'relevo' | 'auto_location' | 'sweep' | 'early_exit' | 'supervisor'. */
  punchOutMethod?: string | null;
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
  stationName?: {
    id: string;
    stationName?: string;
    latitud?: string;
    longitud?: string;
    geofenceRadius?: number;
    geofencePolygon?: { lat: number; lng: number }[] | null;
  } | null;
  /** 'supervisor' for a supervisorShift folded into the list; else guard. */
  role?: "guard" | "supervisor" | "administrative";
  /**
   * El camino de la tarjeta hasta el pago. `null` = no es una tarjeta de tiempo
   * (un día de vacaciones o una falta se informa, no se aprueba ni se paga).
   */
  payrollStatus?:
    | "pending_review"
    | "reviewed"
    | "approved"
    | "paid"
    | "rejected"
    | null;
  payrollStatusAt?: string | null;
  payrollStatusNotes?: string | null;
  /** Descansos y almuerzo: `[{start,end,kind}]`. El último sin `end` = en curso. */
  breaks?: Array<{ start: string; end?: string | null; kind?: string }> | null;
  breakMinutes?: number | null;
  /**
   * LA regla de lo pagable, calculada en el servidor (`lib/horasPagables`):
   * tiempo en el puesto, descanso descontado y netas (lo que se paga). `null`
   * mientras el fichaje sigue abierto. La pantalla las lee de aquí en vez de
   * restar por su cuenta.
   */
  horasEnElPuesto?: number | null;
  descansoMinutos?: number | null;
  horasNetas?: number | null;
  /**
   * El descanso cubre todo el tiempo en el puesto (netas 0): no se paga ni se
   * aprueba hasta corregir el descanso. La pantalla lo enseña «Sin resolver».
   */
  descansoCubreElTurno?: boolean;
  /** Fila sintética de vacaciones/permiso/falta (no vive en guardShifts). */
  esJornadaSinFichaje?: boolean;
}

/** Un movimiento de la bitácora de una tarjeta. */
/** Un fichaje RECHAZADO: el que no llegó a ser. Ver `clockAttempts` en el servidor. */
export interface ClockAttempt {
  id: string;
  subjectType: "guard" | "supervisor" | "staff";
  kind: "in" | "out";
  /** El código que devolvió el servidor: `too_early`, `geofence_failed`, … */
  reason: string;
  message: string | null;
  stationId: string | null;
  stationName: string | null;
  shiftId: string | null;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  distanceMeters: number | null;
  scheduledStart: string | null;
  availableAt: string | null;
  platform: string | null;
  deviceId: string | null;
  attemptedAt: string;
}

export interface TimesheetEvent {
  id: string;
  kind: string;
  action?: string;
  at: string;
  actor: string | null;
  detail: string | null;
  data?: Record<string, unknown> | null;
}

const attendanceService = {
  async dashboard(params?: Record<string, unknown>) {
    const t = getTenantId();

    return unwrap(
      await api.get(`/tenant/${t}/attendance/dashboard${buildQuery(params)}`),
    );
  },

  async list(
    params?: Record<string, unknown>,
  ): Promise<{ rows: AttendanceRecord[]; count: number }> {
    const t = getTenantId();

    return unwrap(
      await api.get(`/tenant/${t}/attendance${buildQuery(params)}`),
    );
  },

  async find(id: string): Promise<AttendanceRecord> {
    const t = getTenantId();

    return unwrap(await api.get(`/tenant/${t}/attendance/${id}`));
  },

  /**
   * La misma ficha, pero SIN gritar si no existe.
   *
   * La usa el enlace de un aviso, y ahí el identificador puede no ser el de un
   * registro de asistencia: cada aviso trae el suyo (una solicitud, un aviso de
   * geocerca, el propio evento). Pedirlo con `find` soltaba un «Extraviado» en
   * mitad de la pantalla — un error de sistema para decir «este aviso no
   * apuntaba a una ficha», que no es un error de nadie.
   *
   * Devuelve `null` y la pantalla sigue: el enlace ya dejó al usuario en el día
   * correcto, que es la mitad útil del viaje.
   */
  async findSilent(id: string): Promise<AttendanceRecord | null> {
    try {
      const t = getTenantId();

      return unwrap(
        await api.get(`/tenant/${t}/attendance/${id}`, {
          toast: { silentError: true },
        }),
      );
    } catch {
      return null;
    }
  },

  /** Mover UNA tarjeta por el ciclo de nómina. */
  async setStatus(id: string, status: string, notes?: string) {
    const t = getTenantId();

    return unwrap(
      await api.patch(`/tenant/${t}/attendance/${id}/status`, {
        data: { status, notes },
      }),
    );
  },

  /** Lo mismo para una selección; devuelve cuántas se movieron y cuáles no. */
  async bulkSetStatus(
    ids: string[],
    status: string,
    notes?: string,
  ): Promise<{
    actualizadas: number;
    fallidas: { id: string; motivo: string }[];
  }> {
    const t = getTenantId();

    return unwrap(
      await api.post(`/tenant/${t}/attendance/bulk-status`, {
        data: { ids, status, notes },
      }),
    );
  },

  /** Corregir a mano entrada, salida, descansos y observaciones. */
  async editTimes(
    id: string,
    data: {
      punchInTime?: string | null;
      punchOutTime?: string | null;
      breaks?: Array<{
        start: string;
        end?: string | null;
        kind?: string;
      }> | null;
      observations?: string | null;
      reason?: string | null;
    },
  ): Promise<AttendanceRecord> {
    const t = getTenantId();

    return unwrap(
      await api.patch(`/tenant/${t}/attendance/${id}/times`, { data }),
    );
  },

  /**
   * Registrar la entrada A NOMBRE del vigilante: está en el puesto y no puede
   * fichar (teléfono roto, batería muerta, móvil olvidado).
   *
   * El servidor ejecuta el MISMO fichaje que haría la app, así que el turno
   * arrastra todo lo de un fichaje real. No se inventa ubicación: el registro
   * sale sin GPS —que es la verdad— y por eso el motivo es obligatorio.
   */
  async manualClockIn(data: {
    guardId: string;
    stationId: string;
    reason: string;
  }): Promise<{
    ok: boolean;
    guardShiftId?: string;
    vigilante?: string;
    motivo?: string;
    detalle?: string;
    turnoAbiertoDesde?: string;
  }> {
    const t = getTenantId();

    return unwrap(
      await api.post(`/tenant/${t}/attendance/manual-clock-in`, { data }),
    );
  },

  /** Quién tocó esta tarjeta, qué hizo y cuándo. */
  async history(id: string): Promise<{ rows: TimesheetEvent[] }> {
    const t = getTenantId();

    return unwrap(await api.get(`/tenant/${t}/attendance/${id}/history`));
  },

  /**
   * Descarga el registro en PDF, Excel o CSV. Va por el SERVIDOR: el navegador
   * sólo tiene las filas que alcanzó a cargar, y el archivo tiene que incluir
   * también los días de vacaciones y falta, que no son fichajes.
   */
  /**
   * La hoja de asistencia del periodo, en el formato pedido.
   *
   * El nombre del archivo lo pone el SERVIDOR (`Content-Disposition`): aquí se
   * componía a mano a partir del formato, así que en cuanto el servidor cambió
   * el nombre —para meter el rango de fechas— el archivo bajaba con otro. Se
   * conserva un nombre de reserva por si la cabecera no llega.
   */
  async exportRecords(params: Record<string, unknown>): Promise<void> {
    const t = getTenantId();
    const fmt = String(params.format || "csv");
    const format: ExportFormat =
      fmt === "excel" || fmt === "xlsx"
        ? "excel"
        : fmt === "pdf"
          ? "pdf"
          : "csv";

    await descargarInforme(
      `/tenant/${t}/attendance/export${buildQuery(params)}`,
      {
        format,
        nombreBase: `asistencia_${hoyEnLaEmpresa()}`,
      },
    );
  },

  /** Names for the filters (guards, stations, branches the viewer may see). */
  async filterOptions(): Promise<OpcionesDeFiltro> {
    const t = getTenantId();

    return unwrap(await api.get(`/tenant/${t}/attendance/filter-options`));
  },

  /** Late punches of a range (default: this company week) grouped by person. */
  async lateSummary(params?: { from?: string; to?: string }): Promise<ResumenDeAtrasos> {
    const t = getTenantId();

    return unwrap(
      await api.get(`/tenant/${t}/attendance/late-summary${buildQuery(params)}`),
    );
  },

  /**
   * Many decisions in one call. Each item is decided on its own (same rules
   * as one click); the answer says which went through and why the rest did not.
   */
  async decisions(items: DecisionDeAsistencia[]): Promise<ResultadoDeLote> {
    const t = getTenantId();

    return unwrap(
      await api.post(`/tenant/${t}/attendance/decisions`, { data: { items } }),
    );
  },

  async exceptions(params?: Record<string, unknown>) {
    const t = getTenantId();

    return unwrap(
      await api.get(`/tenant/${t}/attendance/exceptions${buildQuery(params)}`),
    );
  },

  /**
   * Cierre en bloque del atraso. Con `preview: true` el servidor sólo cuenta a
   * cuántas filas alcanzaría — es lo que la pantalla enseña ANTES de confirmar.
   * Pide nivel de dirección: la app del supervisor no tiene esta ruta.
   */
  async bulkResolveExceptions(data: {
    before: string;
    type?: string;
    resolutionNotes?: string;
    preview?: boolean;
  }) {
    const t = getTenantId();

    return unwrap(
      await api.post(`/tenant/${t}/attendance/exceptions/bulk-resolve`, {
        data,
      }),
    );
  },

  async resolveException(
    id: string,
    data: { status?: string; resolutionNotes?: string },
  ) {
    const t = getTenantId();

    return unwrap(
      await api.patch(`/tenant/${t}/attendance/exceptions/${id}/resolve`, {
        data,
      }),
    );
  },

  async corrections(params?: Record<string, unknown>) {
    const t = getTenantId();

    return unwrap(
      await api.get(`/tenant/${t}/attendance/corrections${buildQuery(params)}`),
    );
  },

  async approveCorrection(
    id: string,
    data: { decision: "approved" | "rejected"; notes?: string },
  ) {
    const t = getTenantId();

    return unwrap(
      await api.patch(`/tenant/${t}/attendance/corrections/${id}/approve`, {
        data,
      }),
    );
  },

  // ── Early clock-out approval requests ──────────────────────────────────────
  async clockOutRequests(params?: Record<string, unknown>) {
    const t = getTenantId();

    return unwrap(
      await api.get(
        `/tenant/${t}/attendance/clock-out-requests${buildQuery(params)}`,
      ),
    );
  },

  async decideClockOutRequest(
    id: string,
    data: { status: "approved" | "rejected"; notes?: string },
  ) {
    const t = getTenantId();

    return unwrap(
      await api.patch(`/tenant/${t}/attendance/clock-out-requests/${id}`, {
        data,
      }),
    );
  },

  // ── Late clock-in approval requests ────────────────────────────────────────
  async clockInRequests(params?: Record<string, unknown>) {
    const t = getTenantId();

    return unwrap(
      await api.get(
        `/tenant/${t}/attendance/clock-in-requests${buildQuery(params)}`,
      ),
    );
  },

  async decideClockInRequest(
    id: string,
    data: { status: "approved" | "rejected"; notes?: string },
  ) {
    const t = getTenantId();

    return unwrap(
      await api.post(
        `/tenant/${t}/attendance/clock-in-requests/${id}/decision`,
        { data },
      ),
    );
  },

  async approve(id: string, notes?: string) {
    const t = getTenantId();

    return unwrap(
      await api.patch(`/tenant/${t}/attendance/${id}/approve`, {
        data: { notes },
      }),
    );
  },

  async reject(id: string, notes?: string) {
    const t = getTenantId();

    return unwrap(
      await api.patch(`/tenant/${t}/attendance/${id}/reject`, {
        data: { notes },
      }),
    );
  },

  async correct(
    id: string,
    data: { field: string; correctedValue: unknown; reason: string },
  ) {
    const t = getTenantId();

    return unwrap(
      await api.post(`/tenant/${t}/attendance/${id}/correct`, { data }),
    );
  },

  /**
   * The payroll period of the tenant that contains a day (today by default):
   * the WHOLE period, both ends inclusive, with its neighbours. Periods are
   * fixed by the calendar (1–15/16–end, the month, or 14 days from a fixed
   * anchor), so a day is paid in exactly one of them.
   */
  async currentPeriod(date?: string): Promise<{
    periodType: string;
    label: string;
    from: string;
    to: string;
    previous?: { desde: string; hasta: string };
    next?: { desde: string; hasta: string };
    closedThrough?: string | null;
    timezone?: string;
  }> {
    const t = getTenantId();
    const q = date ? `?date=${encodeURIComponent(date)}` : "";

    return unwrap(await api.get(`/tenant/${t}/attendance/current-period${q}`));
  },

  /** Closes the payroll up to a local day (YYYY-MM-DD), inclusive. Only forward. */
  async closePeriod(hasta: string) {
    const t = getTenantId();

    return unwrap(
      await api.post(`/tenant/${t}/attendance/close-period`, {
        data: { hasta },
      }),
    );
  },

  /** Reopens the payroll from a day on (management only, with a reason). */
  async reopenPeriod(desde: string, motivo: string) {
    const t = getTenantId();

    return unwrap(
      await api.post(`/tenant/${t}/attendance/reopen-period`, {
        data: { desde, motivo },
      }),
    );
  },

  /** Pay-rule presets per country, and the company's country. */
  async payRulePresets(): Promise<{
    pais: string | null;
    presets: Record<string, {
      pais: string | null;
      periodo: string;
      politica: Record<string, unknown>;
      fuentes: string[];
      confirmar: string[];
    }>;
    /** State presets (US): `regiones.US.CA`. */
    regiones?: Record<string, Record<string, {
      pais: string | null;
      region?: string;
      periodo: string;
      politica: Record<string, unknown>;
      fuentes: string[];
      confirmar: string[];
    }>>;
  }> {
    const t = getTenantId();

    return unwrap(await api.get(`/tenant/${t}/attendance/pay-rules/presets`));
  },

  /** The law's dated changes for the company's country, and agreements to review. */
  async payRuleLegalChanges(): Promise<{
    pais: string | null;
    today: string;
    choice: { seguirCambios: boolean; omitidos: string[] };
    changes: import("@/lib/cambiosDeLey").CambioDeLey[];
    notices: import("@/lib/cambiosDeLey").AvisoDeConvenio[];
  }> {
    const t = getTenantId();

    return unwrap(await api.get(`/tenant/${t}/attendance/pay-rules/legal-changes`));
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

    if (!uploadUrl) throw new Error(i18n.t("ui.apiService.noSePudoPrepararLaSubidaDeLaFoto", "No se pudo preparar la subida de la foto"));

    const form = new FormData();

    form.append("filename", filename);
    form.append("file", file);
    const resp = await fetch(uploadUrl, { method: "POST", body: form });

    if (!resp.ok) throw new Error(i18n.t("ui.apiService.noSePudoSubirLaFoto", "No se pudo subir la foto"));

    return d?.privateUrl as string;
  },

  async clockIn(data: {
    stationId: string;
    latitude?: number;
    longitude?: number;
    selfiePhoto?: string;
  }) {
    const t = getTenantId();

    return unwrap(
      await api.post(`/tenant/${t}/guard/me/clock-in`, {
        data: { ...data, platform: "web" },
      }),
    );
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
  async staffClockIn(data: {
    latitude?: number;
    longitude?: number;
    selfiePhoto?: string;
    address?: string;
    battery?: number;
  }) {
    const t = getTenantId();

    return unwrap(await api.post(`/tenant/${t}/staff/me/clock-in`, { data }));
  },
  async staffClockOut(data: {
    latitude?: number;
    longitude?: number;
    observations?: string;
  }) {
    const t = getTenantId();

    return unwrap(await api.post(`/tenant/${t}/staff/me/clock-out`, { data }));
  },
  /** Office staff: going to lunch / back (the time is not paid). */
  async staffBreakStart() {
    const t = getTenantId();

    return unwrap(await api.post(`/tenant/${t}/staff/me/break/start`, {}));
  },
  async staffBreakEnd() {
    const t = getTenantId();

    return unwrap(await api.post(`/tenant/${t}/staff/me/break/end`, {}));
  },

  /** `silent`: a caller that copes with a refusal (e.g. a role without
   *  payroll settings) asks the client not to toast it. */
  async getSettings(opts: { silent?: boolean } = {}) {
    const t = getTenantId();

    return unwrap(
      await api.get(
        `/tenant/${t}/attendance/settings`,
        opts.silent ? { toast: { silentError: true } } : undefined,
      ),
    );
  },

  async saveSettings(data: Record<string, unknown>) {
    const t = getTenantId();

    return unwrap(await api.put(`/tenant/${t}/attendance/settings`, { data }));
  },
  /**
   * Los fichajes RECHAZADOS de UNA persona — la pestaña «Registros» de su ficha.
   *
   * Se pregunta por `userId` y no por la ficha de vigilante a propósito: la
   * misma llamada sirve para un vigilante, un supervisor y alguien de oficina,
   * que tienen tres relojes distintos pero un solo id de usuario.
   */
  async clockAttempts(params: { userId: string; limit?: number }) {
    const t = getTenantId();

    return unwrap(
      await api.get(
        `/tenant/${t}/attendance/clock-attempts${buildQuery(params)}`,
      ),
    ) as { rows: ClockAttempt[]; limit: number; truncated: boolean };
  },
};

export default attendanceService;

export interface OpcionDeFiltro {
  id: string;
  name: string;
  postSiteId?: string | null;
}

export interface OpcionesDeFiltro {
  guards: OpcionDeFiltro[];
  stations: OpcionDeFiltro[];
  branches: OpcionDeFiltro[];
}

export interface AtrasoDePersona {
  personId: string;
  personName: string;
  role: "guard" | "supervisor" | "staff";
  count: number;
  totalMinutes: number;
  worst: { id: string; day: string; minutes: number; stationName: string | null };
  days: string[];
}

export interface ResumenDeAtrasos {
  from: string;
  to: string;
  tz: string;
  people: AtrasoDePersona[];
  punches: number;
}

export type TipoDeDecision = "exception" | "record" | "correction" | "clockIn" | "clockOut";

export interface DecisionDeAsistencia {
  kind: TipoDeDecision;
  id: string;
  action: "approve" | "reject" | "resolve" | "acknowledge";
  notes?: string;
}

export interface ResultadoDeLote {
  ok: number;
  failed: number;
  results: Array<{ kind: string; id: string; ok: boolean; error?: { code: string; message: string } }>;
}
