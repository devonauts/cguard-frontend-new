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

const unwrap = (resp: any) =>
  resp && resp.data !== undefined ? resp.data : resp;

/** Sólo presentación: decide el icono y el texto de ayuda del formulario. */
export type RadioChannelType =
  | "general"
  | "admin"
  | "supervisors"
  | "stations"
  | "custom";

/** `everyone` = todo el personal operativo; `members` = sólo las reglas. */
export type RadioChannelScope = "everyone" | "members";

export interface RadioChannel {
  id: string;
  /** La clave de la sala en el SFU. No se edita: mudaría de sala a quien hable. */
  key: string;
  name: string;
  description?: string | null;
  type: RadioChannelType;
  scope: RadioChannelScope;
  isDefault: boolean;
  active: boolean;
  sortOrder: number;
  stationIds: string[];
  roleSlugs: string[];
  userIds: string[];
  createdAt?: string;
  updatedAt?: string;
}

export type RadioChannelInput = {
  name: string;
  description?: string | null;
  type?: RadioChannelType;
  scope?: RadioChannelScope;
  active?: boolean;
  isDefault?: boolean;
  sortOrder?: number;
  stationIds?: string[];
  roleSlugs?: string[];
  userIds?: string[];
};

export interface RadioChannelOptions {
  stations: { id: string; name: string; nickname?: string | null }[];
  roles: { slug: string; level: number }[];
  staff: {
    id: string;
    name: string;
    email?: string | null;
    roles: string[];
  }[];
}

/** Un canal tal como lo ve quien va a ENTRAR (no quien lo administra). */
export interface MiCanal {
  id: string;
  key: string;
  name: string;
  description?: string | null;
  type: RadioChannelType;
  scope: RadioChannelScope;
  isDefault: boolean;
  /** Cuánta gente hay dentro AHORA (lo dice el SFU, no el cliente). */
  online: number;
}

export const radioChannelService = {
  /** El catálogo completo — pide `radioChannelRead` (pantalla de CRM). */
  async list(): Promise<RadioChannel[]> {
    const r = unwrap(await api.get(`/tenant/${getTenantId()}/radio-channels`));

    return Array.isArray(r) ? r : (r?.rows ?? []);
  },
  /** Estaciones, roles y personal para armar el formulario, en una llamada. */
  async options(): Promise<RadioChannelOptions> {
    const r = unwrap(
      await api.get(`/tenant/${getTenantId()}/radio-channels/options`),
    );

    return {
      stations: r?.stations ?? [],
      roles: r?.roles ?? [],
      staff: r?.staff ?? [],
    };
  },
  async create(body: RadioChannelInput): Promise<RadioChannel> {
    return unwrap(
      await api.post(`/tenant/${getTenantId()}/radio-channel`, { data: body }),
    );
  },
  async update(
    id: string,
    body: Partial<RadioChannelInput>,
  ): Promise<RadioChannel> {
    return unwrap(
      await api.put(`/tenant/${getTenantId()}/radio-channel/${id}`, {
        data: body,
      }),
    );
  },
  async remove(id: string): Promise<void> {
    return unwrap(
      await api.delete(`/tenant/${getTenantId()}/radio-channel/${id}`),
    );
  },
  /**
   * MIS canales: a los que de verdad puedo entrar. No pide permiso de CRM
   * (un vigilante tampoco lo tiene), sino la misma autoridad que la radio.
   */
  async mine(): Promise<{ rows: MiCanal[]; defaultChannel: string }> {
    const r = unwrap(await api.get(`/tenant/${getTenantId()}/radio/channels`));

    return {
      rows: r?.rows ?? [],
      defaultChannel: r?.defaultChannel || "general",
    };
  },
};

export default radioChannelService;
