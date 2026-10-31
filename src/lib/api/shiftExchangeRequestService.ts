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

/** One side of a swap: the shift and where it is. */
export interface SwapShift {
  id: string;
  start?: string;
  end?: string;
  status?: string;
  stationId?: string | null;
  stationName?: string | null;
  postSiteName?: string | null;
}

/** A rule result from the server (services/shiftExchange/reglas). */
export interface SwapFinding {
  code: string;
  guardId?: string | null;
  shiftId?: string | null;
  params?: Record<string, any>;
}

export interface SwapChecks {
  blocks: SwapFinding[];
  warnings: SwapFinding[];
  at?: string;
}

export type SwapStatus =
  | "pending_peer"
  | "pending_approval"
  | "approved"
  | "rejected"
  | "declined"
  | "cancelled"
  | "expired";

export interface ShiftExchangeRecord {
  id: string;
  kind: "swap" | "giveaway";
  status: SwapStatus;
  notes: string | null;
  requestDate: string | null;
  expiresAt: string | null;
  peerRespondedAt: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  executedAt: string | null;
  checks: SwapChecks | null;
  fromGuard: { id: string; name: string | null } | null;
  toGuard: { id: string; name: string | null } | null;
  decidedBy: { id: string; name: string | null } | null;
  createdBy: { id: string; name: string | null } | null;
  fromShift: SwapShift | null;
  toShift: SwapShift | null;
  fromGuardId: string | null;
  toGuardId: string | null;
}

export interface ShiftExchangeCreateInput {
  fromShiftId: string;
  toShiftId?: string;
  toGuardId?: string;
  notes?: string;
  /** Both guards already agreed (office records it). */
  peerConfirmed?: boolean;
  /** Approve in the same step (needs the decide permission). */
  approveNow?: boolean;
}

const base = () => `/tenant/${getTenantId()}/shift-exchange-request`;

const shiftExchangeRequestService = {
  async list(
    params?: Record<string, unknown>,
  ): Promise<{ rows: ShiftExchangeRecord[]; count: number }> {
    const resp = await api.get(`${base()}${buildQuery(params)}`);

    return resp.data ?? resp;
  },

  async checks(id: string): Promise<SwapChecks> {
    const resp = await api.get(`${base()}/${id}/checks`);

    return resp.data ?? resp;
  },

  async create(data: ShiftExchangeCreateInput): Promise<ShiftExchangeRecord> {
    const resp = await api.post(base(), { data }, { toast: { silentError: true } } as any);

    return resp.data ?? resp;
  },

  async updateStatus(
    id: string,
    status: "approved" | "rejected",
    note?: string,
  ): Promise<ShiftExchangeRecord> {
    const resp = await api.patch(
      `${base()}/${id}/status`,
      { data: { status, note: note || undefined } },
      { toast: { silentError: true } } as any,
    );

    return resp.data ?? resp;
  },

  async act(
    id: string,
    action: "accept" | "decline" | "cancel",
  ): Promise<ShiftExchangeRecord> {
    const resp = await api.post(`${base()}/${id}/${action}`, { data: {} }, { toast: { silentError: true } } as any);

    return resp.data ?? resp;
  },

  async destroy(id: string): Promise<void> {
    await api.delete(`${base()}/${id}`);
  },
};

export default shiftExchangeRequestService;
