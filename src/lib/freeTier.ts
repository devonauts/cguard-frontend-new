import { currentTenantEntry } from "@/lib/entitlements";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * FREE TIER («Plan gratis») — a company CGuard Pro never bills.
 *
 * Only a platform superadmin puts a company on it (backend
 * `lib/freeTier.ts`). For the CRM it means: no trial countdown, no paywall, no
 * «activate / pay» prompt, no checkout. The billing screen just says the
 * company is on the free plan, without the reason.
 *
 * What the server sends:
 *  - `/auth/me`, each `tenants[]` entry: `freeTier: true` (direct AND partner
 *    companies) and, for a direct company, `billingStatus: 'free'`.
 *  - `/subscription/summary`: `status: 'free'` for a direct company.
 *  - `/partner-billing`: `{ enabled: false, status: 'free', freeTier: true }`.
 *
 * Every check reads BOTH signals (flag or status) so an older session that
 * only carries one of them still behaves.
 * ════════════════════════════════════════════════════════════════════════════
 */

export const FREE_BILLING_STATUS = "free";

const isTrue = (v: unknown): boolean => v === true || v === 1 || v === "1";

const isFreeStatus = (v: unknown): boolean =>
  String(v ?? "").toLowerCase() === FREE_BILLING_STATUS;

/**
 * Is this tenant entry (an `/auth/me` `tenants[]` item, its nested `tenant`
 * relation, or a plain tenant row) on the free tier?
 */
export function isFreeTierTenant(entry: any): boolean {
  if (!entry || typeof entry !== "object") return false;
  if (isTrue(entry.freeTier) || isFreeStatus(entry.billingStatus)) return true;
  const rel = entry.tenant;

  if (rel && typeof rel === "object" && rel !== entry)
    return isTrue(rel.freeTier) || isFreeStatus(rel.billingStatus);

  return false;
}

/** Is the user's CURRENT company on the free tier? Superadmins never are. */
export function isFreeTierUser(user: any): boolean {
  if (!user || user.isSuperadmin === true) return false;

  return isFreeTierTenant(currentTenantEntry(user));
}

/**
 * Same question without React, for the HTTP clients: reads the session copy
 * the AuthContext keeps in `localStorage` (`authUserCache`). Unknown → false.
 */
export function isFreeTierSession(): boolean {
  try {
    const raw = localStorage.getItem("authUserCache");

    if (!raw) return false;

    return isFreeTierUser(JSON.parse(raw)?.user);
  } catch {
    return false;
  }
}

/** `/subscription/summary` of a direct free company. */
export function isFreeTierSummary(
  summary: { status?: string | null } | null | undefined,
): boolean {
  return isFreeStatus(summary?.status);
}

/** `/partner-billing` of a free partner company. */
export function isFreeTierPartnerBilling(
  cobro: { status?: string | null; freeTier?: boolean } | null | undefined,
): boolean {
  return !!cobro && (isTrue(cobro.freeTier) || isFreeStatus(cobro.status));
}

/**
 * Module store reasons that ask a free company to pay or to fix its
 * subscription. The server answers them because a free company has no paid
 * subscription; for the CRM they become `plan_gratis` (no billing link).
 */
const PAYMENT_REASONS = new Set([
  "suscripcion_no_activa",
  "implementacion_sin_pagar",
  "sin_suscripcion",
  "sin_cliente_stripe",
]);

export const FREE_TIER_STORE_REASON = "plan_gratis";

export function storeReasonForCompany(
  reason: string | null | undefined,
  freeTier: boolean,
): string | null {
  if (!reason) return reason ?? null;
  if (freeTier && PAYMENT_REASONS.has(reason)) return FREE_TIER_STORE_REASON;

  return reason;
}
