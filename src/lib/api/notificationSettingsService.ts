import { ApiService } from "@/services/api/apiService";

const tenantId = (): string => {
  const t = localStorage.getItem("tenantId");
  if (!t) throw new Error("No pudimos identificar tu empresa. Cierra sesión y vuelve a entrar.");
  return t;
};

/**
 * Los cuatro canales por los que puede salir un aviso.
 *
 * `push` es el teléfono (apps del vigilante y del supervisor) y hasta ahora NO
 * existía como casilla: el push iba pegado a «Panel de control», así que apagar
 * la campana del CRM dejaba también sin aviso el bolsillo del supervisor. El
 * servidor hereda `push` de `dashboard` mientras la empresa no toque la casilla,
 * así que una preferencia guardada de antes se comporta igual que ayer.
 */
export type NotificationChannels = { dashboard: boolean; email: boolean; sms: boolean; push?: boolean };
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
