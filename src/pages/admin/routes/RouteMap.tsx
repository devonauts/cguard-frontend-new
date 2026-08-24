import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { loadGoogleMaps } from '@/utils/loadGoogleMaps';
import { estiloMapa, huella, pielDe, useMapPalette } from '@/utils/mapTheme';
import { chipPin, iconoDe, orbPin } from '@/utils/mapPins';
import { metrosEntre, useMotorMapa } from '@/utils/mapMotion';
import { useMapPopup, mapPopupActions, mapPopupItems, type MapPopupData } from '@/components/maps/MapPopup';
import { formatearDistancia, formatearMinutos, estimarMinutos } from '@/utils/geoMedidas';
import { iconInnerSvg } from '../dashboard/control-center/iconRegistry';
import { leerTrazado, type Coord, type ExtremoRuta } from './routeOptimizacion';
import '@/styles/map.css';

/**
 * ════════════════════════════════════════════════════════════════════════════
 * EL RECORRIDO, DIBUJADO
 *
 * Una ruta de supervisión es una SECUENCIA, no un puñado de chinchetas. Lo que
 * este mapa añade sobre una lista de puestos es exactamente eso: el orden se ve
 * (paradas numeradas), el sentido se ve (flechas SOBRE la línea) y los extremos
 * se distinguen de las paradas (origen y destino llevan glifo, no número).
 *
 * ── LAS FLECHAS SON GRATIS ──────────────────────────────────────────────────
 * Van como `icons` de la polilínea con `SymbolPath.FORWARD_CLOSED_ARROW`: es un
 * símbolo vectorial que dibuja la propia polilínea, sin una sola petición ni un
 * marcador extra. Poner un marcador por tramo era la otra opción y en una ruta
 * de treinta paradas son treinta objetos más que mover en cada `idle`.
 *
 * ── LÍNEA RECTA POR OMISIÓN ─────────────────────────────────────────────────
 * El trazado por calles se FACTURA. Por eso aquí, por omisión, la línea une las
 * paradas en recto y se ETIQUETA como tal en el rótulo («en línea recta»): una
 * estimación honesta vale más que una cifra exacta que nadie pidió pagar. Sólo
 * cuando la ruta ya trae `roadPolyline` —porque alguien pulsó «Trazar por
 * calles»— se dibuja el trazado real y el rótulo cambia a «por calles».
 *
 * ── COSTE ───────────────────────────────────────────────────────────────────
 * `new google.maps.Map()` es una carga facturable: UNA instancia por montaje.
 * Cambiar tema o acento reconfigura la que existe (`setOptions`), nunca crea
 * otra.
 * ════════════════════════════════════════════════════════════════════════════
 */

/** Una parada del recorrido, ya ordenada por quien llama. */
export interface RouteMapStop {
  id: string;
  nombre: string;
  direccion?: string;
  lat: number;
  lng: number;
  /** Minutos de permanencia en el puesto. */
  duracion?: number | null;
  pasadas?: number | null;
}

interface Props {
  /** En el orden en que se recorren. El número de la chincheta es la posición. */
  stops: RouteMapStop[];
  origen?: ExtremoRuta | null;
  destino?: ExtremoRuta | null;
  /** Trazado real por calles, si la ruta lo tiene pedido. */
  roadPolyline?: string | null;
  height?: number;
  /** Cambia el color de la línea: optimizada va en «bien», manual en el acento. */
  optimizada?: boolean;
  /** Rótulo flotante con la distancia. Se puede apagar donde ya se enseña fuera. */
  hud?: boolean;
}

/** A partir de este zoom la parada enseña su nombre; por debajo, sólo el número. */
const ZOOM_FICHA = 13;

/**
 * Marcha efectiva puerta a puerta en ciudad. Es la MISMA que asume el motor de
 * optimización del servidor: si el mapa contara con otra, el tiempo del rótulo
 * y el del panel de ahorro no cuadrarían y ninguno de los dos se creería.
 */
const VELOCIDAD_URBANA = 25;

/** Longitud de la secuencia, en metros, siguiendo el camino que se dibuja. */
function largoDe(camino: Coord[]): number {
  let total = 0;
  for (let i = 1; i < camino.length; i += 1) total += metrosEntre(camino[i - 1], camino[i]);
  return total;
}

