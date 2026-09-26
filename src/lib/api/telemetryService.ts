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

const telemetryService = {
  async log(entry: { level?: string; message: string; details?: unknown }) {
    const tenantId = getTenantId();

    try {
      const { data } = await api.post(`/tenant/${tenantId}/client-log`, {
        data: entry,
      });

      return data;
    } catch (err) {
      // swallow errors — telemetry should not break UI
      console.warn("telemetryService.log failed", err);
    }
  },
};

export default telemetryService;
