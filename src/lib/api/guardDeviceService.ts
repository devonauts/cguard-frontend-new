import { ApiService } from "@/services/api/apiService";

const tenantId = (): string => {
  const t = localStorage.getItem("tenantId");

  if (!t)
    throw new Error(
      "No pudimos identificar tu empresa. Cierra sesión y vuelve a entrar.",
    );

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

/**
 * La calidad de ubicación del teléfono de este vigilante, medida sobre sus
 * últimos fichajes. No juzga a la persona: dice si su móvil está mandando
 * posición, para que la oficina pueda ir a arreglarle el permiso.
 */
export interface CalidadDeUbicacion {
  estado: "precisa" | "aproximada" | "sin_ubicacion" | "sin_datos";
  total: number;
  sinUbicacion: number;
  aproximada: number;
  precisa: number;
  ultimoSinUbicacion: string | null;
  sueloPrecisionM: number;
}

/** Devices a guard has reported (bind/flag) — guard-detail "Dispositivo" tab. */
export const guardDeviceService = {
  async list(userId: string): Promise<GuardDevice[]> {
    const { devices } = await guardDeviceService.listWithLocation(userId);

    return devices;
  },

  /** Lo mismo, con el diagnóstico de ubicación que trae el mismo endpoint. */
  async listWithLocation(
    userId: string,
  ): Promise<{ devices: GuardDevice[]; ubicacion: CalidadDeUbicacion | null }> {
    const resp: any = await ApiService.get(
      `/tenant/${tenantId()}/guard-device/by-guard/${userId}`,
    );
    const data = (resp && (resp.data || resp)) || resp;

    return {
      devices: (data?.rows as GuardDevice[]) || [],
      ubicacion: (data?.ubicacion as CalidadDeUbicacion) ?? null,
    };
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
