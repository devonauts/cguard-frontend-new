import i18n from "@/i18n";
import api from "../api";

/**
 * Customer-originated service requests (callerType='client'), posted by the
 * Mi Seguridad customer app into the `request` table.
 *
 *   GET /tenant/:tenantId/client-requests              (filtered + paged on the server)
 *   PUT /tenant/:tenantId/client-requests/:id/status   (triage — attended / reopened)
 *
 * NOT `/tenant/:tenantId/request`: that endpoint lists INCIDENTS, so customer
 * requests never showed up here (QA-14).
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

export interface CustomerRequestRecord {
  id: string;
  subject: string | null;
  content: string | null;
  callerType: string | null;
  callerName: string | null;
  status: string | null;
  priority: string | null;
  stationId: string | null;
  dateTime: string | null;
  createdAt: string | null;
  station?: { id: string; stationName?: string } | null;
  /** extra_guard | service | quote — what the customer asked for. */
  type?: string | null;
  requestedDate?: string | null;
}

export interface CustomerRequestStats {
  open: number;
  closed: number;
  total: number;
}

export interface CustomerRequestListParams {
  status?: "abierto" | "cerrado";
  query?: string;
  limit: number;
  offset: number;
}

const customerRequestService = {
  async list(params: CustomerRequestListParams): Promise<{
    rows: CustomerRequestRecord[];
    count: number;
    stats: CustomerRequestStats;
  }> {
    const tenantId = getTenantId();
    const qs = buildQuery(params as unknown as Record<string, unknown>);
    const resp = await api.get(`/tenant/${tenantId}/client-requests${qs}`);
    const payload = resp.data ?? resp;
    const rows: CustomerRequestRecord[] = Array.isArray(payload?.rows)
      ? payload.rows
      : [];

    return {
      rows,
      count: Number(payload?.count ?? rows.length),
      stats: payload?.stats ?? { open: 0, closed: 0, total: 0 },
    };
  },

  async updateStatus(
    id: string,
    status: "abierto" | "cerrado",
  ): Promise<CustomerRequestRecord> {
    const tenantId = getTenantId();
    const resp = await api.put(
      `/tenant/${tenantId}/client-requests/${id}/status`,
      { data: { status } },
    );

    return resp.data ?? resp;
  },
};

export default customerRequestService;
