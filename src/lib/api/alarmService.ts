import type { ExportFormat } from "@/lib/export/reportExport";

import { ApiService } from "@/services/api/apiService";
import i18n from "@/i18n";
import { descargarInforme } from "@/lib/export/serverDownload";

const tid = (): string => localStorage.getItem("tenantId") || "";

// ============================================================
// Types
// ============================================================

export type AlarmProtocol =
  | "sia-dc09"
  | "contactid"
  | "surgard"
  | "webhook"
  | "manual";
export type AlarmPanelType =
  | "intrusion"
  | "fire"
  | "holdup"
  | "access"
  | "environmental";
export type AlarmComms = "ip" | "cellular" | "dual";
export type AlarmPanelStatus =
  | "online"
  | "offline"
  | "armed"
  | "disarmed"
  | "unknown";

export interface AlarmPanel {
  id: string;
  name: string;
  accountNumber?: string | null;
  protocol?: AlarmProtocol;
  panelType?: AlarmPanelType;
  make?: string | null;
  model?: string | null;
  comms?: AlarmComms;
  receiverLine?: string | null;
  // NOTE: dc09Key is never returned by the API (stripped server-side).
  supervisionMins?: number | null;
  testIntervalHrs?: number | null;
  status?: AlarmPanelStatus;
  lastSignalAt?: string | null;
  postSiteId?: string | null;
  stationId?: string | null;
  customerId?: string | null;
  notes?: string | null;
  active?: boolean;
  tenantId?: string;
  createdById?: string | null;
  updatedById?: string | null;
  createdAt?: string;
  updatedAt?: string;
  zones?: AlarmZone[];
  contacts?: AlarmContact[];
}

export type AlarmZoneType =
  | "entry"
  | "perimeter"
  | "motion"
  | "glassbreak"
  | "smoke"
  | "panic"
  | "tamper"
  | "supervisory";

export interface AlarmZone {
  id: string;
  alarmPanelId?: string | null;
  zoneNumber?: string | null;
  name?: string | null;
  type?: AlarmZoneType;
  partition?: string | null;
  linkedCameraId?: string | null;
  bypassed?: boolean;
  tenantId?: string;
  panel?: AlarmPanel | null;
  createdAt?: string;
  updatedAt?: string;
}

export type AlarmContactAuthority =
  | "owner"
  | "manager"
  | "keyholder"
  | "emergency";

