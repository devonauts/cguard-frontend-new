import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";

import i18n from "@/i18n";
import { loadGoogleMaps } from "@/utils/loadGoogleMaps";
import { getTenantLocation,
  CENTRO_DE_RESPALDO,
} from "@/utils/tenantLocation";
import { useMapPalette, type MapPalette } from "@/utils/mapTheme";
import {
  useMapPopup,
  mapPopupActions,
  mapPopupItems,
  type MapPopupData,
  type MapPopupKind,
  type MapPopupTone,
} from "@/components/maps/MapPopup";
import { useMotorMapa } from "@/utils/mapMotion";
import { formatearCoord } from "@/utils/geoMedidas";
import { geocodeRaw, geocodificarEnNavegador } from "@/utils/geocodeAddress";
import { reverseGeocode } from "@/lib/geocodeClient";
import { acquireMap, type PooledMap } from "@/utils/mapPool";
import "@/styles/map.css";

type MapType = "roadmap" | "satellite";

type AddressDetails = Record<string, any> | undefined;

/**
 * ── PUENTE DE COLOR ─────────────────────────────────────────────────────────
 * Este mapa se crea con un Map ID de Google Cloud, así que NO puede llevar el
 * array `styles` (un `mapId` lo ignora): las teselas las tiñe Google con
 * `colorScheme`. Lo que sí es nuestro son las geocercas, las rutas y las
 * chinchetas, y ahí la API exige cadenas de color. Se leen de las variables del
 * sistema en tiempo de ejecución (`utils/mapTheme.ts`) para que sigan al acento
 * configurable y al tema, en vez de quedarse en un dorado escrito a mano.
 *
 * ── Y POR QUÉ LAS CHINCHETAS SON DOM ────────────────────────────────────────
 * Es la otra cara de lo mismo: como aquí NO hay teselas propias que perder, sí
 * se puede usar `AdvancedMarkerElement` con contenido HTML real (`.cc-map-pin`,
 * en `styles/map.css`). Los mapas con estilo acromático hacen lo contrario y
 * dibujan sus chinchetas en SVG (`utils/mapPins.ts`). Antes de tocar una
 * chincheta, mira en cuál de los dos mundos estás.
 */

/** Papel de la chincheta → token semántico. Nunca un color literal. */
function colorRol(rol: string | undefined, pal: MapPalette): string {
  switch (rol) {
    case "supervisor":
      return pal.info;
    case "warn":
      return pal.warn;
    case "crit":
      return pal.bad;
    case "muted":
      return pal.inkFaint;
    default:
      return pal.ok;
  }
}

/** Tono semántico → variable de TEXTO. Nunca un color escrito a mano. */
function colorTono(t: MapPopupTone): string {
  return t === "brand"
    ? "var(--brand-text)"
    : t === "neutral"
      ? "var(--ink-faint)"
      : `var(--${t}-text)`;
}

/** El mismo papel, en el eje de tonos del globo. */
function tonoRol(rol: string | undefined): MapPopupTone {
  switch (rol) {
    case "supervisor":
      return "info";
    case "warn":
      return "warn";
    case "crit":
      return "bad";
    case "muted":
      return "neutral";
    default:
      return "ok";
  }
}

/** La chincheta de cristal en DOM — sólo posible aquí, ver la nota de arriba. */
function contenidoPin(color: string, etiqueta?: string): HTMLElement {
  const el = document.createElement("div");

  el.className = etiqueta ? "cc-map-pin" : "cc-map-pin is-sin-texto";
  el.style.setProperty("--pin", color);
  const punto = document.createElement("i");

  el.appendChild(punto);
  if (etiqueta) el.appendChild(document.createTextNode(etiqueta));

  return el;
}

/**
 * Repinta una chincheta YA creada en vez de sustituirla.
 *
 * Sustituir el `content` de un `AdvancedMarkerElement` tira el nodo antiguo, y
 * con él cualquier escucha colgada encima: al cambiar de tema los marcadores se
 * quedaban mudos y el globo dejaba de abrirse. Mutar el nodo conserva las
 * escuchas y además ahorra un reflow por marcador.
 */
function repintarPin(el: HTMLElement, color: string, etiqueta?: string): void {
  el.className = etiqueta ? "cc-map-pin" : "cc-map-pin is-sin-texto";
  el.style.setProperty("--pin", color);
  const texto = el.lastChild;

  if (etiqueta) {
    if (texto && texto.nodeType === Node.TEXT_NODE)
      texto.textContent = etiqueta;
    else el.appendChild(document.createTextNode(etiqueta));
  } else if (texto && texto.nodeType === Node.TEXT_NODE) {
    el.removeChild(texto);
  }
}

/**
 * Cuelga una pulsación de un marcador cubriendo las tres formas que ha tenido la
 * API: `gmp-click` (actual), `click` (heredada) y la pulsación del DOM sobre el
 * contenido. El cerrojo de 80 ms evita que dos de ellas abran el globo dos veces.
 */
function alPulsarMarcador(mk: any, cb: () => void): void {
  let ultimo = 0;
  const disparar = (ev?: any) => {
    const ahora = Date.now();

    if (ahora - ultimo < 80) return;
    ultimo = ahora;
    try {
      ev?.stop?.();
    } catch {
      /* evento sin stop */
    }
    cb();
  };

  try {
    mk.gmpClickable = true;
  } catch {
    /* versión sin la propiedad */
  }
  /* El avanzado es un elemento del DOM: su pulsación se escucha como DOM
     (`addEventListener("gmp-click")`). Colgarle `addListener` funciona pero
     Google lo marca en consola en cada marcador. `addListener("click")` queda
     sólo para el `Marker` clásico, que no tiene `addEventListener`. */
  const esAvanzado = typeof mk?.addEventListener === "function";

  try {
    if (esAvanzado) mk.addEventListener("gmp-click", disparar);
    else mk.addListener("click", disparar);
  } catch {
    /* versión sin el evento */
  }
  try {
    const nodo: HTMLElement | undefined = mk.content;

    nodo?.addEventListener?.("click", (e: Event) => {
      e.stopPropagation();
      disparar();
    });
    if (nodo) nodo.style.cursor = "pointer";
  } catch {
    /* contenido no es DOM (PinElement de la API) */
  }
}

function parsePlaceAddress(place: any) {
  const components: Record<string, string> = {};

  if (!place || !place.address_components) return components;
  place.address_components.forEach((comp: any) => {
    comp.types.forEach((type: string) => {
      components[type] = comp.long_name;
    });
  });

  return components;
}

interface GradoPrecision {
  texto: string;
  textoKey: string;
  tono: MapPopupTone;
}

