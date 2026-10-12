/**
 * EL MAPA DE LA PLATAFORMA — una sola reserva de `google.maps.Map` para todo el CRM.
 *
 * ── POR QUÉ EXISTE ──────────────────────────────────────────────────────────
 * Google factura CADA `new google.maps.Map(...)` como una "carga de mapa
 * dinámico" (SKU Dynamic Maps). No factura el script, ni el desplazamiento, ni
 * el zoom, ni cambiar capas: factura el constructor. Cambiar de pantalla,
 * volver a un paso del asistente o reabrir un modal costaba un mapa nuevo.
 *
 * Aquí se construye el mapa UNA vez y se PRESTA: vive en un `<div>` propio que
 * se engancha dentro del hueco de quien lo pide y, al desmontar, se DEVUELVE
 * (desenganchado del DOM, no destruido). El siguiente que lo pide se lleva el
 * mismo objeto. Resultado: 1 carga por recarga de página y por grupo; 2 si una
 * pantalla enseña dos mapas a la vez (y luego se reutilizan los dos).
 *
 * TODO consumidor de mapas pasa por `acquireMap`. Fuera de este archivo no debe
 * haber ningún `new google.maps.Map`.
 *
 * ── LOS GRUPOS (por qué no es UNO solo) ─────────────────────────────────────
 * `mapId` y `colorScheme` sólo se fijan al construir: un mapa no puede cambiar
 * de uno a otro después. Hay dos mundos en el CRM y no se pueden mezclar:
 *
 *   · "raster" (sin `mapId`): mapa de operaciones, rutas en vivo, rastro GPS,
 *     editor de rutas y editor de geocercas. Su aspecto acromático sale del
 *     array `styles`, que un mapa con `mapId` IGNORA. Además el tema (claro,
 *     oscuro, «Estándar», noche…) cambia en caliente con `setOptions`, así que
 *     UNA instancia sirve para todos los temas. No usan `AdvancedMarkerElement`.
 *   · "v:<mapId>:<LIGHT|DARK>" (vectorial): `GoogleMapEmbed` y
 *     `AddressAutocomplete`. Pintan chinchetas DOM con `AdvancedMarkerElement`,
 *     que exige `mapId`, y tiñen las teselas con `colorScheme`, que es inmutable.
 *
 * El antiguo «la geocerca salía en blanco con un mapId» no era por los overlays
 * clásicos (Polygon/Polyline/Circle/Marker pintan en mapas vectoriales): era un
 * `AdvancedMarkerElement` sobre un `mapId` no válido para la clave. Unificar en
 * vectorial costaría el gris acromático del CRM (y los temas por usuario);
 * unificar en ráster obligaría a rehacer las chinchetas DOM de las fichas. Se
 * quedan dos grupos, y dentro de cada uno, reutilización total.
 *
 * ── TRASPASO LIMPIO ─────────────────────────────────────────────────────────
 * Lo que un consumidor dibuja NO puede aparecer en la pantalla siguiente:
 *   · `track(overlay)` registra marcadores, polilíneas, polígonos, círculos,
 *     `AdvancedMarkerElement`, `InfoWindow`, `OverlayView`… y `release()` los
 *     quita. Un overlay que el consumidor ya quitó por su cuenta se olvida solo
 *     (`map_changed`), así que un tablero que crea y borra miles de marcadores
 *     no acumula referencias.
 *   · `listen(...)` y `onRelease(fn)` para oyentes y limpiezas a medida.
 *   · Al devolver, además, se limpian SIEMPRE: oyentes del mapa, la capa
 *     `map.data`, los controles empujados a `map.controls`, Street View.
 *   · Al prestar se reponen las opciones a una BASE conocida (tipo de mapa,
 *     controles, gestos, estilos, cursores, límites de zoom) + las del que pide.
 *   · `track()` sobre un préstamo ya devuelto quita el overlay al instante: una
 *     respuesta de red que llega tarde no pinta en el mapa del siguiente.
 *
 * ── CACHÉ DE VISTA ──────────────────────────────────────────────────────────
 * Con `vista: "<clave>"` se recuerda en memoria el último centro/zoom de esa
 * área al devolver el mapa, y al volver se restaura (`vistaRestaurada: true`
 * avisa al consumidor para que NO vuelva a encuadrar). Sólo memoria: Google no
 * permite guardar su contenido más allá de una caché temporal.
 *
 * ── MEMORIA ─────────────────────────────────────────────────────────────────
 * Cada mapa libre retiene su `<div>`, sus teselas y (si es vectorial) un
 * contexto WebGL — el navegador sólo admite unos 16. Se guardan como mucho
 * MAX_LIBRES_POR_GRUPO por grupo y MAX_LIBRES en total; el resto se deja al GC.
 *
 * ── CONTRATO DE EVENTOS (telemetría de consumo; aquí no se envía nada) ──────
 * En `window`, como `CustomEvent`:
 *   · `cg:mapa-creado`      detail `{ area, grupo }` — una carga FACTURABLE.
 *   · `cg:mapa-reutilizado` detail `{ area, grupo }` — préstamo sin coste.
 *   · `cg:google-uso`       detail `{ sku, area }`   — otra llamada facturable
 *     hecha desde el navegador (`places_autocomplete_session`, `places_details`,
 *     `geocoding`…). Se emite SÓLO cuando la petición sale de verdad (después
 *     de mirar la caché): un acierto de caché no cuenta.
 * `area` es un id corto y estable del consumidor ("control-center", "trail"…).
 * Para QA: `window.__cgMapas = { creados, reutilizados, libres }`.
 *
 * ── SEGURIDAD ANTE FALLOS ───────────────────────────────────────────────────
 * Está en el camino del alta de clientes y de puestos: ante cualquier error se
 * construye un mapa nuevo, que es el comportamiento de siempre.
 * `VITE_MAP_POOL=0` desactiva la reutilización entera (un mapa por montaje).
 */

