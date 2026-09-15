import { ApiService } from "@/services/api/apiService";

const tenantId = (): string => {
  const t = localStorage.getItem("tenantId");

  if (!t)
    throw new Error(
      "No pudimos identificar tu empresa. Cierra sesión y vuelve a entrar.",
    );

  return t;
};

export interface BillingQuote {
  seats: number;
  perUserCents: number;
  platformFeeCents: number;
  monthlyCents: number;
  implementationCents: number;
  firstChargeCents: number;
  currency: string;
  netMonthlyCents: number;
}

export interface PlanResolution {
  key: string | null;
  name: string | null;
  features: string[];
  seatCap: number | null;
  seatsRemaining: number | null;
  overLimit: boolean;
}

/** Los datos del distribuidor que factura, cuando lo hace uno. */
export interface ManagedByProvider {
  name: string | null;
  supportEmail: string | null;
  supportPhone: string | null;
}

export interface BillingSummary {
  /** `reseller_managed` cuando factura un distribuidor: entonces no hay
   *  suscripción de CGuard Pro, ni prueba, ni precio por usuario que enseñar. */
  status: string; // trialing | active | past_due | trial_expired | canceled | reseller_managed
  /** `'reseller'` = la relación de cobro es con el distribuidor, no con nosotros. */
  billingOwnership?: "direct" | "reseller";
  managedBy?: ManagedByProvider | null;
  trial: {
    endsAt: string | null;
    daysLeft: number;
    active: boolean;
    expired: boolean;
  };
  seats: number;
  implementationPaid: boolean;
  hasSubscription: boolean;
  quote: BillingQuote;
  trialDays: number;
  plan?: PlanResolution;
}

export interface BillableUser {
  id: string;
  name: string;
  email: string | null;
  roles: string[];
  status: string | null;
}

export interface PlatformInvoice {
  id: string;
  stripeInvoiceId: string;
  number: string | null;
  status: string; // draft | open | paid | void | uncollectible
  amountDueCents: number;
  amountPaidCents: number;
  currency: string;
  periodStart: string | null;
  periodEnd: string | null;
  hostedInvoiceUrl: string | null;
  invoicePdfUrl: string | null;
  linesSummary: string | null;
  paidAt: string | null;
  issuedAt: string | null;
}

export const subscriptionBillingService = {
  summary(): Promise<BillingSummary> {
    return ApiService.get(`/tenant/${tenantId()}/subscription/summary`);
  },
  /** The users counted as billable seats (who the tenant pays for). */
  users(): Promise<BillableUser[]> {
    return ApiService.get(`/tenant/${tenantId()}/subscription/users`);
  },
  /** Returns a Stripe Checkout URL to redirect to. */
  checkout(): Promise<{ url: string; id: string }> {
    return ApiService.post(`/tenant/${tenantId()}/subscription/checkout`, {});
  },
  /** Returns a Stripe Customer Portal URL to add/update the card & manage autopay. */
  portal(): Promise<{ url: string }> {
    return ApiService.post(`/tenant/${tenantId()}/subscription/portal`, {});
  },
  /** Stripe invoice history (refreshed server-side), with hosted/PDF links. */
  invoices(): Promise<PlatformInvoice[]> {
    return ApiService.get(`/tenant/${tenantId()}/subscription/invoices`);
  },
};

export default subscriptionBillingService;
