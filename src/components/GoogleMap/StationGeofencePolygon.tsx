import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from 'react-i18next';
import { loadGoogleMaps } from "@/utils/loadGoogleMaps";
import { getTenantLocation } from "@/utils/tenantLocation";
import { useMapPalette } from "@/utils/mapTheme";
import { useMapPopup, mapPopupActions, mapPopupItems, type MapPopupTone } from "@/components/maps/MapPopup";
import { useMotorMapa } from "@/utils/mapMotion";
import {
  areaPoligono,
  centroide,
  formatearArea,
  formatearCoord,
  formatearDistancia,
  perimetroPoligono,
  radioEquivalente,
  radioMaximo,
} from "@/utils/geoMedidas";
import { Undo2, Trash2, MapPin, Search, Building2, Maximize2 } from "lucide-react";
import "@/styles/map.css";

export type PolyPoint = { lat: number; lng: number };

const FALLBACK = { lat: -0.2295, lng: -78.5236 }; // Quito

/**
 * Editor de geocerca poligonal sobre Google Maps. Se toca el mapa para soltar
 * vértices; cada uno cae numerado y el polígono (o la línea en curso) se dibuja
 * en vivo. El contorno es editable: se arrastra un vértice o un tirador
 * intermedio. «Deshacer» quita el último punto, «Limpiar» reinicia.
 *
 * ── POR QUÉ MARCADORES CLÁSICOS Y NO `AdvancedMarkerElement` ────────────────
 * El mapa se crea SIN `mapId` a propósito. `AdvancedMarkerElement` exige uno, y
 * un `mapId` que no sea válido para la clave hace que los marcadores no pinten
 * NADA en silencio — ese fue el error original de «no veo lo que estoy
 * dibujando». Los overlays clásicos siempre se ven.
 *
 * ── POR QUÉ LOS VÉRTICES SON MARCADORES ARRASTRABLES ───────────────────────
 * Los tiradores que dibuja `editable: true` miden unos 10 px: con el ratón pasan,
 * con el dedo son inalcanzables (el mínimo cómodo son 24). Encima de cada uno se
 * pone un círculo numerado de 26 px que ES el tirador de verdad; los tiradores
 * intermedios de Google siguen debajo para INSERTAR puntos nuevos, que es lo que
 * saben hacer y nosotros no.
 *
 * ── POR QUÉ EL ARRASTRE NO AVISA HASTA SOLTAR ──────────────────────────────
 * Avisar a cada fotograma volvería a entrar por `value`, y el efecto de dibujo
 * BORRA y recrea los marcadores: se destruiría el marcador que el dedo tiene
 * cogido a mitad de arrastre. Durante el gesto sólo se mueven el contorno y las
 * cifras; el aviso sale una vez, al soltar.
 */
