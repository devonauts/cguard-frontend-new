import { resolveApiBase } from "@/lib/apiBase";
import { avisarUsoGoogle } from "@/utils/mapPool";
/**
 * Dirección → coordenadas, por el backend en vez de por el navegador.
 *
 * ── QUÉ SUSTITUYE ───────────────────────────────────────────────────────────
 * A `new google.maps.Geocoder()`. Ese camino factura una petición de Geocoding
 * API (~5 USD / 1.000) cada vez que alguien abre una ficha, porque el navegador
 * no recuerda nada entre pestañas ni entre usuarios: la misma sede la pagan
 * cinco personas del mismo turno, y la vuelven a pagar mañana.
 *
 * ── LA CADENA ENTERA (la parte cara está en el servidor) ────────────────────
 *   1. `sessionStorage` de esta pestaña — cero red al volver a la misma ficha.
 *   2. `geocode_cache` del backend — compartida entre todos los usuarios, todas
 *      las empresas y todos los reinicios.
 *   3. Nominatim (OpenStreetMap) — gratis, ya desplegado.
 *   4. Google — sólo si Nominatim no sabe responder, y una única vez por
 *      dirección en la vida del sistema, porque el resultado se guarda.
 * Los pasos 2-4 los resuelve `GET /api/geocode/address`; aquí sólo se ve el 1.
 *
 * ── POR QUÉ HAY RESPALDO AL GEOCODIFICADOR DEL NAVEGADOR ────────────────────
 * Si el backend no puede responder (501 sin clave, corte de red, 429) se vuelve
 * al camino de siempre en vez de dejar la ficha sin coordenadas. Esto está en el
 * alta de clientes y de puestos, y un ahorro que rompe un alta no es un ahorro.
 * El respaldo cuesta lo mismo que costaba antes, ni más.
 */

const API_BASE = (
  resolveApiBase() ?? "http://localhost:3001/api"
).replace(/\/+$/, "");
const SS_PREFIX = "geocache:";
/** Caché en memoria de la pestaña (se pierde al recargar, como debe). */
const MEM_DIRECCIONES = new Map<string, any[]>();
/** Vigencia en la pestaña. Corta a propósito: el servidor ya guarda el largo. */
const SS_TTL_MS = 60 * 60 * 1000;

export interface GeocodedAddress {
  address: string;
  city: string;
  postalCode: string;
  country: string;
  latitude: number;
  longitude: number;
  formattedAddress: string;
}

export interface GeocodeOptions {
  region?: string;
  language?: string;
  /** `false` para no recurrir a `google.maps.Geocoder` si el servidor no puede. */
  allowClientFallback?: boolean;
}

function ssKey(q: string, o: GeocodeOptions): string {
  return `${SS_PREFIX}${q.trim().toLowerCase()}|${o.region || ""}|${o.language || ""}`;
}

function readSession(key: string): any | null {
  try {
    const raw = sessionStorage.getItem(key);

    if (!raw) return null;
    const { at, data } = JSON.parse(raw);

    if (!at || Date.now() - at > SS_TTL_MS) {
      sessionStorage.removeItem(key);

      return null;
    }

    return data;
  } catch {
    return null;
  }
}

function writeSession(key: string, data: any): void {
  try {
    sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), data }));
  } catch {
    /* cuota llena o modo privado: la caché del servidor sigue cubriendo */
  }
}

/** Extrae los campos que usan los formularios de un resultado de Google. */
export function parseGeocodeResult(result: any): GeocodedAddress | null {
  const loc = result?.geometry?.location;

  if (!loc) return null;

  // El REST devuelve números; el SDK del navegador, funciones. Se aceptan ambos.
  const lat = typeof loc.lat === "function" ? loc.lat() : Number(loc.lat);
  const lng = typeof loc.lng === "function" ? loc.lng() : Number(loc.lng);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const comps: Record<string, string> = {};

  (result.address_components || []).forEach((c: any) => {
    (c.types || []).forEach((t: string) => {
      if (!comps[t]) comps[t] = c.long_name;
    });
  });

  return {
    formattedAddress: result.formatted_address || "",
    address: result.formatted_address || "",
    city:
      comps.locality ||
      comps.administrative_area_level_2 ||
      comps.sublocality_level_1 ||
      comps.administrative_area_level_1 ||
      "",
    postalCode: comps.postal_code || "",
    country: comps.country || "",
    latitude: lat,
    longitude: lng,
  };
}

async function viaBrowser(query: string, opts: GeocodeOptions): Promise<any[]> {
  const { results } = await geocodificarEnNavegador(
    { address: query, ...(opts.region ? { region: opts.region } : {}) },
    "geocode-fallback",
  );

  return results;
}

