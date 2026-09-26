import i18n from "@/i18n";
import api from "@/lib/api";

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

const patrolService = {
  async create(payload: Record<string, unknown>) {
    const tenantId = getTenantId();
    const { data } = await api.post(`/tenant/${tenantId}/patrol`, {
      data: payload,
    });

    return data;
  },
  async find(id: string) {
    const tenantId = getTenantId();
    const { data } = await api.get(`/tenant/${tenantId}/patrol/${id}`);

    return data;
  },
};

export default patrolService;
