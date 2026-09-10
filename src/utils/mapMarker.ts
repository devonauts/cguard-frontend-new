/**
 * Create a map marker that prefers the modern `AdvancedMarkerElement` and
 * gracefully falls back to the (deprecated but still-functional) `Marker`.
 *
 * AdvancedMarkerElement only renders on a map that has a Google Cloud **Map ID**
 * — so this uses it only when the map was created with a `mapId` AND the marker
 * library is loaded; otherwise it keeps the legacy Marker (no regression). To
 * activate advanced markers app-wide, create a Map ID in Google Cloud console
 * and set `VITE_GOOGLE_MAPS_MAP_ID`; maps that opt into `mapIdIfConfigured()`
 * then render advanced markers and the deprecation warning goes away.
 *
 * Returns a uniform `{ remove() }` so callers manage overlays the same way
 * regardless of which marker type was used.
 */
import { tokenHex } from "./mapTheme";

export interface MapMarkerHandle {
  remove: () => void;
}

export interface MapMarkerOptions {
  position: { lat: number; lng: number };
  title?: string;
  /** Fill/background colour of the dot/pin. */
  color?: string;
  /** Legacy-marker circle scale (advanced pins auto-size). */
  scale?: number;
}

/** The configured Map ID, or undefined. Pass to `new google.maps.Map({ mapId })`. */
export function mapIdIfConfigured(): string | undefined {
  const id = (import.meta as any).env?.VITE_GOOGLE_MAPS_MAP_ID as
    | string
    | undefined;

  return id && String(id).trim() ? String(id).trim() : undefined;
}

export function createMapMarker(
  map: any,
  opts: MapMarkerOptions,
): MapMarkerHandle {
  const g = (window as any).google;
  const AdvancedMarkerElement = g?.maps?.marker?.AdvancedMarkerElement;
  const PinElement = g?.maps?.marker?.PinElement;
  // AdvancedMarkerElement requires the map to carry a mapId to render.
  const hasMapId = !!(map && (map.get?.("mapId") || (map as any).mapId));

  // El color por defecto sale del acento configurable, no de un dorado escrito a
  // mano: la API de Google exige una cadena, así que se lee de la variable en
  // tiempo de ejecución. Ver `utils/mapTheme.ts`.
  const relleno = opts.color || tokenHex("--brand");
  const canto = tokenHex("--glass-solid");
  const tinta = tokenHex("--brand-ink");

  if (AdvancedMarkerElement && PinElement && hasMapId) {
    try {
      const pin = new PinElement({
        background: relleno,
        borderColor: canto,
        glyphColor: tinta,
        scale: 0.9,
      });
      const m = new AdvancedMarkerElement({
        map,
        position: opts.position,
        title: opts.title,
        content: pin.element,
      });

      return {
        remove: () => {
          m.map = null;
        },
      };
    } catch {
      /* fall through to legacy marker */
    }
  }

  const marker = new g.maps.Marker({
    map,
    position: opts.position,
    title: opts.title,
    icon: {
      path: g.maps.SymbolPath.CIRCLE,
      scale: opts.scale ?? 7,
      fillColor: relleno,
      fillOpacity: 1,
      strokeColor: canto,
      strokeWeight: 2,
    },
  });

  return { remove: () => marker.setMap(null) };
}