export interface AlarmContact {
  id: string;
  alarmPanelId?: string | null;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  callOrder?: number | null;
  // NOTE: passcode is never returned by the API (stripped server-side).
  authority?: AlarmContactAuthority | null;
  tenantId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export type AlarmSignalFormat =
  | "sia"
  | "contactid"
  | "surgard"
  | "webhook"
  | "manual";
export type AlarmSignalQualifier = "event" | "restore" | "status";
export type AlarmSignalChannel = "ip" | "cellular" | "receiver";

export interface AlarmSignal {
  id: string;
  alarmPanelId?: string | null;
  accountNumber?: string | null;
  zoneNumber?: string | null;
  partition?: string | null;
  format?: AlarmSignalFormat | null;
  eventCode?: string | null;
  qualifier?: AlarmSignalQualifier | null;
  raw?: string | null;
  channel?: AlarmSignalChannel | null;
  receiverId?: string | null;
  receivedAt: string;
  tenantId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export type AlarmEventCategory =
  | "burglary"
  | "fire"
  | "holdup"
  | "panic"
  | "medical"
  | "tamper"
  | "trouble"
  | "openclose"
  | "test"
  | "supervisory"
  | "restore";

export interface AlarmEvent {
  id: string;
  alarmSignalId?: string | null;
  alarmPanelId?: string | null;
  alarmZoneId?: string | null;
  category?: AlarmEventCategory | null;
  priority?: number;
  description?: string | null;
  zoneNumber?: string | null;
  at?: string | null;
  alarmCaseId?: string | null;
  tenantId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export type AlarmCaseStatus =
  | "queued"
  | "acknowledged"
  | "verifying"
  | "dispatched"
  | "resolved"
  | "closed";
export type AlarmCaseDisposition =
  | "real"
  | "false"
  | "test"
  | "runaway"
  | "cancelled";

export interface AlarmCase {
  id: string;
  alarmPanelId?: string | null;
  status?: AlarmCaseStatus;
  priority?: number;
  category?: AlarmEventCategory | string | null;
  title?: string | null;
  assignedOperatorId?: string | null;
  ackAt?: string | null;
  dispatchAt?: string | null;
  resolvedAt?: string | null;
  closedAt?: string | null;
  disposition?: AlarmCaseDisposition | null;
  incidentId?: string | null;
  dispatchId?: string | null;
  postSiteId?: string | null;
  stationId?: string | null;
  customerId?: string | null;
  /** Origin: 'alarm_panel' | 'client_app' | 'worker_app' | 'manual'. */
  source?: string | null;
  tenantId?: string;
  createdById?: string | null;
  createdAt?: string;
  updatedAt?: string;
  panel?: AlarmPanel | null;
  /** El «dónde» de un caso que NO viene de un panel: un SOS o un pánico. */
  station?: { id: string; stationName?: string | null } | null;
  postSite?: { id: string; companyName?: string | null } | null;
  events?: AlarmEvent[];
  auditLogs?: AlarmAuditLog[];
}

/**
 * Display metadata for an alarm case's ORIGIN — so operators can tell at a glance
 * whether a case came from a monitored alarm panel, a customer's SOS, or a guard's
 * panic button. Legacy/null cases are treated as alarm-panel (all pre-dated panels).
 */
/**
 * De dónde vino la alarma. Devuelve un TONO del sistema, no clases de color.
 *
 * Antes devolvía `bg-red-500/15 text-red-600 …` escrito a mano, y eso deja el
 * origen fuera del sistema: no cambia con el tema ni con el acento que elija el
 * usuario. Ahora devuelve el tono y quien pinta usa `StatusBadge`, que lo
 * resuelve contra las variables.
 *
 * El tono NO se deriva del acento a propósito: un SOS de cliente tiene que
 * seguir siendo rojo aunque alguien ponga el acento en rojo, y no volverse
 * verde porque lo ponga en verde.
 */
export function alarmSourceMeta(source?: string | null): {
  label: string;
  short: string;
  tone: "bad" | "warn" | "neutral" | "info";
} {
  switch (source) {
    case "client_app":
      return {
        label: i18n.t("alarm.source.clientApp"),
        short: i18n.t("alarm.source.clientAppShort"),
        tone: "bad",
      };
    case "worker_app":
      // `bad`, NO `warn`. Antes era naranja —se conservó al migrar de clases a
      // tonos— y quedaba el absurdo de que el SOS de un cliente salía rojo y el
      // botón de pánico de un vigilante ámbar. El backend dispara la MISMA ruta
      // de pánico completa para los dos: pintar uno menos grave es mentir.
      return {
        label: i18n.t("alarm.source.workerApp"),
        short: i18n.t("alarm.source.workerAppShort"),
        tone: "bad",
      };
    case "manual":
      return {
        label: i18n.t("alarm.source.manual"),
        short: i18n.t("alarm.source.manualShort"),
        tone: "neutral",
      };
    case "alarm_panel":
    default:
      return {
        label: i18n.t("alarm.source.panel"),
        short: i18n.t("alarm.source.panelShort"),
        tone: "info",
      };
  }
}

export type AlarmDispatchType = "guard" | "police" | "fire" | "medical";
export type AlarmDispatchStatus =
  | "requested"
  | "enroute"
  | "onscene"
  | "cleared";

export interface AlarmDispatch {
  id: string;
  alarmCaseId?: string | null;
  type?: AlarmDispatchType;
  target?: string | null;
  status?: AlarmDispatchStatus;
  eta?: string | null;
  outcome?: string | null;
  dispatchedById?: string | null;
  tenantId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface AlarmAuditLog {
  id: string;
  alarmCaseId?: string | null;
  action?: string | null;
  detail?: string | null;
  actorId?: string | null;
  /** Display name of the operator (null for system rows). */
  actorName?: string | null;
  at: string;
  tenantId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export type ActionPlanStepType =
  | "verify"
  | "call"
  | "video"
  | "dispatch_guard"
  | "notify_police"
  | "notify_customer"
  | "note";

export interface ActionPlanStep {
  order: number;
  type: ActionPlanStepType;
  detail?: string;
}

export interface ActionPlan {
  id: string;
  name: string;
  alarmPanelId?: string | null;
  appliesToCategory?: string | null;
  steps?: ActionPlanStep[];
  active?: boolean;
  tenantId?: string;
  createdById?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface OpenCloseSchedule {
  id: string;
  alarmPanelId?: string | null;
  dayOfWeek?: number | null;
  openTime?: string | null;
  closeTime?: string | null;
  graceMins?: number | null;
  tenantId?: string;
  createdAt?: string;
  updatedAt?: string;
}

// ============================================================
// Helpers
// ============================================================

const qstr = (params?: Record<string, string | number | undefined>): string => {
  if (!params) return "";
  const qs = new URLSearchParams();

  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
  }
  const s = qs.toString();

  return s ? `?${s}` : "";
};

// ============================================================
// Service
// ============================================================

/**
 * ════════════════════════════════════════════════════════════════════════════
 * LEER UNA LISTA VENGA COMO VENGA
 *
 * El módulo de alarmas contesta de DOS formas según el endpoint: los casos, las
 * señales y los eventos devuelven el array pelado; los paneles, las zonas, los
 * contactos, los protocolos y los horarios lo envuelven en `{ rows, count }`.
 *
 * Las cinco pantallas envueltas hacían `Array.isArray(x) ? x : []` sobre el
 * objeto, así que enseñaban CERO paneles, CERO zonas y CERO contactos con la
 * base llena — «No hay paneles» encima de cinco paneles. No se veía porque
 * hasta ahora nadie tenía datos que enseñar ahí.
 *
 * Se desenvuelve aquí, en el único sitio por el que pasan las cinco, en vez de
 * cambiar el contrato del servidor: es el mismo criterio que `leerAhorro` en
 * las rutas —aceptar las formas razonables en vez de romper la pantalla entera
 * por la envoltura— y no puede afectar a ningún otro consumidor.
 * ════════════════════════════════════════════════════════════════════════════
 */
function lista<T>(respuesta: any): T[] {
  if (Array.isArray(respuesta)) return respuesta as T[];
  if (respuesta && Array.isArray(respuesta.rows)) return respuesta.rows as T[];

  return [];
}

export const alarmService = {
  // --- Panels ---
  panels(): Promise<AlarmPanel[]> {
    return ApiService.get(`/tenant/${tid()}/alarm/panels`).then(lista<AlarmPanel>);
  },
  panel(id: string): Promise<AlarmPanel> {
    return ApiService.get(`/tenant/${tid()}/alarm/panel/${id}`);
  },
  createPanel(
    body: Partial<AlarmPanel> & { dc09Key?: string },
  ): Promise<AlarmPanel> {
    return ApiService.post(`/tenant/${tid()}/alarm/panel`, body);
  },
  updatePanel(
    id: string,
    body: Partial<AlarmPanel> & { dc09Key?: string },
  ): Promise<AlarmPanel> {
    return ApiService.put(`/tenant/${tid()}/alarm/panel/${id}`, body);
  },
  deletePanel(id: string): Promise<void> {
    return ApiService.delete(`/tenant/${tid()}/alarm/panel/${id}`);
  },

  // --- Zones ---
  zones(panelId: string): Promise<AlarmZone[]> {
    return ApiService.get(`/tenant/${tid()}/alarm/panel/${panelId}/zones`).then(
      lista<AlarmZone>,
    );
  },
  createZone(panelId: string, body: Partial<AlarmZone>): Promise<AlarmZone> {
    return ApiService.post(
      `/tenant/${tid()}/alarm/panel/${panelId}/zone`,
      body,
    );
  },
  updateZone(id: string, body: Partial<AlarmZone>): Promise<AlarmZone> {
    return ApiService.put(`/tenant/${tid()}/alarm/zone/${id}`, body);
  },
  deleteZone(id: string): Promise<void> {
    return ApiService.delete(`/tenant/${tid()}/alarm/zone/${id}`);
  },

  // --- Contacts ---
  contacts(panelId: string): Promise<AlarmContact[]> {
    return ApiService.get(`/tenant/${tid()}/alarm/panel/${panelId}/contacts`).then(
      lista<AlarmContact>,
    );
  },
  createContact(
    panelId: string,
    body: Partial<AlarmContact> & { passcode?: string },
  ): Promise<AlarmContact> {
    return ApiService.post(
      `/tenant/${tid()}/alarm/panel/${panelId}/contact`,
      body,
    );
  },
  updateContact(
    id: string,
    body: Partial<AlarmContact> & { passcode?: string },
  ): Promise<AlarmContact> {
    return ApiService.put(`/tenant/${tid()}/alarm/contact/${id}`, body);
  },
  deleteContact(id: string): Promise<void> {
    return ApiService.delete(`/tenant/${tid()}/alarm/contact/${id}`);
  },

  // --- Action Plans ---
  actionPlans(): Promise<ActionPlan[]> {
    return ApiService.get(`/tenant/${tid()}/alarm/action-plans`).then(
      lista<ActionPlan>,
    );
  },
  createActionPlan(body: Partial<ActionPlan>): Promise<ActionPlan> {
    return ApiService.post(`/tenant/${tid()}/alarm/action-plan`, body);
  },
  updateActionPlan(id: string, body: Partial<ActionPlan>): Promise<ActionPlan> {
    return ApiService.put(`/tenant/${tid()}/alarm/action-plan/${id}`, body);
  },
  deleteActionPlan(id: string): Promise<void> {
    return ApiService.delete(`/tenant/${tid()}/alarm/action-plan/${id}`);
  },

  // --- Schedules ---
  schedules(panelId: string): Promise<OpenCloseSchedule[]> {
    return ApiService.get(`/tenant/${tid()}/alarm/panel/${panelId}/schedules`).then(
      lista<OpenCloseSchedule>,
    );
  },
  createSchedule(
    panelId: string,
    body: Partial<OpenCloseSchedule>,
  ): Promise<OpenCloseSchedule> {
    return ApiService.post(
      `/tenant/${tid()}/alarm/panel/${panelId}/schedule`,
      body,
    );
  },
  deleteSchedule(id: string): Promise<void> {
    return ApiService.delete(`/tenant/${tid()}/alarm/schedule/${id}`);
  },

  // --- Cases ---
  /**
   * `from`/`to` (ISO) acotan `createdAt` EN EL SERVIDOR, y `category` la
   * categoría de alarma. El informe del botón de pánico depende de ambos: sin
   * ellos pedía las N más recientes y recortaba en el navegador, así que un
   * rango antiguo se exportaba vacío.
   */
  cases(params?: {
    status?: AlarmCaseStatus | string;
    category?: AlarmEventCategory | string;
    from?: string;
    to?: string;
    limit?: number;
  }): Promise<AlarmCase[]> {
    return ApiService.get(`/tenant/${tid()}/alarm/cases${qstr(params)}`);
  },
  case(id: string): Promise<AlarmCase> {
    return ApiService.get(`/tenant/${tid()}/alarm/case/${id}`);
  },
  acknowledge(id: string, action?: string): Promise<AlarmCase> {
    return ApiService.post(
      `/tenant/${tid()}/alarm/case/${id}/acknowledge`,
      action ? { action } : undefined,
    );
  },
  dispatch(
    id: string,
    body: { type: AlarmDispatchType; target: string; note?: string },
  ): Promise<AlarmDispatch> {
    return ApiService.post(`/tenant/${tid()}/alarm/case/${id}/dispatch`, body);
  },
  resolve(id: string): Promise<AlarmCase> {
    return ApiService.post(`/tenant/${tid()}/alarm/case/${id}/resolve`);
  },
  close(
    id: string,
    body: { disposition: AlarmCaseDisposition },
  ): Promise<AlarmCase> {
    return ApiService.post(`/tenant/${tid()}/alarm/case/${id}/close`, body);
  },
  caseToIncident(
    id: string,
    body: Record<string, unknown>,
  ): Promise<{ id?: string; incidentId?: string }> {
    return ApiService.post(`/tenant/${tid()}/alarm/case/${id}/incident`, body);
  },
  addNote(id: string, body: { detail: string }): Promise<AlarmAuditLog> {
    return ApiService.post(`/tenant/${tid()}/alarm/case/${id}/note`, body);
  },
  actionPlan(id: string): Promise<{
    plan: { id: string; name: string } | null;
    steps: ActionPlanStep[];
    progress: Record<
      string,
      { done: boolean; note?: string | null; at?: string; by?: string | null }
    >;
  }> {
    return ApiService.get(`/tenant/${tid()}/alarm/case/${id}/action-plan`);
  },
  setStep(
    id: string,
    body: { stepIndex: number; done: boolean; note?: string },
  ): Promise<any> {
    return ApiService.post(`/tenant/${tid()}/alarm/case/${id}/step`, body);
  },
  caseCameras(id: string): Promise<any[]> {
    return ApiService.get(`/tenant/${tid()}/alarm/case/${id}/cameras`);
  },
  caseClips(id: string): Promise<any[]> {
    return ApiService.get(`/tenant/${tid()}/alarm/case/${id}/clips`);
  },
  logCall(
    id: string,
    body: {
      alarmContactId?: string;
      contactName?: string;
      phone?: string;
      outcome: string;
      note?: string;
    },
  ): Promise<{ call: any; ecvSatisfied: boolean; attempts: number }> {
    return ApiService.post(`/tenant/${tid()}/alarm/case/${id}/call`, body);
  },
  dispatchPolice(
    id: string,
    body: { note?: string; override?: boolean },
  ): Promise<{ police?: { message?: string } }> {
    return ApiService.post(`/tenant/${tid()}/alarm/case/${id}/dispatch`, {
      type: "police",
      ...body,
    });
  },
  falseAlarmReport(params?: {
    days?: number;
  }): Promise<{ days: number; overall: any; panels: any[] }> {
    return ApiService.get(
      `/tenant/${tid()}/alarm/reports/false-alarms${qstr(params)}`,
    );
  },
  analytics(params?: { days?: number }): Promise<any> {
    return ApiService.get(`/tenant/${tid()}/alarm/analytics${qstr(params)}`);
  },
  auditExport(params?: {
    days?: number;
  }): Promise<{ days: number; count: number; rows: any[] }> {
    return ApiService.get(
      `/tenant/${tid()}/alarm/reports/audit-export${qstr(params)}`,
    );
  },
  /**
   * El mismo rastro de auditoría, pero como archivo ya armado por el servidor.
   *
   * Es el MISMO endpoint: sin `format` devuelve el JSON que pinta la pantalla,
   * con `format` devuelve el CSV, el Excel o el PDF. Se aprovecha así en vez de
   * abrir una ruta nueva porque los datos, el permiso y el tope de filas son
   * exactamente los mismos; lo único que cambia es el envoltorio.
   */
  auditExportFile(
    format: ExportFormat,
    params?: { days?: number },
  ): Promise<void> {
    const days = params?.days ?? 30;

    return descargarInforme(
      `/tenant/${tid()}/alarm/reports/audit-export?days=${days}&format=${format}`,
      { format, nombreBase: `auditoria-alarmas-${days}d` },
    );
  },

  // --- Signals / Events ---
  signals(params?: {
    panelId?: string;
    limit?: number;
  }): Promise<AlarmSignal[]> {
    return ApiService.get(`/tenant/${tid()}/alarm/signals${qstr(params)}`);
  },
  events(params?: { caseId?: string }): Promise<AlarmEvent[]> {
    return ApiService.get(`/tenant/${tid()}/alarm/events${qstr(params)}`);
  },
};
