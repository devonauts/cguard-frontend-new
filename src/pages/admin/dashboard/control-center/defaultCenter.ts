/**
 * Resolve the Operations map's default center.
 *
 * Priority:
 *   1. company coordinates (tenant.latitude/longitude)
 *   2. company address geocoded via the backend Nominatim proxy (/geocode/search)
 *   3. the viewer's country, from an IP geolocation lookup
 *   4. a final hardcoded fallback
 *
 * Address and IP lookups are cached in localStorage so the dashboard doesn't hit
 * the network on every load.
 */
import { searchGeocode } from "@/lib/geocodeClient";
import { CENTRO_DE_RESPALDO } from "@/utils/tenantLocation";

export type CenterSource = "company" | "company-address" | "ip" | "fallback";
export interface MapCenter {
  lat: number;
  lng: number;
  zoom: number;
  source: CenterSource;
}

const FINAL_FALLBACK: MapCenter = {
  ...CENTRO_DE_RESPALDO,
  zoom: 11,
  source: "fallback",
};

/** Loose shape of the tenant record used only for map-center resolution. */
interface TenantLike {
  latitude?: number | string | null;
  longitude?: number | string | null;
  address?: string | null;
  country?: string | null;
  name?: string | null;
}

const num = (v: unknown): number | null => {
  const n = parseFloat(v as string);

  return Number.isFinite(n) ? n : null;
};

/** Loose shape of the IP-geolocation responses (ipwho.is / ipapi.co). */
interface IpGeoResponse {
  success?: boolean;
  error?: boolean | string;
  latitude?: number | string;
  longitude?: number | string;
}

function readCache<T>(key: string, maxAgeMs: number): T | null {
  try {
    const raw = localStorage.getItem(key);

    if (!raw) return null;
    const { t, v } = JSON.parse(raw);

    if (!t || Date.now() - t > maxAgeMs) return null;

    return v as T;
  } catch {
    return null;
  }
}

function writeCache(key: string, v: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify({ t: Date.now(), v }));
  } catch {
    /* localStorage full / unavailable — ignore, it's only a cache */
  }
}

/** Country-level center derived from the viewer's IP. Cached 24h. Null on failure. */
async function ipCenter(): Promise<MapCenter | null> {
  const cached = readCache<MapCenter>("cc_ip_center", 24 * 3600 * 1000);

  if (cached) return cached;

  const tryFetch = async (
    url: string,
    pick: (
      j: IpGeoResponse,
    ) => [number | string | undefined, number | string | undefined] | null,
  ): Promise<MapCenter | null> => {
    try {
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), 4000);
      const res = await fetch(url, { signal: ctrl.signal });

      clearTimeout(to);
      if (!res.ok) return null;
      const picked = pick(await res.json());

      if (!picked) return null;
      const lat = num(picked[0]);
      const lng = num(picked[1]);

      if (lat == null || lng == null) return null;

      return { lat, lng, zoom: 5, source: "ip" };
    } catch {
      return null;
    }
  };

  const c =
    (await tryFetch("https://ipwho.is/", (j) =>
      j && j.success !== false ? [j.latitude, j.longitude] : null,
    )) ||
    (await tryFetch("https://ipapi.co/json/", (j) =>
      j && !j.error ? [j.latitude, j.longitude] : null,
    ));

  if (c) writeCache("cc_ip_center", c);

  return c;
}

/** Geocode the company address via the backend proxy. Cached 7d per address. */
async function addressCenter(
  address: string,
  country?: string,
): Promise<MapCenter | null> {
  const q = [address, country].filter(Boolean).join(", ").trim();

  if (!q) return null;
  const key = `cc_addr_center:${q}`;
  const cached = readCache<MapCenter>(key, 7 * 24 * 3600 * 1000);

  if (cached) return cached;
  try {
    const results = await searchGeocode(q, { limit: "1" });
    const first = Array.isArray(results) ? results[0] : null;
    const lat = num(first?.lat);
    const lng = num(first?.lon ?? first?.lng);

    if (lat == null || lng == null) return null;
    const c: MapCenter = { lat, lng, zoom: 13, source: "company-address" };

    writeCache(key, c);

    return c;
  } catch {
    return null;
  }
}

/** Synchronous company-coordinate center (no network), or undefined when unset. */
export function companyCenter(
  tenant: TenantLike | null | undefined,
): MapCenter | undefined {
  const lat = num(tenant?.latitude);
  const lng = num(tenant?.longitude);

  return lat != null && lng != null
    ? { lat, lng, zoom: 13, source: "company" }
    : undefined;
}

/** Full async resolution following the priority order above. Never rejects. */
export async function resolveDefaultCenter(
  tenant: TenantLike | null | undefined,
): Promise<MapCenter> {
  const direct = companyCenter(tenant);

  if (direct) return direct;
  const byAddress = tenant?.address
    ? await addressCenter(
        String(tenant.address),
        tenant?.country ? String(tenant.country) : undefined,
      )
    : null;

  if (byAddress) return byAddress;
  const byIp = await ipCenter();

  if (byIp) return byIp;

  return FINAL_FALLBACK;
}
