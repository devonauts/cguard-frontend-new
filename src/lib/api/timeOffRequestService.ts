import i18n from "@/i18n";
import api from "../api";

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

    if (Array.isArray(v)) {
      for (const item of v) {
        if (item !== undefined && item !== null)
          p.append(`${k}[]`, String(item));
      }
    } else if (v !== undefined && v !== null) {
      const s = String(v);

      if (s.trim() !== "") p.append(k, s);
    }
  }
  const s = p.toString();

  return s ? `?${s}` : "";
};

export interface TimeOffRecord {
  id: string;
  requestDate: string;
  type: string | null;
  startDate: string | null;
  startTime: string | null;
  endDate: string | null;
  endTime: string | null;
  reason: string | null;
  comment: string | null;
  status: "pending" | "approved" | "rejected";
  isPaid: boolean;
  guardId: string | null;
  guard: { id: string; fullName?: string; email?: string } | null;
  guardName?: string | null; // denormalized snapshot — fallback when guard join is null
}

export interface TimeOffCreateInput {
  requestDate?: string;
  type?: string;
  startDate?: string;
  startTime?: string;
  endDate?: string;
  endTime?: string;
  reason?: string;
  isPaid?: boolean;
  guard?: string; // userId
  comment?: string;
}

const timeOffRequestService = {
  async list(
    params?: Record<string, unknown>,
  ): Promise<{ rows: TimeOffRecord[]; count: number }> {
    const tenantId = getTenantId();
    const qs = buildQuery(params);
    const resp = await api.get(`/tenant/${tenantId}/time-off-request${qs}`);

    return resp.data ?? resp;
  },

  async create(data: TimeOffCreateInput): Promise<TimeOffRecord> {
    const tenantId = getTenantId();
    const resp = await api.post(`/tenant/${tenantId}/time-off-request`, {
      data,
    });

    return resp.data ?? resp;
  },

  async updateStatus(
    id: string,
    status: "pending" | "approved" | "rejected",
    comment?: string,
  ): Promise<TimeOffRecord> {
    const tenantId = getTenantId();
    const resp = await api.patch(
      `/tenant/${tenantId}/time-off-request/${id}/status`,
      { data: { status, comment } },
    );

    return resp.data ?? resp;
  },

  async destroy(id: string): Promise<void> {
    const tenantId = getTenantId();

    await api.delete(`/tenant/${tenantId}/time-off-request/${id}`);
  },
};

export default timeOffRequestService;