/* ── EL GEOCODIFICADOR DEL NAVEGADOR, CON MEMORIA ────────────────────────────
   Todo `google.maps.Geocoder().geocode` del CRM pasa por aquí. La misma
   petición dentro de la pestaña sale de la memoria (o de `sessionStorage`, con
   la misma vigencia corta que arriba) y no vuelve a Google. Nada se guarda más
   allá de la sesión: las condiciones de Google sólo permiten una caché temporal
   de su contenido. Cada petición que SÍ sale se anuncia como `cg:google-uso`
   (sku `geocoding`) para la telemetría de consumo; un acierto de caché no. */
const MEM_GEO = new Map<string, any[]>();
const SS_GEO = "geocache-sdk:";

/** Devuelve a los resultados guardados en JSON sus `LatLng`/`LatLngBounds`. */
function rehidratar(results: any[]): any[] {
  const g = (window as any).google?.maps;

  if (!g) return results;

  return results.map((r) => {
    const geo = r?.geometry;

    if (!geo) return r;
    const loc = geo.location;
    const vp = geo.viewport;

    return {
      ...r,
      geometry: {
        ...geo,
        location:
          loc && typeof loc.lat !== "function"
            ? new g.LatLng(Number(loc.lat), Number(loc.lng))
            : loc,
        viewport:
          vp && typeof vp.getCenter !== "function" && vp.south != null
            ? new g.LatLngBounds(
                { lat: vp.south, lng: vp.west },
                { lat: vp.north, lng: vp.east },
              )
            : vp,
      },
    };
  });
}

export async function geocodificarEnNavegador(
  request: Record<string, unknown>,
  area: string,
): Promise<{ results: any[]; status: string }> {
  const google = (window as any).google;

  if (!google?.maps?.Geocoder) return { results: [], status: "UNAVAILABLE" };
  const clave = JSON.stringify(request);
  const enMemoria = MEM_GEO.get(clave);

  if (enMemoria) return { results: enMemoria, status: "OK" };
  const guardado = readSession(SS_GEO + clave);

  if (Array.isArray(guardado) && guardado.length) {
    const vivos = rehidratar(guardado);

    MEM_GEO.set(clave, vivos);

    return { results: vivos, status: "OK" };
  }

  avisarUsoGoogle("geocoding", area);

  return new Promise((resolve) => {
    try {
      new google.maps.Geocoder().geocode(
        request,
        (res: any[] | null, status: string) => {
          const results = status === "OK" ? res || [] : [];

          if (results.length) {
            MEM_GEO.set(clave, results);
            writeSession(SS_GEO + clave, results);
          }
          resolve({ results, status });
        },
      );
    } catch {
      resolve({ results: [], status: "ERROR" });
    }
  });
}

/**
 * Devuelve los resultados crudos de Google (`results[]`), vengan de donde vengan.
 * Se mantiene el formato de Google para que quien ya lo parseaba no cambie.
 */
export async function geocodeRaw(
  query: string,
  opts: GeocodeOptions = {},
): Promise<any[]> {
  const q = String(query || "").trim();

  if (!q) return [];

  const key = ssKey(q, opts);
  // Memoria primero (la misma dirección en la misma pestaña no toca ni el
  // `sessionStorage` ni la red), luego la pestaña, luego el servidor.
  const enMemoria = MEM_DIRECCIONES.get(key);

  if (enMemoria) return enMemoria;
  const hot = readSession(key);

  if (hot) {
    MEM_DIRECCIONES.set(key, hot);

    return hot;
  }

  const params = new URLSearchParams({ q });

  if (opts.region) params.set("region", opts.region);
  if (opts.language) params.set("language", opts.language);

  try {
    const token = localStorage.getItem("authToken");
    const res = await fetch(
      `${API_BASE}/geocode/address?${params.toString()}`,
      {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      },
    );

    if (res.ok) {
      const body = await res.json();
      const results = Array.isArray(body?.results) ? body.results : [];

      if (results.length) {
        writeSession(key, results);
        MEM_DIRECCIONES.set(key, results);
      }

      return results;
    }

    // 501 = el servidor no tiene clave de Maps. Cualquier otro fallo (red, 429,
    // 502) también cae al respaldo: es preferible pagar una petición a dejar el
    // formulario sin coordenadas.
    if (opts.allowClientFallback === false) return [];
  } catch {
    if (opts.allowClientFallback === false) return [];
  }

  const results = await viaBrowser(q, opts);

  if (results.length) {
    writeSession(key, results);
    MEM_DIRECCIONES.set(key, results);
  }

  return results;
}

/** Atajo: el primer resultado ya desmenuzado, o `null`. */
export async function geocodeAddress(
  query: string,
  opts: GeocodeOptions = {},
): Promise<GeocodedAddress | null> {
  const results = await geocodeRaw(query, opts);

  return results.length ? parseGeocodeResult(results[0]) : null;
}

export default { geocodeAddress, geocodeRaw, parseGeocodeResult };
