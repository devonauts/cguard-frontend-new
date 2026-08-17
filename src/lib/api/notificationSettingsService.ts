import { ApiService } from "@/services/api/apiService";

const tenantId = (): string => {
  const t = localStorage.getItem("tenantId");
  if (!t) throw new Error("No pudimos identificar tu empresa. Cierra sesión y vuelve a entrar.");
  return t;
};

export type NotificationChannels = { dashboard: boolean; email: boolean; sms: boolean };
export type NotificationPreferences = Record<string, NotificationChannels>;

export const notificationSettingsService = {
  get(): Promise<{ preferences: NotificationPreferences }> {
    return ApiService.get(`/tenant/${tenantId()}/notification-preferences`);
  },

  update(preferences: NotificationPreferences): Promise<{ preferences: NotificationPreferences }> {
    return ApiService.put(`/tenant/${tenantId()}/notification-preferences`, { data: { preferences } });
  },
};

export default notificationSettingsService;
