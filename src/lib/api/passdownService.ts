import i18n from "@/i18n";
import api from "../api";

/**
 * Passdowns (pases de turno) API client. Read-only shift-handover records left
 * by an outgoing guard for the incoming shift. Tenant-scoped.
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

export type PassdownStatus = "open" | "received";
export type PassdownSchedule = "Diurno" | "Nocturno" | null;
export type PassdownKind = "24h" | "12h" | "otro" | null;

export interface PassdownImage {
  downloadUrl?: string | null;
  publicUrl?: string | null;
}

export interface Passdown {
  id: string;
  stationId: string | null;
  stationName: string | null;
  outgoingGuardName: string | null;
  guardShiftId: string | null;
  shiftSchedule: PassdownSchedule;
  shiftKind: PassdownKind;
  shiftLabel: string | null;
  notes: string | null;
  instructionCount: number;
  status: PassdownStatus;
  receivedByName: string | null;
  receivedAt: string | null;
  createdAt: string;
  passdownImages: PassdownImage[];
  /** 'supervisor' para la entrega del supervisor de ronda; si no, la del puesto. */
  channel?: string | null;
  // ── Relevo v2: entrega y aceptación entre compañeros ─────────────────────
  // Todos opcionales: los pases anteriores a esto no los tienen, y el CRM
  // tiene que seguir pintándolos igual.
  /** Cuándo el saliente pulsó «Entregar». Null en los pases antiguos. */
  deliveredAt?: string | null;
  /** Cuándo el entrante aceptó el puesto (= marcó su entrada). */
  acceptedAt?: string | null;
  /**
   * ¿El saliente seguía en el puesto cuando llegó el entrante? Lo contesta el
   * entrante al aceptar. Null = no se preguntó (pase antiguo o app vieja).
   * Viene de un TINYINT: puede llegar como 0/1 además de booleano.
   */
  outgoingPresent?: boolean | 0 | 1 | null;
  /** Cuándo el saliente avisó de que su relevo no había llegado. */
  reliefMissingReportedAt?: string | null;
  /** Cómo se registró la entrada del entrante: 'app' | 'auto_location' | 'supervisor'. */
  incomingPunchMethod?: string | null;
  /**
   * Consignas guardadas en el propio pase (JSON `[{text, priority, done}]`).
   * Los pases antiguos las tienen como tareas y sólo llegan en el detalle.
   * Puede venir como texto JSON sin parsear: ver `consignasDelPase`.
   */
  instructions?: unknown;
}

export interface PassdownInstruction {
  id: string;
  taskToDo: string;
  priority: "alta" | "media" | "baja" | null;
  status: string | null;
  wasItDone: boolean;
  dateCompletedTask: string | null;
  completionNotes: string | null;
}

export interface PassdownDetail extends Passdown {
  /**
   * Dos formas conviven: las tareas de los pases antiguos
   * (`PassdownInstruction`) y el JSON nuevo `{text, priority, done}`.
   * Se leen siempre a través de `consignasDelPase`.
   */
  instructions?: unknown;
}

const passdownService = {
  /**
   * List passdowns, optionally filtered by status/station/fecha.
   * `from`/`to` (ISO) acotan `createdAt` EN EL SERVIDOR — el informe de relevos
   * los manda para no depender de "los N más recientes".
   */
  async list(params?: {
    status?: PassdownStatus;
    stationId?: string;
    from?: string;
    to?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ rows: Passdown[]; count: number }> {
    const t = getTenantId();

    return unwrap(await api.get(`/tenant/${t}/passdown${buildQuery(params)}`));
  },
  /** Full passdown detail (adds the instructions list). */
  async get(id: string): Promise<{ passdown: PassdownDetail }> {
    const t = getTenantId();

    return unwrap(await api.get(`/tenant/${t}/passdown/${id}`));
  },
};

export default passdownService;
