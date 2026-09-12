import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pause, Play, Crosshair, RotateCcw } from "lucide-react";

import {
  analizar,
  detectarParadas,
  distancia,
  duracion,
  fechaHora,
  hora,
  indiceMasCercano,
  kmh,
  posicionEnTiempo,
  simplificarConPresupuesto,
  type Parada,
  type PuntoRecorrido,
} from "./trackGeometry";

import { loadGoogleMaps } from "@/utils/loadGoogleMaps";
import {
  estiloMapa,
  huella,
  pielDe,
  useMapPalette,
  type MapPalette,
} from "@/utils/mapTheme";
import { iconoDe, orbPin } from "@/utils/mapPins";
import { calma, useMotorMapa } from "@/utils/mapMotion";
import {
  useMapPopup,
  mapPopupActions,
  mapPopupItems,
  type MapPopupData,
  type MapPopupMetric,
} from "@/components/maps/MapPopup";
import "@/styles/map.css";
import i18n from "@/i18n";
import { localeActual } from "@/lib/localeActual";
import { CENTRO_DE_RESPALDO } from "@/utils/tenantLocation";
/** Un ping del GPS. Se re-exporta desde la geometría para no partir el tipo en
 *  dos: la página del historial lo importa desde aquí desde siempre. */
export type TrailPoint = PuntoRecorrido;

/**
 * ════════════════════════════════════════════════════════════════════════════
 * RECORRIDO DEL VIGILANTE
 *
 * No una línea muerta: un recorrido que se LEE. Cuatro piezas:
 *
 *   · DIRECCIÓN — flechas sobre el trazo. Sin ellas, una polilínea no dice si
 *     el vigilante subió o bajó la calle, y esa es la primera pregunta.
 *   · PARADAS — donde estuvo quieto de verdad, con cuánto tiempo. Es lo que
 *     convierte el trazo en una jornada: aquí media hora, aquí pasó de largo.
 *   · TIEMPO — se puede recorrer. La cabeza del trazo avanza y lo ya andado se
 *     enciende; lo que falta queda apagado.
 *   · PUNTO — pulsar el trazo abre el ping REAL que hay debajo: hora, velocidad,
 *     batería y precisión.
 *
 * ── EL VOLUMEN DE PUNTOS ────────────────────────────────────────────────────
 * Un turno son miles de pings (el tope del servidor es 5.000). Aquí NO se dibuja
 * un marcador por punto — eso cuelga el navegador. El trazo se simplifica con
 * Douglas-Peucker hasta un presupuesto de vértices (`trackGeometry.ts`) y sólo
 * los HITOS llevan chincheta: inicio, fin y paradas. El dato crudo sigue entero
 * detrás: el globo de un punto, la reproducción y el CSV leen el array original.
 * Pulsar el TRAZO busca el ping más cercano — un marcador invisible por punto,
 * sin marcadores.
 *
 * NOTA — sin `mapId`: un mapa creado con un Map ID de Google Cloud IGNORA el
 * array `styles`, y las teselas acromáticas del sistema son justo lo que hace
 * que este mapa pertenezca al CRM. Por eso las chinchetas son SVG (`mapPins`) y
 * el movimiento se hace con `OverlayView` (`mapMotion`), que no exige `mapId`.
 *
 * NOTA — UN solo camino para el pulso: aquí el único latido permanente es el
 * `vivo` del SVG de la chincheta de «Fin». NO se llama a `motor.latido()` en
 * este mapa; hacerlo dibujaría un segundo halo encima del mismo punto. Del motor
 * sólo se usa `onda()`, que es un EVENTO de una vez (se cruza una parada al
 * reproducir), no un estado.
 * ════════════════════════════════════════════════════════════════════════════
 */

const geometria = (mapType: string, pal: MapPalette) =>
  mapType === "roadmap" ? estiloMapa(pal) : undefined;

