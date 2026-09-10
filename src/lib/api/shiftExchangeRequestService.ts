import api from "../api";

const getTenantId = (): string => {
  const t = localStorage.getItem("tenantId");

  if (!t)
    throw new Error(
      "No pudimos identificar tu empresa. Cierra sesión y vuelve a entrar.",
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

export interface ShiftExchangeRecord {
  id: string;
  requestDate: string | null;
  fromShiftId: string | null;
  toShiftId: string | null;
  fromGuardId: string | null;
  toGuardId: string | null;
  status: "pending" | "approved" | "rejected";
  notes: string | null;
  fromGuard: { id: string; fullName?: string; email?: string } | null;
  toGuard: { id: string; fullName?: string; email?: string } | null;
}

export interface ShiftExchangeCreateInput {
  requestDate?: string;
  fromShiftId?: string;
  toShiftId?: string;
  fromGuardId?: string;
  toGuardId?: string;
  notes?: string;
}

const shiftExchangeRequestService = {
  async list(
    params?: Record<string, unknown>,
  ): Promise<{ rows: ShiftExchangeRecord[]; count: number }> {
    const tenantId = getTenantId();
    const qs = buildQuery(params);
    const resp = await api.get(
      `/tenant/${tenantId}/shift-exchange-request${qs}`,
    );

    return resp.data ?? resp;
  },

  async create(data: ShiftExchangeCreateInput): Promise<ShiftExchangeRecord> {
    const tenantId = getTenantId();
    const resp = await api.post(`/tenant/${tenantId}/shift-exchange-request`, {
      data,
    });

    return resp.data ?? resp;
  },

  async updateStatus(
    id: string,
    status: "approved" | "rejected",
  ): Promise<ShiftExchangeRecord> {
    const tenantId = getTenantId();
    const resp = await api.patch(
      `/tenant/${tenantId}/shift-exchange-request/${id}/status`,
      { data: { status } },
    );

    return resp.data ?? resp;
  },

  async destroy(id: string): Promise<void> {
    const tenantId = getTenantId();

    await api.delete(`/tenant/${tenantId}/shift-exchange-request/${id}`);
  },
};

export default shiftExchangeRequestService;
