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
};

export default vehicleService;
