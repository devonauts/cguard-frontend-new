/**
 * Frontend entitlement helpers — read the current tenant's plan features and
 * billing state off the authenticated user (populated by /auth/me and signin).
 *
 * FAIL OPEN: when the plan features are absent (older session, superadmin, or
 * an unconfigured catalog) every feature is treated as allowed. Gating only
 * removes a feature when the backend explicitly returns a feature list that
 * omits it — so nothing breaks until a superadmin narrows a tier.
 */

/** Canonical gateable feature keys (mirror of backend lib/entitlements.ts). */
export const FEATURE_KEYS = [
  "rondas",
  "video",
  "entrenamiento",
  "messaging",
  "radio",
  "tasks",
  "passdowns",
  "scheduling",
  "reports",
  "multi_client",
  "supervisor_app",
  "panic_sos",
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];

/**
 * MÓDULOS ADICIONALES (espejo de `backend/src/lib/modulosAdicionales.ts`).
 * Se compran aparte con un pago único y, al revés que las funciones de arriba,
 * FALLAN CERRADO: sin constancia de compra, no se tienen. Por eso no están en
 * `FEATURE_KEYS`.
 */
export const MODULE_KEYS = ["sucursales", "vigia_pro"] as const;

export type ModuleKey = (typeof MODULE_KEYS)[number];

export function isModuleKey(key: string): key is ModuleKey {
  return (MODULE_KEYS as readonly string[]).includes(key);
}

function persistedTenantId(): string | null {
  try {
    return localStorage.getItem("tenantId");
  } catch {
    return null;
  }
}

/** The user's current tenant membership entry (by persisted tenantId, else first). */
export function currentTenantEntry(user: any): any | null {
  if (!user) return null;
  const list: any[] = Array.isArray(user.tenants) ? user.tenants : [];

  if (list.length) {
    const tid = persistedTenantId();

    if (tid) {
      const match = list.find(
        (t) =>
          t.tenantId === tid ||
          (t.tenant && (t.tenant.id === tid || t.tenant.tenantId === tid)),
      );

      if (match) return match;
    }

    return list[0];
  }
  // Single-tenant shape.
  if (user.tenant) return user.tenant;

  return null;
}

/** The tenant's plan feature list, or null when unknown (→ fail open). */
export function getPlanFeatures(user: any): string[] | null {
  const entry = currentTenantEntry(user);
  const feats = entry?.planFeatures;

  return Array.isArray(feats) ? feats : null;
}

/**
 * Whether the current tenant is entitled to a feature. Fail-open on unknown —
 * EXCEPT a módulo adicional, which fails closed (it is paid for).
 */
export function hasFeature(user: any, key: string): boolean {
  const feats = getPlanFeatures(user);

  if (isModuleKey(key)) return Array.isArray(feats) && feats.includes(key);

  if (!feats || feats.length === 0) return true; // fail open

  return feats.includes(key);
}

export interface BillingState {
  billingStatus: string | null;
  suspendedAt: string | null;
}

/** The current tenant's billing/suspension state for the lockout gate. */
export function getBillingState(user: any): BillingState {
  const entry = currentTenantEntry(user);

  return {
    billingStatus: entry?.billingStatus ?? null,
    suspendedAt: entry?.suspendedAt ?? null,
  };
}
