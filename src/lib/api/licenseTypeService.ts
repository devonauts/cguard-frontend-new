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

export interface LicenseType {
  id: string;
  name: string;
  status?: string;
  tenantId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface LicenseTypeListResponse {
  rows: LicenseType[];
  count: number;
}

const licenseTypeService = {
  async list(
    params: Record<string, string> = {},
  ): Promise<LicenseTypeListResponse> {
    const tenantId = getTenantId();
    const qs = params ? `?${new URLSearchParams(params).toString()}` : "";
    const { data } = await api.get<LicenseTypeListResponse>(
      `/tenant/${tenantId}/license-type${qs}`,
    );

    return data;
  },

  async create(input: {
    name: string;
    status?: string;
  }): Promise<LicenseType & { data?: LicenseType }> {
    const tenantId = getTenantId();
    const { data } = await api.post<LicenseType & { data?: LicenseType }>(
      `/tenant/${tenantId}/license-type`,
      input,
    );

    return data;
  },

  async update(
    id: string,
    input: { name?: string; status?: string },
  ): Promise<LicenseType & { data?: LicenseType }> {
    const tenantId = getTenantId();
    const { data } = await api.put<LicenseType & { data?: LicenseType }>(
      `/tenant/${tenantId}/license-type/${id}`,
      input,
    );

    return data;
  },

  async destroy(ids: string[]): Promise<{ success?: boolean }> {
    const tenantId = getTenantId();
    const { data } = await api.delete<{ success?: boolean }>(
      `/tenant/${tenantId}/license-type`,
      { data: { ids } },
    );

    return data;
  },

  async autocomplete(
    query: string,
    limit = 10,
  ): Promise<Array<{ id: string; label?: string; name?: string }>> {
    const tenantId = getTenantId();
    const { data } = await api.get<
      Array<{ id: string; label?: string; name?: string }>
    >(
      `/tenant/${tenantId}/license-type/autocomplete?query=${encodeURIComponent(query)}&limit=${limit}`,
    );

    return data;
  },
};

export default licenseTypeService;
