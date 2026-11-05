import i18n from "@/i18n";
import { ApiService } from "@/services/api/apiService";

/**
 * Frontend client for the unified communications layer (Configuración →
 * Comunicaciones). Talks ONLY to the authed, tenant-scoped endpoints:
 *   GET/PUT /tenant/:t/communications/settings
 *   GET     /tenant/:t/communications/logs
 *   GET     /tenant/:t/communications/wallet
 *
 * Secrets (Meta access token, app secret, webhook verify token) are NEVER
 * handled here — only non-secret identifiers (phone number id, business
 * account id) which the backend stores on the tenant settings blob.
 */

const tenantId = (): string => {
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

export type Channel = "push" | "whatsapp" | "sms" | "email";
export type Provider = "fcm" | "meta" | "twilio" | "smtp" | string;
export type DeliveryStatus =
  | "queued"
  | "sent"
  | "delivered"
  | "read"
  | "failed"
  | "skipped";
export type MessageType =
  | "otp"
  | "shift_reminder"
  | "incident_alert"
  | "visitor_alert"
  | "ronda_alert"
  | "task_alert"
  | "no_show"
  | "panic"
  | "new_assignment"
  | "escalation"
  | "generic"
  | string;

/** Mirror of the backend CommunicationSettings blob (defaults merged server-side). */
export interface CommunicationSettings {
  /** Horario de silencio del tenant. Sólo afecta al PUSH, y lo crítico
   *  —pánico, inasistencia, puesto abandonado— nunca calla. */
  quiet_hours?: { enabled: boolean; startHour: number; endHour: number };
  push_enabled: boolean;
  whatsapp_enabled: boolean;
  sms_enabled: boolean;
  email_enabled: boolean;
  whatsapp_provider: "meta";
  sms_provider: "twilio";
  critical_alert_sms_fallback: boolean;
  otp_preferred_channel: "whatsapp" | "sms";
  wallet_required_for_paid_channels: boolean;
  low_balance_threshold: number;
  allow_negative_communications_balance: boolean;
  default_country_code: string;
  timezone: string | null;
  whatsapp_shift_reminders: boolean;
  whatsapp_incidents: boolean;
  sms_critical: boolean;
  // Non-secret Meta identifiers stored on the settings blob (NOT secrets).
  meta_phone_number_id?: string | null;
  meta_business_account_id?: string | null;
  [key: string]: any;
}

export interface WalletSnapshot {
  balanceCents: number;
  currency: string;
  lowBalanceThresholdCents: number;
  belowThreshold: boolean;
}

export interface CommunicationLog {
  id: string;
  tenantId: string;
  userId: string | null;
  recipient: string;
  /** Added by the API when `recipient` is a user id (push). */
  recipientName?: string;
  channel: Channel;
  provider: string;
  messageType: MessageType;
  status: DeliveryStatus;
  providerMessageId: string | null;
  providerResponse: any | null;
  errorMessage: string | null;
  costEstimateCents: number | null;
  billedAmountCents: number | null;
  currency: string;
  deepLink: string | null;
  createdAt: string;
  updatedAt: string;
  deliveredAt: string | null;
  readAt: string | null;
  failedAt: string | null;
  /** Module Multimarca (phase 5): the brand the message spoke for. */
  brandId?: string | null;
  brandName?: string;
  brandColor?: string | null;
  /** The From it went out with (SMS number / WhatsApp phone number id). */
  sender?: string | null;
  senderSource?: "brand" | "tenant" | "platform" | null;
}

export interface LogsResult {
  rows: CommunicationLog[];
  count: number;
  page: number;
  limit: number;
  totalPages: number;
}

/** Meta Embedded Signup config (non-secret, safe for the browser). */
export interface WhatsAppEmbeddedConfig {
  appId: string | null;
  configId: string | null;
  graphVersion: string;
  configured: boolean;
}

export type WhatsAppConnectionState =
  | "connected"
  | "disconnected"
  | "pending"
  | "error";

/** Per-tenant WhatsApp Business connection status (Embedded Signup). */
export interface WhatsAppStatus {
  connected: boolean;
  status: WhatsAppConnectionState;
  displayPhoneNumber: string | null;
  businessName: string | null;
  displayName: string | null;
  qualityRating: string | null;
  messagingLimit: string | null;
  wabaId: string | null;
  phoneNumberId: string | null;
  connectedAt: string | null;
  lastSyncAt: string | null;
  tokenLast4: string | null;
  embedded: WhatsAppEmbeddedConfig;
  /** El número está conectado pero Meta aún no lo tiene activo: falta el PIN. */
  needsRegistration?: boolean;
  /** Estado del número según Meta (CONNECTED, PENDING…), si contestó. */
  estadoDelNumero?: string | null;
  /** Las plantillas de la cuenta de la empresa, con su estado en Meta. */
  plantillas?: WhatsAppPlantilla[];
  /** Las que usa la plataforma y aún no están creadas en su cuenta. */
  plantillasQueFaltan?: string[];
  metaBusinessId?: string | null;
  /**
   * Pagos en Meta: los enlaces directos y si Meta está rechazando mensajes
   * por falta de pago (error 131042) sin que haya salido ninguno después.
   */
  pago?: {
    problema: boolean;
    desde: string | null;
    pagos: string;
    administrador: string;
  } | null;
}

export interface WhatsAppPlantilla {
  nombre: string;
  idioma: string;
  /** APPROVED · PENDING · REJECTED · PAUSED · DISABLED (de Meta). */
  estado: string | null;
  categoria: string | null;
}

export interface WhatsAppCallbackPayload {
  /** Authorization code returned by FB.login (response_type: 'code'). */
  code: string;
  /** Captured from the WA_EMBEDDED_SIGNUP session-info message (may be null). */
  wabaId?: string | null;
  phoneNumberId?: string | null;
}

export interface LogsFilters {
  channel?: string;
  provider?: string;
  status?: string;
  type?: string; // maps to messageType server-side
  /** Module Multimarca: only this brand's messages. */
  brandId?: string;
  from?: string; // ISO date
  to?: string; // ISO date
  page?: number;
  limit?: number;
}

function buildQuery(filters: LogsFilters): string {
  const entries: [string, string][] = [];

  Object.entries(filters).forEach(([k, v]) => {
    if (v === undefined || v === null || v === "") return;
    entries.push([k, String(v)]);
  });
  const qs = new URLSearchParams(entries).toString();

  return qs ? `?${qs}` : "";
}

export const communicationService = {
  getSettings(): Promise<CommunicationSettings> {
    return ApiService.get(`/tenant/${tenantId()}/communications/settings`);
  },

  updateSettings(
    patch: Partial<CommunicationSettings>,
  ): Promise<CommunicationSettings> {
    return ApiService.put(`/tenant/${tenantId()}/communications/settings`, {
      data: patch,
    });
  },

  getWallet(): Promise<WalletSnapshot> {
    return ApiService.get(`/tenant/${tenantId()}/communications/wallet`);
  },

  /** Stripe Checkout top-up — resolves with the hosted checkout URL. */
  rechargeWallet(amountCents: number): Promise<{ url: string; id: string }> {
    return ApiService.post(
      `/tenant/${tenantId()}/communications/wallet/recharge`,
      {
        data: { amountCents },
      },
    );
  },

  getLogs(filters: LogsFilters = {}): Promise<LogsResult> {
    return ApiService.get(
      `/tenant/${tenantId()}/communications/logs${buildQuery(filters)}`,
    );
  },

  // ── WhatsApp Business (Meta Embedded Signup) ──────────────────────────────
  // The tenant never handles tokens/secrets: the browser only receives the
  // public app id + config id and posts back the one-time auth code.

  whatsappStatus(): Promise<WhatsAppStatus> {
    return ApiService.get(
      `/tenant/${tenantId()}/communications/whatsapp/status`,
    );
  },

  whatsappConnect(): Promise<WhatsAppEmbeddedConfig> {
    return ApiService.post(
      `/tenant/${tenantId()}/communications/whatsapp/connect`,
      {},
    );
  },

  whatsappCallback(payload: WhatsAppCallbackPayload): Promise<WhatsAppStatus> {
    return ApiService.post(
      `/tenant/${tenantId()}/communications/whatsapp/callback`,
      { data: payload },
    );
  },

  whatsappDisconnect(): Promise<WhatsAppStatus> {
    return ApiService.post(
      `/tenant/${tenantId()}/communications/whatsapp/disconnect`,
      {},
    );
  },

  whatsappRegister(pin: string): Promise<{ registered: boolean }> {
    return ApiService.post(
      `/tenant/${tenantId()}/communications/whatsapp/register`,
      { data: { pin } },
    );
  },

  whatsappDefaultTemplates(): Promise<{
    creadas: Array<{ nombre: string; ok: boolean; estado?: string | null; error?: string }>;
  }> {
    return ApiService.post(
      `/tenant/${tenantId()}/communications/whatsapp/default-templates`,
      {},
    );
  },

  whatsappSyncTemplates(): Promise<{ ok: boolean }> {
    return ApiService.post(
      `/tenant/${tenantId()}/communications/whatsapp/sync-templates`,
      {},
    );
  },
};

export default communicationService;
