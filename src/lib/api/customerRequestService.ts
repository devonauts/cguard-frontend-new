import api from "../api";

/**
 * Customer-originated service requests (callerType='client'), posted by the
 * Mi Seguridad customer app into the shared `request` model and read by the CRM.
 *
 * Reuses the existing tenant request endpoints:
 *   GET /tenant/:tenantId/request            (list — filtered client-side by callerType)
 *   PUT /tenant/:tenantId/request/:id        (triage — update status / mark attended)
 */

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
}

const customerRequestService = {
  async list(
    params?: Record<string, unknown>,
  ): Promise<{ rows: CustomerRequestRecord[]; count: number }> {
    const tenantId = getTenantId();
    const qs = buildQuery(params);
    const resp = await api.get(`/tenant/${tenantId}/request${qs}`);
    const payload = resp.data ?? resp;
    const rows: CustomerRequestRecord[] = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.rows)
        ? payload.rows
        : [];
    const count = Array.isArray(payload)
      ? payload.length
      : (payload?.count ?? rows.length);

    return { rows, count };
  },

  async updateStatus(
    id: string,
    status: string,
  ): Promise<CustomerRequestRecord> {
    const tenantId = getTenantId();
    const resp = await api.put(`/tenant/${tenantId}/request/${id}`, {
      data: { status },
    });

    return resp.data ?? resp;
  },
};

export default customerRequestService;
