import i18n from "@/i18n";
import api from "@/lib/api";

// Reuse tenantId retrieval pattern
const getTenantId = (): string => {
  const t = localStorage.getItem("tenantId");

  if (!t) {
    throw new Error(
      i18n.t(
        "ui.apiService.noPudimosIdentificarTuEmpresa",
        "No pudimos identificar tu empresa. Cierra sesión y vuelve a entrar.",
      ),
    );
  }

  return t;
};

const vehicleService = {
  async list(params?: Record<string, unknown>) {
    const tenantId = getTenantId();
    const qs = params
      ? `?${new URLSearchParams(params as Record<string, string>).toString()}`
      : "";

    try {
      const { data: resp } = await api.get<any>(
        `/tenant/${tenantId}/vehicle${qs}`,
        { toast: { silentError: true } },
      );

      // Normalize response shapes used across the app
      if (!resp) return { rows: [], count: 0 };
      if (Array.isArray(resp)) return { rows: resp, count: resp.length };
      if (resp.rows && Array.isArray(resp.rows)) return resp;
      if (resp.data && Array.isArray(resp.data))
        return { rows: resp.data, count: resp.data.length };

      return { rows: [], count: 0 };
    } catch (err) {
      // Re-throw so callers can handle, but keep logging for easier debugging
      try {
        console.error("[vehicleService] list error", err);
      } catch (e) {}
      throw err;
    }
  },

  async autocomplete(query: string, limit = 10) {
    const tenantId = getTenantId();

    try {
      const { data: resp } = await api.get<any>(
        `/tenant/${tenantId}/vehicle/autocomplete?query=${encodeURIComponent(query)}&limit=${limit}`,
      );

      return resp || [];
    } catch (err) {
      try {
        console.error("[vehicleService] autocomplete error", err);
      } catch (e) {}
      throw err;
    }
  },

  async find(id: string) {
    const tenantId = getTenantId();
    const { data: resp } = await api.get<any>(
      `/tenant/${tenantId}/vehicle/${id}`,
    );

    return resp;
  },

  // Optional CRUD helpers to match backend capabilities
  async create(data: Record<string, unknown>) {
    const tenantId = getTenantId();
    const { data: resp } = await api.post<any>(`/tenant/${tenantId}/vehicle`, {
      data,
    });

    return resp;
  },

  async update(id: string, data: Record<string, unknown>) {
    const tenantId = getTenantId();
    const { data: resp } = await api.put<any>(
      `/tenant/${tenantId}/vehicle/${id}`,
      { data },
    );

    return resp;
  },

  async destroy(ids: string[] | string) {
    const tenantId = getTenantId();
    const payload = Array.isArray(ids) ? ids : [ids];

    await api.delete(`/tenant/${tenantId}/vehicle`, { data: { ids: payload } });

    return true;
  },

  /* ── Flota: salidas y devoluciones (2026-11-04) ──────────────────────────
     Un vehículo de la empresa se SACA y se DEVUELVE con su odómetro; el
     personal de un supervisor sólo lo usa su dueño. El servidor valida que
     el odómetro no retroceda y marca lo raro (salto grande, odómetro ≫ GPS). */

  async checkout(
    vehicleId: string,
    data: {
      odometer?: number | null;
      fuel?: string | null;
      purpose?: string | null;
      driverUserId?: string | null;
      photos?: unknown[];
    },
  ) {
    const tenantId = getTenantId();
    const { data: resp } = await api.post<any>(
      `/tenant/${tenantId}/vehicle/${vehicleId}/checkout`,
      { data },
    );

    return resp;
  },

  async checkin(
    useId: string,
    data: {
      odometer?: number | null;
      fuel?: string | null;
      notes?: string | null;
      damages?: string | null;
      photos?: unknown[];
    },
  ) {
    const tenantId = getTenantId();
    const { data: resp } = await api.post<any>(
      `/tenant/${tenantId}/vehicle-use/${useId}/checkin`,
      { data },
    );

    return resp;
  },

  async uses(params: {
    vehicleId?: string;
    driverUserId?: string;
    status?: "open" | "closed";
    from?: string;
    to?: string;
    flagged?: boolean;
    limit?: number;
  } = {}) {
    const tenantId = getTenantId();
    const q = new URLSearchParams();

    for (const [k, v] of Object.entries(params))
      if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
    const { data: resp } = await api.get<any>(
      `/tenant/${tenantId}/vehicle-use?${q.toString()}`,
    );

    return resp as { rows: any[]; count: number };
  },
};

export default vehicleService;
