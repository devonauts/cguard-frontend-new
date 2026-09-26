import i18n from "@/i18n";
import { ApiService } from "./api/apiService";

function getTenantId(): string {
  const t = localStorage.getItem("tenantId");

  if (!t) throw new Error(i18n.t("ui.apiService.noPudimosIdentificarTuEmpresa", "No pudimos identificar tu empresa. Cierra sesión y vuelve a entrar."));

  return t;
}

const KpiService = {
  async list(params: Record<string, any> = {}) {
    const tenantId = getTenantId();
    const qs = new URLSearchParams();

    Object.keys(params).forEach((k) => {
      if (params[k] !== undefined && params[k] !== null)
        qs.append(k, String(params[k]));
    });
    // Add cache-busting timestamp to avoid 304 Not Modified responses
    qs.append("_", String(Date.now()));

    return ApiService.get(`/tenant/${tenantId}/kpi?${qs.toString()}`, {
      headers: { "Cache-Control": "no-cache" },
    });
  },

  async create(payload: any) {
    const tenantId = getTenantId();

    return ApiService.post(`/tenant/${tenantId}/kpi`, payload);
  },

  async update(id: string, payload: any) {
    const tenantId = getTenantId();

    return ApiService.put(`/tenant/${tenantId}/kpi/${id}`, payload);
  },

  async destroy(id: string) {
    const tenantId = getTenantId();

    return ApiService.delete(`/tenant/${tenantId}/kpi/${id}`);
  },

  async autocomplete(query: string, limit = 10) {
    const tenantId = getTenantId();

    return ApiService.get(
      `/tenant/${tenantId}/kpi/autocomplete?query=${encodeURIComponent(query)}&limit=${limit}`,
    );
  },

  async getPdf(id: string) {
    const tenantId = getTenantId();
    const blob = await ApiService.getBlob(`/tenant/${tenantId}/kpi/${id}/pdf`);

    return blob;
  },
  async getExcel(id: string) {
    const tenantId = getTenantId();
    const blob = await ApiService.getBlob(
      `/tenant/${tenantId}/kpi/${id}/excel`,
    );

    return blob;
  },
};

export default KpiService;
