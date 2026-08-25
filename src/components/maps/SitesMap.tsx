import { useMemo } from 'react';
import { MapPin } from 'lucide-react';
import GoogleMapEmbed, { type MapEmbedMarker } from '@/components/GoogleMap/GoogleMapEmbed';
import StaticMapImage from '@/components/maps/StaticMapImage';
import { mapPopupActions, mapPopupItems } from '@/components/maps/MapPopup';

/**
 * Todas las sedes de un cliente sobre un mapa.
 *
 * ── POR QUÉ NO VALE `IncidentMap` ───────────────────────────────────────────
 * `IncidentMap` responde a "dónde pasó esto": UNA coordenada, UNA chincheta. El
 * resumen de un cliente responde a otra pregunta —"dónde opero para él"— y esa
 * respuesta son N sedes repartidas. Pintar sólo la dirección fiscal del cliente
 * era engañoso: marcaba una oficina donde a lo mejor no hay ni un vigilante, y
 * dejaba fuera las sedes que sí importan.
 *
 * ── EL ENCUADRE ES LA PIEZA CLAVE ───────────────────────────────────────────
 * Con varias chinchetas no hay "centro" que valga. La miniatura estática se pide
 * SIN `center` ni `zoom` (la API encuadra sola) y el mapa interactivo usa
 * `fitMarkers`, que calcula el rectángulo que las contiene. Centrar en la
 * primera dejaría al resto fuera de la pantalla.
 *
 * Se mantiene la disciplina de coste de `StaticMapImage`: imagen estática
 * ($2/1.000) hasta que alguien pulsa; sólo entonces se construye el mapa
 * dinámico ($7/1.000).
 */

export interface SedeEnMapa {
  id: string;
  name: string;
  address?: string | null;
  city?: string | null;
  lat?: number | string | null;
  lng?: number | string | null;
  /** Cuántas estaciones tiene, para el globo. */
  stations?: number;
  /** Cuántos vigilantes asignados, para el globo y el color de la chincheta. */
  guards?: number;
}

interface Props {
  sedes: SedeEnMapa[];
  /** Dirección del propio cliente. Es el plan B cuando NINGUNA sede tiene
   *  coordenadas todavía — mejor enseñar dónde está el cliente que un hueco,
   *  pero se dice claramente que eso es lo que se está viendo. */
  clienteFallback?: { lat?: number | null; lng?: number | null; label?: string } | null;
  height?: string;
  /** Ir a la sede desde el globo. */
  onSedeClick?: (id: string) => void;
  /** Texto del hueco cuando no hay absolutamente nada que pintar. */
  textoVacio?: string;
}

const num = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n !== 0 ? n : null;
};

export default function SitesMap({
  sedes,
  clienteFallback,
  height = '300px',
  onSedeClick,
  textoVacio = 'Sin ubicación registrada',
}: Props) {
  // Sólo las sedes geolocalizadas. Una sede sin coordenadas no se puede pintar,
  // pero tampoco puede tumbar el mapa de las demás.
  const conCoords = useMemo(
    () =>
      (sedes || [])
        .map((s) => ({ s, lat: num(s.lat), lng: num(s.lng) }))
        .filter((r): r is { s: SedeEnMapa; lat: number; lng: number } => r.lat !== null && r.lng !== null),
    [sedes],
  );

  const markers = useMemo<MapEmbedMarker[]>(
    () =>
      conCoords.map(({ s, lat, lng }) => ({
        id: String(s.id),
        lat,
        lng,
        label: s.name,
        kind: 'site' as const,
        subtitle: [s.address, s.city].filter(Boolean).join(' · ') || undefined,
        // Sede sin vigilantes = chincheta apagada. Es la misma lectura que la
        // tabla de "Estado de sedes" de debajo, para que no se contradigan.
        role: (s.guards ?? 0) > 0 ? undefined : 'muted',
        status:
          (s.guards ?? 0) > 0
            ? { label: 'Operativa', tone: 'ok' as const }
            : { label: 'Sin operación', tone: 'neutral' as const },
      })),
    [conCoords],
  );

  const puntos = useMemo(() => conCoords.map(({ lat, lng }) => ({ lat, lng })), [conCoords]);

  const porId = useMemo(() => {
    const m = new Map<string, SedeEnMapa>();
    conCoords.forEach(({ s }) => m.set(String(s.id), s));
    return m;
  }, [conCoords]);

  const fbLat = num(clienteFallback?.lat);
  const fbLng = num(clienteFallback?.lng);

  // ── Nada que pintar ────────────────────────────────────────────────────────
  if (markers.length === 0 && (fbLat === null || fbLng === null)) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed text-sm"
        style={{ height, borderColor: 'var(--hairline)', background: 'var(--glass-sunken)', color: 'var(--ink-soft)' }}
      >
        <MapPin className="h-5 w-5 opacity-50" /> {textoVacio}
      </div>
    );
  }

  // ── Plan B: ninguna sede geolocalizada, se enseña al cliente ───────────────
  if (markers.length === 0) {
    return (
      <div className="relative overflow-hidden rounded-xl border" style={{ borderColor: 'var(--hairline)' }}>
        <StaticMapImage lat={fbLat} lng={fbLng} zoom={14} height={height} alt="Mapa del cliente" className="w-full">
          <div style={{ height }}>
            <GoogleMapEmbed lat={fbLat!} lng={fbLng!} zoom={14} mapType="roadmap" draggable={false} />
          </div>
        </StaticMapImage>
        <span
          className="pointer-events-none absolute left-2 top-2 rounded-md px-2 py-1 text-[11px] font-medium"
          style={{ background: 'var(--float)', color: 'var(--ink-soft)', border: '1px solid var(--hairline)' }}
        >
          Dirección del cliente · las sedes aún no tienen ubicación
        </span>
      </div>
    );
  }

  // ── Lo normal: las sedes ───────────────────────────────────────────────────
  return (
    <div className="overflow-hidden rounded-xl border" style={{ borderColor: 'var(--hairline)' }}>
      <StaticMapImage points={puntos} height={height} alt="Mapa de las sedes del cliente" className="w-full">
        <div style={{ height }}>
          <GoogleMapEmbed
            markers={markers}
            fitMarkers
            zoom={14}
            mapType="roadmap"
            draggable={false}
            markerPopup={(m) => {
              const s = porId.get(m.id);
              if (!s) return null;
              return {
                fields: mapPopupItems(
                  s.address || s.city
                    ? { label: 'Dirección', value: [s.address, s.city].filter(Boolean).join(', '), wide: true }
                    : null,
                ),
                metrics: [
                  { label: 'Estaciones', value: s.stations ?? 0 },
                  { label: 'Vigilantes', value: s.guards ?? 0 },
                ],
                actions: mapPopupItems(
                  onSedeClick ? mapPopupActions.detail(() => onSedeClick(String(s.id)), 'Ver sede') : null,
                  mapPopupActions.directions(m.lat, m.lng),
                ),
              };
            }}
          />
        </div>
      </StaticMapImage>
    </div>
  );
}
