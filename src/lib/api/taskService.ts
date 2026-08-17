import api from "../api";

/**
 * Client-tasks API client. A client creates a task for a station (pending_approval);
 * the CRM approves/rejects + tracks completion. Tenant-scoped.
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

export type TaskStatus =
  | "pending_approval"
  | "approved"
  | "rejected"
  | "completed"
  | "cancelled";

export interface TaskImage {
  id: string;
  downloadUrl?: string | null;
  publicUrl?: string | null;
  name?: string | null;
}

export interface TaskRow {
  id: string;
  taskToDo: string;
  status: TaskStatus;
  source: "client" | "staff" | "passdown" | null;
  priority: "alta" | "media" | "baja" | null;
  dateToDoTheTask: string;
  dateCompletedTask?: string | null;
  wasItDone: boolean;
  approvalNotes?: string | null;
  clientAccountId?: string | null;
  taskBelongsToStationId?: string | null;
  taskBelongsToStation?: { id: string; stationName: string } | null;
  /** Guard's completion photo(s). */
  taskCompletedImage?: TaskImage[] | null;
  /** Client's optional reference image(s) attached at creation. */
  imageOptional?: TaskImage[] | null;
  createdAt: string;
}

const taskService = {
  /**
   * Tasks by status (use status='all' for the tracking view).
   * `from`/`to` (ISO) acotan `createdAt` EN EL SERVIDOR — el informe de tareas
   * los manda para no depender de "las N más recientes".
   */
  async byStatus(params?: { status?: TaskStatus | "all"; from?: string; to?: string; limit?: number }) {
    const t = getTenantId();
    return unwrap(await api.get(`/tenant/${t}/task/approvals${buildQuery(params)}`));
  },
  async approve(id: string, notes?: string) {
    const t = getTenantId();
    return unwrap(await api.post(`/tenant/${t}/task/${id}/approve`, { data: { notes } }));
  },
  async reject(id: string, notes?: string) {
    const t = getTenantId();
    return unwrap(await api.post(`/tenant/${t}/task/${id}/reject`, { data: { notes } }));
  },
  /** Staff create — auto-approved by the backend. */
  async create(data: {
    taskToDo: string;
    dateToDoTheTask: string;
    taskBelongsToStation: string;
    priority?: "alta" | "media" | "baja";
  }) {
    const t = getTenantId();
    return unwrap(await api.post(`/tenant/${t}/task`, { data }));
  },
  /** Station options for the staff "new task" picker. */
  async stations(query = "") {
    const t = getTenantId();
    return unwrap(
      await api.get(`/tenant/${t}/station/autocomplete${buildQuery({ query, limit: 50 })}`),
    );
  },
};

export default taskService;
