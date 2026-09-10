import { ApiService } from "@/services/api/apiService";

const tenantId = (): string => {
  const t = localStorage.getItem("tenantId");

  if (!t)
    throw new Error(
      "No pudimos identificar tu empresa. Cierra sesión y vuelve a entrar.",
    );

  return t;
};

export interface EmailCatalogItem {
  key: string;
  label: string;
  description: string;
  category: string;
  locked?: boolean;
  eventType?: string;
}

export interface EmailBranding {
  brandColor: string;
  headerColor: string;
}

/** `disponible: false` no es un error: hay avisos que no salen de una plantilla
 *  de archivo, y otros que esta plataforma sencillamente no envía. En esos casos
 *  `motivo` explica cuál de las dos cosas es. */
export interface EmailPreviewResult {
  disponible: boolean;
  motivo?: string;
  key?: string;
  label?: string;
  asunto?: string;
  html?: string;
  plantilla?: string;
  avisoSendgrid?: boolean;
}

export interface EmailPreferencesResponse {
  catalog: EmailCatalogItem[];
  preferences: Record<string, boolean>;
  branding?: EmailBranding;
  logoUrl?: string | null;
}

export const emailPreferencesService = {
  get(): Promise<EmailPreferencesResponse> {
    return ApiService.get(`/tenant/${tenantId()}/email-preferences`);
  },

  update(
    preferences: Record<string, boolean>,
    branding?: EmailBranding,
  ): Promise<EmailPreferencesResponse> {
    return ApiService.put(`/tenant/${tenantId()}/email-preferences`, {
      data: { preferences, ...(branding ? { branding } : {}) },
    });
  },

  /** Render a sample transactional email with DRAFT branding for live preview. */
  preview(branding?: EmailBranding): Promise<{ html: string }> {
    return ApiService.post(`/tenant/${tenantId()}/email-preferences/preview`, {
      data: { ...(branding ? { branding } : {}) },
    });
  },

  /** El correo REAL de un punto del catálogo, con datos de ejemplo. Lo renderiza
   *  el propio remitente parándose antes de enviar, así que no puede diferir de
   *  lo que recibe el destinatario. */
  previewTemplate(key: string): Promise<EmailPreviewResult> {
    return ApiService.get(
      `/tenant/${tenantId()}/email-preferences/preview/${encodeURIComponent(key)}`,
    );
  },
};

export default emailPreferencesService;
