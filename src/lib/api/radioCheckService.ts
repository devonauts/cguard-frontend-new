import api from "../api";

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) || "";

const getTenantId = (): string => {
  const t = localStorage.getItem("tenantId");
  if (!t) throw new Error("No pudimos identificar tu empresa. Cierra sesión y vuelve a entrar.");
  return t;
};

const unwrap = (resp: any) => (resp && resp.data !== undefined ? resp.data : resp);

/** Playable URL for a stored private audio clip (works in <audio>). */
export const radioAudioSrc = (privateUrl?: string | null) =>
  !privateUrl ? "" : `${API_URL}/file/download?privateUrl=${encodeURIComponent(privateUrl)}`;

export const radioCheckService = {
  /** Live console: stations + on-duty guard + latest entry status. */
  async getConsole() {
    return unwrap(await api.get(`/tenant/${getTenantId()}/radio-check/console`));
  },
  /** Start a manual roll call (all stations or one). */
  async start(scope: "all" | "station" = "all", stationId?: string) {
    return unwrap(await api.post(`/tenant/${getTenantId()}/radio-check/start`, { data: { scope, stationId } }));
  },
  async listSessions(limit = 30) {
    return unwrap(await api.get(`/tenant/${getTenantId()}/radio-check/sessions?limit=${limit}`));
  },
  async getSession(id: string) {
    return unwrap(await api.get(`/tenant/${getTenantId()}/radio-check/sessions/${id}`));
  },
  async cancelSession(id: string) {
    return unwrap(await api.post(`/tenant/${getTenantId()}/radio-check/sessions/${id}/cancel`, { data: {} }));
  },
  async regenerateSummary(id: string) {
    return unwrap(await api.post(`/tenant/${getTenantId()}/radio-check/sessions/${id}/summary`, { data: {} }));
  },
  async escalate(entryId: string) {
    return unwrap(await api.post(`/tenant/${getTenantId()}/radio-check/entries/${entryId}/escalate`, { data: {} }));
  },
  async getSettings() {
    return unwrap(await api.get(`/tenant/${getTenantId()}/radio-check/settings`));
  },
  async saveSettings(patch: Record<string, unknown>) {
    return unwrap(await api.put(`/tenant/${getTenantId()}/radio-check/settings`, { data: patch }));
  },
};
