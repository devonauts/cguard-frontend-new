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

export interface SmsAccount {
  balanceCents: number;
  currency: string;
  status: string;
  subaccountSid: string | null;
  phoneNumber: string | null;
  hasSender: boolean;
  provisioned: boolean;
  platformConfigured: boolean;
  pricePerSmsCents: number;
}

export interface SmsTransaction {
  id: string;
  type: string;
  amountCents: number;
  balanceAfterCents: number | null;
  smsCount: number | null;
  currency: string;
  reference: string | null;
  description: string | null;
  createdAt: string;
}

export const smsAccountService = {
  get(): Promise<{ account: SmsAccount; transactions: SmsTransaction[] }> {
    return ApiService.get(`/tenant/${tenantId()}/sms-account`);
  },
  transactions(limit = 100): Promise<{ transactions: SmsTransaction[] }> {
    return ApiService.get(
      `/tenant/${tenantId()}/sms-account/transactions?limit=${limit}`,
    );
  },
  provision(): Promise<{ account: SmsAccount }> {
    return ApiService.post(`/tenant/${tenantId()}/sms-account/provision`, {});
  },
  // recharge() removed: the legacy per-tenant SMS wallet is retired.
  // Balance + Stripe recharge now live in the unified communications wallet
  // (communicationService.rechargeWallet, /setting/comunicaciones).
  availableNumbers(
    params: { country?: string; areaCode?: string; contains?: string } = {},
  ): Promise<{ numbers: AvailableNumber[] }> {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => !!v) as [string, string][],
    ).toString();

    return ApiService.get(
      `/tenant/${tenantId()}/sms-account/available-numbers${qs ? `?${qs}` : ""}`,
    );
  },
  buyNumber(phoneNumber: string): Promise<{ account: SmsAccount }> {
    return ApiService.post(`/tenant/${tenantId()}/sms-account/buy-number`, {
      data: { phoneNumber },
    });
  },
};

export interface AvailableNumber {
  phoneNumber: string;
  friendlyName: string | null;
  locality: string | null;
  region: string | null;
  isoCountry: string | null;
}

export default smsAccountService;
