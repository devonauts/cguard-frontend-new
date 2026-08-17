import { ApiService } from "@/services/api/apiService";

const tenantId = (): string => {
  const t = localStorage.getItem("tenantId");
  if (!t) throw new Error("No pudimos identificar tu empresa. Cierra sesión y vuelve a entrar.");
  return t;
};

export interface GuardDevice {
  id: string;
  deviceId: string;
  platform: string | null;
  model: string | null;
  manufacturer: string | null;
  osVersion: string | null;
  appVersion: string | null;
  isBound: boolean;
  flagged: boolean;
  lastSeenAt: string | null;
  lastMismatchAt: string | null;
  hasPush: boolean;
}

/** Devices a guard has reported (bind/flag) — guard-detail "Dispositivo" tab. */
export const guardDeviceService = {
  async list(userId: string): Promise<GuardDevice[]> {
    const resp: { rows?: GuardDevice[]; data?: { rows?: GuardDevice[] } } = await ApiService.get(
      `/tenant/${tenantId()}/guard-device/by-guard/${userId}`,
    );
    const data = (resp && (resp.data || resp)) || resp;
    return (data?.rows as GuardDevice[]) || [];
  },

  /** Reset binding (e.g. new phone): unbind the guard's devices, clear flags. */
  async resetBinding(deviceRecordId: string): Promise<void> {
    await ApiService.post(
      `/tenant/${tenantId()}/guard-device/${deviceRecordId}/reset-binding`,
      {},
    );
  },
};

export default guardDeviceService;
