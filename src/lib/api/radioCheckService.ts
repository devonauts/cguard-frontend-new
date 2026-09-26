import i18n from "@/i18n";
import api from "../api";
import { resolveApiBase } from "@/lib/apiBase";

const API_URL = (resolveApiBase() as string | undefined) || "";

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

/** Playable URL for a stored private audio clip (works in <audio>). */
export const radioAudioSrc = (privateUrl?: string | null) =>
  !privateUrl
    ? ""
    : `${API_URL}/file/download?privateUrl=${encodeURIComponent(privateUrl)}`;

export type RadioPresenceState =
  | "ONLINE_ACTIVE"
  | "ONLINE_BACKGROUND"
  | "RECONNECTING"
  | "OFFLINE";

export interface RadioPresenceRow {
  userId: string;
  name: string;
  /** Le toca estar en el canal (turno abierto). */
  onDuty: boolean;
  /** Está de verdad conectado al canal ahora mismo. */
  liveOnChannel: boolean;
  /** Lo último que dijo su teléfono, o null si nunca dijo nada. */
  reported: RadioPresenceState | null;
  /** Ese aviso es viejo: ya no describe el presente. */
  stale: boolean;
  /** Se le puede avisar al teléfono. */
  pushReachable: boolean;
  app?: string;
  lastReportAt?: number;
}

export interface RadioPresence {
  channel: string;
  rows: RadioPresenceRow[];
  resumen: {
    operativos?: number;
    enTurno?: number;
    enElCanal?: number;
    enTurnoFueraDelCanal?: number;
    despertables?: number;
  };
}

export const radioCheckService = {
  /** Live console: stations + on-duty guard + latest entry status. */
  async getConsole() {
    return unwrap(
      await api.get(`/tenant/${getTenantId()}/radio-check/console`),
    );
  },
  /** Start a manual roll call (all stations or one). */
  async start(scope: "all" | "station" = "all", stationId?: string) {
    return unwrap(
      await api.post(`/tenant/${getTenantId()}/radio-check/start`, {
        data: { scope, stationId },
      }),
    );
  },
  async listSessions(limit = 30) {
    return unwrap(
      await api.get(
        `/tenant/${getTenantId()}/radio-check/sessions?limit=${limit}`,
      ),
    );
  },
  async getSession(id: string) {
    return unwrap(
      await api.get(`/tenant/${getTenantId()}/radio-check/sessions/${id}`),
    );
  },
  async cancelSession(id: string) {
    return unwrap(
      await api.post(
        `/tenant/${getTenantId()}/radio-check/sessions/${id}/cancel`,
        { data: {} },
      ),
    );
  },
  async regenerateSummary(id: string) {
    return unwrap(
      await api.post(
        `/tenant/${getTenantId()}/radio-check/sessions/${id}/summary`,
        { data: {} },
      ),
    );
  },
  async escalate(entryId: string) {
    return unwrap(
      await api.post(
        `/tenant/${getTenantId()}/radio-check/entries/${entryId}/escalate`,
        { data: {} },
      ),
    );
  },
  async getSettings() {
    return unwrap(
      await api.get(`/tenant/${getTenantId()}/radio-check/settings`),
    );
  },
  async saveSettings(patch: Record<string, unknown>) {
    return unwrap(
      await api.put(`/tenant/${getTenantId()}/radio-check/settings`, {
        data: patch,
      }),
    );
  },
  /**
   * Cobertura del canal abierto: a quién le toca oír, quién está de verdad en el
   * canal (lo dice el servidor de voz, no el teléfono) y a quién se puede
   * despertar. NO es del pase de novedades, pero se sirve desde aquí porque es
   * la misma pantalla y el mismo cliente.
   */
  async getRadioPresence(channel = "general"): Promise<RadioPresence> {
    return unwrap(
      await api.get(
        `/tenant/${getTenantId()}/radio/presence?channel=${encodeURIComponent(channel)}`,
      ),
    );
  },
};
