import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Route as RouteIcon } from "lucide-react";
import { loadGoogleMaps } from "@/utils/loadGoogleMaps";
import { estiloMapa, huella, pielDe, useMapPalette, type MapPalette } from "@/utils/mapTheme";
import { chipPin, iconoDe, orbPin } from "@/utils/mapPins";
import { metrosEntre, useMotorMapa, type Tono } from "@/utils/mapMotion";
import {
  useMapPopup, mapPopupActions, mapPopupItems,
  type MapPopupData, type MapPopupMetric,
} from "@/components/maps/MapPopup";
import { fechaHora, haceCuanto, kmh } from "./trackGeometry";
import "@/styles/map.css";

/** One plotted stop of a vehicle-patrol route (a point with valid coordinates). */
export interface RouteStopMarker {
  id: string;
  routeId: string;
  routeName: string;
  siteName: string;
  address?: string;
  lat: number;
  lng: number;
  order: number;
  done: boolean;
}

/** Una persona en servicio con posición conocida — vigilante o supervisor. */
export interface LiveUnit {
  /** Estable entre sondeos y entre eventos del canal en vivo (`g-…` / `sup-…`). */
  id: string;
  kind: "guard" | "supervisor";
  nombre: string;
  /** Segunda línea: puesto, zona o turno. */
  sub?: string;
  lat: number;
  lng: number;
  /** Instante del último dato recibido. */
  at?: string | null;
  bateria?: number | null;
  /** m/s, si el dispositivo lo manda. */
  velocidad?: number | null;
  telefono?: string | null;
  /** Desde cuándo está en servicio. */
  desde?: string | null;
  /** Id del vigilante para pedir su recorrido. Sin esto no hay historial. */
  guardId?: string | null;
}

type MapType = "roadmap" | "satellite" | "hybrid" | "terrain";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * MAPA DE SEGUIMIENTO EN VIVO
 *
 * Dos capas sobre las mismas teselas acromáticas del CRM:
 *
 *   · LA RUTA — las paradas de patrulla del día, como fichas de cristal
 *     numeradas y una línea con HALO (una polilínea ancha y tenue debajo y otra
 *     fina y viva encima; sobre teselas casi negras una sola línea se pierde).
 *   · LAS UNIDADES — vigilantes y supervisores en servicio. NO saltan de ping a
 *     ping: se DESLIZAN, con la proa mirando hacia donde avanzan, y sólo late lo
 *     que de verdad está mandando señal. Eso lo pone `utils/mapMotion.ts`; aquí
 *     únicamente se le entregan destinos.
 *
 * ── LOS TRES ESTADOS ────────────────────────────────────────────────────────
 * `en servicio` (se mueve) · `detenido` (manda señal pero lleva rato quieto —
 * lo normal en un puesto fijo, por eso NO es una alarma) · `sin señal` (hace más
 * de cinco minutos que no llega nada: se apaga el latido y se va a tinta tenue).
 * El latido SÓLO se enciende cuando hay señal viva; si latiera siempre no
 * significaría nada.
 *
 * UN solo camino para ese pulso: lo pone `motor.latido()` (DOM sobre un
 * `OverlayView`) y por eso las chinchetas de este mapa NUNCA llevan `vivo` — las
 * dos cosas hacen lo mismo y juntas salen dos halos sobre el mismo punto. Y la
 * posición la escribe SÓLO `motor.seguir()`: nadie llama a `setPosition` por su
 * cuenta, o serían dos manos escribiendo el mismo valor y el marcador daría
 * tirones que parecen «el GPS va mal».
 *
 * ── COSTE ───────────────────────────────────────────────────────────────────
 * `new google.maps.Map()` es una carga FACTURABLE. Aquí hay UNA instancia y vive
 * lo que vive el componente: cambiar el tipo de mapa, el tema o el acento
 * reconfigura la que ya existe (`setOptions`), nunca crea otra.
 *
 * ── COLOR ───────────────────────────────────────────────────────────────────
 * Ni un color escrito a mano: verde/ámbar/tinta semánticos y el acento del CRM,
 * todos leídos de las variables en tiempo de ejecución (`utils/mapTheme.ts`),
 * porque la API de Google no acepta `var()`.
 * ════════════════════════════════════════════════════════════════════════════
 */