export interface OpcionesPrestamo {
  /** Id corto y estable del consumidor (telemetría). */
  area: string;
  /** Clave de la caché de vista (centro/zoom). Sin ella no se recuerda nada. */
  vista?: string;
}

export interface PooledMap {
  /** La instancia de `google.maps.Map` lista para usar. */
  map: any;
  /** Grupo de la reserva al que pertenece. */
  grupo: string;
  /** `true` si vino de la reserva (no costó nada). */
  reutilizado: boolean;
  /** `true` si se restauró el centro/zoom guardado de `vista`. */
  vistaRestaurada: boolean;
  /** Registra un overlay para quitarlo al devolver. Devuelve el mismo objeto. */
  track: <T>(overlay: T) => T;
  /** `google.maps.event.addListener` que se quita solo al devolver. */
  listen: (target: any, evento: string, fn: (...a: any[]) => void) => any;
  /** Limpieza a medida al devolver (p. ej. `autocomplete.unbindAll()`). */
  onRelease: (fn: () => void) => void;
  /** Devuélvelo al desmontar. Limpia y desengancha; NO destruye el mapa. */
  release: () => void;
}

type Libre = { host: HTMLDivElement; map: any; grupo: string };

/** Mapas libres, por grupo. */
const libres = new Map<string, Libre[]>();
/** Último centro/zoom por área. Sólo memoria (ver cabecera). */
const vistas = new Map<string, { center: { lat: number; lng: number }; zoom: number }>();

const MAX_LIBRES_POR_GRUPO = 2;
const MAX_LIBRES = 4;

const contador = { creados: 0, reutilizados: 0 };

if (typeof window !== "undefined") {
  (window as any).__cgMapas = {
    get creados() {
      return contador.creados;
    },
    get reutilizados() {
      return contador.reutilizados;
    },
    get libres() {
      let n = 0;

      libres.forEach((l) => (n += l.length));

      return n;
    },
  };
}

function poolEnabled(): boolean {
  return (import.meta as any).env?.VITE_MAP_POOL !== "0";
}

/** Emite un evento de telemetría. Nunca rompe a quien llama. */
function emitir(nombre: string, detail: Record<string, unknown>): void {
  try {
    window.dispatchEvent(new CustomEvent(nombre, { detail }));
  } catch {
    /* sin `window` o sin CustomEvent: no se mide, y ya */
  }
}

/** Consumo facturable de un servicio de Google hecho desde el navegador. */
export function avisarUsoGoogle(sku: string, area: string): void {
  emitir("cg:google-uso", { sku, area });
}

export function grupoDe(options: any): string {
  if (!options?.mapId) return "raster";
  const cs = String(options.colorScheme ?? "LIGHT").toUpperCase();

  return `v:${options.mapId}:${cs.includes("DARK") ? "DARK" : "LIGHT"}`;
}

