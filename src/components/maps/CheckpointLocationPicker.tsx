import { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Circle, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useChartColors } from '@/lib/chartColors';
import { metrosEntre } from '@/utils/mapMotion';
import { formatearCoord, formatearDistancia } from '@/utils/geoMedidas';
import '@/styles/map.css';

// Quito fallback when nothing is set yet.
const FALLBACK: [number, number] = [-0.2295, -78.5236];

/**
 * Pin del punto de control.
 *
 * ── POR QUÉ AQUÍ NO VALE `var(--brand)` ────────────────────────────────────
 * El icono se inyecta como cadena de HTML en un `divIcon` de Leaflet y el color
 * viaja en ATRIBUTOS de presentación de SVG (`fill=`, `stroke=`), donde el
 * navegador NO sustituye variables CSS: quedaría un pin sin pintar. Lo mismo le
 * pasa a `pathOptions` del `Circle`, que Leaflet escribe como atributo.
 *
 * Por eso el color se RESUELVE en JavaScript con `useChartColors()`, que es
 * exactamente el puente que `lib/chartColors.ts` existe para dar: devuelve el
 * acento ya calculado (`oklch(0.72 …)`) y se vuelve a leer solo cuando el
 * usuario cambia de tema o de acento. Con `#C8860A` cocido, el pin se quedaba
 * dorado aunque el CRM entero pasara a violeta.
 *
 * El contorno blanco SÍ es literal a propósito: separa el pin de la fotografía
 * del mapa, que es la misma imagen en tema claro y en oscuro.
 */
function crearPin(color: string) {
  return L.divIcon({
    className: 'cp-pin',
    html:
      `<svg width="30" height="42" viewBox="0 0 24 36" xmlns="http://www.w3.org/2000/svg"` +
      ` style="transition:transform .16s ease, filter .16s ease;transform-origin:50% 100%">` +
      `<path fill="${color}" stroke="#ffffff" stroke-width="1.5" d="M12 0C5.37 0 0 5.37 0 12c0 8.5 12 24 12 24s12-15.5 12-24C24 5.37 18.63 0 12 0z"/>` +
      `<circle cx="12" cy="12" r="4.5" fill="#ffffff"/></svg>`,
    iconSize: [30, 42],
    iconAnchor: [15, 42],
  });
}

function ClickToPlace({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onPick(e.latlng.lat, e.latlng.lng) });
  return null;
}