/** A partir de este zoom la parada muestra su nombre. */
const ZOOM_FICHA = 13;
/** Sin datos nuevos durante este rato, la unidad está SIN SEÑAL. */
const MS_SIN_SENAL = 5 * 60000;
/** Quieta más de esto (habiendo señal), la unidad está DETENIDA. */
const MS_DETENIDO = 3 * 60000;
/** Desplazamiento que cuenta como movimiento de verdad y no ruido del GPS. */
const M_MOVIMIENTO = 15;
/** Cada cuánto se revisa si alguna unidad se quedó rancia (sin ping nuevo). */
const MS_REVISION = 20000;

type EstadoUnidad = "activo" | "detenido" | "sinSenal";

// Mapa de módulo: la etiqueta se traduce donde se pinta (`clave`), nunca aquí,
// porque un t() a la carga del módulo congela el idioma de arranque.
const ESTADO: Record<EstadoUnidad, { clave: string; etiqueta: string; tono: Tono; pop: "ok" | "info" | "neutral" }> = {
  activo: { clave: "tracking.unitState.active", etiqueta: "En servicio", tono: "bien", pop: "ok" },
  detenido: { clave: "tracking.unitState.stopped", etiqueta: "Detenido", tono: "info", pop: "info" },
  sinSenal: { clave: "tracking.unitState.noSignal", etiqueta: "Sin señal", tono: "tenue", pop: "neutral" },
};

interface RegistroUnidad {
  marker: any;
  datos: LiveUnit;
  estado: EstadoUnidad;
  /** Clave visual del icono: mientras no cambie, no se regenera el SVG. */
  clave: string;
  rumbo: number | null;
  /** Última vez que se movió de verdad, en época del navegador. */
  movidoEn: number;
  lat: number;
  lng: number;
}

function estiloPara(pal: MapPalette, mapType: MapType): any[] | undefined {
  // Satélite/híbrido/terreno traen su propia imagen: estilizarlos no aplica.
  return mapType === "roadmap" ? estiloMapa(pal) : undefined;
}

function colorDeEstado(pal: MapPalette, estado: EstadoUnidad): string {
  return estado === "activo" ? pal.ok : estado === "detenido" ? pal.info : pal.inkFaint;
}

/** Las dos cifras grandes del globo de una unidad. Vive fuera del componente
 *  porque se calculan en dos sitios —al abrir y en cada refresco en vivo— y
 *  tienen que decir exactamente lo mismo. */
function metricasDe(u: LiveUnit, estado: EstadoUnidad, t: TFunction): MapPopupMetric[] {
  return mapPopupItems<MapPopupMetric>(
    { label: t("ui.AlarmCaseDetail.ultimaSenal", "Última señal"), value: haceCuanto(u.at), tone: estado === "sinSenal" ? "warn" : undefined },
    u.bateria != null
      ? { label: "Batería", value: `${Math.round(u.bateria)}%`, tone: u.bateria <= 20 ? "bad" : undefined }
      : null,
  );
}