/**
 * Lo que un préstamo anterior pudo cambiar, devuelto a sus valores de serie.
 * `undefined` en `setOptions` deja la opción como si nunca se hubiera puesto
 * (los controles vuelven a su visibilidad por defecto).
 */
function base(grupo: string): Record<string, unknown> {
  const b: Record<string, unknown> = {
    mapTypeId: "roadmap",
    disableDefaultUI: undefined,
    zoomControl: undefined,
    mapTypeControl: undefined,
    streetViewControl: undefined,
    fullscreenControl: undefined,
    rotateControl: undefined,
    scaleControl: undefined,
    cameraControl: undefined,
    zoomControlOptions: undefined,
    mapTypeControlOptions: undefined,
    fullscreenControlOptions: undefined,
    streetViewControlOptions: undefined,
    gestureHandling: undefined,
    draggable: undefined,
    scrollwheel: undefined,
    keyboardShortcuts: undefined,
    disableDoubleClickZoom: undefined,
    clickableIcons: undefined,
    draggableCursor: undefined,
    draggingCursor: undefined,
    minZoom: null,
    maxZoom: null,
    restriction: null,
    heading: 0,
    tilt: 0,
  };

  // `styles` sólo existe en ráster; en vectorial Google lo ignora y avisa.
  if (grupo === "raster") b.styles = null;

  return b;
}

function makeHost(): HTMLDivElement {
  const host = document.createElement("div");

  host.style.width = "100%";
  host.style.height = "100%";

  return host;
}

function quitarOverlay(o: any): void {
  try {
    if (typeof o?.close === "function") o.close();
  } catch {
    /* ignorar */
  }
  try {
    if (typeof o?.setMap === "function") o.setMap(null);
    else if (o && "map" in o) o.map = null;
  } catch {
    /* ignorar */
  }
}

/**
 * Presta un mapa montado dentro de `container`.
 *
 * `options` se aplica siempre (también al reutilizar) encima de la BASE, así que
 * centro, zoom, tipo y controles quedan como los pide quien llama.
 */
