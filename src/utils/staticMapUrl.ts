/**
 * Constructor de URLs para la Maps Static API.
 *
 * ── POR QUÉ ─────────────────────────────────────────────────────────────────
 * Un mapa dinámico (`new google.maps.Map()`) se factura a $7/1.000 CARGAS, y una
 * miniatura que nadie va a arrastrar cuesta exactamente lo mismo que el centro de
 * mando. La Maps Static API cuesta $2/1.000 (−71 %), tiene su propio cupo gratis
 * de 10.000 y además no necesita cargar la librería de JavaScript: es un `<img>`.
 *
 * ── LA REGLA QUE HACE QUE FUNCIONE: URL DETERMINISTA ────────────────────────
 * Misma latitud, longitud, tamaño y zoom → MISMA cadena de URL → el navegador la
 * sirve de su caché HTTP y Google no ve la segunda petición. Por eso aquí no hay
 * nada aleatorio, ni marcas de tiempo, ni el orden de parámetros al azar: las
 * coordenadas se redondean a 6 decimales (~11 cm, sobra) para que dos lecturas
 * del mismo punto no generen dos URLs distintas. `worker-app/src/lib/station.ts`
 * ya seguía esta disciplina; esto es la versión del CRM.
 *
 * `scale=2` entrega el doble de densidad para pantallas retina y sigue contando
 * como UNA petición.
 */

const KEY = (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY as
  | string
  | undefined;

/** Máximo que acepta la API por lado (antes de `scale`). */
const MAX_LADO = 640;

export interface StaticMapOptions {
  zoom?: number;
  width?: number;
  height?: number;
  mapType?: "roadmap" | "satellite" | "hybrid" | "terrain";
  /** Color del pin en formato `0xRRGGBB`. */
  markerColor?: string;
  /** Polígono a dibujar (geocerca). */
  polygon?: Array<{ lat: number; lng: number }> | null;
  /** Radio en metros: se dibuja como polígono aproximado (la API no trae círculos). */
  radiusMeters?: number | null;
}

function redondear(n: number): string {
  return n.toFixed(6).replace(/\.?0+$/, "");
}

/**
 * Aproxima un círculo con un polígono.
 *
 * La Static API no tiene primitiva de círculo — sólo `path` — así que una
 * geocerca por radio hay que dibujarla a mano. 24 vértices dan un contorno que a
 * tamaño de miniatura es indistinguible de un círculo, y la corrección por
 * `cos(lat)` evita que salga un óvalo al alejarse del ecuador.
 */
function circuloComoPoligono(
  lat: number,
  lng: number,
  metros: number,
  vertices = 24,
): Array<{ lat: number; lng: number }> {
  const gradosPorMetroLat = 1 / 111_320;
  const gradosPorMetroLng =
    1 / (111_320 * Math.cos((lat * Math.PI) / 180) || 1);
  const puntos: Array<{ lat: number; lng: number }> = [];

  for (let i = 0; i < vertices; i++) {
    const ang = (i / vertices) * 2 * Math.PI;

    puntos.push({
      lat: lat + metros * gradosPorMetroLat * Math.sin(ang),
      lng: lng + metros * gradosPorMetroLng * Math.cos(ang),
    });
  }

  return puntos;
}

/** `true` cuando hay clave configurada; sin ella no se puede pedir imagen. */
export function staticMapsAvailable(): boolean {
  return !!KEY;
}

/**
 * Devuelve la URL de la imagen, o `null` si no se puede construir (sin clave o
 * coordenadas inservibles). `null` significa "usa el mapa interactivo".
 */
export function staticMapUrl(
  lat: unknown,
  lng: unknown,
  opts: StaticMapOptions = {},
): string | null {
  const la = Number(lat);
  const ln = Number(lng);

  if (!KEY) return null;
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return null;
  if (la === 0 && ln === 0) return null;

  const {
    zoom = 15,
    width = 640,
    height = 320,
    mapType = "roadmap",
    markerColor = "0xC8860A",
    polygon = null,
    radiusMeters = null,
  } = opts;

  const w = Math.min(Math.round(width), MAX_LADO);
  const h = Math.min(Math.round(height), MAX_LADO);
  const centro = `${redondear(la)},${redondear(ln)}`;

  const params = new URLSearchParams({
    center: centro,
    zoom: String(zoom),
    size: `${w}x${h}`,
    scale: "2",
    maptype: mapType,
    key: KEY,
  });

  // `markers` y `path` se añaden a mano porque llevan `|`, que URLSearchParams
  // escaparía a `%7C`; la API lo acepta, pero deja la URL ilegible al depurar.
  let url = `https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`;

  url += `&markers=color:${markerColor}%7C${centro}`;

  const trazo =
    polygon && polygon.length >= 3
      ? polygon
      : radiusMeters && radiusMeters > 0
        ? circuloComoPoligono(la, ln, radiusMeters)
        : null;

  if (trazo) {
    const puntos = trazo
      .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))
      .map((p) => `${redondear(p.lat)},${redondear(p.lng)}`);

    if (puntos.length >= 3) {
      // Se cierra el contorno explícitamente: la API no lo hace sola.
      puntos.push(puntos[0]);
      url += `&path=color:${markerColor}%7Cweight:2%7Cfillcolor:0x00000022%7C${puntos.join("%7C")}`;
    }
  }

  return url;
}

/** Un punto de la versión de varias chinchetas. */
export interface StaticMapPoint {
  lat: unknown;
  lng: unknown;
}

/**
 * La misma miniatura, pero con VARIAS chinchetas y encuadre automático.
 *
 * La diferencia real está en lo que NO se manda: sin `center` ni `zoom`, la
 * Maps Static API encuadra sola el rectángulo que contiene a todos los
 * marcadores. Es la única forma de que un cliente con sedes repartidas por la
 * ciudad se vea entero en una imagen — fijar el centro en la primera deja al
 * resto fuera del encuadre.
 *
 * Con un solo punto sí se fija centro y zoom (`staticMapUrl`): el encuadre
 * automático de un único marcador se va al zoom máximo y no se entiende nada.
 * Sigue siendo UNA petición y la URL sigue siendo determinista.
 */
export function staticMapUrlMulti(
  points: StaticMapPoint[],
  opts: Omit<StaticMapOptions, "polygon" | "radiusMeters"> = {},
): string | null {
  if (!KEY) return null;

  const validos = (points || [])
    .map((p) => ({ lat: Number(p?.lat), lng: Number(p?.lng) }))
    .filter(
      (p) =>
        Number.isFinite(p.lat) &&
        Number.isFinite(p.lng) &&
        !(p.lat === 0 && p.lng === 0),
    );

  if (validos.length === 0) return null;
  if (validos.length === 1)
    return staticMapUrl(validos[0].lat, validos[0].lng, opts);

  const {
    width = 640,
    height = 320,
    mapType = "roadmap",
    markerColor = "0xC8860A",
  } = opts;

  const w = Math.min(Math.round(width), MAX_LADO);
  const h = Math.min(Math.round(height), MAX_LADO);

  const params = new URLSearchParams({
    size: `${w}x${h}`,
    scale: "2",
    maptype: mapType,
    key: KEY,
  });

  const chinchetas = validos
    .map((p) => `${redondear(p.lat)},${redondear(p.lng)}`)
    .join("%7C");

  return (
    `https://maps.googleapis.com/maps/api/staticmap?${params.toString()}` +
    `&markers=color:${markerColor}%7C${chinchetas}`
  );
}

export default staticMapUrl;