/**
 * Qué tan fina es la dirección que devolvió Google. Es la única medida de
 * precisión REAL que hay al colocar un pin a mano, y llega gratis en la misma
 * respuesta de la geocodificación inversa: no cuesta ni una petición más.
 */
// `textoKey` viaja junto al texto en español: la traducción se hace al
// PUBLICAR la lectura (ya en ejecución). Llamar a t() en esta constante la
// congelaría en el idioma con el que arrancó la sesión.
const PRECISION: Record<string, GradoPrecision> = {
  ROOFTOP: {
    texto: "Exacta · portal",
    textoKey: "maps.precision.rooftop",
    tono: "ok",
  },
  RANGE_INTERPOLATED: {
    texto: "Interpolada en la calle",
    textoKey: "maps.precision.rangeInterpolated",
    tono: "ok",
  },
  GEOMETRIC_CENTER: {
    texto: "Centro de la manzana",
    textoKey: "maps.precision.geometricCenter",
    tono: "warn",
  },
  APPROXIMATE: {
    texto: "Aproximada",
    textoKey: "maps.precision.approximate",
    tono: "warn",
  },
};

/**
 * Traduce la dirección de Nominatim a las claves de Google.
 *
 * El servicio de geocodificación del CRM devuelve el cuerpo crudo de Nominatim
 * en la inversa (el directo sí viene ya normalizado). Quien consume
 * `onMarkerMove` lee `locality`, `postal_code`, `country`… así que la traducción
 * se hace AQUÍ, en un solo sitio: el contrato del componente no cambia.
 */
function componentesDeNominatim(
  a: Record<string, any> | undefined,
): Record<string, string> {
  if (!a) return {};
  const fuera: Record<string, string> = {};
  const poner = (clave: string, valor: unknown) => {
    if (valor != null && String(valor).trim()) fuera[clave] = String(valor);
  };

  poner("street_number", a.house_number);
  poner("route", a.road);
  poner("sublocality_level_1", a.suburb || a.neighbourhood);
  poner("locality", a.city || a.town || a.village || a.municipality);
  poner("administrative_area_level_2", a.county);
  poner("administrative_area_level_1", a.state);
  poner("postal_code", a.postcode);
  poner("country", a.country);

  return fuera;
}

/**
 * Precisión legible sin `location_type` (que es cosa de Google).
 *
 * Nominatim no la declara, pero la delata: si trae número de portal, el punto
 * cayó sobre una dirección concreta; si sólo trae calle, sobre el eje de la vía;
 * y si no trae ni eso, es el centroide de un barrio o de una ciudad. Es la misma
 * escala, deducida de lo que sí viene.
 */
function precisionDeNominatim(r: any): GradoPrecision | undefined {
  const a = r?.address || {};
  const tipo = String(r?.addresstype || r?.type || "");

  if (a.house_number || tipo === "building" || tipo === "house") {
    return {
      texto: "Exacta · portal",
      textoKey: "maps.precision.rooftop",
      tono: "ok",
    };
  }
  if (a.road || tipo === "road")
    return {
      texto: "Nivel de calle",
      textoKey: "maps.precision.streetLevel",
      tono: "ok",
    };
  if (a.suburb || a.neighbourhood)
    return {
      texto: "Centro del barrio",
      textoKey: "maps.precision.neighbourhoodCenter",
      tono: "warn",
    };

  return {
    texto: "Aproximada",
    textoKey: "maps.precision.approximate",
    tono: "warn",
  };
}

interface EstadoPin {
  lat: number;
  lng: number;
  direccion: string;
  precision: string | null;
  tonoPrecision: MapPopupTone;
  resolviendo: boolean;
  arrastrando: boolean;
}

export interface MapEmbedMarker {
  id: string;
  lat: number;
  lng: number;
  label?: string;
  role?: string;
  /** Qué es — decide el icono y el tono de arranque del globo. */
  kind?: MapPopupKind;
  /** Segunda línea del globo. Convención: «Puesto · Cliente». */
  subtitle?: string;
  /** Teléfono: si viene, el globo trae el botón de llamar. */
  phone?: string | null;
  /** Píldora de estado de la cabecera del globo. */
  status?: { label: string; tone?: MapPopupTone; live?: boolean };
  /** Latido en vivo. SÓLO para lo que de verdad está pasando ahora — si late
   *  todo, el latido deja de significar nada. */
  pulse?: boolean;
}

/** Papel de la chincheta → tono del motor de movimiento (ondas y latidos). */
function tonoMotor(
  rol: string | undefined,
): "bien" | "aviso" | "malo" | "info" | "marca" | "tenue" {
  switch (rol) {
    case "supervisor":
      return "info";
    case "warn":
      return "aviso";
    case "crit":
      return "malo";
    case "muted":
      return "tenue";
    default:
      return "bien";
  }
}

