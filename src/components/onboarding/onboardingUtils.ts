
import { localeActual } from '@/lib/localeActual'
// Shared helpers for the first-login business onboarding feature.
// Keeps tenant extraction, completeness, trial math and timezone options
// consistent across the wizard, banner, header badge and provider.

export interface OnboardingTenant {
  id: string | null;
  name?: string;
  businessTitle?: string;
  taxNumber?: string;
  phone?: string;
  email?: string;
  address?: string;
  addressLine2?: string;
  city?: string;
  country?: string;
  postalCode?: string;
  latitude?: number | string | null;
  longitude?: number | string | null;
  timezone?: string;
  website?: string;
  licenseNumber?: string;
  logoId?: string | null;
  logoUrl?: string | null;
  trialEndsAt?: string | null;
  billingStatus?: string | null;
  onboardingCompleted?: boolean;
  raw?: any;
}

// Required fields (besides logo) that must be present for "business is set up".
export const REQUIRED_FIELDS: Array<{ key: keyof OnboardingTenant; label: string }> = [
  { key: "name", label: "Nombre de la empresa" },
  { key: "businessTitle", label: "Razón social" },
  { key: "taxNumber", label: "RUC / Cédula" },
  { key: "phone", label: "Teléfono" },
  { key: "email", label: "Correo electrónico" },
  { key: "address", label: "Dirección" },
  { key: "timezone", label: "Zona horaria" },
];

const firstNonEmpty = (...vals: any[]) => {
  for (const v of vals) {
    if (v !== undefined && v !== null && String(v).trim() !== "") return v;
  }
  return undefined;
};

// Pick the active tenant relation from a user object, mirroring the logic
// used elsewhere (localStorage tenantId -> match, else first entry), and
// normalize the nested `tenant` relation fields the backend now provides.
export function extractOnboardingTenant(user: any): OnboardingTenant | null {
  if (!user) return null;

  let entry: any = null;
  const storedId = typeof window !== "undefined" ? localStorage.getItem("tenantId") : null;

  if (Array.isArray(user.tenants) && user.tenants.length > 0) {
    if (storedId) {
      entry = user.tenants.find(
        (t: any) =>
          t?.tenantId === storedId ||
          (t?.tenant && (t.tenant.id === storedId || t.tenant.tenantId === storedId)),
      );
    }
    if (!entry) entry = user.tenants[0];
  }
  if (!entry && user.tenant) entry = user.tenant;
  if (!entry) return null;

  // The tenant relation may be nested under `.tenant`, or fields may live
  // directly on the entry (single-tenant shape).
  const rel = entry.tenant && typeof entry.tenant === "object" ? entry.tenant : entry;

  const id =
    entry.tenantId ||
    rel?.id ||
    rel?.tenantId ||
    entry.id ||
    null;

  // Resolve a logo: a logoId field, or any logo url found in settings.
  let logoUrl: string | null = null;
  try {
    const settings = rel?.settings;
    const fromSettings = Array.isArray(settings)
      ? settings[0]?.logoUrl
      : settings && (settings.logoUrl || settings.logos?.[0]?.publicUrl || settings.logos?.[0]?.privateUrl);
    logoUrl = rel?.logoUrl || fromSettings || (rel?.logo && (rel.logo.publicUrl || rel.logo.downloadUrl)) || null;
  } catch {
    logoUrl = rel?.logoUrl || null;
  }

  // logoId can come straight from the relation, or be inferred from settings.
  let logoId: string | null = null;
  try {
    const settings = rel?.settings;
    const settingsLogo = Array.isArray(settings) ? settings[0]?.logos?.[0] : settings?.logos?.[0];
    logoId = rel?.logoId || settingsLogo?.id || (logoUrl ? "settings" : null) || null;
  } catch {
    logoId = rel?.logoId || (logoUrl ? "settings" : null);
  }

  // billing / trial / onboarding come from either the entry or the relation.
  const trialEndsAt = firstNonEmpty(entry.trialEndsAt, rel?.trialEndsAt) ?? null;
  const billingStatus = firstNonEmpty(entry.billingStatus, rel?.billingStatus) ?? null;
  const onboardingCompleted = Boolean(
    entry.onboardingCompleted ?? rel?.onboardingCompleted ?? false,
  );

  return {
    id: id ? String(id) : null,
    name: firstNonEmpty(rel?.name, entry.tenantName),
    businessTitle: rel?.businessTitle,
    taxNumber: rel?.taxNumber,
    phone: rel?.phone,
    email: rel?.email,
    address: rel?.address,
    addressLine2: rel?.addressLine2,
    city: rel?.city,
    country: rel?.country,
    postalCode: rel?.postalCode,
    latitude: rel?.latitude ?? null,
    longitude: rel?.longitude ?? null,
    timezone: rel?.timezone,
    website: rel?.website,
    licenseNumber: rel?.licenseNumber,
    logoId,
    logoUrl,
    trialEndsAt,
    billingStatus,
    onboardingCompleted,
    raw: rel,
  };
}