/** Vértices que se permite dibujar. Por encima, el trazo se simplifica más. */
const PRESUPUESTO_VERTICES = 900;
/** Cadencia del reloj de la reproducción. Entre latido y latido el marcador lo
 *  desliza `mapMotion`, así que 4 Hz se ven como 60 fps y cuestan 4 renders. */
const PASO_MS = 250;
/** Multiplicadores del reloj. Un turno de 12 h a ×60 se ve en 12 minutos. */
const VELOCIDADES = [10, 60, 300, 1200];

export default function TrailMap({
  points,
  mapType = "roadmap",
  focusIndex,
  onFocusIndex,
}: {
  points: TrailPoint[];
  mapType?: "roadmap" | "satellite" | "hybrid" | "terrain";
  /** Punto que la lista lateral pide enfocar. Cambiarlo abre su globo. */
  focusIndex?: number | null;
  /** Se avisa del punto que se está mirando, para resaltarlo en la lista. */
  onFocusIndex?: (i: number | null) => void;
}) {
  // `t` ya está tomado en este archivo (el instante de la reproducción):
  // el traductor entra como `tr`.
  const { t: tr } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const pal = useMapPalette();
  const piel = useMemo(() => pielDe(pal), [pal]);
  const version = useMemo(() => huella(pal), [pal]);

  const motor = useMotorMapa(mapRef.current, ready);
  const pop = useMapPopup(() => mapRef.current, {
    onClose: () => onFocusIndex?.(null),
  });
  const popRef = useRef(pop);

  popRef.current = pop;

  const validos = useMemo(
    () =>
      points.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng)),
    [points],
  );

  const analisis = useMemo(() => analizar(validos), [validos]);
  const paradas = useMemo(() => detectarParadas(validos), [validos]);
  const trazo = useMemo(
    () => simplificarConPresupuesto(validos, PRESUPUESTO_VERTICES),
    [validos],
  );

  const t0 = analisis.tiempos.length ? analisis.tiempos[0] : 0;
  const tFin = analisis.tiempos.length
    ? analisis.tiempos[analisis.tiempos.length - 1]
    : 0;
  const rango = Math.max(0, tFin - t0);

  /* ── Reloj de la reproducción ─────────────────────────────────────────── */
  // Arranca en el FINAL: lo primero que se quiere ver es el recorrido entero.
  // Pulsar «reproducir» rebobina y lo cuenta desde el principio.
  const [t, setT] = useState(0);
  const [reproduciendo, setReproduciendo] = useState(false);
  const [velocidad, setVelocidad] = useState(60);
  const [seguir, setSeguir] = useState(true);

  useEffect(() => {
    setT(tFin);
    setReproduciendo(false);
  }, [tFin, validos]);

  useEffect(() => {
    if (!reproduciendo || rango <= 0) return;
    const iv = window.setInterval(() => {
      setT((previo) => {
        const siguiente = previo + PASO_MS * velocidad;

        if (siguiente >= tFin) {
          setReproduciendo(false);

          return tFin;
        }

        return siguiente;
      });
    }, PASO_MS);

    return () => window.clearInterval(iv);
  }, [reproduciendo, velocidad, tFin, rango]);

  const alternarReproduccion = useCallback(() => {
    setReproduciendo((previo) => {
      if (previo) return false;
      // Al final del recorrido, «reproducir» significa «otra vez desde el
      // principio»; si no, sigue desde donde se dejó.
      setT((actual) => (actual >= tFin - 1 ? t0 : actual));

      return true;
    });
  }, [t0, tFin]);

  /* ── Mapa (una sola instancia; crear otra es una carga facturable) ─────── */
  useEffect(() => {
    let cancelled = false;

    loadGoogleMaps()
      .then(() => {
        if (cancelled || !ref.current) return;
        const g = (window as any).google;
        const first = points[0];

        mapRef.current = new g.maps.Map(ref.current, {
          center: first
            ? { lat: first.lat, lng: first.lng }
            : { ...CENTRO_DE_RESPALDO },
          zoom: 14,
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: "greedy",
          clickableIcons: false,
          mapTypeId: mapType,
          styles: geometria(mapType, pal),
          backgroundColor: pal.tierra,
        });
        // Si el usuario agarra el mapa, manda él: el seguimiento se suelta.
        mapRef.current.addListener("dragstart", () => setSeguir(false));
        setReady(true);
      })
      .catch((e) => setErr(e?.message || "No se pudo cargar el mapa"));

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready || !mapRef.current) return;
    mapRef.current.setOptions({
      mapTypeId: mapType,
      styles: geometria(mapType, pal),
      backgroundColor: pal.tierra,
    });
  }, [mapType, pal, ready]);

  /* ── Globos ───────────────────────────────────────────────────────────── */

  /** Último punto enfocado — el pestillo que impide que enfocar y avisar del
   *  enfoque se persigan el uno al otro. */
  const ultimoFocoRef = useRef<number | null>(null);

  const globoDePunto = useCallback(
    (i: number) => {
      const p = validos[i];

      if (!p) return;
      const v = analisis.velocidades[i];
      const bat = typeof p.battery === "number" ? Math.round(p.battery) : null;
      const datos: MapPopupData = {
        id: `punto-${i}`,
        kind: "point",
        title: `Punto #${i + 1}`,
        subtitle: fechaHora(p.at),
        metrics: mapPopupItems<MapPopupMetric>(
          { label: "Velocidad", value: kmh(v) },
          bat != null
            ? {
                label: tr("ui.TrailMap.bateria", "Batería"),
                value: `${bat}%`,
                tone: bat <= 20 ? "bad" : undefined,
              }
            : null,
        ),
        fields: mapPopupItems(
          { label: "Hora", value: hora(p.at), mono: true },
          {
            label: tr("ui.TrailMap.precision", "Precisión"),
            value:
              typeof p.accuracy === "number"
                ? `± ${Math.round(p.accuracy)} m`
                : "—",
            mono: true,
            // Por encima de 60 m el punto no dice dónde estuvo, dice por dónde
            // andaba: se avisa en vez de dibujarlo como si fuera exacto.
            tone:
              typeof p.accuracy === "number" && p.accuracy > 60
                ? "warn"
                : undefined,
          },
          {
            label: tr("ui.TrailMap.recorridoHastaAqui", "Recorrido hasta aquí"),
            value: distancia(analisis.acumulado[i] || 0),
            mono: true,
            wide: true,
          },
          {
            label: "Coordenadas",
            value: `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`,
            mono: true,
            wide: true,
          },
        ),
        actions: mapPopupItems(
          mapPopupActions.center(() =>
            motor?.camara.volarA({ lat: p.lat, lng: p.lng }, { zoom: 18 }),
          ),
          mapPopupActions.directions(p.lat, p.lng),
        ),
        // Los hitos de inicio y fin abren este mismo globo y son orbes anclados por
        // su centro: se sube lo que mide medio orbe para que no se tapen.
        offsetY: -24,
      };

      popRef.current.open({ lat: p.lat, lng: p.lng }, datos);
      // Se anota ANTES de avisar: si no, el foco vuelve como prop y el efecto de
      // enfoque re-centraría el mapa por un punto que ya se está mirando.
      ultimoFocoRef.current = i;
      onFocusIndex?.(i);
    },
    [analisis, motor, onFocusIndex, validos, tr],
  );

  const globoDeParada = useCallback(
    (parada: Parada, numero: number) => {
      const datos: MapPopupData = {
        id: `parada-${parada.desde}`,
        kind: "point",
        title: `Parada ${numero}`,
        subtitle: `${hora(parada.inicio)} – ${hora(parada.fin)}`,
        status: { label: "Detenido", tone: "warn" },
        metrics: mapPopupItems<MapPopupMetric>(
          {
            label: tr("ui.TrailMap.duracion", "Duración"),
            value: duracion(parada.ms),
            tone: "warn",
          },
          { label: "Pings", value: parada.hasta - parada.desde + 1 },
        ),
        fields: mapPopupItems(
          { label: "Llegada", value: fechaHora(parada.inicio), mono: true },
          { label: "Salida", value: fechaHora(parada.fin), mono: true },
          {
            label: "Coordenadas",
            value: `${parada.lat.toFixed(5)}, ${parada.lng.toFixed(5)}`,
            mono: true,
            wide: true,
          },
        ),
        actions: mapPopupItems(
          {
            id: "ir-al-momento",
            label: tr("ui.TrailMap.irAEsteMomento", "Ir a este momento"),
            icon: <Play />,
            onClick: () => {
              setReproduciendo(false);
              setT(new Date(parada.inicio).getTime());
            },
          },
          mapPopupActions.directions(parada.lat, parada.lng),
        ),
        // El orbe se ancla por su centro: sin subirlo, el globo lo taparía.
        offsetY: -24,
      };

      popRef.current.open({ lat: parada.lat, lng: parada.lng }, datos);
      ultimoFocoRef.current = parada.desde;
      onFocusIndex?.(parada.desde);
    },
    [onFocusIndex, tr],
  );

  /* ── Dibujo del trazo ─────────────────────────────────────────────────── */

  const overlaysRef = useRef<Array<() => void>>([]);
  const avanceRef = useRef<any>(null);
  const puckRef = useRef<any>(null);
  const rumboPuckRef = useRef<number | null>(null);
  /** Vértices simplificados y su índice en el array original. */
  const caminoRef = useRef<{
    pts: Array<{ lat: number; lng: number }>;
    idx: number[];
  }>({ pts: [], idx: [] });
  /** Identidad del recorrido ya encuadrado — la cámara no se mueve al cambiar
   *  de tema, sólo cuando de verdad hay un recorrido nuevo. */
  const encuadradoRef = useRef<unknown>(null);
  /** Cuántos vértices lleva pintados la línea de avance. */
  const ultimoKRef = useRef(-1);
  /** Última parada por la que ya pasó la reproducción — para no repetir la onda. */
  const ultimaParadaRef = useRef(-1);

  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const g = (window as any).google;

    overlaysRef.current.forEach((quitar) => quitar());
    overlaysRef.current = [];
    avanceRef.current = null;
    puckRef.current = null;
    rumboPuckRef.current = null;
    caminoRef.current = { pts: [], idx: [] };
    ultimoKRef.current = -1;
    ultimaParadaRef.current = -1;
    motor?.soltar("puck");
    if (!validos.length) return;

    const idx = trazo.indices;
    const camino = idx.map((i) => ({
      lat: validos[i].lat,
      lng: validos[i].lng,
    }));

    caminoRef.current = { pts: camino, idx };

    // El trazo va en TRES pasadas: halo ancho y tenue debajo (es lo que lo hace
    // «encenderse» sobre teselas casi negras), la línea completa apagada, y
    // encima la parte ya recorrida, viva y con flechas.
    const halo = new g.maps.Polyline({
      path: camino,
      map: mapRef.current,
      zIndex: 1,
      strokeColor: pal.brand,
      strokeOpacity: 0.16,
      strokeWeight: 13,
      // El halo es el blanco de los clics: es ancho y perdona el pulso. La línea
      // fina de encima no escucha, para no robarle la pulsación.
      clickable: true,
    });

    halo.addListener("click", (e: any) => {
      const ll = e?.latLng;

      if (!ll) return;
      const i = indiceMasCercano(validos, { lat: ll.lat(), lng: ll.lng() });

      if (i >= 0) globoDePunto(i);
    });
    const linea = new g.maps.Polyline({
      path: camino,
      map: mapRef.current,
      clickable: false,
      zIndex: 2,
      strokeColor: pal.brand,
      strokeOpacity: 0.34,
      strokeWeight: 3,
    });
    // La parte recorrida. Las FLECHAS van sólo aquí: repetidas en las dos líneas
    // se solaparían y se leerían como puntas dobles.
    const avance = new g.maps.Polyline({
      path: camino,
      map: mapRef.current,
      clickable: false,
      zIndex: 3,
      strokeColor: pal.brand,
      strokeOpacity: 0.95,
      strokeWeight: 3.5,
      icons: [
        {
          icon: {
            path: g.maps.SymbolPath.FORWARD_CLOSED_ARROW,
            scale: 2.6,
            strokeColor: pal.brand,
            strokeWeight: 1,
            fillColor: pal.brand,
            fillOpacity: 1,
          },
          repeat: "110px",
          offset: "40px",
        },
      ],
    });

    avanceRef.current = avance;
    overlaysRef.current.push(
      () => halo.setMap(null),
      () => linea.setMap(null),
      () => avance.setMap(null),
    );

    /* ── Hitos: SÓLO inicio, fin y paradas ─────────────────────────────── */
    const hito = (
      p: { lat: number; lng: number },
      color: string,
      insignia: string,
      titulo: string,
      alPulsar: () => void,
      vivo = false,
    ) => {
      const marker = new g.maps.Marker({
        map: mapRef.current,
        position: { lat: p.lat, lng: p.lng },
        icon: iconoDe(
          g,
          orbPin({ color, insignia, piel, version, vivo, tamano: "sm" }),
        ),
        title: titulo,
        zIndex: 500,
      });

      marker.addListener("click", alPulsar);
      overlaysRef.current.push(() => marker.setMap(null));
    };

    const inicio = validos[0];
    const fin = validos[validos.length - 1];

    hito(inicio, pal.ok, "A", `Inicio · ${fechaHora(inicio.at)}`, () =>
      globoDePunto(0),
    );
    if (validos.length > 1) {
      hito(
        fin,
        pal.brand,
        "B",
        `Fin · ${fechaHora(fin.at)}`,
        () => globoDePunto(validos.length - 1),
        true,
      );
    }
    paradas.forEach((parada, i) => {
      hito(
        parada,
        pal.warn,
        String(i + 1),
        `Parada ${i + 1} · ${duracion(parada.ms)}`,
        () => globoDeParada(parada, i + 1),
      );
    });

    /* ── La cabeza del recorrido ───────────────────────────────────────── */
    const puck = new g.maps.Marker({
      map: mapRef.current,
      position: camino[camino.length - 1],
      icon: iconoDe(
        g,
        orbPin({ color: pal.brand, insignia: "•", piel, version }),
      ),
      zIndex: 900,
      title: tr(
        "ui.TrailMap.posicionEnElInstanteMostrado",
        "Posición en el instante mostrado",
      ),
    });

    puckRef.current = puck;
    overlaysRef.current.push(() => puck.setMap(null));

    // El encuadre se hace UNA vez por recorrido, y sólo con el motor ya montado:
    // el efecto corre antes (con `motor` aún en null) y marcarlo como encuadrado
    // ahí dejaría el mapa mirando a cualquier sitio.
    if (motor && encuadradoRef.current !== validos) {
      encuadradoRef.current = validos;
      if (camino.length > 1)
        motor.camara.encuadrar(camino, { padding: 56, zoomMax: 17 });
      else mapRef.current.setCenter(camino[0]);
    }
  }, [validos, trazo, paradas, ready, pal, piel, version, motor, tr]);

  /* ── Avance en el tiempo ──────────────────────────────────────────────── */

  useEffect(() => {
    if (!ready || !validos.length || !avanceRef.current) return;
    // El reloj arranca en 0 y lo coloca un efecto posterior. Sin esta guarda, el
    // primer fotograma de un recorrido recién cargado dibuja el trazo entero
    // recortado al primer punto y se ve un parpadeo.
    if (t < analisis.tiempos[0]) return;
    const pos = posicionEnTiempo(validos, analisis.tiempos, t);

    if (!pos) return;

    // Cuántos vértices simplificados caben antes de la cabeza. Binaria: la lista
    // ya está ordenada y esto corre cuatro veces por segundo.
    const { pts: camino, idx } = caminoRef.current;
    let lo = 0;
    let hi = idx.length;

    while (lo < hi) {
      const mid = (lo + hi) >> 1;

      if (idx[mid] <= pos.indice) lo = mid + 1;
      else hi = mid;
    }
    const k = lo;

    // Se reescribe el camino sólo cuando cambia el número de vértices; entre
    // medias basta con mover la cabeza, que la lleva el marcador.
    if (k !== ultimoKRef.current) {
      ultimoKRef.current = k;
      const trozo = camino.slice(0, Math.max(1, k));

      trozo.push({ lat: pos.lat, lng: pos.lng });
      avanceRef.current.setPath(trozo);
    }

    const g = (window as any).google;

    if (puckRef.current && motor) {
      motor.seguir(
        "puck",
        puckRef.current,
        { lat: pos.lat, lng: pos.lng },
        {
          duracion: reproduciendo && !calma() ? PASO_MS : 0,
          rumbo: true,
          minMetrosRumbo: 6,
          alRumbo: (grados) => {
            if (rumboPuckRef.current === grados) return;
            rumboPuckRef.current = grados;
            try {
              puckRef.current?.setIcon(
                iconoDe(
                  g,
                  orbPin({
                    color: pal.brand,
                    insignia: "•",
                    piel,
                    version,
                    rumbo: grados,
                  }),
                ),
              );
            } catch {
              /* el marcador ya no está */
            }
          },
        },
      );
    }

    // Rebobinar devuelve las ondas al bote: si no, reproducir dos veces el mismo
    // recorrido sólo las enseñaría la primera vez.
    while (
      ultimaParadaRef.current >= 0 &&
      paradas[ultimaParadaRef.current].desde > pos.indice
    ) {
      ultimaParadaRef.current -= 1;
    }
    // Al cruzar una parada durante la reproducción sale UNA onda. Es un evento,
    // no un estado: se expande, se apaga y no vuelve. Marca el hito sin obligar a
    // mirar el reloj.
    if (reproduciendo && motor) {
      for (let i = ultimaParadaRef.current + 1; i < paradas.length; i += 1) {
        if (paradas[i].desde > pos.indice) break;
        ultimaParadaRef.current = i;
        motor.onda(
          { lat: paradas[i].lat, lng: paradas[i].lng },
          { tono: "aviso", radio: 44 },
        );
      }
    }

    if (seguir && reproduciendo)
      motor?.camara.volarA({ lat: pos.lat, lng: pos.lng });
  }, [
    t,
    ready,
    validos,
    analisis,
    paradas,
    motor,
    reproduciendo,
    seguir,
    pal,
    piel,
    version,
  ]);

  /* ── Foco pedido desde la lista lateral ───────────────────────────────── */
  useEffect(() => {
    // Al cerrarse el globo el foco vuelve a `null`, y ahí hay que SOLTAR el
    // pestillo: si no, volver a pulsar la misma fila no haría nada.
    if (focusIndex == null) {
      ultimoFocoRef.current = null;

      return;
    }
    if (focusIndex === ultimoFocoRef.current) return;
    ultimoFocoRef.current = focusIndex;
    const p = validos[focusIndex];

    if (!p) return;
    setReproduciendo(false);
    setT(analisis.tiempos[focusIndex] ?? tFin);
    motor?.camara.volarA({ lat: p.lat, lng: p.lng }, { zoom: 18 });
    globoDePunto(focusIndex);
  }, [focusIndex]);

  /* ── Interfaz ─────────────────────────────────────────────────────────── */

  const posActual = useMemo(
    () =>
      analisis.tiempos.length
        ? posicionEnTiempo(validos, analisis.tiempos, t)
        : null,
    [validos, analisis, t],
  );

  if (err) {
    return (
      <div className="flex h-full items-center justify-center bg-muted text-sm text-muted-foreground">
        {err}
      </div>
    );
  }

  const hayRecorrido = validos.length > 0;
  const km = analisis.metros / 1000;

  return (
    <div className="cc-map-frame h-full w-full">
      <div ref={ref} className="cc-map-canvas" />

      {hayRecorrido && (
        <>
          {/* Resumen — arriba, para dejar abajo la línea de tiempo. */}
          <div
            className="cc-map-hud"
            style={{ left: 12, top: 12, maxWidth: "min(92%, 30rem)" }}
          >
            <div className="cc-map-card px-3 py-2.5">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <div>
                  <div className="cc-map-eyebrow">Recorrido</div>
                  <div className="cc-map-metric">
                    {km.toFixed(km >= 10 ? 1 : 2)}
                    <span
                      style={{
                        color: "var(--ink-faint)",
                        fontWeight: 600,
                        fontSize: 11,
                      }}
                    >
                      {" "}
                      km
                    </span>
                  </div>
                </div>
                <div>
                  <div className="cc-map-eyebrow">
                    {tr("ui.TrailMap.duracion", "Duración")}
                  </div>
                  <div className="cc-map-metric">{duracion(analisis.ms)}</div>
                </div>
                <div className="hidden sm:block">
                  <div className="cc-map-eyebrow">
                    {i18n.t("ui.TrailMap.velMedia")}
                  </div>
                  <div className="cc-map-metric">
                    {analisis.velMediaKmh.toFixed(1)}
                    <span
                      style={{
                        color: "var(--ink-faint)",
                        fontWeight: 600,
                        fontSize: 11,
                      }}
                    >
                      {" "}
                      km/h
                    </span>
                  </div>
                </div>
                <div>
                  <div className="cc-map-eyebrow">Paradas</div>
                  <div
                    className="cc-map-metric"
                    style={{
                      color: paradas.length ? "var(--warn-text)" : undefined,
                    }}
                  >
                    {paradas.length}
                  </div>
                </div>
                {analisis.bateria != null && (
                  <div>
                    <div className="cc-map-eyebrow">
                      {tr("ui.TrailMap.bateria", "Batería")}
                    </div>
                    <div
                      className="cc-map-metric"
                      style={{
                        color:
                          analisis.bateria <= 20
                            ? "var(--bad-text)"
                            : undefined,
                      }}
                    >
                      {analisis.bateria}%
                    </div>
                  </div>
                )}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="cc-map-key">
                  <i style={{ color: "var(--ok)" }} />
                  Inicio
                </span>
                <span className="cc-map-key">
                  <i style={{ color: "var(--warn)" }} />
                  Parada
                </span>
                <span className="cc-map-key">
                  <i style={{ color: "var(--brand)" }} />
                  Fin
                </span>
                <span style={{ fontSize: 10, color: "var(--ink-faint)" }}>
                  {validos.length.toLocaleString(localeActual())} puntos
                  {trazo.toleranciaM > 0
                    ? ` · trazo simplificado a ${trazo.indices.length.toLocaleString(localeActual())} vértices (±${trazo.toleranciaM} m)`
                    : ""}
                </span>
              </div>
            </div>
          </div>

          {/* Línea de tiempo — abajo, despejando el logotipo de Google. */}
          {rango > 0 && (
            <div
              className="cc-map-hud"
              style={{ left: 12, right: 12, bottom: 30 }}
            >
              <div className="cc-map-card flex items-center gap-3 px-3 py-2">
                <button
                  aria-label={
                    reproduciendo ? "Pausar" : "Reproducir el recorrido"
                  }
                  className="cg-focus grid size-8 flex-none place-items-center rounded-full"
                  style={{
                    background: "var(--brand)",
                    color: "var(--brand-ink)",
                  }}
                  title={reproduciendo ? "Pausar" : "Reproducir el recorrido"}
                  type="button"
                  onClick={alternarReproduccion}
                >
                  {reproduciendo ? (
                    <Pause className="size-4" />
                  ) : (
                    <Play className="size-4" />
                  )}
                </button>

                <button
                  aria-label={i18n.t("ui.TrailMap.volverAlInicioDelRecorrido")}
                  className="cg-focus hidden size-8 flex-none place-items-center rounded-full sm:grid"
                  style={{
                    border: "1px solid var(--hairline)",
                    color: "var(--ink-soft)",
                  }}
                  title="Volver al inicio"
                  type="button"
                  onClick={() => {
                    setReproduciendo(false);
                    setT(t0);
                  }}
                >
                  <RotateCcw className="size-3.5" />
                </button>

                <span
                  className="flex-none tabular-nums"
                  style={{ fontSize: 11, fontWeight: 700, color: "var(--ink)" }}
                >
                  {hora(t)}
                </span>

                <input
                  aria-label={i18n.t("ui.TrailMap.instanteDelRecorrido")}
                  className="h-1.5 min-w-0 flex-1 cursor-pointer appearance-none rounded-full"
                  max={rango}
                  min={0}
                  step={1000}
                  style={{
                    accentColor: "var(--brand)",
                    background: "var(--hairline)",
                  }}
                  type="range"
                  value={Math.max(0, Math.min(rango, t - t0))}
                  onChange={(e) => {
                    setReproduciendo(false);
                    setT(t0 + Number(e.target.value));
                  }}
                />

                <span
                  className="hidden flex-none tabular-nums sm:inline"
                  style={{ fontSize: 11, color: "var(--ink-faint)" }}
                >
                  {hora(tFin)}
                </span>

                <button
                  className="cg-focus flex-none rounded-full px-2 py-1 tabular-nums"
                  style={{
                    border: "1px solid var(--hairline)",
                    color: "var(--ink-soft)",
                    fontSize: 11,
                    fontWeight: 700,
                  }}
                  title={tr(
                    "ui.TrailMap.velocidadDeReproduccion",
                    "Velocidad de reproducción",
                  )}
                  type="button"
                  onClick={() =>
                    setVelocidad(
                      (v) =>
                        VELOCIDADES[
                          (VELOCIDADES.indexOf(v) + 1) % VELOCIDADES.length
                        ],
                    )
                  }
                >
                  ×{velocidad}
                </button>

                <button
                  aria-pressed={seguir}
                  className="cg-focus grid size-8 flex-none place-items-center rounded-full"
                  style={{
                    border: "1px solid var(--hairline)",
                    color: seguir ? "var(--brand-text)" : "var(--ink-faint)",
                  }}
                  title={
                    seguir
                      ? tr(
                          "ui.TrailMap.camaraSigueElRecorrido",
                          "La cámara sigue el recorrido",
                        )
                      : tr("ui.TrailMap.camaraSuelta", "La cámara está suelta")
                  }
                  type="button"
                  onClick={() => setSeguir((s) => !s)}
                >
                  <Crosshair className="size-3.5" />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {ready && !hayRecorrido && (
        <div className="pointer-events-none absolute inset-0 z-[3] flex items-center justify-center">
          <span
            className="cc-map-card px-3 py-1.5 text-sm"
            style={{ color: "var(--ink-soft)" }}
          >
            {tr(
              "ui.TrailMap.sinRecorridoParaEsteRango",
              "Sin recorrido para este rango",
            )}
          </span>
        </div>
      )}

      {/* Sin esto el globo compartido no se pinta. */}
      {pop.portal}

      {/* Lectura para quien no ve el mapa: el instante que se está mostrando. */}
      <span aria-live="polite" className="sr-only">
        {posActual
          ? `Punto ${posActual.indice + 1} de ${validos.length}, ${hora(t)}`
          : ""}
      </span>
    </div>
  );
}
