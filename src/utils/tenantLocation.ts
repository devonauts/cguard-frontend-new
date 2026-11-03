/**
 * Caches the tenant's (business) default map center and country in localStorage
 * so that map components and phone inputs can use the correct business locale
 * without hardcoding any values.
 */

/**
 * ════════════════════════════════════════════════════════════════════════════
 * DÓNDE ABRE UN MAPA CUANDO NO SE SABE NADA
 *
 * Estas coordenadas son Quito, y estaban COPIADAS a mano en doce componentes
 * distintos —`AddressAutocomplete`, `GoogleMapEmbed`, el selector de puntos de
 * ronda, la geocerca de la estación, el centro de operaciones, los mapas de
 * GPS…—. Cada copia era un sitio más donde un tenant mexicano veía su mapa
 * abrirse sobre Ecuador, y arreglarlo significaba encontrarlas todas.
 *
 * Es un RESPALDO, no un defecto de producto: lo primero que se mira siempre es
 * la ubicación de la empresa (`getTenantLocation`), que se cachea al entrar.
 * Esto sólo decide qué se ve mientras eso no esté disponible — un tenant recién
 * creado, o el instante antes de que responda la petición.
 *
 * `centroPorDefecto()` ya aplica ese orden. Úsala en vez de escribir números.
 * ════════════════════════════════════════════════════════════════════════════
 */
export const CENTRO_DE_RESPALDO = { lat: -0.2295, lng: -78.5236 } as const;

/**
 * El centro con el que abrir un mapa: la empresa si se sabe dónde está, y el
 * respaldo si no. Un solo sitio, para que cambiarlo sea cambiarlo de verdad.
 */
export function centroPorDefecto(): { lat: number; lng: number } {
  const biz = getTenantLocation();

  return biz ? { lat: biz.lat, lng: biz.lng } : { ...CENTRO_DE_RESPALDO };
}

const LAT_KEY = "tenantLat";
const LNG_KEY = "tenantLng";
const COUNTRY_KEY = "tenantCountry";
const TZ_KEY = "tenantTimeZone";

/** Cache the tenant IANA timezone (single source of truth for time display). */
export function cacheTenantTimezone(tz: string | null | undefined): void {
  if (!tz || typeof tz !== "string") return;
  try {
    localStorage.setItem(TZ_KEY, tz.trim());
  } catch {}
}

/** The cached tenant timezone, or undefined (callers then use device tz). */
export function getTenantTimezone(): string | undefined {
  try {
    const tz = localStorage.getItem(TZ_KEY) || undefined;

    // A zone newer than this browser's tz data («America/Ciudad_Juarez» on an
    // older Safari) made every `timeZone: getTenantTimezone()` throw a
    // RangeError: it is treated as unset, so callers use the device zone.
    if (tz) new Intl.DateTimeFormat("en-US", { timeZone: tz });

    return tz;
  } catch {}

  return undefined;
}

export function cacheTenantLocation(
  lat: number | string | null | undefined,
  lng: number | string | null | undefined,
): void {
  const latNum = typeof lat === "string" ? parseFloat(lat) : (lat ?? NaN);
  const lngNum = typeof lng === "string" ? parseFloat(lng) : (lng ?? NaN);

  if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) return;
  try {
    localStorage.setItem(LAT_KEY, String(latNum));
    localStorage.setItem(LNG_KEY, String(lngNum));
  } catch {}
}

export function getTenantLocation(): { lat: number; lng: number } | null {
  try {
    const lat = parseFloat(localStorage.getItem(LAT_KEY) || "");
    const lng = parseFloat(localStorage.getItem(LNG_KEY) || "");

    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  } catch {}

  return null;
}

export function clearTenantLocation(): void {
  try {
    localStorage.removeItem(LAT_KEY);
    localStorage.removeItem(LNG_KEY);
  } catch {}
}

/** Stores a 2-letter ISO country code (e.g. "EC", "US") for phone dial-code defaulting. */
export function cacheTenantCountry(
  countryCode: string | null | undefined,
): void {
  if (!countryCode || typeof countryCode !== "string") return;
  const normalized = countryCode.trim().toUpperCase();

  if (normalized.length < 2) return;
  try {
    localStorage.setItem(COUNTRY_KEY, normalized);
  } catch {}
}

/** Returns the cached ISO-2 country code, or null if not set. */
export function getTenantCountry(): string | null {
  try {
    return localStorage.getItem(COUNTRY_KEY);
  } catch {}

  return null;
}

export function clearTenantCountry(): void {
  try {
    localStorage.removeItem(COUNTRY_KEY);
  } catch {}
}