export function acquireMap(
  container: HTMLElement,
  options: any,
  prestamo: OpcionesPrestamo,
): PooledMap {
  const google = (window as any).google;
  const grupo = grupoDe(options);
  const area = prestamo?.area || "desconocida";
  const claveVista = prestamo?.vista;
  const guardada = claveVista ? vistas.get(claveVista) : undefined;
  const opciones = guardada
    ? { ...options, center: guardada.center, zoom: guardada.zoom }
    : options;

  let entrada: Libre | null = null;
  let reutilizado = false;

  if (poolEnabled()) {
    const cola = libres.get(grupo);
    const candidato = cola && cola.pop();

    if (candidato) {
      try {
        container.appendChild(candidato.host);
        // `mapId` y `colorScheme` son inmutables: el grupo ya garantiza que
        // coinciden, y pasarlos a `setOptions` sólo genera avisos.
        const { mapId, colorScheme, backgroundColor, ...resto } = opciones || {};

        candidato.map.setOptions({ ...base(grupo), ...resto });
        // Re-fijar el centro fuerza el repintado tras volver a engancharse.
        if (resto.center) candidato.map.setCenter(resto.center);
        entrada = candidato;
        reutilizado = true;
      } catch (err) {
        if ((import.meta as any).env?.DEV)
          console.warn("[mapPool] no se pudo reutilizar; se construye otro", err);
        try {
          candidato.host.remove();
        } catch {
          /* ignorar */
        }
      }
    }
  }

  if (!entrada) {
    const host = makeHost();

    container.appendChild(host);
    const map = new google.maps.Map(host, opciones);

    entrada = { host, map, grupo };
    contador.creados += 1;
    emitir("cg:mapa-creado", { area, grupo });
  } else {
    contador.reutilizados += 1;
    emitir("cg:mapa-reutilizado", { area, grupo });
  }

  const map = entrada.map;
  const overlays = new Set<any>();
  const escuchas: any[] = [];
  const limpiezas: Array<() => void> = [];
  let liberado = false;

  const track = <T>(o: T): T => {
    const ov: any = o;

    if (!ov) return o;
    if (liberado) {
      quitarOverlay(ov);

      return o;
    }
    overlays.add(ov);
    try {
      // Si el consumidor lo quita (o lo vuelve a poner) por su cuenta, la lista
      // le sigue: así no se retienen overlays ya muertos.
      if (typeof ov.addListener === "function" && typeof ov.getMap === "function") {
        ov.addListener("map_changed", () => {
          if (liberado) return;
          if (ov.getMap() === map) overlays.add(ov);
          else overlays.delete(ov);
        });
      }
    } catch {
      /* sin MVC: se queda en la lista hasta devolver */
    }

    return o;
  };

  const listen = (target: any, evento: string, fn: (...a: any[]) => void) => {
    const l = google.maps.event.addListener(target, evento, fn);

    if (liberado) {
      l?.remove?.();

      return l;
    }
    escuchas.push(l);

    return l;
  };

  const release = () => {
    if (liberado) return;
    liberado = true;
    const g = (window as any).google;

    if (claveVista) {
      try {
        const c = map.getCenter?.();
        const z = map.getZoom?.();

        if (c && Number.isFinite(z))
          vistas.set(claveVista, { center: { lat: c.lat(), lng: c.lng() }, zoom: z });
      } catch {
        /* sin vista que guardar */
      }
    }

    limpiezas.forEach((fn) => {
      try {
        fn();
      } catch {
        /* ignorar */
      }
    });
    Array.from(overlays).forEach(quitarOverlay);
    overlays.clear();
    escuchas.forEach((l) => {
      try {
        l?.remove?.();
      } catch {
        /* ignorar */
      }
    });

    try {
      // Oyentes que el consumidor puso directamente sobre el mapa.
      g?.maps?.event?.clearInstanceListeners?.(map);
    } catch {
      /* ignorar */
    }
    try {
      const data = map.data;

      if (data) {
        data.forEach((f: any) => data.remove(f));
        data.setStyle({});
        g?.maps?.event?.clearInstanceListeners?.(data);
      }
    } catch {
      /* ignorar */
    }
    try {
      const posiciones = new Set<number>(
        Object.values(g?.maps?.ControlPosition || {}).filter(
          (v): v is number => typeof v === "number",
        ),
      );

      posiciones.forEach((p) => map.controls?.[p]?.clear?.());
    } catch {
      /* ignorar */
    }
    try {
      map.getStreetView?.()?.setVisible?.(false);
    } catch {
      /* ignorar */
    }
    try {
      entrada!.host.remove();
    } catch {
      /* ignorar */
    }

    if (!poolEnabled()) return;
    let total = 0;

    libres.forEach((l) => (total += l.length));
    const cola = libres.get(entrada!.grupo) || [];

    // Por encima del tope se deja morir: el GC lo recoge.
    if (cola.length >= MAX_LIBRES_POR_GRUPO || total >= MAX_LIBRES) return;
    cola.push(entrada!);
    libres.set(entrada!.grupo, cola);
  };

  return {
    map,
    grupo,
    reutilizado,
    vistaRestaurada: !!guardada,
    track,
    listen,
    onRelease: (fn) => {
      if (liberado) fn();
      else limpiezas.push(fn);
    },
    release,
  };
}

/** Sólo para pruebas o para liberar memoria a propósito. */
export function drainMapPool(): void {
  libres.clear();
  vistas.clear();
}

/** Clave corta y estable a partir de una cadena larga (firma de una ruta…). */
export function huellaCorta(s: string): string {
  let h = 5381;

  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;

  return (h >>> 0).toString(36);
}

/**
 * Mide el autocompletado clásico de Places (`google.maps.places.Autocomplete`).
 *
 * El widget agrupa las pulsaciones en una SESIÓN él solo (no hace falta
 * `AutocompleteSessionToken`; eso es para `AutocompleteService`). Se factura la
 * sesión y el Place Details del sitio elegido. Se avisa al empezar a escribir
 * (abre sesión) y al elegir un sitio (detalles, cierra sesión). Devuelve la
 * limpieza.
 */
export function medirAutocompletado(
  input: HTMLInputElement,
  ac: any,
  area: string,
): () => void {
  let abierta = false;
  const alEscribir = () => {
    if (abierta || !input.value.trim()) return;
    abierta = true;
    avisarUsoGoogle("places_autocomplete_session", area);
  };

  input.addEventListener("input", alEscribir);
  const l = ac?.addListener?.("place_changed", () => {
    try {
      if (ac.getPlace?.()?.geometry) avisarUsoGoogle("places_details", area);
    } catch {
      /* ignorar */
    }
    abierta = false;
  });

  return () => {
    input.removeEventListener("input", alEscribir);
    try {
      l?.remove?.();
    } catch {
      /* ignorar */
    }
  };
}