export default function RouteMap({
  stops,
  origen = null,
  destino = null,
  roadPolyline = null,
  height = 380,
  optimizada = false,
  hud = true,
}: Props) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const linesRef = useRef<any[]>([]);
  const [listo, setListo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ficha, setFicha] = useState(true);
  const fichaRef = useRef(true);

  const pal = useMapPalette();
  const piel = useMemo(() => pielDe(pal), [pal]);
  const version = useMemo(() => huella(pal), [pal]);

  const motor = useMotorMapa(mapRef.current, listo);
  const pop = useMapPopup(() => mapRef.current);
  const popRef = useRef(pop);
  popRef.current = pop;

  /** El trazado por calles, ya descodificado. `null` = línea recta. */
  const trazado = useMemo(() => leerTrazado(roadPolyline), [roadPolyline]);

  /** La secuencia completa: origen (si lo hay), paradas, destino (si lo hay). */
  const secuencia = useMemo<Coord[]>(() => {
    const pts: Coord[] = [];
    if (origen) pts.push({ lat: origen.lat, lng: origen.lng });
    stops.forEach((s) => pts.push({ lat: s.lat, lng: s.lng }));
    if (destino) pts.push({ lat: destino.lat, lng: destino.lng });
    return pts;
  }, [stops, origen, destino]);

  /** Lo que se dibuja de verdad: el trazado real si lo hay, si no la secuencia. */
  const camino = trazado ?? secuencia;

  const medida = useMemo(() => {
    const metros = largoDe(camino);
    return {
      metros,
      // Con trazado real la distancia YA es de calle; en recto hay que decir que
      // se estima, o el número se lee como una promesa que nadie hizo.
      porCalles: !!trazado,
      // Los mismos 25 km/h efectivos que usa el motor de optimización, para que
      // el mapa y el panel de ahorro no den dos tiempos distintos del mismo
      // recorrido. Sobre distancia REAL no se aplica el factor de rodeo (ya está
      // en el trazado); sobre línea recta sí, que es lo que hace `estimarMinutos`.
      minutos: trazado ? (metros / 1000 / VELOCIDAD_URBANA) * 60 : estimarMinutos(metros, VELOCIDAD_URBANA),
    };
  }, [camino, trazado]);

  /* ── El mapa, una sola vez ─────────────────────────────────────────────── */
  useEffect(() => {
    let cancelado = false;
    loadGoogleMaps()
      .then(() => {
        if (cancelado || !ref.current) return;
        const g = (window as any).google;
        const centro = secuencia[0] ?? { lat: -0.18, lng: -78.46 };
        mapRef.current = new g.maps.Map(ref.current, {
          center: centro,
          zoom: 13,
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: 'greedy',
          clickableIcons: false,
          styles: estiloMapa(pal),
          backgroundColor: pal.tierra,
        });

        const revisarZoom = () => {
          const z = mapRef.current?.getZoom?.() ?? 13;
          const quiere = z >= ZOOM_FICHA;
          if (quiere !== fichaRef.current) {
            fichaRef.current = quiere;
            setFicha(quiere);
          }
        };
        mapRef.current.addListener('idle', revisarZoom);
        revisarZoom();
        setListo(true);
      })
      .catch((e) => setError(e?.message || 'No se pudo cargar el mapa'));
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tema y acento: se reconfigura la instancia que ya existe.
  useEffect(() => {
    if (!listo || !mapRef.current) return;
    mapRef.current.setOptions({ styles: estiloMapa(pal), backgroundColor: pal.tierra });
  }, [pal, listo]);

  /* ── Chinchetas y línea ────────────────────────────────────────────────── */
  useEffect(() => {
    if (!listo || !mapRef.current) return;
    const g = (window as any).google;

    markersRef.current.forEach((m) => m.setMap(null));
    linesRef.current.forEach((l) => l.setMap(null));
    markersRef.current = [];
    linesRef.current = [];

    const colorLinea = optimizada ? pal.ok : pal.brand;

    if (camino.length > 1) {
      // Halo ancho y tenue debajo, línea viva encima: sobre teselas casi negras
      // una sola polilínea se pierde. Las flechas van SÓLO en la de arriba.
      linesRef.current.push(
        new g.maps.Polyline({
          map: mapRef.current,
          path: camino,
          geodesic: !trazado,
          clickable: false,
          strokeColor: colorLinea,
          strokeOpacity: 0.18,
          strokeWeight: 11,
          zIndex: 1,
        }),
        new g.maps.Polyline({
          map: mapRef.current,
          path: camino,
          geodesic: !trazado,
          clickable: false,
          strokeColor: colorLinea,
          strokeOpacity: 0.95,
          strokeWeight: 3,
          zIndex: 2,
          // El SENTIDO del recorrido. Símbolo vectorial de la propia polilínea:
          // ni una petición, ni un marcador por tramo.
          icons: [
            {
              icon: {
                path: g.maps.SymbolPath.FORWARD_CLOSED_ARROW,
                scale: 2.8,
                strokeColor: colorLinea,
                strokeOpacity: 1,
                strokeWeight: 1.2,
                fillColor: colorLinea,
                fillOpacity: 1,
              },
              offset: '6%',
              repeat: '96px',
            },
          ],
        }),
      );
    }

    /** Una chincheta de extremo: glifo en vez de número, para no confundirla
     *  con una parada. Casa (origen) y bandera (destino) son universales. */
    const pintarExtremo = (e: ExtremoRuta, esOrigen: boolean) => {
      const color = esOrigen ? pal.info : pal.ok;
      const glifo = iconInnerSvg(esOrigen ? 'Home' : 'Flag');
      const etiqueta = esOrigen ? 'Origen' : 'Destino';
      const asset = ficha
        ? chipPin({ etiqueta, color, glifo, piel, version })
        : orbPin({ color, glifo, piel, version, tamano: 'md' });
      const marker = new g.maps.Marker({
        map: mapRef.current,
        position: { lat: e.lat, lng: e.lng },
        icon: iconoDe(g, asset),
        title: `${etiqueta}: ${e.label}`,
        zIndex: esOrigen ? 900 : 890,
      });
      marker.addListener('click', () => {
        const datos: MapPopupData = {
          id: esOrigen ? 'origen' : 'destino',
          kind: 'point',
          title: etiqueta,
          subtitle: e.label,
          tone: esOrigen ? 'info' : 'ok',
          fields: mapPopupItems(
            { label: 'Dirección', value: e.label, wide: true },
            { label: 'Coordenadas', value: `${e.lat.toFixed(5)}, ${e.lng.toFixed(5)}`, mono: true, wide: true },
          ),
          actions: mapPopupItems(
            mapPopupActions.center(() => motor?.camara.volarA({ lat: e.lat, lng: e.lng }, { zoom: 16 })),
            mapPopupActions.directions(e.lat, e.lng),
          ),
          offsetY: ficha ? -52 : -26,
        };
        popRef.current.open(marker, datos);
      });
      markersRef.current.push(marker);
    };

    if (origen) pintarExtremo(origen, true);

    stops.forEach((s, idx) => {
      const pos = { lat: s.lat, lng: s.lng };
      const numero = String(idx + 1);
      const color = optimizada ? pal.ok : pal.brand;
      const asset = ficha
        ? chipPin({ etiqueta: s.nombre, insignia: numero, color, piel, version })
        : orbPin({ color, insignia: numero, piel, version, tamano: 'sm' });

      const marker = new g.maps.Marker({
        map: mapRef.current,
        position: pos,
        icon: iconoDe(g, asset),
        title: `${numero}. ${s.nombre}`,
        zIndex: 400 + idx,
      });
      marker.addListener('click', () => {
        const datos: MapPopupData = {
          id: s.id,
          kind: 'station',
          title: s.nombre,
          subtitle: `Parada ${idx + 1} de ${stops.length}`,
          tone: optimizada ? 'ok' : 'brand',
          fields: mapPopupItems(
            s.direccion ? { label: 'Dirección', value: s.direccion, wide: true } : null,
            s.duracion != null ? { label: 'Permanencia', value: `${s.duracion} min`, mono: true } : null,
            s.pasadas != null ? { label: 'Pasadas', value: String(s.pasadas), mono: true } : null,
          ),
          actions: mapPopupItems(
            mapPopupActions.center(() => motor?.camara.volarA(pos, { zoom: 17 })),
            mapPopupActions.directions(s.lat, s.lng),
          ),
          // La ficha cuelga 50 px sobre la coordenada: sin subir el globo, se
          // taparían la una a la otra.
          offsetY: ficha ? -52 : -26,
        };
        popRef.current.open(marker, datos);
      });
      markersRef.current.push(marker);
    });

    if (destino) pintarExtremo(destino, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stops, origen, destino, camino, trazado, listo, pal, piel, version, ficha, optimizada, motor]);

  /* ── Encuadre ──────────────────────────────────────────────────────────── */
  /** Firma de la geometría: el encuadre se rehace cuando cambia la RUTA, no en
   *  cada repintado por tema o por zoom — o le arrebataría la vista al operador
   *  cada vez que alguien conmuta el modo oscuro. */
  const firma = useMemo(
    () => camino.map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join('|'),
    [camino],
  );

  useEffect(() => {
    if (!listo || !motor || camino.length === 0) return;
    motor.camara.encuadrar(camino, { padding: 72, zoomMax: 16 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firma, listo, motor]);

  useEffect(
    () => () => {
      markersRef.current.forEach((m) => {
        try {
          m.setMap(null);
        } catch {
          /* el mapa ya se destruyó */
        }
      });
      linesRef.current.forEach((l) => {
        try {
          l.setMap(null);
        } catch {
          /* ídem */
        }
      });
    },
    [],
  );

  if (error) {
    return (
      <div
        className="grid place-items-center rounded-2xl border text-center text-sm"
        style={{ height, borderColor: 'var(--hairline)', background: 'var(--glass-sunken)', color: 'var(--ink-soft)' }}
      >
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className="cc-map-frame" style={{ height }}>
      <div ref={ref} className="cc-map-canvas" />

      {hud && secuencia.length > 0 && (
        <div className="cc-map-hud" style={{ left: 12, bottom: 30, maxWidth: 'min(92%, 30rem)' }}>
          <div className="cc-map-card px-3 py-2.5">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <div>
                <div className="cc-map-eyebrow">Paradas</div>
                <div className="cc-map-metric">{stops.length}</div>
              </div>
              <div>
                <div className="cc-map-eyebrow">{medida.porCalles ? 'Por calles' : 'En línea recta'}</div>
                <div className="cc-map-metric">{formatearDistancia(medida.metros)}</div>
              </div>
              <div className="hidden sm:block">
                <div className="cc-map-eyebrow">{t("ui.RouteMap.conduccionEstimada", "Conducción estimada")}</div>
                <div className="cc-map-metric" title={t("ui.RouteMap.aMarchaDeTraficoUrbano", "A marcha de tráfico urbano, sin contar la permanencia en cada parada")}>
                  {formatearMinutos(medida.minutos)}
                </div>
              </div>
              <div className="ml-auto flex flex-col items-end gap-1">
                {origen && (
                  <span className="cc-map-key">
                    <i style={{ color: 'var(--info)' }} />
                    Origen
                  </span>
                )}
                <span className="cc-map-key">
                  <i style={{ color: optimizada ? 'var(--ok)' : 'var(--brand)' }} />
                  {optimizada ? 'Orden optimizado' : 'Orden manual'}
                </span>
                {destino && (
                  <span className="cc-map-key">
                    <i style={{ color: 'var(--ok)' }} />
                    Destino
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {listo && secuencia.length === 0 && (
        <div className="pointer-events-none absolute inset-0 z-[3] grid place-items-center">
          <div className="cc-map-card px-4 py-3 text-center text-sm" style={{ color: 'var(--ink-soft)' }}>
            Ninguna parada tiene ubicación todavía. En cuanto los puestos tengan coordenadas, el recorrido se dibuja solo.
          </div>
        </div>
      )}

      {/* Sin esto el globo compartido no se pinta. */}
      {pop.portal}
    </div>
  );
}
