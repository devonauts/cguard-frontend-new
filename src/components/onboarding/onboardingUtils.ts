import i18n from "@/i18n";
import { localeActual } from "@/lib/localeActual";
import { taxIdLabelFor } from "@/lib/validators/id";
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
  /** `'reseller'` = a esta empresa la factura su distribuidor, no CGuard Pro. */
  billingOwnership?: string | null;
  onboardingCompleted?: boolean;
  raw?: any;
}

// Required fields (besides logo) that must be present for "business is set up".
// OJO: constante de módulo — se evalúa al cargar, así que aquí NO se llama a
// t(). Cada campo lleva su CLAVE (labelKey) y el texto se traduce donde se
// pinta (OnboardingBanner).
export const REQUIRED_FIELDS: Array<{
  key: keyof OnboardingTenant;
  label: string;
  labelKey: string;
}> = [
  {
    key: "name",
    label: "Nombre de la empresa",
    labelKey: "onboarding.requiredFields.name",
  },
  {
    key: "businessTitle",
    label: "Razón social",
    labelKey: "onboarding.requiredFields.businessTitle",
  },
  // OJO: la etiqueta de taxNumber NO se traduce por esta clave, se resuelve por
  // país en `etiquetaDeCampo` — ver el comentario de esa función.
  {
    key: "taxNumber",
    label: "Identificación fiscal",
    labelKey: "onboarding.requiredFields.taxNumberGeneric",
  },
  {
    key: "phone",
    label: "Teléfono",
    labelKey: "onboarding.requiredFields.phone",
  },
  {
    key: "email",
    label: "Correo electrónico",
    labelKey: "onboarding.requiredFields.email",
  },
  {
    key: "address",
    label: "Dirección",
    labelKey: "onboarding.requiredFields.address",
  },
  {
    key: "timezone",
    label: "Zona horaria",
    labelKey: "onboarding.requiredFields.timezone",
  },
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
  const storedId =
    typeof window !== "undefined" ? localStorage.getItem("tenantId") : null;

  if (Array.isArray(user.tenants) && user.tenants.length > 0) {
    if (storedId) {
      entry = user.tenants.find(
        (t: any) =>
          t?.tenantId === storedId ||
          (t?.tenant &&
            (t.tenant.id === storedId || t.tenant.tenantId === storedId)),
      );
    }
    if (!entry) entry = user.tenants[0];
  }
  if (!entry && user.tenant) entry = user.tenant;
  if (!entry) return null;

  // The tenant relation may be nested under `.tenant`, or fields may live
  // directly on the entry (single-tenant shape).
  const rel =
    entry.tenant && typeof entry.tenant === "object" ? entry.tenant : entry;

  const id = entry.tenantId || rel?.id || rel?.tenantId || entry.id || null;

  // Resolve a logo: a logoId field, or any logo url found in settings.
  let logoUrl: string | null = null;

  try {
    const settings = rel?.settings;
    const fromSettings = Array.isArray(settings)
      ? settings[0]?.logoUrl
      : settings &&
        (settings.logoUrl ||
          settings.logos?.[0]?.publicUrl ||
          settings.logos?.[0]?.privateUrl);

    logoUrl =
      rel?.logoUrl ||
      fromSettings ||
      (rel?.logo && (rel.logo.publicUrl || rel.logo.downloadUrl)) ||
      null;
  } catch {
    logoUrl = rel?.logoUrl || null;
  }

  // logoId can come straight from the relation, or be inferred from settings.
  let logoId: string | null = null;

  try {
    const settings = rel?.settings;
    const settingsLogo = Array.isArray(settings)
      ? settings[0]?.logos?.[0]
      : settings?.logos?.[0];

    logoId =
      rel?.logoId || settingsLogo?.id || (logoUrl ? "settings" : null) || null;
  } catch {
    logoId = rel?.logoId || (logoUrl ? "settings" : null);
  }

  // billing / trial / onboarding come from either the entry or the relation.
  const trialEndsAt =
    firstNonEmpty(entry.trialEndsAt, rel?.trialEndsAt) ?? null;
  const billingStatus =
    firstNonEmpty(entry.billingStatus, rel?.billingStatus) ?? null;
  const billingOwnership =
    firstNonEmpty(entry.billingOwnership, rel?.billingOwnership) ?? "direct";
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
    billingOwnership,
    onboardingCompleted,
    raw: rel,
  };
}

/**
 * Cómo se llama cada campo que falta en el aviso «Faltan: …».
 *
 * El identificador fiscal se nombra SEGÚN EL PAÍS del tenant. Antes decía
 * «RUC / Cédula» a todo el mundo: a una empresa mexicana se le pedía un
 * documento ecuatoriano que no existe en su país, y no había forma de saber que
 * lo que faltaba era su RFC.
 */
function etiquetaDeCampo(
  f: { key: keyof OnboardingTenant; label: string; labelKey: string },
  t: OnboardingTenant | null,
): string {
  if (f.key === "taxNumber") {
    const propio = taxIdLabelFor(t?.country);

    if (propio) return propio;
  }

  return i18n.t(f.labelKey, f.label);
}

// List of required fields/items still missing for "business is set up".
export function getMissingFields(t: OnboardingTenant | null): string[] {
  const rot = (f: {
    key: keyof OnboardingTenant;
    label: string;
    labelKey: string;
  }) => etiquetaDeCampo(f, t);
  const logo = i18n.t("onboarding.requiredFields.logo", "Logo");

  if (!t) return REQUIRED_FIELDS.map(rot).concat(logo);
  const missing: string[] = [];

  for (const f of REQUIRED_FIELDS) {
    const v = (t as any)[f.key];

    if (v === undefined || v === null || String(v).trim() === "")
      missing.push(rot(f));
  }
  if (!t.logoId) missing.push(logo);

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
    return d.toLocaleDateString(localeActual(), {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return d.toLocaleDateString();
  }
}

export const isTrialing = (billingStatus?: string | null) =>
  (billingStatus || "").toLowerCase() === "trialing";

/**
 * ¿Le factura un distribuidor a esta empresa?
 *
 * Cuando la respuesta es sí, CGuard Pro no tiene relación de cobro con ella:
 * no hay prueba corriendo, no hay tarjeta, no hay precio por usuario. Todo lo
 * que hable de nuestra suscripción se esconde — no por estética, sino porque
 * enseñárselo la llevaría a intentar pagar aquí una factura que le cobra otro.
 */
export const esFacturadaPorProveedor = (billingOwnership?: string | null) =>
  (billingOwnership || "direct").toLowerCase() === "reseller";

/**
 * Zonas horarias: se reexportan desde `@/lib/timezones`.
 *
 * Aquí vivía una copia literal de OCHO zonas latinoamericanas —la otra copia
 * estaba en ProfileCompanyForm— y un `tzFromText` que buscaba subcadenas de dos
 * letras en la dirección entera. Los nombres se conservan porque el asistente
 * de alta importa de este módulo; la implementación es una sola y está allí,
 * con el porqué de cada decisión.
 */
export {
  TIMEZONE_OPTIONS,
  DEFAULT_TIMEZONE,
  tzFromText,
  COUNTRY_TZ,
} from "@/lib/timezones";

// localStorage key used to snooze auto-opening the wizard after "Completar más tarde".
export const snoozeKey = (tenantId: string) =>
  `cg_onboarding_snoozed_${tenantId}`;
