import i18n from "@/i18n";
import { ApiService } from "./api/apiService";

function getTenantId(): string {
  const t = localStorage.getItem("tenantId");

  if (!t) throw new Error(i18n.t("ui.apiService.noPudimosIdentificarTuEmpresa", "No pudimos identificar tu empresa. Cierra sesión y vuelve a entrar."));

  return t;
}

const IncidentTypesService = {
  async list(query = "", page = 1, pageSize = 25) {
    const tenantId = getTenantId();
    const params = new URLSearchParams();

    if (query) params.append("filter[name]", query);
    if (pageSize) params.append("limit", String(pageSize));
    const offset = (page - 1) * pageSize;

    if (offset) params.append("offset", String(offset));

    const data = await ApiService.get(
      `/tenant/${tenantId}/incidentType?${params.toString()}`,
    );

    return data;
  },

  async create(payload: { name: string }) {
    const tenantId = getTenantId();

    return ApiService.post(`/tenant/${tenantId}/incidentType`, {
      data: payload,
    });
  },

  async update(id: string, payload: { name: string }) {
    const tenantId = getTenantId();

    return ApiService.put(`/tenant/${tenantId}/incidentType/${id}`, {
      data: payload,
    });
  },

  async toggle(id: string) {
    const tenantId = getTenantId();

    return ApiService.post(`/tenant/${tenantId}/incidentType/${id}/toggle`);
  },

  async destroyAll(ids: string[]) {
    const tenantId = getTenantId();

    return ApiService.delete(
      `/tenant/${tenantId}/incidentType?ids=${ids.join(",")}`,
    );
  },

  async autocomplete(query: string, limit = 10) {
    const tenantId = getTenantId();

    return ApiService.get(
      `/tenant/${tenantId}/incidentType/autocomplete?query=${encodeURIComponent(query)}&limit=${limit}`,
    );
  },
};

export default IncidentTypesService;
