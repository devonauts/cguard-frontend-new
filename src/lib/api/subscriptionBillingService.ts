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
  /** Partner-billed only: the maximum seats its partner set (null/absent =
   *  none). Sent only while a superadmin lets that partner manage seats. */
  seatCap?: number | null;
  seatsRemaining?: number | null;
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
  /**
   * A resolved plan for direct companies. For partner-billed companies
   * (`reseller_managed`) the server sends just the plan's name as a string.
   */
  plan?: PlanResolution | string | null;
}

/** The plan's display name, whichever of the two shapes the server sent. */
export function nombreDelPlan(plan: BillingSummary["plan"]): string | null {
  if (typeof plan === "string") return plan.trim() || null;
  return plan?.name || plan?.key || null;
}

/** The plan's key, only when the server sent a resolved plan. */
export function claveDelPlan(plan: BillingSummary["plan"]): string | null {
  return plan && typeof plan === "object" ? plan.key : null;
}

export interface BillableUser {
  id: string;
  /** El id del USUARIO — con éste se quita o se reactiva. */
  userId: string | null;
  name: string;
  email: string | null;
  roles: string[];
  status: string | null;
  /** Por qué NO se cobra. Ausente = se cobra. */
  excludedReason?: "archived" | "demo" | "duplicate" | "pending";
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
  /**
   * Quién se cobra. Con `todos`, vienen TAMBIÉN los que no se cobran
   * —archivados, de ejemplo, duplicados— cada uno con su motivo, que es lo que
   * permite devolverlos a la factura desde la propia pantalla.
   */
  users(todos = false): Promise<BillableUser[]> {
    return ApiService.get(
      `/tenant/${tenantId()}/subscription/users${todos ? "?all=1" : ""}`,
    );
  },

  /**
   * Dejar de pagar por alguien. Archiva su membresía: el servidor le revoca las
   * sesiones y le cierra la entrada en TODOS los canales. Por eso la pantalla
   * lo dice sin rodeos — no es «quitarlo de la factura», es sacarlo del sistema.
   */
  quitarUsuario(userId: string): Promise<any> {
    return ApiService.post(`/tenant/${tenantId()}/user/${userId}/suspend`, {});
  },

  /** Devolverlo: recupera el acceso y vuelve a la factura. */
  reactivarUsuario(userId: string): Promise<any> {
    return ApiService.post(`/tenant/${tenantId()}/user/${userId}/restore`, {});
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
