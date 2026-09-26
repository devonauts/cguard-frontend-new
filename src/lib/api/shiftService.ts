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
        if (item === undefined || item === null) continue;
        const s = String(item);

        if (s.trim() === "") continue;
        p.append(`${k}[]`, s);
      }
    } else if (v !== undefined && v !== null) {
      const s = String(v);

      if (s.trim() !== "") p.append(k, s);
    }
  }
  const s = p.toString();

  return s ? `?${s}` : "";
};

export interface ShiftRecord {
  id: string;
  startTime: string;
  endTime: string;
  guardId: string | null;
  stationId: string | null;
  postSiteId: string | null;
  guard: {
    id: string;
    fullName?: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    avatarUrl?: string;
  } | null;
  station: { id: string; stationName: string } | null;
  createdAt?: string;
}

/** Display name for a shift's assigned guard, with fallbacks. */
export function guardDisplayName(guard: ShiftRecord["guard"]): string | null {
  if (!guard) return null;
  const name =
    guard.fullName ||
    [guard.firstName, guard.lastName].filter(Boolean).join(" ") ||
    guard.email;

  return name || null;
}

const shiftService = {
  async list(
    params?: Record<string, unknown>,
  ): Promise<{ rows: ShiftRecord[]; count: number }> {
    const tenantId = getTenantId();
    const qs = buildQuery(params);
    const resp = await api.get(`/tenant/${tenantId}/shift${qs}`);

    return resp.data ?? resp;
  },

  async find(id: string): Promise<ShiftRecord> {
    const tenantId = getTenantId();
    const resp = await api.get(`/tenant/${tenantId}/shift/${id}`);

    return resp.data ?? resp;
  },

  async create(data: {
    startTime: string;
    endTime: string;
    guard?: string;
    station?: string;
    postSite?: string;
  }): Promise<ShiftRecord> {
    const tenantId = getTenantId();
    const resp = await api.post(`/tenant/${tenantId}/shift`, { data });

    return resp.data ?? resp;
  },

  async update(
    id: string,
    data: {
      startTime: string;
      endTime: string;
      guard?: string;
      station?: string;
      postSite?: string;
    },
  ): Promise<ShiftRecord> {
    const tenantId = getTenantId();
    const resp = await api.put(`/tenant/${tenantId}/shift/${id}`, { data });

    return resp.data ?? resp;
  },

  async destroy(id: string): Promise<void> {
    const tenantId = getTenantId();

    await api.delete(`/tenant/${tenantId}/shift/${id}`);
  },

  async assign(id: string, guardId: string): Promise<ShiftRecord> {
    const tenantId = getTenantId();
    const resp = await api.patch(`/tenant/${tenantId}/shift/${id}/assign`, {
      data: { guard: guardId },
    });

    return resp.data ?? resp;
  },
};

export default shiftService;