function Recenter({ lat, lng }: { lat: number | null; lng: number | null }) {
  const map = useMap();
  useEffect(() => {
    if (lat != null && lng != null) map.setView([lat, lng], map.getZoom(), { animate: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng]);
  return null;
}

/**
 * ¿Sirve este radio?
 *
 * El listón no es estético. El GPS de un teléfono acierta a 5-20 m a cielo
 * abierto y bastante peor pegado a una fachada o dentro de un zaguán, que es
 * donde están los puntos de control. Un radio por DEBAJO de ese error rechaza
 * escaneos legítimos —el vigilante está delante del punto y el sistema dice que
 * no—, y uno demasiado ancho da por bueno un escaneo desde la acera de enfrente.
 */
function juzgarRadio(radio: number): { texto: string; color: string } {
  if (radio < 20) {
    return {
      texto: 'Radio por debajo del error normal del GPS: puede rechazar escaneos válidos.',
      color: 'var(--bad-text)',
    };
  }
  if (radio < 30) {
    return {
      texto: 'Radio justo: con GPS flojo o bajo techo puede fallar algún escaneo.',
      color: 'var(--warn-text)',
    };
  }
  if (radio > 150) {
    return {
      texto: 'Radio muy amplio: daría por válido un escaneo desde fuera del edificio.',
      color: 'var(--warn-text)',
    };
  }
  return {
    texto: 'Radio adecuado: absorbe el error del GPS sin dar por válido lo que está lejos.',
    color: 'var(--ok-text)',
  };
}

export default function CheckpointLocationPicker({
  lat,
  lng,
  radius,
  onChange,
  reference,
}: {
  lat: number | null;
  lng: number | null;
  radius: number;
  onChange: (lat: number, lng: number, radius: number) => void;
  /** Punto de referencia (el puesto). Con él, la lectura dice «a 34 m del
   *  puesto», que es la comprobación que de verdad importa aquí: una dirección
   *  postal no distingue el vestíbulo de la azotea, y una distancia sí. */
  reference?: { lat: number; lng: number; label?: string } | null;
}) {
  const hasPin = lat != null && lng != null;
  const center: [number, number] = hasPin ? [lat as number, lng as number] : FALLBACK;

  // Paleta viva: se vuelve a leer sola al cambiar el tema o el acento.
  const paleta = useChartColors();
  const pinIcon = useMemo(() => crearPin(paleta.brand), [paleta.brand]);

  // Posición MIENTRAS se arrastra. El aviso al formulario sigue saliendo sólo al
  // soltar (como antes); esto es únicamente lo que se ve moverse.
  const [viva, setViva] = useState<{ lat: number; lng: number } | null>(null);
  const [arrastrando, setArrastrando] = useState(false);
  const cuadroRef = useRef(0);

  useEffect(() => () => cancelAnimationFrame(cuadroRef.current), []);

  const punto = viva ?? (hasPin ? { lat: lat as number, lng: lng as number } : null);
  const refValida =
    reference && Number.isFinite(reference.lat) && Number.isFinite(reference.lng) ? reference : null;
  const separacion = punto && refValida ? metrosEntre(refValida, punto) : null;

  const veredicto = juzgarRadio(radius);

  /** Levanta el pin mientras va cogido: es la única señal de «lo tengo» que hay
   *  en una pantalla táctil. Se toca el SVG y no el nodo del marcador porque
   *  Leaflet reescribe el `transform` del marcador en cada fotograma. */
  const levantar = (marcador: L.Marker, activo: boolean) => {
    const svg = marcador.getElement()?.querySelector('svg') as SVGElement | null;
    if (!svg) return;
    svg.style.transform = activo ? 'translateY(-7px) scale(1.1)' : '';
    svg.style.filter = activo ? 'drop-shadow(0 9px 10px rgba(0,0,0,.35))' : '';
  };

  return (
    <div className="space-y-2">
      <div className="cc-map-frame rounded-xl border" style={{ height: 320, borderColor: 'var(--hairline)' }}>
        <MapContainer
          center={center}
          zoom={hasPin ? 17 : 13}
          scrollWheelZoom
          className="cc-map-canvas"
          style={{ height: '100%', width: '100%' }}
        >
          {/* Las teselas de OpenStreetMap sólo existen en claro. En tema oscuro
              se invierten y se les devuelve el tono para que el mapa no sea el
              único rectángulo blanco de la pantalla. Va como variante de utilidad
              porque las hojas de estilo del mapa son territorio de otro. */}
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            className="dark:[filter:invert(1)_hue-rotate(180deg)_brightness(0.92)_contrast(0.88)]"
          />
          <ClickToPlace onPick={(la, ln) => onChange(la, ln, radius)} />
          <Recenter lat={lat} lng={lng} />

          {/* El puesto, para poder juzgar si el punto de control cae donde debe. */}
          {refValida && (
            <Circle
              center={[refValida.lat, refValida.lng]}
              radius={6}
              pathOptions={{ color: paleta.brand, weight: 2, fillColor: paleta.brand, fillOpacity: 0.5, dashArray: '2 4' }}
            />
          )}

          {punto && (
            <>
              <Marker
                position={[punto.lat, punto.lng]}
                draggable
                icon={pinIcon}
                eventHandlers={{
                  dragstart: (e) => {
                    setArrastrando(true);
                    levantar(e.target as L.Marker, true);
                  },
                  drag: (e) => {
                    const p = (e.target as L.Marker).getLatLng();
                    cancelAnimationFrame(cuadroRef.current);
                    cuadroRef.current = requestAnimationFrame(() => setViva({ lat: p.lat, lng: p.lng }));
                  },
                  dragend: (e) => {
                    cancelAnimationFrame(cuadroRef.current);
                    setArrastrando(false);
                    levantar(e.target as L.Marker, false);
                    const p = (e.target as L.Marker).getLatLng();
                    setViva(null);
                    onChange(p.lat, p.lng, radius);
                  },
                }}
              />
              {radius > 0 && (
                <Circle
                  center={[punto.lat, punto.lng]}
                  radius={radius}
                  pathOptions={{ color: paleta.brand, weight: 1.5, fillColor: paleta.brand, fillOpacity: 0.12 }}
                />
              )}
            </>
          )}
        </MapContainer>

        {/* La lectura. Antes «arrastra el pin» era a ciegas: se soltaba y no había
            forma de saber dónde había caído ni si seguía perteneciendo al puesto. */}
        <div className="cc-map-hud" style={{ left: 10, right: 10, bottom: 10 }}>
          <div className="cc-map-card px-2.5 py-2">
            <div className="cc-map-eyebrow">
              {arrastrando ? 'Suelta para fijar el punto' : punto ? 'Punto de control' : 'Sin ubicación'}
            </div>
            {punto ? (
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]">
                <span className="font-mono tabular-nums" style={{ color: 'var(--ink-soft)' }}>
                  {formatearCoord(punto.lat, punto.lng)}
                </span>
                {separacion != null && (
                  <span
                    className="font-semibold"
                    style={{ color: separacion > 500 ? 'var(--warn-text)' : 'var(--ink)' }}
                  >
                    · a {formatearDistancia(separacion)} {reference?.label ? `de ${reference.label}` : 'del puesto'}
                  </span>
                )}
              </div>
            ) : (
              <div className="mt-0.5 text-[11px]" style={{ color: 'var(--ink-soft)' }}>
                Toca el mapa para colocarlo.
              </div>
            )}
          </div>
        </div>
      </div>

      <p className="text-[11px]" style={{ color: 'var(--ink-faint)' }}>
        Toca el mapa o arrastra el pin para fijar la ubicación exacta del punto.
      </p>

      {separacion != null && separacion > 500 && (
        <p className="text-[11px]" style={{ color: 'var(--warn-text)' }}>
          Este punto está a {formatearDistancia(separacion)} del puesto. Revisa que pertenezca a esta ronda.
        </p>
      )}

      {/* Coverage radius */}
      <div className="glass-sunken p-3">
        <div className="mb-1 flex items-center justify-between text-sm">
          <span className="font-medium" style={{ color: 'var(--ink)' }}>Radio de cobertura</span>
          <span className="font-mono tabular-nums" style={{ color: 'var(--brand-text)' }}>{radius} m</span>
        </div>
        <input
          type="range"
          min={10}
          max={300}
          step={5}
          value={radius}
          onChange={(e) => onChange(lat ?? FALLBACK[0], lng ?? FALLBACK[1], Number(e.target.value))}
          className="cg-focus w-full"
          style={{ accentColor: 'var(--brand)' }}
          disabled={!hasPin}
        />
        <p className="mt-1 text-[11px]" style={{ color: 'var(--ink-faint)' }}>
          El vigilante debe estar dentro de este radio para que el escaneo cuente como válido.
        </p>
        <p className="mt-1 text-[11px]" style={{ color: veredicto.color }}>
          {veredicto.texto}
        </p>
      </div>
    </div>
  );
}
