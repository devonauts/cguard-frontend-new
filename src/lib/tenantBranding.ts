/**
 * Tenant branding (company name + logo URL) cache.
 *
 * The sidebar lives inside AppLayout, which every page re-mounts on navigation.
 * Without a cache the sidebar reset its state to empty and re-fetched the tenant
 * on every click, so the logo/name flickered through the "CG / CGuard"
 * placeholder each time. This module holds the resolved branding in:
 *   - a module-level variable (survives component re-mounts within a session), and
 *   - localStorage (survives full reloads + feeds the boot LoadingScreen),
 * so the sidebar can render synchronously and only hit the API once per tenant.
 *
 * Call invalidateTenantBranding() after the tenant logo/name changes (e.g. the
 * onboarding wizard uploading a logo) so the next read re-fetches.
 */
export interface TenantBranding {
  tenantId: string;
  name: string;
  logo: string | null;
}

const LOGO_KEY = "tenantLogoUrl";
const NAME_KEY = "tenantName";

let memoryCache: TenantBranding | null = null;

/** In-memory branding for this tenant if already loaded this session, else null. */
export function getCachedTenantBranding(
  tenantId: string,
): TenantBranding | null {
  return memoryCache && memoryCache.tenantId === tenantId ? memoryCache : null;
}

/** Synchronous best-effort branding from localStorage (used to seed initial UI state). */
export function getStoredTenantBranding(): {
  name: string;
  logo: string | null;
} {
  try {
    return {
      name: localStorage.getItem(NAME_KEY) || "",
      logo: localStorage.getItem(LOGO_KEY) || null,
    };
  } catch {
    return { name: "", logo: null };
  }
}

/** Persist resolved branding to both the memory cache and localStorage. */
export function setTenantBranding(b: TenantBranding): void {
  memoryCache = b;
  try {
    if (b.logo) localStorage.setItem(LOGO_KEY, b.logo);
    else localStorage.removeItem(LOGO_KEY);
    if (b.name) localStorage.setItem(NAME_KEY, b.name);
    else localStorage.removeItem(NAME_KEY);
  } catch {
    /* ignore */
  }
}

/** Drop the cache so the next read re-fetches (call after the logo/name changes). */
export function invalidateTenantBranding(): void {
  memoryCache = null;
}