export default function StationGeofencePolygon({
  value,
  onChange,
  centerLat,
  centerLng,
  showLocation = false,
  onCenterChange,
  siteLocation,
}: {
  value: PolyPoint[];
  onChange: (pts: PolyPoint[]) => void;
  centerLat?: number;
  centerLng?: number;
  /** When true, this map ALSO edits the station's center point (address search +
   *  draggable pin + "same as sitio"), so one map does both location + geofence. */
  showLocation?: boolean;
  onCenterChange?: (lat: number, lng: number) => void;
  siteLocation?: { lat: number; lng: number } | null;
}) {
  const { t } = useTranslation();
  const pts = value || [];

  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const polyRef = useRef<any>(null);
  const lineRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const centerMarkerRef = useRef<any>(null);
  const onCenterChangeRef = useRef(onCenterChange);
  onCenterChangeRef.current = onCenterChange;
  const [ready, setReady] = useState(false);
  const [alto, setAlto] = useState(340);

  // Lo que se mide MIENTRAS se arrastra. Es una ruta aparte de `value` porque el
  // aviso al formulario sólo sale al soltar (ver la nota de la cabecera).
  const [rutaViva, setRutaViva] = useState<PolyPoint[] | null>(null);

  // The map-click listener is registered once; read the latest props via refs.
  const ptsRef = useRef(pts);
  ptsRef.current = pts;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Puente de color: la geocerca se dibuja con el acento configurable del CRM,
  // leído de las variables en tiempo de ejecución — la API de Google no acepta
  // `var(--brand)` en `strokeColor`/`fillColor`. Ver `utils/mapTheme.ts`.
  const pal = useMapPalette();

  // El globo compartido: aquí sirve para lo que en escritorio hace el botón
  // derecho — quitar un vértice — y que con el dedo no existe.
  const pop = useMapPopup(() => mapRef.current);
  const popRef = useRef(pop);
  popRef.current = pop;

  // Cámara compartida: encuadrar el recinto y viajar a un vértice con transición.
  const motor = useMotorMapa(mapRef.current, ready);
  const motorRef = useRef(motor);
  motorRef.current = motor;

  const hasCenter =
    typeof centerLat === "number" &&
    typeof centerLng === "number" &&
    Number.isFinite(centerLat) &&
    Number.isFinite(centerLng);

  // ── Init map once ──────────────────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await loadGoogleMaps();
        if (!mounted || !mapDivRef.current) return;
        const g = (window as any).google;
        if (!g?.maps) return;

        const biz = getTenantLocation();
        const center = hasCenter
          ? { lat: centerLat as number, lng: centerLng as number }
          : pts.length
            ? { lat: pts[0].lat, lng: pts[0].lng }
            : biz
              ? { lat: biz.lat, lng: biz.lng }
              : FALLBACK;

        const map = new g.maps.Map(mapDivRef.current, {
          center,
          zoom: 18,
          mapTypeId: "satellite", // best for tracing a building outline
          mapTypeControl: true, // native Map/Satellite toggle
          streetViewControl: false,
          fullscreenControl: true,
          tilt: 0,
          draggableCursor: "crosshair",
          // No mapId on purpose — keeps classic Markers/Polygon rendering.
        });
        mapRef.current = map;

        map.addListener("click", (e: any) => {
          if (!e?.latLng) return;
          const lat = e.latLng.lat();
          const lng = e.latLng.lng();
          onChangeRef.current([...(ptsRef.current || []), { lat, lng }]);
        });

        // Location editing: a draggable CENTER pin (the station point, distinct
        // from the numbered geofence vertices) + Google Places address search.
        if (showLocation) {
          centerMarkerRef.current = new g.maps.Marker({
            position: center,
            map,
            draggable: true,
            title: t("station.geofence.centerPinTitle", "Ubicación del puesto (arrastra para ajustar)"),
            zIndex: 5000,
          });
          // Retorno visual del agarre: el marcador salta al cogerlo y vuelve a
          // posarse al soltar, que es la señal de «lo tengo» en una pantalla táctil.
          centerMarkerRef.current.addListener("dragstart", () => {
            try { centerMarkerRef.current.setAnimation(g.maps.Animation.BOUNCE); } catch { /* sin animación */ }
            popRef.current.close();
          });
          centerMarkerRef.current.addListener("dragend", (e: any) => {
            try { centerMarkerRef.current.setAnimation(null); } catch { /* sin animación */ }
            if (!e?.latLng) return;
            onCenterChangeRef.current?.(e.latLng.lat(), e.latLng.lng());
          });

          if (g.maps.places && searchRef.current) {
            const ac = new g.maps.places.Autocomplete(searchRef.current, { fields: ["geometry"] });
            ac.bindTo("bounds", map);
            ac.addListener("place_changed", () => {
              const place = ac.getPlace();
              const loc = place?.geometry?.location;
              if (!loc) return;
              const lat = loc.lat();
              const lng = loc.lng();
              motorRef.current?.camara.volarA({ lat, lng }, { zoom: 18 });
              onCenterChangeRef.current?.(lat, lng);
            });
          }
        }

        setReady(true);
      } catch (err) {
        console.error("[StationGeofencePolygon] map init failed", err);
      }
    })();
    return () => {
      mounted = false;
      try {
        markersRef.current.forEach((m) => m.setMap(null));
        markersRef.current = [];
        if (lineRef.current) lineRef.current.setMap(null);
        if (polyRef.current) polyRef.current.setMap(null);
        if (centerMarkerRef.current) { centerMarkerRef.current.setMap(null); centerMarkerRef.current = null; }
        mapRef.current = null;
      } catch {
        /* ignore */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Recenter + move the center pin when coords change ──────────────────────
  useEffect(() => {
    if (mapRef.current && hasCenter) {
      const c = { lat: centerLat as number, lng: centerLng as number };
      motorRef.current?.camara.volarA(c);
      if (centerMarkerRef.current) centerMarkerRef.current.setPosition(c);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centerLat, centerLng]);

  // El mapa cambia de alto sin que Google se entere: hay que avisarle o las
  // teselas se quedan cortadas en la mitad de abajo.
  useEffect(() => {
    const g = (window as any).google;
    if (!ready || !g?.maps || !mapRef.current) return;
    const id = window.setTimeout(() => {
      try { g.maps.event.trigger(mapRef.current, "resize"); } catch { /* desmontado */ }
    }, 220);
    return () => window.clearTimeout(id);
  }, [alto, ready]);

  const hasSite =
    siteLocation && Number.isFinite(siteLocation.lat) && Number.isFinite(siteLocation.lng);
  const useSite = () => {
    if (hasSite) onCenterChange?.(siteLocation!.lat, siteLocation!.lng);
  };

  // ── Redraw markers + line/polygon whenever the points change ───────────────
  useEffect(() => {
    const g = (window as any).google;
    if (!ready || !g?.maps || !mapRef.current) return;
    const map = mapRef.current;

    // Clear previous overlays.
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];
    if (lineRef.current) { lineRef.current.setMap(null); lineRef.current = null; }
    if (polyRef.current) { polyRef.current.setMap(null); polyRef.current = null; }

    const path = pts.map((p) => ({ lat: p.lat, lng: p.lng }));

    // Mientras un vértice va cogido, el contorno se mueve pero NO se avisa: el
    // aviso reconstruiría los marcadores y se llevaría por delante el que el
    // dedo tiene agarrado.
    let arrastrando = false;

    if (path.length >= 3) {
      polyRef.current = new g.maps.Polygon({
        paths: path,
        map,
        editable: true,
        strokeColor: pal.brand,
        strokeOpacity: 0.95,
        strokeWeight: 2,
        fillColor: pal.brand,
        fillOpacity: 0.18,
      });
      // Sync back when the user drags a vertex or inserts/removes one.
      const p = polyRef.current.getPath();
      const leer = () => p.getArray().map((ll: any) => ({ lat: ll.lat(), lng: ll.lng() }));
      const sync = () => { if (!arrastrando) onChangeRef.current(leer()); };
      g.maps.event.addListener(p, "set_at", sync);
      g.maps.event.addListener(p, "insert_at", sync);
      g.maps.event.addListener(p, "remove_at", sync);
    } else if (path.length === 2) {
      lineRef.current = new g.maps.Polyline({
        path,
        map,
        strokeColor: pal.brand,
        strokeOpacity: 0.95,
        strokeWeight: 2,
      });
    }

    /**
     * Mueve el contorno mientras se arrastra, sin avisar al formulario.
     *
     * Se escribe con `setAt` sobre la ruta que ya existe y NO con `setPath`:
     * `setPath` cambia la MVCArray por otra, y las escuchas de sincronía quedan
     * colgadas de la vieja — los tiradores intermedios de Google dejarían de
     * guardar lo que insertan.
     */
    let pendiente = 0;
    const moverEnVivo = (i: number, lat: number, lng: number) => {
      const ruta = (ptsRef.current || []).map((p, j) => (j === i ? { lat, lng } : p));
      try {
        const destino = polyRef.current?.getPath?.() ?? lineRef.current?.getPath?.();
        if (destino && i < destino.getLength()) destino.setAt(i, new g.maps.LatLng(lat, lng));
      } catch { /* overlay ya retirado */ }
      cancelAnimationFrame(pendiente);
      pendiente = requestAnimationFrame(() => setRutaViva(ruta));
    };

    // Numbered vertex markers (classic Marker = always visible, no mapId needed).
    pts.forEach((pt, i) => {
      const marker = new g.maps.Marker({
        position: { lat: pt.lat, lng: pt.lng },
        map,
        draggable: true,
        // Tinta CASI NEGRA sobre el relleno del acento: el acento es claro por
        // diseño (ver tokens.css) y una cifra blanca encima sería ilegible.
        label: { text: String(i + 1), color: pal.brandInk, fontSize: "11px", fontWeight: "700" },
        icon: {
          path: g.maps.SymbolPath.CIRCLE,
          // 13 de radio = 26 px de diámetro: el mínimo cómodo para un dedo.
          scale: 13,
          fillColor: pal.brand,
          fillOpacity: 1,
          strokeColor: pal.glassSolid,
          strokeWeight: 2,
        },
        title: `Vértice ${i + 1} · arrástralo para ajustar`,
        zIndex: 1000 + i,
        cursor: "grab",
      });

      marker.addListener("dragstart", () => { arrastrando = true; popRef.current.close(); });
      marker.addListener("drag", (e: any) => {
        if (!e?.latLng) return;
        moverEnVivo(i, e.latLng.lat(), e.latLng.lng());
      });
      marker.addListener("dragend", (e: any) => {
        arrastrando = false;
        cancelAnimationFrame(pendiente);
        setRutaViva(null);
        if (!e?.latLng) return;
        const lat = e.latLng.lat();
        const lng = e.latLng.lng();
        onChangeRef.current((ptsRef.current || []).map((p, j) => (j === i ? { lat, lng } : p)));
      });

      // Con el dedo no hay botón derecho, que es como Google deja quitar un
      // vértice. El globo lo suple con un botón de verdad.
      marker.addListener("click", () => {
        popRef.current.open(marker, {
          id: `v${i}`,
          kind: "zone",
          title: `Vértice ${i + 1} de ${ptsRef.current.length}`,
          subtitle: "Arrástralo para ajustar el contorno",
          tone: "brand",
          fields: [{ label: "Coordenadas", value: formatearCoord(pt.lat, pt.lng), mono: true, wide: true }],
          actions: [
            {
              id: "quitar",
              label: "Quitar punto",
              icon: <Trash2 />,
              tone: "bad",
              variant: "primary",
              closeOnClick: true,
              onClick: () => onChangeRef.current((ptsRef.current || []).filter((_, j) => j !== i)),
            },
            mapPopupActions.center(() =>
              motorRef.current?.camara.volarA(pt, { zoom: Math.max(mapRef.current?.getZoom?.() ?? 0, 19) }),
            ),
          ],
        });
      });

      markersRef.current.push(marker);
    });

    return () => cancelAnimationFrame(pendiente);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, pal, JSON.stringify(pts)]);

  // ── Las cifras: lo que hay que ver MIENTRAS se dibuja ──────────────────────
  const medidas = useMemo(() => {
    const ruta = rutaViva ?? pts;
    if (ruta.length < 3) return null;
    const area = areaPoligono(ruta);
    return {
      area,
      perimetro: perimetroPoligono(ruta),
      radio: radioEquivalente(area),
      alcance: radioMaximo(ruta),
      centro: centroide(ruta),
    };
  }, [rutaViva, pts]);

  /**
   * ¿Sirve esta geocerca para lo que existe?
   *
   * El listón no es estético: por debajo de unos 15 m de radio equivalente la
   * geocerca cabe DENTRO del error del GPS de un teléfono (5-20 m a cielo
   * abierto, peor entre edificios), así que marcaría fuera a un vigilante que
   * está dentro. Por arriba, pasados los 500 m deja de distinguir el puesto de
   * la manzana entera y da por válida una entrada desde la esquina.
   */
  const aviso = useMemo((): { tono: MapPopupTone; texto: string } | null => {
    const ruta = rutaViva ?? pts;
    if (!ruta.length) return null;
    if (ruta.length < 3) {
      return { tono: "warn", texto: t("station.geofence.needThreePoints", "Agrega al menos 3 puntos para cerrar la geocerca.") };
    }
    if (!medidas) return null;
    const r = medidas.radio;
    if (r < 15) {
      return {
        tono: "bad",
        texto: "Demasiado pequeña: cabe dentro del error normal del GPS de un teléfono y marcaría fuera a quien está dentro.",
      };
    }
    if (r < 25) {
      return { tono: "warn", texto: "Muy justa: con GPS flojo puede dar falsas salidas. Amplíala un poco si puedes." };
    }
    if (r > 500) {
      return {
        tono: "bad",
        texto: "Demasiado grande: daría por válida una entrada desde una manzana de distancia.",
      };
    }
    if (r > 250) {
      return { tono: "warn", texto: "Bastante amplia: revisa que no se salga de la propiedad del cliente." };
    }
    return { tono: "ok", texto: t("station.geofence.sizeOk", "Tamaño adecuado para marcar entrada y salida.") };
  }, [medidas, pts, rutaViva, t]);

  const undo = () => onChange(pts.slice(0, -1));
  const clear = () => onChange([]);
  const cuadrar = () => {
    if (pts.length) motorRef.current?.camara.encuadrar(pts, { zoomMax: 20, padding: 48 });
    else if (medidas?.centro) motorRef.current?.camara.volarA(medidas.centro, { zoom: 18 });
  };

  const colorTono = (t: MapPopupTone) =>
    t === "brand" ? "var(--brand-text)" : t === "neutral" ? "var(--ink-faint)" : `var(--${t}-text)`;

  return (
    <div className="space-y-2">
      {showLocation && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              ref={searchRef}
              type="text"
              placeholder={t("ui.StationGeofencePolygon.buscarDireccionDelPuesto", "Buscar dirección del puesto…")}
              className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>
          {hasSite && (
            <button
              type="button"
              onClick={useSite}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-input px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              <Building2 size={13} /> {t('ui.StationGeofencePolygon.igualQueElSitio', 'Igual que el sitio')}
            </button>
          )}
        </div>
      )}
      {showLocation && (
        <p className="text-[11px] text-muted-foreground">
          Busca la dirección o arrastra el pin para fijar dónde marca entrada el vigilante; luego toca el mapa para dibujar la geocerca.
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <MapPin size={12} /> {pts.length} punto(s) · toca el mapa para agregar vértices, arrastra los círculos para ajustar
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={cuadrar}
            disabled={pts.length < 2}
            className="inline-flex min-h-9 items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs disabled:opacity-40"
          >
            <Maximize2 size={12} /> Encuadrar
          </button>
          <button
            type="button"
            onClick={undo}
            disabled={!pts.length}
            className="inline-flex min-h-9 items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs disabled:opacity-40"
          >
            <Undo2 size={12} /> Deshacer
          </button>
          <button
            type="button"
            onClick={clear}
            disabled={!pts.length}
            className="inline-flex min-h-9 items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs disabled:opacity-40"
            style={{ color: "var(--bad-text)" }}
          >
            <Trash2 size={12} /> Limpiar
          </button>
        </div>
      </div>

      <div className="cc-map-frame rounded-xl border border-border" style={{ height: alto }}>
        <div ref={mapDivRef} className="cc-map-canvas" />

        {/* Las cifras, encima del dibujo: sin ellas «dibuja una geocerca» es
            dibujar a ciegas y sólo se descubre el tamaño real en la calle. */}
        {medidas && (
          <div className="cc-map-hud" style={{ left: 10, top: 10 }}>
            <div className="cc-map-card flex items-stretch gap-4 px-3 py-2">
              <div>
                <div className="cc-map-eyebrow">{t("ui.StationGeofencePolygon.area", "Área")}</div>
                <div className="cc-map-metric">{formatearArea(medidas.area)}</div>
              </div>
              <div style={{ width: 1, background: "var(--hairline)" }} />
              <div>
                <div className="cc-map-eyebrow">Radio equiv.</div>
                <div className="cc-map-metric">{formatearDistancia(medidas.radio)}</div>
              </div>
              <div style={{ width: 1, background: "var(--hairline)" }} />
              <div>
                <div className="cc-map-eyebrow">{t("ui.StationGeofencePolygon.perimetro", "Perímetro")}</div>
                <div className="cc-map-metric">{formatearDistancia(medidas.perimetro)}</div>
              </div>
            </div>
          </div>
        )}

        <div className="cc-map-hud" style={{ right: 10, bottom: 10 }}>
          <button
            type="button"
            onClick={() => setAlto((a) => (a > 420 ? 340 : 560))}
            className="cc-map-card px-2.5 py-1.5 text-[11px] font-semibold"
          >
            {alto > 420 ? "Reducir mapa" : "Ampliar mapa"}
          </button>
        </div>

        {pop.portal}
      </div>

      {aviso && (
        <p className="text-[11px] leading-snug" style={{ color: colorTono(aviso.tono) }}>
          {aviso.texto}
        </p>
      )}
    </div>
  );
}