export default function RouteTrackingMap({
  stops,
  units = [],
  mapType = "roadmap",
  showGeofence = false,
  geofenceRadius = 120,
  height = 380,
  defaultCenter,
  hud = true,
}: {
  stops: RouteStopMarker[];
  /** Vigilantes y supervisores en servicio. Sin esto el mapa es el de siempre. */
  units?: LiveUnit[];
  mapType?: MapType;
  showGeofence?: boolean;
  geofenceRadius?: number;
  height?: number;
  defaultCenter?: { lat: number; lng: number; zoom?: number };
  /** Panel de cristal flotante con el avance del día. */
  hud?: boolean;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const linesRef = useRef<any[]>([]);
  const circlesRef = useRef<any[]>([]);
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ficha, setFicha] = useState(true);
  const fichaRef = useRef(true);

  const pal = useMapPalette();
  const piel = useMemo(() => pielDe(pal), [pal]);
  const version = useMemo(() => huella(pal), [pal]);

  const motor = useMotorMapa(mapRef.current, ready);
  const pop = useMapPopup(() => mapRef.current);
  const popRef = useRef(pop);
  popRef.current = pop;

  /** Unidad que la cámara está siguiendo, si alguna. */
  const siguiendoRef = useRef<string | null>(null);
  /** El encuadre sobre el personal se hace UNA vez: repetirlo en cada sondeo le
   *  arrebataría la vista al operador cada quince segundos. */
  const encuadradoRef = useRef(false);

  const resumen = useMemo(() => {
    const rutas = new Set(stops.map((s) => s.routeId));
    const hechas = new Set(stops.filter((s) => s.done).map((s) => s.routeId));
    const paradas = stops.length;
    const paradasHechas = stops.filter((s) => s.done).length;
    return {
      rutas: rutas.size,
      hechas: hechas.size,
      paradas,
      paradasHechas,
      pct: paradas > 0 ? Math.round((paradasHechas / paradas) * 100) : 0,
    };
  }, [stops]);

  // one-time map init
  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps()
      .then(() => {
        if (cancelled || !ref.current) return;
        const g = (window as any).google;
        const first = stops[0];
        const initCenter = defaultCenter
          ? { lat: defaultCenter.lat, lng: defaultCenter.lng }
          : first
            ? { lat: first.lat, lng: first.lng }
            : { lat: -0.18, lng: -78.46 };
        mapRef.current = new g.maps.Map(ref.current, {
          center: initCenter,
          zoom: defaultCenter?.zoom ?? 12,
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: "greedy",
          clickableIcons: false,
          mapTypeId: mapType,
          styles: estiloPara(pal, mapType),
          backgroundColor: pal.tierra,
        });

        const revisarZoom = () => {
          const z = mapRef.current?.getZoom?.() ?? 12;
          const quiere = z >= ZOOM_FICHA;
          if (quiere !== fichaRef.current) { fichaRef.current = quiere; setFicha(quiere); }
        };
        mapRef.current.addListener("idle", revisarZoom);
        // Arrastrar el mapa suelta el seguimiento: si el operador agarró la
        // vista, manda él y no la unidad.
        mapRef.current.addListener("dragstart", () => { siguiendoRef.current = null; });
        revisarZoom();
        setReady(true);
      })
      .catch((e) => setErr(e?.message || "No se pudo cargar el mapa"));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // react to map-type + theme/accent changes
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    mapRef.current.setOptions({
      mapTypeId: mapType,
      styles: estiloPara(pal, mapType),
      backgroundColor: pal.tierra,
    });
  }, [mapType, pal, ready]);

  // sync markers / polylines / geofences whenever the stops change
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const g = (window as any).google;

    // clear previous overlays
    markersRef.current.forEach((m) => m.setMap(null));
    linesRef.current.forEach((l) => l.setMap(null));
    circlesRef.current.forEach((c) => c.setMap(null));
    markersRef.current = [];
    linesRef.current = [];
    circlesRef.current = [];

    const bounds = new g.maps.LatLngBounds();
    let any = false;

    // group stops by route so each route gets its own ordered polyline
    const byRoute = new Map<string, RouteStopMarker[]>();
    stops.forEach((s) => {
      if (!byRoute.has(s.routeId)) byRoute.set(s.routeId, []);
      byRoute.get(s.routeId)!.push(s);
    });

    byRoute.forEach((group) => {
      const ordered = group.slice().sort((a, b) => a.order - b.order);
      const path: any[] = [];

      ordered.forEach((s, idx) => {
        const pos = { lat: s.lat, lng: s.lng };
        const color = s.done ? pal.ok : pal.warn;
        const numero = String(idx + 1);
        const asset = ficha
          ? chipPin({ etiqueta: s.siteName, insignia: numero, color, piel, version })
          : orbPin({ color, insignia: numero, piel, version });

        const marker = new g.maps.Marker({
          map: mapRef.current,
          position: pos,
          icon: iconoDe(g, asset),
          title: s.siteName,
          zIndex: 400 + idx,
        });
        marker.addListener("click", () => {
          const datos: MapPopupData = {
            id: s.id,
            kind: "station",
            title: s.siteName,
            subtitle: `${s.routeName} · parada ${idx + 1}`,
            status: {
              label: s.done ? "Completada" : "Pendiente",
              tone: s.done ? "ok" : "warn",
            },
            fields: mapPopupItems(
              { label: "Ruta", value: s.routeName },
              { label: "Orden", value: `#${s.order}`, mono: true },
              s.address ? { label: "Dirección", value: s.address, wide: true } : null,
            ),
            actions: mapPopupItems(
              mapPopupActions.center(() => motor?.camara.volarA(pos, { zoom: 17 })),
              mapPopupActions.directions(s.lat, s.lng),
            ),
            // La altura de la chincheta la sabe este mapa y sólo este mapa: la
            // ficha cuelga 50 px sobre la coordenada y sin subir el globo se
            // taparían la una a la otra.
            offsetY: ficha ? -52 : -26,
          };
          popRef.current.open(marker, datos);
        });
        markersRef.current.push(marker);

        if (showGeofence) {
          circlesRef.current.push(
            new g.maps.Circle({
              map: mapRef.current,
              center: pos,
              radius: geofenceRadius,
              strokeColor: color,
              strokeOpacity: 0.55,
              strokeWeight: 1,
              fillColor: color,
              fillOpacity: 0.08,
              clickable: false,
            }),
          );
        }

        path.push(pos);
        bounds.extend(pos);
        any = true;
      });

      if (path.length > 1) {
        const done = ordered.every((s) => s.done);
        // El trazo va en DOS pasadas: halo ancho y tenue debajo, línea fina y
        // viva encima. Una sola polilínea sobre teselas casi negras se pierde;
        // el halo es lo que la hace «encenderse».
        const color = done ? pal.ok : pal.brand;
        linesRef.current.push(
          new g.maps.Polyline({
            map: mapRef.current, path, geodesic: true, clickable: false,
            strokeColor: color, strokeOpacity: 0.18, strokeWeight: 11, zIndex: 1,
          }),
          new g.maps.Polyline({
            map: mapRef.current, path, geodesic: true, clickable: false,
            strokeColor: color, strokeOpacity: 0.95, strokeWeight: 2.5, zIndex: 2,
          }),
        );
      }
    });

    if (any && !defaultCenter) {
      if (stops.length > 1) mapRef.current.fitBounds(bounds, 64);
      else mapRef.current.setCenter({ lat: stops[0].lat, lng: stops[0].lng });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stops, ready, showGeofence, geofenceRadius, defaultCenter, pal, piel, version, ficha, motor]);

  /* ── Capa en vivo ─────────────────────────────────────────────────────── */

  const unidadesRef = useRef<Map<string, RegistroUnidad>>(new Map());
  /** Late cada 20 s para que «sin señal» aparezca sin esperar a un ping nuevo. */
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!units.length) return;
    const iv = window.setInterval(() => setRevision((n) => n + 1), MS_REVISION);
    return () => window.clearInterval(iv);
  }, [units.length]);

  const globoDeUnidad = useCallback((id: string) => {
    const rec = unidadesRef.current.get(id);
    if (!rec) return;
    const u = rec.datos;
    const e = ESTADO[rec.estado];
    const dia = new Date().toISOString().slice(0, 10);

    const acciones = mapPopupItems(
      u.kind === "guard" && u.guardId
        ? {
            id: "recorrido",
            label: t("tracking.viewTodayRoute", "Ver recorrido de hoy"),
            icon: <RouteIcon />,
            variant: "primary" as const,
            onClick: () => navigate(`/tracking-history?guard=${encodeURIComponent(u.guardId!)}&from=${dia}&to=${dia}`),
          }
        : null,
      {
        ...mapPopupActions.center(() => {
          siguiendoRef.current = id;
          // La posición INTERPOLADA, no la del último ping: entre pings el
          // marcador ya se movió y centrar en el ping lo dejaría descuadrado.
          const p = motor?.posicionDe(id) ?? { lat: rec.lat, lng: rec.lng };
          motor?.camara.volarA(p, { zoom: 17 });
        }),
        label: "Centrar y seguir",
      },
      mapPopupActions.call(u.telefono),
      mapPopupActions.directions(rec.lat, rec.lng),
    );

    const datos: MapPopupData = {
      id,
      kind: u.kind === "supervisor" ? "supervisor" : "guard",
      title: u.nombre,
      subtitle: `${u.kind === "supervisor" ? "Supervisor" : "Vigilante"}${u.sub ? ` · ${u.sub}` : ""}`,
      status: { label: t(e.clave, e.etiqueta), tone: e.pop, live: rec.estado !== "sinSenal" },
      metrics: metricasDe(u, rec.estado, t),
      fields: mapPopupItems(
        { label: "Velocidad", value: kmh(u.velocidad ?? null), mono: true },
        { label: "En servicio desde", value: u.desde ? fechaHora(u.desde) : "—", mono: true },
        { label: "Coordenadas", value: `${rec.lat.toFixed(5)}, ${rec.lng.toFixed(5)}`, mono: true, wide: true },
      ),
      note: rec.estado === "sinSenal"
        ? "El dispositivo lleva más de cinco minutos sin reportar. La chincheta muestra la última posición conocida."
        : undefined,
      actions: acciones,
      // El orbe está anclado por su CENTRO: sin subir el globo, saldría encima.
      offsetY: -26,
    };
    // Se ancla al MARCADOR, no a una coordenada: así el globo viaja con la
    // chincheta mientras `mapMotion` la desliza entre pings.
    popRef.current.open(rec.marker, datos);
  }, [motor, navigate]);

  /** El oyente del marcador se registra UNA vez; esto le da siempre la versión
   *  fresca del constructor del globo, sin volver a suscribir nada. */
  const globoDeUnidadRef = useRef(globoDeUnidad);
  globoDeUnidadRef.current = globoDeUnidad;

  useEffect(() => {
    if (!ready || !mapRef.current || !motor) return;
    const g = (window as any).google;
    const registro = unidadesRef.current;
    const ahora = Date.now();
    const vivos = new Set<string>();

    units.forEach((u) => {
      if (!Number.isFinite(u.lat) || !Number.isFinite(u.lng)) return;
      vivos.add(u.id);

      let rec = registro.get(u.id);
      if (!rec) {
        const marker = new g.maps.Marker({
          map: mapRef.current,
          position: { lat: u.lat, lng: u.lng },
          title: u.nombre,
          zIndex: 800,
        });
        // El oyente se registra UNA vez y lee del registro, no del cierre: así
        // el globo enseña siempre el último dato y no el de cuando se creó.
        marker.addListener("click", () => globoDeUnidadRef.current(u.id));
        rec = {
          marker,
          datos: u,
          estado: "activo",
          clave: "",
          rumbo: null,
          movidoEn: ahora,
          lat: u.lat,
          lng: u.lng,
        };
        registro.set(u.id, rec);
      }

      if (metrosEntre({ lat: rec.lat, lng: rec.lng }, u) >= M_MOVIMIENTO) rec.movidoEn = ahora;
      rec.datos = u;
      rec.lat = u.lat;
      rec.lng = u.lng;

      const visto = u.at ? new Date(u.at).getTime() : NaN;
      const antiguedad = Number.isFinite(visto) ? ahora - visto : Infinity;
      rec.estado = antiguedad > MS_SIN_SENAL
        ? "sinSenal"
        : ahora - rec.movidoEn > MS_DETENIDO
          ? "detenido"
          : "activo";

      const color = colorDeEstado(pal, rec.estado);
      const insignia = u.kind === "supervisor" ? "S" : "V";
      const clave = `${rec.estado}|${version}|${insignia}`;
      const pintar = () => {
        rec!.marker.setIcon(
          iconoDe(g, orbPin({
            color,
            insignia,
            piel,
            version,
            // Sólo lo que se mueve lleva proa: una flecha en alguien parado
            // apunta a donde estuvo hace rato y miente.
            rumbo: rec!.estado === "activo" ? rec!.rumbo ?? undefined : undefined,
            tamano: u.kind === "supervisor" ? "md" : "sm",
          })),
        );
      };
      if (clave !== rec.clave) {
        rec.clave = clave;
        pintar();
      }

      // `seguir` ES la forma de mover el marcador: nadie más le escribe la
      // posición, o darían tirones dos manos escribiendo el mismo valor.
      motor.seguir(u.id, rec.marker, { lat: u.lat, lng: u.lng }, {
        duracion: "auto",
        rumbo: true,
        // Por encima del umbral que trae el motor (4 m) a propósito: la mayoría
        // de los vigilantes están en un puesto FIJO, y con 4 m el temblor del
        // GPS de un teléfono quieto ya hace girar la proa sola.
        minMetrosRumbo: 10,
        alRumbo: (grados) => {
          const r = registro.get(u.id);
          if (!r || r.rumbo === grados) return;
          r.rumbo = grados;
          if (r.estado !== "activo") return;
          try {
            r.marker.setIcon(
              iconoDe(g, orbPin({
                color: colorDeEstado(pal, r.estado),
                insignia: r.datos.kind === "supervisor" ? "S" : "V",
                piel,
                version,
                rumbo: grados,
                tamano: r.datos.kind === "supervisor" ? "md" : "sm",
              })),
            );
          } catch { /* el marcador ya no está en el mapa */ }
        },
      });

      // El latido SÓLO donde hay señal viva. Es lo que le da sentido.
      motor.latido(u.id, { lat: u.lat, lng: u.lng }, {
        activo: rec.estado !== "sinSenal",
        tono: ESTADO[rec.estado].tono,
        radio: 22,
      });

      if (siguiendoRef.current === u.id) motor.camara.volarA({ lat: u.lat, lng: u.lng });
      // El globo abierto se refresca en el sitio: si estás mirando a alguien, la
      // «última señal» y la batería tienen que envejecer solas.
      if (popRef.current.isOpen && popRef.current.openId === u.id) {
        popRef.current.update({
          status: { label: t(ESTADO[rec.estado].clave, ESTADO[rec.estado].etiqueta), tone: ESTADO[rec.estado].pop, live: rec.estado !== "sinSenal" },
          metrics: metricasDe(u, rec.estado, t),
        });
      }
    });

    // Bajas: quien ya no viene en la lista (fichó salida) se retira entero.
    Array.from(registro.keys()).forEach((id) => {
      if (vivos.has(id)) return;
      const rec = registro.get(id)!;
      try { rec.marker.setMap(null); } catch { /* ya estaba fuera */ }
      registro.delete(id);
      if (siguiendoRef.current === id) siguiendoRef.current = null;
      if (popRef.current.openId === id) popRef.current.close();
    });
    motor.conservar(vivos);

    // Sin paradas geolocalizadas nadie encuadra el mapa y el personal se queda
    // fuera de la vista. La primera hornada de unidades lo resuelve.
    if (!encuadradoRef.current && !stops.length && !defaultCenter && vivos.size) {
      encuadradoRef.current = true;
      motor.camara.encuadrar(
        units.filter((u) => vivos.has(u.id)).map((u) => ({ lat: u.lat, lng: u.lng })),
        { padding: 72, zoomMax: 16 },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [units, ready, motor, pal, piel, version, revision, stops.length, defaultCenter]);

  // Al desmontar, los marcadores de las unidades se van con el componente.
  useEffect(() => () => {
    unidadesRef.current.forEach((rec) => {
      try { rec.marker.setMap(null); } catch { /* el mapa ya se destruyó */ }
    });
    unidadesRef.current.clear();
  }, []);

  const conteo = useMemo(() => {
    let activos = 0;
    let detenidos = 0;
    let sinSenal = 0;
    const ahora = Date.now();
    units.forEach((u) => {
      const visto = u.at ? new Date(u.at).getTime() : NaN;
      const rec = unidadesRef.current.get(u.id);
      const antiguedad = Number.isFinite(visto) ? ahora - visto : Infinity;
      if (antiguedad > MS_SIN_SENAL) sinSenal += 1;
      else if (rec && ahora - rec.movidoEn > MS_DETENIDO) detenidos += 1;
      else activos += 1;
    });
    return { activos, detenidos, sinSenal, total: units.length };
    // `revision` entra a propósito: es el latido que refresca los rótulos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [units, revision]);

  if (err) {
    return (
      <div className="grid place-items-center text-center text-sm text-muted-foreground" style={{ height }}>
        <div>
          <p>{err}</p>
          <p className="mt-1 text-xs">Verifica <code>VITE_GOOGLE_MAPS_API_KEY</code>.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="cc-map-frame" style={{ height }}>
      <div ref={ref} className="cc-map-canvas" />

      {hud && (stops.length > 0 || units.length > 0) && (
        <div className="cc-map-hud" style={{ left: 12, bottom: 30, maxWidth: "min(92%, 30rem)" }}>
          <div className="cc-map-card px-3 py-2.5">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              {stops.length > 0 && (
                <>
                  <div className="cc-map-ring-wrap">
                    <div
                      className="cc-map-ring"
                      style={{
                        ["--pct" as any]: resumen.pct,
                        ["--anillo" as any]: resumen.pct >= 80 ? "var(--ok)" : resumen.pct >= 50 ? "var(--warn)" : "var(--brand)",
                      }}
                    />
                    <span>{resumen.pct}%</span>
                  </div>
                  <div>
                    <div className="cc-map-eyebrow">Paradas</div>
                    <div className="cc-map-metric">
                      {resumen.paradasHechas}
                      <span style={{ color: "var(--ink-faint)", fontWeight: 600 }}>/{resumen.paradas}</span>
                    </div>
                  </div>
                  <div className="hidden sm:block">
                    <div className="cc-map-eyebrow">Rutas</div>
                    <div className="cc-map-metric">{resumen.rutas}</div>
                  </div>
                </>
              )}
              {units.length > 0 && (
                <div>
                  <div className="cc-map-eyebrow">En servicio</div>
                  <div className="cc-map-metric" style={{ color: "var(--ok-text)" }}>{conteo.total}</div>
                </div>
              )}
              <div className="ml-auto flex flex-col items-end gap-1">
                {units.length > 0 ? (
                  <>
                    <span className="cc-map-key"><i style={{ color: "var(--ok)" }} />En servicio · {conteo.activos}</span>
                    <span className="cc-map-key"><i style={{ color: "var(--info)" }} />Detenido · {conteo.detenidos}</span>
                    <span className="cc-map-key"><i style={{ color: "var(--ink-faint)" }} />{t("tracking.unitState.noSignal", "Sin señal")} · {conteo.sinSenal}</span>
                  </>
                ) : (
                  <>
                    <span className="cc-map-key"><i style={{ color: "var(--ok)" }} />Completada</span>
                    <span className="cc-map-key"><i style={{ color: "var(--warn)" }} />Pendiente</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {ready && stops.length === 0 && units.length === 0 && (
        <div className="pointer-events-none absolute inset-0 z-[3] grid place-items-center">
          <div className="cc-map-card px-4 py-3 text-center text-sm" style={{ color: "var(--ink-soft)" }}>
            No hay paradas con ubicación ni personal en servicio para mostrar.
          </div>
        </div>
      )}

      {/* Sin esto el globo compartido no se pinta. */}
      {pop.portal}
    </div>
  );
}