export default function GoogleMapEmbed({
  lat,
  lng,
  address,
  markers,
  zoom = 15,
  className = "w-full h-full",
  mapType = "roadmap",
  showGeofence = false,
  geofenceRadius = 200,
  draggable = false,
  onMarkerMove,
  height,
  centerRequest,
  enableClickToSet,
  onMapClick,
  onReady,
  polygon,
  focusZoom,
  markerPopup,
  onMarkerClick,
  focusMarker,
  fitMarkers = false,
  hud,
  area = "map-embed",
  apagado = false,
}: {
  lat?: number;
  lng?: number;
  address?: string;
  markers?: MapEmbedMarker[];
  zoom?: number;
  className?: string;
  mapType?: MapType;
  showGeofence?: boolean;
  geofenceRadius?: number;
  /** Optional polygon geofence to display (array of {lat,lng}). */
  polygon?: Array<{ lat: number; lng: number }>;
  draggable?: boolean;
  onMarkerMove?: (
    lat: number,
    lng: number,
    address: string,
    addressDetails?: AddressDetails,
  ) => void;
  height?: string;
  centerRequest?: number;
  enableClickToSet?: boolean;
  onMapClick?: (lat: number, lng: number) => void;
  onReady?: () => void;
  /** When centerRequest fires, also zoom to this level (closer focus). */
  focusZoom?: number;
  /** Enriquece (o sustituye) el globo por defecto de un marcador de la lista. */
  markerPopup?: (m: MapEmbedMarker) => Partial<MapPopupData> | null | undefined;
  /** Aviso de pulsación sobre un marcador, además del globo. */
  onMarkerClick?: (m: MapEmbedMarker) => void;
  /** Enfoca un marcador desde fuera (una lista lateral, un teclado): vuela hasta
   *  él, lo señala con una onda y abre su globo. `nonce` es lo que dispara. */
  focusMarker?: { id: string; nonce: number } | null;
  /** Encuadra el mapa para que quepan TODOS los marcadores de la lista.
   *  Sin esto el mapa se centra en el primero con el zoom pedido, así que una
   *  lista de sedes repartidas por la ciudad deja fuera a casi todas. */
  fitMarkers?: boolean;
  /** Panel de cristal libre sobre el mapa (lo coloca quien lo pasa). */
  hud?: ReactNode;
  /** Id corto del consumidor para la telemetría del mapa compartido
   *  ("incident", "scan", "timesheet"…). Ver `utils/mapPool.ts`. */
  area?: string;
  /** Mapa de REFERENCIA (p. ej. un evento que ya terminó): teselas y
   *  chinchetas en gris, el globo sigue a color. Va en una clase de NUESTRO
   *  hueco (`.cc-map-canvas`), no en el mapa prestado: al devolverlo a la
   *  reserva sale de este hueco y el siguiente que lo pide lo recibe a color,
   *  sin nada que restablecer. */
  apagado?: boolean;
}) {
  const { t } = useTranslation();
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstance = useRef<any>(null);
  const pooledRef = useRef<PooledMap | null>(null);
  /** Lo dibujado va registrado en el préstamo: al devolver el mapa se quita
   *  solo y no reaparece en la pantalla siguiente. */
  const trackear = useCallback(
    <T,>(o: T): T => (pooledRef.current ? pooledRef.current.track(o) : o),
    [],
  );
  const areaRef = useRef(area);

  areaRef.current = area;
  const markerRef = useRef<any>(null);
  const markersRef = useRef<Record<string, any>>({});
  const circleRef = useRef<any>(null);
  const polygonRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
  /** ¿El hueco del mapa está (o está a punto de estar) a la vista? */
  const [aLaVista, setALaVista] = useState(false);

  // Paleta viva: cambia con el tema Y con el acento configurable del CRM.
  const pal = useMapPalette();
  const palRef = useRef(pal);

  palRef.current = pal;

  // El globo compartido de todos los mapas del CRM. Se le pasa un GETTER porque
  // el mapa nace dentro de un `await` y no provoca re-render.
  const pop = useMapPopup(() => mapInstance.current);
  const popRef = useRef(pop);

  popRef.current = pop;

  // El motor de movimiento compartido: cámara con transición, ondas de evento.
  // `ready` es la señal de que ya hay mapa al que atarlo.
  const motor = useMotorMapa(mapInstance.current, ready);
  const motorRef = useRef(motor);

  motorRef.current = motor;

  /** Centrar es una transición, no un corte. */
  const volar = useCallback(
    (destino: { lat: number; lng: number }, zoom?: number) => {
      motorRef.current?.camara.volarA(
        destino,
        zoom != null ? { zoom } : undefined,
      );
    },
    [],
  );

  // Lo que el operador tiene que VER mientras coloca el pin: dónde cayó, qué
  // dirección resolvió y cómo de fina es esa dirección.
  const [pin, setPin] = useState<EstadoPin | null>(null);
  const pinRef = useRef<EstadoPin | null>(null);

  pinRef.current = pin;

  // Las escuchas se registran UNA vez, así que leen los props por referencia.
  const markersDatos = useRef<Record<string, MapEmbedMarker>>({});
  const popupRef = useRef(markerPopup);

  popupRef.current = markerPopup;
  const clickRef = useRef(onMarkerClick);

  clickRef.current = onMarkerClick;
  const moveRef = useRef(onMarkerMove);

  moveRef.current = onMarkerMove;
  const mapClickRef = useRef(onMapClick);

  mapClickRef.current = onMapClick;
  const clickToSetRef = useRef(enableClickToSet);

  clickToSetRef.current = enableClickToSet;

  /** Globo de un marcador de la lista: lo básico + lo que añada el consumidor. */
  const abrirGloboMarcador = useCallback((mk: any, m: MapEmbedMarker) => {
    const extra = popupRef.current?.(m) ?? {};
    const base: MapPopupData = {
      id: m.id,
      kind: m.kind ?? "point",
      title: m.label || i18n.t("maps.kind.point", "Punto"),
      subtitle: m.subtitle,
      tone: tonoRol(m.role),
      status: m.status,
      fields: mapPopupItems({
        label: i18n.t("ui.GoogleMapEmbed.coordenadas", "Coordenadas"),
        value: formatearCoord(m.lat, m.lng),
        mono: true,
        wide: true,
      }),
      actions: mapPopupItems(
        mapPopupActions.directions(m.lat, m.lng),
        mapPopupActions.center(() => {
          const cerca = Math.max(mapInstance.current?.getZoom?.() ?? 0, 17);

          motorRef.current?.camara.volarA(
            { lat: m.lat, lng: m.lng },
            { zoom: cerca },
          );
          motorRef.current?.onda({ lat: m.lat, lng: m.lng }, { tono: "marca" });
        }),
        mapPopupActions.call(m.phone),
      ),
    };

    popRef.current.open(mk, {
      ...base,
      ...extra,
      title: extra.title ?? base.title,
    });
    clickRef.current?.(m);
  }, []);

  // Draw/update the polygon geofence when provided.
  useEffect(() => {
    const google = (window as any).google;

    if (!ready || !google?.maps || !mapInstance.current) return;
    if (polygonRef.current) {
      polygonRef.current.setMap(null);
      polygonRef.current = null;
    }
    const pts = (polygon || []).filter(
      (p) => p && !isNaN(p.lat) && !isNaN(p.lng),
    );

    if (pts.length >= 3) {
      polygonRef.current = trackear(new google.maps.Polygon({
        paths: pts,
        strokeColor: pal.brand,
        strokeOpacity: 0.9,
        strokeWeight: 2,
        fillColor: pal.brand,
        fillOpacity: 0.12,
        map: mapInstance.current,
      }));
    }
  }, [ready, pal, JSON.stringify(polygon || [])]);

  // La geocerca circular sigue al acento igual que la poligonal: antes eran dos
  // colores distintos (rojo y dorado) para el mismo concepto.
  useEffect(() => {
    if (!circleRef.current) return;
    circleRef.current.setOptions({
      strokeColor: pal.brand,
      fillColor: pal.brand,
    });
  }, [pal]);

  // La cruz del cursor entra y sale con el modo, y va en la OPCIÓN del mapa —
  // no en el `style` del contenedor, que Google pisa con el suyo propio en
  // cuanto el ratón toca las teselas.
  useEffect(() => {
    if (!ready || !mapInstance.current) return;
    try {
      mapInstance.current.setOptions({
        draggableCursor: enableClickToSet ? "crosshair" : null,
      });
    } catch {
      /* mapa desmontado */
    }
  }, [enableClickToSet, ready]);

  const apiKey = (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY;

  /**
   * AHORRO · El mapa no se construye hasta que el hueco se acerca a la pantalla.
   *
   * Google factura CADA `new google.maps.Map(...)`, no su uso. Este componente
   * sale en unas quince pantallas, y en varias vive al final de una ficha larga,
   * dentro de una pestaña que nadie abre o en un modal que no se despliega: se
   * pagaba un mapa que jamás llegó a verse. Con el observador, quien no baja no
   * gasta; quien baja lo tiene ya montado antes de llegar (250 px de margen).
   *
   * Mismo patrón que `hooks/useCercaDeLaVista.ts`. Sin
   * `IntersectionObserver` (navegadores viejos, pruebas) se monta de inmediato:
   * esto no puede dejar una pantalla sin mapa.
   */
  useEffect(() => {
    const nodo = mapRef.current;

    if (!nodo || aLaVista) return;

    if (typeof IntersectionObserver !== "function") {
      setALaVista(true);

      return;
    }

    const obs = new IntersectionObserver(
      (entradas) => {
        if (entradas.some((e) => e.isIntersecting)) {
          setALaVista(true);
          obs.disconnect();
        }
      },
      { rootMargin: "250px" },
    );

    obs.observe(nodo);

    return () => obs.disconnect();
  }, [aLaVista]);

  useEffect(() => {
    let mounted = true;

    if (!aLaVista || mapInstance.current) return;

    async function init() {
      if (!mapRef.current) return;

      try {
        await loadGoogleMaps();
        if (!mounted) return;
        const google = (window as any).google;

        if (!google || !google.maps) {
          throw new Error("Google Maps API did not initialize");
        }
        // Determine a better initial center when no explicit coords are provided.
        async function determineCenter() {
          // 1) If markers present, use first marker
          if (Array.isArray(markers) && markers.length > 0) {
            const m = markers[0];

            if (
              typeof m.lat === "number" &&
              typeof m.lng === "number" &&
              Number.isFinite(m.lat) &&
              Number.isFinite(m.lng)
            )
              return { lat: m.lat, lng: m.lng, zoom: zoom };
          }

          // 2) If direct coordinates passed, use them (but only if finite)
          if (
            typeof lat === "number" &&
            typeof lng === "number" &&
            Number.isFinite(lat) &&
            Number.isFinite(lng)
          )
            return { lat, lng, zoom };

          // 3) Try geocoding an address (if provided)
          //
          // AHORRO · Antes era un `new google.maps.Geocoder()` a pelo, y cada
          // apertura de la pantalla pagaba la MISMA dirección otra vez. Ahora va
          // por `geocodeRaw`, que pregunta a la caché compartida del servidor
          // (memoria → base de datos → Nominatim gratis → Google sólo si el
          // gratuito calla): a Google se le paga una vez por dirección en la vida
          // del sistema. El formato de la respuesta es el de Google, igual que
          // antes; lo único que cambia es que `location.lat` puede llegar como
          // número (REST) en vez de como función (SDK).
          if (address) {
            try {
              const results = await geocodeRaw(address);
              const loc = results?.[0]?.geometry?.location;

              if (loc) {
                const la =
                  typeof loc.lat === "function" ? loc.lat() : Number(loc.lat);
                const ln =
                  typeof loc.lng === "function" ? loc.lng() : Number(loc.lng);

                if (Number.isFinite(la) && Number.isFinite(ln))
                  return { lat: la, lng: ln, zoom: 15 };
              }
            } catch (e) {
              // ignore and continue to next fallback
            }
          }

          // 4) Try browser geolocation as a last-resort (gives approximate client/user location)
          if (navigator && (navigator as any).geolocation) {
            try {
              const pos = await new Promise<GeolocationPosition>(
                (resolve, reject) =>
                  (navigator as any).geolocation.getCurrentPosition(
                    resolve,
                    reject,
                    { timeout: 5000 },
                  ),
              );

              return {
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
                zoom: 12,
              };
            } catch (e) {
              // ignore
            }
          }

          // 5) Read optional env default client coords
          const defLat = parseFloat(
            (import.meta as any).env?.VITE_DEFAULT_CLIENT_LAT,
          );
          const defLng = parseFloat(
            (import.meta as any).env?.VITE_DEFAULT_CLIENT_LNG,
          );

          if (!Number.isNaN(defLat) && !Number.isNaN(defLng))
            return { lat: defLat, lng: defLng, zoom: 12 };

          // 6) final fallback — use business location or generic Ecuador center
          const biz = getTenantLocation();

          if (biz) return { lat: biz.lat, lng: biz.lng, zoom: 12 };

          return { ...CENTRO_DE_RESPALDO, zoom: 12 };
        }

        const c = await determineCenter();

        if (!mounted || !mapRef.current) return;
        // Ensure coordinates are finite numbers
        const centerLat = Number.isFinite(c.lat) ? c.lat : CENTRO_DE_RESPALDO.lat;
        const centerLng = Number.isFinite(c.lng) ? c.lng : CENTRO_DE_RESPALDO.lng;
        const center = { lat: centerLat, lng: centerLng };
        const initialZoom =
          c.zoom ??
          (typeof lat === "number" && typeof lng === "number" ? zoom : 12);

        const isDark = document.documentElement.classList.contains("dark");

        const { ColorScheme } = (await google.maps.importLibrary(
          "core",
        )) as any;

        // AHORRO · La reserva de `mapPool`: al desmontar, el mapa se DEVUELVE en
        // vez de tirarse, así que cambiar de pestaña, cerrar un modal o volver
        // atrás en un asistente no vuelve a construir —ni a cobrar— nada. La
        // reserva se agrupa por `mapId` + `colorScheme` (inmutables al crear).
        pooledRef.current = acquireMap(mapRef.current, {
          center,
          zoom: initialZoom,
          mapTypeId: mapType === "satellite" ? "satellite" : "roadmap",
          mapTypeControl: true,
          streetViewControl: false,
          fullscreenControl: false,
          mapId: "d94ad875743639fb1933bbd4",
          colorScheme: isDark ? ColorScheme.DARK : ColorScheme.LIGHT,
        }, { area });
        mapInstance.current = pooledRef.current.map;

        // «Toca el mapa para fijar la ubicación».
        //
        // La escucha se registra SIEMPRE y decide dentro, leyendo el modo por
        // referencia. Antes se registraba sólo si el modo ya venía activo en el
        // primer render — y en Cobertura de cliente, que es su único uso, arranca
        // apagado y se enciende al pulsar «Fijar ubicación exacta»: la escucha no
        // llegaba a existir nunca y tocar el mapa no hacía absolutamente nada.
        mapInstance.current.addListener("click", (ev: any) => {
          if (!clickToSetRef.current) return;
          try {
            const ll = ev.latLng;
            const lat = ll.lat();
            const lng = ll.lng();

            if (markerRef.current) {
              try {
                markerRef.current.position = { lat, lng };
              } catch {}
            } else {
              try {
                markerRef.current =
                  trackear(new google.maps.marker.AdvancedMarkerElement({
                    position: { lat, lng },
                    map: mapInstance.current,
                    content: pinPrincipal(google, palRef.current),
                  }));
              } catch {}
            }
            // El punto elegido se anuncia igual que uno arrastrado: misma
            // lectura de coordenadas y misma dirección resuelta.
            if (circleRef.current) circleRef.current.setCenter({ lat, lng });
            motorRef.current?.onda({ lat, lng }, { tono: "marca" });
            anunciarPin(lat, lng);
            if (typeof mapClickRef.current === "function")
              mapClickRef.current(lat, lng);
          } catch (err) {
            console.warn("Map click handler error", err);
          }
        });

        // Create marker for single-location mode only when no markers list is provided
        try {
          if (!Array.isArray(markers) || markers.length === 0) {
            markerRef.current = trackear(new google.maps.marker.AdvancedMarkerElement({
              position: center,
              map: mapInstance.current,
              title: address || i18n.t("ui.PanicAlertOverlay.ubicacion", "Ubicación"),
              gmpDraggable: draggable,
              content: pinPrincipal(google, palRef.current),
            }));
            // Pulsar la chincheta principal cuenta lo que se sabe del punto.
            alPulsarMarcador(markerRef.current, () => abrirGloboPrincipal());
          } else {
            // Do not create a main/center marker when an explicit markers list is provided
            markerRef.current = null;
          }
        } catch (markerErr) {
          console.warn("Marker creation failed or omitted", markerErr);
          markerRef.current = null;
        }

        if (draggable && markerRef.current) {
          const leerPos = () => {
            const pos = markerRef.current?.position as any;

            if (!pos) return null;

            return {
              lat:
                typeof pos.lat === "function" ? pos.lat() : (pos.lat as number),
              lng:
                typeof pos.lng === "function" ? pos.lng() : (pos.lng as number),
            };
          };

          markerRef.current.addEventListener("gmp-dragstart", () => {
            popRef.current.close();
            marcarNodo(markerRef.current, true);
            setPin((p) => (p ? { ...p, arrastrando: true } : p));
          });

          // `gmp-drag` dispara en CADA fotograma del arrastre. Escribir estado de
          // React en cada uno tiraría la fluidez del propio arrastre, así que la
          // lectura de coordenadas se refresca a ritmo de pantalla.
          let pendiente = 0;

          markerRef.current.addEventListener("gmp-drag", () => {
            const ll = leerPos();

            if (!ll) return;
            if (circleRef.current) circleRef.current.setCenter(ll);
            cancelAnimationFrame(pendiente);
            pendiente = requestAnimationFrame(() => {
              setPin({
                lat: ll.lat,
                lng: ll.lng,
                direccion: "",
                precision: null,
                tonoPrecision: "neutral",
                resolviendo: false,
                arrastrando: true,
              });
            });
          });

          markerRef.current.addEventListener("gmp-dragend", () => {
            cancelAnimationFrame(pendiente);
            marcarNodo(markerRef.current, false);
            const latLng = leerPos();

            if (!latLng) return;
            if (circleRef.current) circleRef.current.setCenter(latLng);
            anunciarPin(latLng.lat, latLng.lng);
          });
        }

        if (showGeofence) {
          circleRef.current = trackear(new google.maps.Circle({
            strokeColor: palRef.current.brand,
            strokeOpacity: 0.7,
            strokeWeight: 2,
            fillColor: palRef.current.brand,
            fillOpacity: 0.1,
            map: mapInstance.current,
            center,
            radius: geofenceRadius,
            clickable: false,
          }));
        }

        setReady(true);
        try {
          onReady?.();
        } catch {}
      } catch (err) {
        console.error("Failed loading Google Maps JS API", err);
        setReady(false);
      }
    }

    init();

    return () => {
      mounted = false;
      try {
        if (markerRef.current) {
          try {
            markerRef.current.map = null;
          } catch {
            /* ignore */
          }
          markerRef.current = null;
        }
        // TODO lo que se colgó del mapa tiene que bajarse: la reserva no destruye
        // el mapa, y un overlay olvidado reaparecería sobre el siguiente que lo
        // tome prestado. Los marcadores de la lista se limpian aquí por lo mismo.
        Object.values(markersRef.current || {}).forEach((mk: any) => {
          try {
            if (typeof mk?.setMap === "function") mk.setMap(null);
            else if (mk) mk.map = null;
          } catch {
            /* ya desmontado */
          }
        });
        markersRef.current = {};
        markersDatos.current = {};
        if (circleRef.current) {
          circleRef.current.setMap(null);
          circleRef.current = null;
        }
        if (polygonRef.current) {
          polygonRef.current.setMap(null);
          polygonRef.current = null;
        }
        try {
          pooledRef.current?.release();
        } catch {
          /* ya devuelto */
        }
        pooledRef.current = null;
        mapInstance.current = null;
      } catch {}
    };
    // `aLaVista` es la única dependencia: el mapa se construye cuando el hueco
    // se asoma, y una sola vez (el guardia de arriba corta si ya existe).
  }, [aLaVista]);

  /** La gota del acento. Es la chincheta que se ARRASTRA: la punta señala la
   *  coordenada exacta, que es justo lo que hace falta al colocar. */
  function pinPrincipal(google: any, p: MapPalette): any {
    try {
      const el = new google.maps.marker.PinElement({
        background: p.brand,
        borderColor: p.brandInk,
        glyphColor: p.brandInk,
        scale: 1.1,
      }).element as HTMLElement;

      el.style.transition =
        "transform .16s var(--ease, ease), filter .16s var(--ease, ease)";
      el.style.transformOrigin = "50% 100%";

      return el;
    } catch {
      return undefined;
    }
  }

  /**
   * Levanta la chincheta mientras se arrastra. Sin esto el pin parece pegado al
   * mapa y no hay forma de saber si el dedo llegó a cogerlo — que es la queja de
   * siempre al colocar una ubicación desde el teléfono.
   *
   * Va en estilos DIRECTOS y no en una clase porque `styles/map.css` es de otro
   * territorio: aquí sólo se toca el nodo que este componente creó.
   */
  function marcarNodo(mk: any, activo: boolean): void {
    try {
      const nodo: HTMLElement | undefined = mk?.content;

      if (!nodo?.style) return;
      nodo.style.transform = activo ? "translateY(-8px) scale(1.08)" : "";
      nodo.style.filter = activo
        ? "drop-shadow(0 10px 12px rgba(0,0,0,.32))"
        : "";
    } catch {
      /* contenido sin DOM */
    }
  }

  /**
   * Publica el punto y resuelve su dirección.
   *
   * ── COSTE · ESTE ERA EL CARO ──────────────────────────────────────────────
   * Aquí había un `new google.maps.Geocoder()` que se disparaba en CADA arrastre
   * del pin. Colocar bien la sede de un cliente son diez o quince ajustes, y cada
   * uno era una geocodificación inversa pagada — de la misma puerta, una y otra
   * vez. Ahora se pide a `reverseGeocode`, que va contra la caché compartida del
   * servidor y REDONDEA la coordenada a cuatro decimales (~11 m): todos los
   * ajustes finos sobre la misma entrada comparten una única respuesta guardada,
   * y detrás está Nominatim, que es gratis.
   *
   * Se mantienen las dos condiciones que ya había: sólo se resuelve si alguien
   * consume la dirección (`onMarkerMove`) —el modo «toca el mapa para fijar» de
   * Cobertura no la lee— y el respaldo con el geocodificador del navegador sigue
   * ahí para que un fallo del servicio gratuito no deje un formulario sin ciudad
   * ni código postal.
   */
  const anunciarPin = useCallback((la: number, ln: number) => {
    const resolver = typeof moveRef.current === "function";

    setPin({
      lat: la,
      lng: ln,
      direccion: "",
      precision: null,
      tonoPrecision: "neutral",
      resolviendo: resolver,
      arrastrando: false,
    });
    if (!resolver) return;

    const publicar = (
      formatted: string,
      detalles: Record<string, any>,
      grado?: GradoPrecision,
    ) => {
      setPin((p) =>
        p && p.lat === la && p.lng === ln
          ? {
              ...p,
              direccion: formatted,
              precision: grado ? i18n.t(grado.textoKey, grado.texto) : null,
              tonoPrecision: grado?.tono ?? "neutral",
              resolviendo: false,
            }
          : p,
      );
      if (typeof moveRef.current === "function")
        moveRef.current(la, ln, formatted, detalles);
    };

    reverseGeocode(la, ln, { addressdetails: 1 })
      .then((r: any) => {
        if (!r || !r.display_name) throw new Error("sin dirección");
        publicar(
          String(r.display_name),
          componentesDeNominatim(r.address),
          precisionDeNominatim(r),
        );
      })
      .catch(() => {
        // Respaldo: el geocodificador del navegador. Se paga, pero sólo cuando el
        // camino gratuito ha fallado — y antes se pagaba SIEMPRE.
        const google = (window as any).google;

        if (!google?.maps?.Geocoder) {
          setPin((p) => (p ? { ...p, resolviendo: false } : p));

          return;
        }
        try {
          // Pasa por la memoria de la pestaña (`geocodificarEnNavegador`): el
          // mismo punto no se vuelve a pagar.
          void geocodificarEnNavegador(
            { location: { lat: la, lng: ln } },
            areaRef.current,
          ).then(({ results, status }) => {
            const primero =
              status === "OK" && results && results[0] ? results[0] : null;

            publicar(
              primero?.formatted_address || "",
              parsePlaceAddress(primero),
              primero?.geometry?.location_type
                ? PRECISION[primero.geometry.location_type as string]
                : undefined,
            );
          });
        } catch {
          setPin((p) => (p ? { ...p, resolviendo: false } : p));
        }
      });
  }, []);

  /** Globo de la chincheta principal: dirección, coordenadas y precisión. */
  const abrirGloboPrincipal = useCallback(() => {
    const p = pinRef.current;
    const la = p?.lat ?? (typeof lat === "number" ? lat : undefined);
    const ln = p?.lng ?? (typeof lng === "number" ? lng : undefined);

    if (!Number.isFinite(la as number) || !Number.isFinite(ln as number))
      return;
    const laN = la as number;
    const lnN = ln as number;

    popRef.current.open(markerRef.current, {
      id: "principal",
      kind: "point",
      title:
        p?.direccion ||
        address ||
        i18n.t("ui.GoogleMapEmbed.ubicacionSeleccionada", "Ubicación seleccionada"),
      subtitle: draggable
        ? i18n.t(
            "ui.GoogleMapEmbed.arrastraLaChinchetaParaAjustarla",
            "Arrastra la chincheta para ajustarla",
          )
        : undefined,
      tone: "brand",
      status: p?.precision
        ? { label: p.precision, tone: p.tonoPrecision }
        : undefined,
      fields: [
        {
          label: i18n.t("ui.GoogleMapEmbed.coordenadas", "Coordenadas"),
          value: formatearCoord(laN, lnN),
          mono: true,
          wide: true,
        },
      ],
      actions: [mapPopupActions.directions(laN, lnN)],
    });
  }, [address, draggable, lat, lng]);

  // Watch for theme changes and update map colorScheme dynamically
  useEffect(() => {
    const observer = new MutationObserver(async () => {
      if (!mapInstance.current) return;
      const google = (window as any).google;

      if (!google?.maps) return;
      const { ColorScheme } = (await google.maps.importLibrary("core")) as any;
      const isDark = document.documentElement.classList.contains("dark");

      mapInstance.current.setOptions({
        colorScheme: isDark ? ColorScheme.DARK : ColorScheme.LIGHT,
      });
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => observer.disconnect();
  }, []);

  // Manage multiple markers when `markers` prop is provided
  useEffect(() => {
    const google = (window as any).google;

    if (!google || !mapInstance.current) return;

    const desired = markers || [];
    const existing = markersRef.current || {};

    const keep = new Set<string>();

    desired.forEach((m) => {
      if (!m || typeof m.lat !== "number" || typeof m.lng !== "number") return;
      keep.add(m.id);
      // La escucha de pulsación se registró una sola vez y lee de aquí: así un
      // marcador que cambia de nombre o de papel abre el globo ya actualizado.
      markersDatos.current[m.id] = m;
      const color = colorRol(m.role, palRef.current);

      if (existing[m.id]) {
        // update (supports both Marker and AdvancedMarkerElement)
        try {
          if (typeof existing[m.id].setPosition === "function") {
            existing[m.id].setPosition({ lat: m.lat, lng: m.lng });
          } else {
            existing[m.id].position = { lat: m.lat, lng: m.lng };
          }
        } catch {}
        try {
          if (typeof existing[m.id].setTitle === "function") {
            existing[m.id].setTitle(m.label || m.id);
          } else {
            existing[m.id].title = m.label || m.id;
          }
        } catch {}
        // Repintar la ficha SIN sustituirla: el papel del marcador o el acento
        // pueden haber cambiado, pero la escucha de pulsación tiene que seguir viva.
        try {
          const nodo: HTMLElement | undefined = existing[m.id].content;

          if (nodo?.classList?.contains("cc-map-pin"))
            repintarPin(nodo, color, m.label);
        } catch {}
      } else {
        // create marker
        try {
          const mk = trackear(new google.maps.marker.AdvancedMarkerElement({
            position: { lat: m.lat, lng: m.lng },
            map: mapInstance.current,
            title: m.label || m.id,
            content: contenidoPin(color, m.label),
          }));

          alPulsarMarcador(mk, () => {
            const dato = markersDatos.current[m.id];

            if (dato) abrirGloboMarcador(mk, dato);
          });
          markersRef.current[m.id] = mk;
        } catch (e) {
          console.warn("Failed to create marker", e);
        }
      }
    });

    // remove old markers
    Object.keys(existing).forEach((id) => {
      if (!keep.has(id)) {
        try {
          if (typeof existing[id].setMap === "function") {
            existing[id].setMap(null);
          } else {
            existing[id].map = null;
          }
        } catch {}
        delete existing[id];
        delete markersDatos.current[id];
      }
    });

    markersRef.current = existing;
    // `ready` is a dependency so this re-runs once the async map init finishes —
    // otherwise a markers list present on first render is dropped (map not ready
    // yet) and never re-applied, leaving the map pin-less.
  }, [markers, ready, pal, abrirGloboMarcador]);

  // Encuadre de TODOS los marcadores.
  //
  // El centrado normal usa el primer marcador y el zoom pedido — bien para una
  // sola chincheta, inútil para una lista repartida por la ciudad. Aquí se
  // calcula el rectángulo que las contiene y se deja que el mapa elija el zoom.
  // Con un único punto no hay rectángulo que valga (`fitBounds` sobre un punto
  // se va al zoom máximo), así que se centra y punto.
  useEffect(() => {
    if (!fitMarkers || !ready) return;
    const google = (window as any).google;
    const mapa = mapInstance.current;

    if (!google?.maps || !mapa) return;

    const puntos = (markers || []).filter(
      (m) => m && Number.isFinite(m.lat) && Number.isFinite(m.lng),
    );

    if (puntos.length === 0) return;

    if (puntos.length === 1) {
      try {
        mapa.setCenter({ lat: puntos[0].lat, lng: puntos[0].lng });
        mapa.setZoom(zoom);
      } catch {
        /* mapa aún montándose */
      }

      return;
    }

    try {
      const limites = new google.maps.LatLngBounds();

      puntos.forEach((m) => limites.extend({ lat: m.lat, lng: m.lng }));
      mapa.fitBounds(limites, 48);
    } catch {
      /* mapa aún montándose */
    }
  }, [fitMarkers, markers, ready, zoom]);

  // Latido de lo que está VIVO. Se mantiene aparte del efecto de marcadores
  // porque depende del motor, que llega un fotograma después que el mapa.
  useEffect(() => {
    if (!motor) return;
    (markers || []).forEach((m) => {
      if (!m || typeof m.lat !== "number" || typeof m.lng !== "number") return;
      motor.latido(
        `hb-${m.id}`,
        { lat: m.lat, lng: m.lng },
        {
          activo: !!m.pulse,
          tono: tonoMotor(m.role),
        },
      );
    });
  }, [markers, motor]);

  // Enfoque desde fuera: la lista lateral del despacho señala a alguien y el
  // mapa va, lo marca y abre su globo — sin obligar a buscarlo entre chinchetas.
  useEffect(() => {
    if (!focusMarker?.id) return;
    const mk = markersRef.current[focusMarker.id];
    const dato = markersDatos.current[focusMarker.id];

    if (!mk || !dato) return;
    const destino = { lat: dato.lat, lng: dato.lng };

    volar(destino, Math.max(mapInstance.current?.getZoom?.() ?? 0, 16));
    motorRef.current?.onda(destino, { tono: tonoMotor(dato.role) });
    abrirGloboMarcador(mk, dato);
    // Sólo el `nonce` dispara: pulsar dos veces el mismo de la lista tiene que
    // volver a llevarte allí aunque el id no haya cambiado.
  }, [focusMarker?.nonce]);

  // Resaltar lo que está abierto: el resto de chinchetas se apagan un poco para
  // que la seleccionada no se pierda entre veinte iguales. Sólo opacidad y orden
  // de apilado — nada de color, que el papel de cada chincheta ya lo lleva.
  useEffect(() => {
    const abierto = pop.openId;

    Object.entries(markersRef.current || {}).forEach(([id, mk]) => {
      try {
        const nodo: HTMLElement | undefined = mk?.content;

        if (!nodo?.style) return;
        const apagada = !!abierto && id !== abierto;

        nodo.style.transition = "opacity .18s var(--ease, ease)";
        nodo.style.opacity = apagada ? "0.42" : "1";
        if (typeof mk.zIndex !== "undefined")
          mk.zIndex = abierto && id === abierto ? 9000 : undefined;
      } catch {
        /* marcador sin DOM */
      }
    });
  }, [pop.openId]);

  useEffect(() => {
    const google = (window as any).google;

    if (!google || !mapInstance.current) return;
    const map = mapInstance.current;
    const rawLat =
      typeof lat === "number"
        ? lat
        : markerRef.current?.getPosition
          ? markerRef.current.getPosition().lat()
          : (getTenantLocation()?.lat ?? CENTRO_DE_RESPALDO.lat);
    const rawLng =
      typeof lng === "number"
        ? lng
        : markerRef.current?.getPosition
          ? markerRef.current.getPosition().lng()
          : (getTenantLocation()?.lng ?? CENTRO_DE_RESPALDO.lng);

    // Guard against NaN — skip update entirely if coordinates are invalid
    if (!Number.isFinite(rawLat) || !Number.isFinite(rawLng)) return;
    const center = { lat: rawLat, lng: rawLng };

    // Antes eran un `setCenter` y un `setZoom` secos: al elegir otro puesto el
    // mapa parpadeaba en otro sitio y había que reconstruir mentalmente dónde
    // estabas. La cámara del motor conserva ese hilo — y si el destino queda
    // lejos, aleja, desplaza y acerca en vez de cruzar el mundo de golpe.
    //
    // Con `fitMarkers` el encuadre lo decide el rectángulo de la lista: volar a
    // un centro aquí lo desharía en el mismo fotograma (este efecto se declara
    // después, así que gana). Sin coordenadas propias ese centro sería además
    // la ubicación de la empresa, que no es donde están las chinchetas.
    const encuadrandoLista =
      fitMarkers && Array.isArray(markers) && markers.length > 0;

    if (!encuadrandoLista) volar(center, zoom);
    map.setMapTypeId(mapType === "satellite" ? "satellite" : "roadmap");

    if (markerRef.current) {
      markerRef.current.position = center;
      markerRef.current.gmpDraggable = draggable;
      markerRef.current.title = address || i18n.t("ui.PanicAlertOverlay.ubicacion", "Ubicación");
    } else {
      // Only create a main marker if no explicit markers list was provided
      if (!Array.isArray(markers) || markers.length === 0) {
        try {
          markerRef.current = trackear(new google.maps.marker.AdvancedMarkerElement({
            position: center,
            map,
            gmpDraggable: draggable,
            title: address || i18n.t("ui.PanicAlertOverlay.ubicacion", "Ubicación"),
            content: pinPrincipal(google, palRef.current),
          }));
          alPulsarMarcador(markerRef.current, () => abrirGloboPrincipal());
        } catch (e) {
          console.warn("Failed to create fallback main marker", e);
          markerRef.current = null;
        }
      }
    }

    if (showGeofence) {
      if (circleRef.current) {
        circleRef.current.setCenter(center);
        circleRef.current.setRadius(geofenceRadius);
        circleRef.current.setMap(map);
      } else {
        circleRef.current = trackear(new google.maps.Circle({
          strokeColor: palRef.current.brand,
          strokeOpacity: 0.7,
          strokeWeight: 2,
          fillColor: palRef.current.brand,
          fillOpacity: 0.1,
          map,
          center,
          radius: geofenceRadius,
          clickable: false,
        }));
      }
    } else if (circleRef.current) {
      circleRef.current.setMap(null);
    }
  }, [
    lat,
    lng,
    zoom,
    mapType,
    showGeofence,
    geofenceRadius,
    draggable,
    address,
    fitMarkers,
    markers,
  ]);

  // Allow forced recenter when `centerRequest` changes (useful for manual centering from parent)
  useEffect(() => {
    if (centerRequest == null) return;
    const google = (window as any).google;

    if (!google || !mapInstance.current) return;
    if (typeof lat !== "number" || typeof lng !== "number") return;
    try {
      const center = { lat, lng };
      const actual = mapInstance.current.getZoom?.() ?? 0;
      // Acercar sólo si el foco pedido está MÁS cerca que lo que ya se ve: si el
      // operador se había acercado a mano, alejarle sería quitarle el trabajo.
      const destino =
        typeof focusZoom === "number" && actual < focusZoom
          ? focusZoom
          : undefined;

      volar(center, destino);
      // Un toque para que el ojo encuentre el sitio nuevo sin buscarlo: es un
      // evento (te acabo de llevar aquí), así que suena una vez y se apaga.
      motorRef.current?.onda(center, { tono: "marca" });
      if (markerRef.current) markerRef.current.position = center;
      if (showGeofence && circleRef.current)
        circleRef.current.setCenter(center);
    } catch (err) {
      console.warn("Failed to pan map on centerRequest", err);
    }
  }, [centerRequest]);

  // La lectura del pin: dirección resuelta, coordenadas y precisión. Sólo tiene
  // sentido donde de verdad se coloca un punto.
  const lectura = useMemo(() => {
    if (!draggable && !enableClickToSet) return null;
    if (!pin) return null;

    return pin;
  }, [draggable, enableClickToSet, pin]);

  if (!apiKey) {
    const bizFallback = getTenantLocation();
    const coords =
      typeof lat === "number" && typeof lng === "number"
        ? `${lat},${lng}`
        : address
          ? encodeURIComponent(address)
          : `${bizFallback?.lat ?? CENTRO_DE_RESPALDO.lat},${bizFallback?.lng ?? CENTRO_DE_RESPALDO.lng}`;
    const tParam = mapType === "satellite" ? "&t=k" : "";
    const src = `https://maps.google.com/maps?q=${coords}&z=${zoom}${tParam}&output=embed`;

    return (
      <div className={className} style={{ height: height ?? "100%" }}>
        <iframe
          allowFullScreen
          height="100%"
          loading="lazy"
          src={src}
          style={{
            border: 0,
            filter: apagado ? "grayscale(0.85) brightness(0.97)" : undefined,
          }}
          title="Google Maps"
          width="100%"
        />
      </div>
    );
  }

  return (
    <div
      className={`cc-map-frame ${className}`}
      style={{ height: height ?? "100%" }}
    >
      <div
        ref={mapRef}
        className={apagado ? "cc-map-canvas is-apagado" : "cc-map-canvas"}
      />

      {lectura && (
        <div className="cc-map-hud" style={{ left: 10, right: 10, bottom: 10 }}>
          <div className="cc-map-card max-w-full p-2.5 sm:max-w-[22rem]">
            <div className="cc-map-eyebrow">
              {lectura.arrastrando
                ? t("maps.checkpointPicker.dropToPin", "Suelta para fijar el punto")
                : lectura.resolviendo
                  ? t("ui.GoogleMapEmbed.resolviendoDireccion", "Resolviendo dirección…")
                  : t("ui.GoogleMapEmbed.puntoFijado", "Punto fijado")}
            </div>
            <div
              className="mt-1 truncate text-[12.5px] font-semibold leading-snug"
              style={{ color: "var(--ink)" }}
              title={lectura.direccion || undefined}
            >
              {lectura.direccion ||
                (lectura.resolviendo
                  ? "…"
                  : t("maps.pin.noKnownAddress", "Sin dirección conocida"))}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span
                className="font-mono text-[11px] tabular-nums"
                style={{ color: "var(--ink-soft)" }}
              >
                {formatearCoord(lectura.lat, lectura.lng)}
              </span>
              {lectura.precision && (
                <span
                  className="text-[11px] font-semibold"
                  style={{ color: colorTono(lectura.tonoPrecision) }}
                >
                  · {lectura.precision}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {hud}
      {pop.portal}
    </div>
  );
}
