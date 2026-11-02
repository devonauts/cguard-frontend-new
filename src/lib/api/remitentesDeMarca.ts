/**
 * MULTIMARCA · phase 5 — each brand's own SMS number and WhatsApp sender.
 *
 * Client of `/tenant/:t/brands/senders` and `/brands/:id/senders/…` (backend
 * `api/multimarca/senders.ts`). A brand without a sender of its own uses the
 * company's, and its messages carry the brand name.
 */
import i18n from "@/i18n";
import { ApiService } from "@/services/api/apiService";

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
const base = () => `/tenant/${tenantId()}/brands`;

export type ModoWhatsApp = "waba_number" | "own";

export interface RemitentesDeLaEmpresa {
  sms: {
    provisioned: boolean;
    phoneNumber: string | null;
    platformConfigured: boolean;
  };
  whatsapp: {
    connected: boolean;
    displayPhoneNumber: string | null;
    phoneNumberId: string | null;
    businessName?: string | null;
  };
}

export interface RemitentesDeMarca {
  brandId: string;
  name: string;
  isPrincipal: boolean;
  company: RemitentesDeLaEmpresa;
  sms: {
    phoneNumber: string | null;
    origin: "assigned" | "purchased" | null;
    usesCompanyNumber: boolean;
  };
  whatsapp: {
    mode: ModoWhatsApp | null;
    phoneNumberId: string | null;
    displayPhoneNumber: string | null;
    verifiedName: string | null;
    businessName: string | null;
    wabaId: string | null;
    status: "connected" | "disconnected" | "none";
    connectedAt: string | null;
    usesCompanyNumber: boolean;
  };
}

export interface NumeroDeLaEmpresa {
  phoneNumber: string;
  sid: string | null;
  isCompanyNumber: boolean;
  brandId: string | null;
  /** A brand admin: used by a brand that is not theirs. */
  taken?: boolean;
}

export interface NumeroDeWhatsApp {
  phoneNumberId: string;
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  status: string | null;
  isCompanyNumber: boolean;
  brandId: string | null;
  taken?: boolean;
}

export interface Inventario {
  sms: {
    provisioned: boolean;
    live: boolean;
    companyNumber: string | null;
    numbers: NumeroDeLaEmpresa[];
  };
  whatsapp: {
    connected: boolean;
    companyPhoneNumberId: string | null;
    numbers: NumeroDeWhatsApp[];
  };
}

export interface NumeroDisponible {
  phoneNumber: string;
  friendlyName: string | null;
  locality: string | null;
  region: string | null;
  isoCountry: string | null;
}

export interface ParametrosDeRegistro {
  appId: string | null;
  configId: string | null;
  graphVersion: string;
  configured: boolean;
}

export interface ResultadoDePrueba {
  results: Array<{
    status: string;
    channel: string;
    provider: string | null;
    skipReason: string | null;
    error: string | null;
  }>;
}

export const remitentesDeMarcaService = {
  de: (marcaId: string): Promise<RemitentesDeMarca> =>
    ApiService.get(`${base()}/${marcaId}/senders`),
  inventario: (): Promise<Inventario> =>
    ApiService.get(`${base()}/senders/inventory`),
  asignarSms: (
    marcaId: string,
    phoneNumber: string | null,
  ): Promise<RemitentesDeMarca> =>
    ApiService.put(`${base()}/${marcaId}/senders/sms`, { phoneNumber }),
  disponibles: (
    marcaId: string,
    q: { country?: string; areaCode?: string; contains?: string } = {},
  ): Promise<{ numbers: NumeroDisponible[] }> => {
    const qs = new URLSearchParams(
      Object.entries(q).filter(([, v]) => !!v) as [string, string][],
    ).toString();

    return ApiService.get(
      `${base()}/${marcaId}/senders/sms/available-numbers${qs ? `?${qs}` : ""}`,
    );
  },
  comprarSms: (
    marcaId: string,
    phoneNumber: string,
  ): Promise<RemitentesDeMarca> =>
    ApiService.post(`${base()}/${marcaId}/senders/sms/buy`, { phoneNumber }),
  asignarWhatsApp: (
    marcaId: string,
    phoneNumberId: string | null,
  ): Promise<RemitentesDeMarca> =>
    ApiService.put(`${base()}/${marcaId}/senders/whatsapp`, { phoneNumberId }),
  parametrosDeRegistro: (marcaId: string): Promise<ParametrosDeRegistro> =>
    ApiService.get(`${base()}/${marcaId}/senders/whatsapp/connect`),
  conectarWhatsAppPropio: (
    marcaId: string,
    d: { code: string; wabaId: string | null; phoneNumberId: string | null },
  ): Promise<RemitentesDeMarca> =>
    ApiService.post(`${base()}/${marcaId}/senders/whatsapp/callback`, d),
  desconectarWhatsApp: (marcaId: string): Promise<RemitentesDeMarca> =>
    ApiService.post(`${base()}/${marcaId}/senders/whatsapp/disconnect`, {}),
  probar: (d: {
    channel: "sms" | "whatsapp";
    phone: string;
    brandId?: string;
    clientAccountId?: string;
    userId?: string;
  }): Promise<ResultadoDePrueba> =>
    ApiService.post(`${base()}/senders/test`, d),
};

export default remitentesDeMarcaService;
