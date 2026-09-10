import { ApiService } from "@/services/api/apiService";

const tenantId = (): string => {
  const t = localStorage.getItem("tenantId");

  if (!t)
    throw new Error(
      "No pudimos identificar tu empresa. Cierra sesión y vuelve a entrar.",
    );

  return t;
};

export interface RondaSettings {
  id?: string | null;
  postSiteId?: string | null;
  frequencyMinutes: number;
  roundsPerShift: number | null;
  graceMinutes: number;
  maxDurationMinutes: number;
  requirePhoto: boolean;
  requireGeofence: boolean;
  geofenceRadius: number;
  requireNote: boolean;
  /** Exigir que los puntos se marquen en el orden del recorrido. */
  requireCheckpointOrder: boolean;
  notifyTenantOnStart: boolean;
  notifyTenantOnComplete: boolean;
  notifyTenantOnMissed: boolean;
  notifyClient: boolean;
  emailOnComplete: boolean;
  active: boolean;
  isDefault?: boolean;
}

export const rondaSettingsService = {
  /** Effective settings (tenant default, or per-post override if postSiteId given). */
  get(postSiteId?: string): Promise<RondaSettings> {
    const qs = postSiteId
      ? `?postSiteId=${encodeURIComponent(postSiteId)}`
      : "";

    return ApiService.get(`/tenant/${tenantId()}/ronda-settings${qs}`);
  },

  /** Upsert settings (tenant default or per-post override). */
  update(data: Partial<RondaSettings>): Promise<RondaSettings> {
    return ApiService.put(`/tenant/${tenantId()}/ronda-settings`, { data });
  },
};

export default rondaSettingsService;