// List of required fields/items still missing for "business is set up".
export function getMissingFields(t: OnboardingTenant | null): string[] {
  if (!t) return REQUIRED_FIELDS.map((f) => f.label).concat("Logo");
  const missing: string[] = [];
  for (const f of REQUIRED_FIELDS) {
    const v = (t as any)[f.key];
    if (v === undefined || v === null || String(v).trim() === "") missing.push(f.label);
  }
  if (!t.logoId) missing.push("Logo");
  return missing;
}

// "Business is set up" requires ALL required fields AND a logo.
export function isBusinessSetUp(t: OnboardingTenant | null): boolean {
  return getMissingFields(t).length === 0;
}

// True while onboarding still needs attention (not completed AND not fully set up).
export function needsOnboarding(t: OnboardingTenant | null): boolean {
  if (!t) return false;
  if (t.onboardingCompleted) return false;
  return !isBusinessSetUp(t);
}

// Days remaining until trial end (rounded up, never below 0).
export function trialDaysLeft(trialEndsAt?: string | null): number | null {
  if (!trialEndsAt) return null;
  const end = new Date(trialEndsAt).getTime();
  if (Number.isNaN(end)) return null;
  const diff = end - Date.now();
  if (diff <= 0) return 0;
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export function formatTrialEndDate(trialEndsAt?: string | null): string | null {
  if (!trialEndsAt) return null;
  const d = new Date(trialEndsAt);
  if (Number.isNaN(d.getTime())) return null;
  try {
    return d.toLocaleDateString(localeActual(), { day: "numeric", month: "long", year: "numeric" });
  } catch {
    return d.toLocaleDateString();
  }
}

export const isTrialing = (billingStatus?: string | null) =>
  (billingStatus || "").toLowerCase() === "trialing";

// Timezone helper + options, mirrored from ProfileCompanyForm.
const COUNTRY_TZ: Record<string, string> = {
  ecuador: "America/Guayaquil", ec: "America/Guayaquil",
  colombia: "America/Bogota", co: "America/Bogota",
  peru: "America/Lima", "perú": "America/Lima", pe: "America/Lima",
  mexico: "America/Mexico_City", "méxico": "America/Mexico_City", mx: "America/Mexico_City",
  panama: "America/Panama", "panamá": "America/Panama", pa: "America/Panama",
  chile: "America/Santiago", cl: "America/Santiago",
  argentina: "America/Buenos_Aires", ar: "America/Buenos_Aires",
  venezuela: "America/Caracas", ve: "America/Caracas",
  bolivia: "America/La_Paz", bo: "America/La_Paz",
  spain: "Europe/Madrid", "españa": "Europe/Madrid", es: "Europe/Madrid",
};

export function tzFromText(...vals: (string | undefined)[]): string | null {
  const hay = vals.filter(Boolean).join(" ").toLowerCase();
  if (!hay) return null;
  for (const key of Object.keys(COUNTRY_TZ)) {
    if (hay.includes(key)) return COUNTRY_TZ[key];
  }
  return null;
}

export const TIMEZONE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "America/Guayaquil", label: "UTC-5 Quito (America/Guayaquil)" },
  { value: "America/Bogota", label: "UTC-5 Bogotá (America/Bogota)" },
  { value: "America/Lima", label: "UTC-5 Lima (America/Lima)" },
  { value: "America/Mexico_City", label: "UTC-6 Ciudad de México" },
  { value: "America/Santiago", label: "UTC-3 Santiago" },
  { value: "America/Buenos_Aires", label: "UTC-3 Buenos Aires" },
  { value: "Europe/Madrid", label: "UTC+1 Madrid" },
  { value: "UTC", label: "UTC" },
];

export const DEFAULT_TIMEZONE = "America/Guayaquil";

// localStorage key used to snooze auto-opening the wizard after "Completar más tarde".
export const snoozeKey = (tenantId: string) => `cg_onboarding_snoozed_${tenantId}`;
