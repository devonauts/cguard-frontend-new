import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Building2, Crosshair, Home, Shield, User, UserCog, X } from "lucide-react";
import { loadGoogleMaps } from "@/utils/loadGoogleMaps";
import { estiloMapa, huella, pielDe, useMapPalette, type MapPalette } from "@/utils/mapTheme";
import { chipPin, iconoDe, orbPin } from "@/utils/mapPins";
import { crearMotorMapa, type MotorMapa } from "@/utils/mapMotion";
import { useMapPopup } from "@/components/maps/MapPopup";
import type { MapEntity, EntityKind } from "../types";
import { DEFAULT_PREFS, type DashboardPrefs } from "../prefs";
import { iconInnerSvg } from "../iconRegistry";
import {
  agruparPorRejilla, calcularCobertura, radioDe,
  type Cobertura, type PuestoEstado, type Racimo,
} from "./OperationsMapCoverage";
import {
  globoDe, globoDeRacimo, pedirRastro, telemetriaDe,
  type MandoGlobo, type Rastro,
} from "./OperationsMapPopup";
import "@/styles/map.css";
import { guardarBloqueDeEmpresa, leerBloqueDeEmpresa } from "@/lib/appearanceSync";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * MAPA DE OPERACIONES — el tablero del centro de mando.
 *
 * Cuatro cosas EN VIVO, cada una con su lenguaje propio, sobre teselas
 * acromáticas derivadas del lienzo del CRM:
 *
 *   PUESTOS Y SEDES  ficha con nombre, cifra de gente dentro y su GEOCERCA
 *                    dibujada, teñida por el estado real de cobertura.
 *   VIGILANTES       orbe pequeño que se DESLIZA entre pings y saca proa hacia
 *                    donde camina; late mientras la señal está viva.
 *   SUPERVISORES     orbe grande y, con zoom, ficha con nombre: se distinguen
 *                    de un vigilante sin leer nada.
 *   CLIENTES         sus sedes, en tinta neutra y agrupadas cuando se pisan.
 *
 * ── EL REPARTO DE PAPELES ──────────────────────────────────────────────────
 * · el COLOR es siempre semántico (cobertura o estado), nunca decorativo;
 * · la FORMA y el glifo dicen QUÉ es;
 * · el MOVIMIENTO dice que está vivo.
 * Un cliente no lleva color de estado a propósito: es contexto, no una alarma.
 *
 * ── DE DÓNDE SALE CADA PIEZA ───────────────────────────────────────────────
 * · el color, de `utils/mapTheme.ts` (puente con la API de Google, que exige
 *   cadenas y no acepta `var()`);
 * · las chinchetas, de `utils/mapPins.ts`;
 * · el deslizamiento, el rumbo, el latido y la cámara, de `utils/mapMotion.ts`;
 * · el globo, de `components/maps/MapPopup.tsx` — aquí sólo se decide QUÉ dice
 *   (ver `OperationsMapPopup.tsx`).
 * Nada de eso se reimplementa aquí.
 * ════════════════════════════════════════════════════════════════════════════
 */

/** A partir de este zoom un puesto enseña nombre y cifra; por debajo sería una
 *  alfombra de etiquetas solapadas y se usa el orbe compacto. */
const ZOOM_FICHA = 13;
/** Los supervisores y las sedes de cliente se etiquetan más tarde: son contexto. */
const ZOOM_FICHA_PERSONA = 14;
const ZOOM_FICHA_SEDE = 14;
/** Por debajo de esto las geocercas son manchas que tapan la ciudad. */
const ZOOM_GEOCERCA = 12;
/** Tope de geocercas dibujadas a la vez — cada una es un objeto del mapa. */
const TOPE_GEOCERCAS = 250;

/* ── Capas ────────────────────────────────────────────────────────────────── */

const ORDEN_CAPAS: EntityKind[] = ["station", "guard", "supervisor", "client", "incident", "tenant"];

const CAPA_LABEL: Record<EntityKind, string> = {
  station: "Puestos",
  guard: "Vigilantes",
  supervisor: "Supervisores",
  client: "Clientes",
  incident: "Incidentes",
  tenant: "Sede central",
};

const CAPA_ICONO: Record<EntityKind, typeof Shield> = {
  station: Shield,
  guard: User,
  supervisor: UserCog,
  client: Home,
  incident: AlertTriangle,
  tenant: Building2,
};

type Capas = Record<EntityKind, boolean>;
const CAPAS_TODAS: Capas = { station: true, guard: true, supervisor: true, client: true, incident: true, tenant: true };

// Caché de pintado; la verdad son las capas guardadas en la cuenta
// (`users.appearance.mapLayers[tenantId]`), que te siguen a otro navegador.
const CLAVE_CAPAS = () => `cc.mapaCapas.${localStorage.getItem("tenantId") || "default"}`;

function leerCapas(): Capas {
  try {
    const raw = localStorage.getItem(CLAVE_CAPAS());
    if (!raw) return { ...CAPAS_TODAS };
    return { ...CAPAS_TODAS, ...(JSON.parse(raw) as Partial<Capas>) };
  } catch {
    return { ...CAPAS_TODAS };
  }
}

/* ── Color ────────────────────────────────────────────────────────────────── */

/** Color de la cobertura — semántico, nunca el acento: un puesto sin cubrir no
 *  puede cambiar de color porque alguien eligió otro acento. */
function colorCobertura(c: Cobertura, p: MapPalette): string {
  return c === "cubierto" ? p.ok : c === "riesgo" ? p.warn : c === "sinCubrir" ? p.bad : p.inkFaint;
}

function colorEstado(s: MapEntity["status"], p: MapPalette): string {
  switch (s) {
    case "online": return p.ok;
    case "patrol": return p.brand;
    case "delayed": return p.warn;
    case "incident":
    case "emergency": return p.bad;
    default: return p.inkFaint;
  }
}

/**
 * Color final de una chincheta, por orden de mando:
 *   1. el que traiga la propia entidad (`meta.color`),
 *   2. el que el usuario haya PERSONALIZADO en «Personalizar» — se compara con
 *      `DEFAULT_PREFS` porque los valores de fábrica son colores fijos heredados
 *      y, si se respetaran, el mapa seguiría ignorando el acento del CRM,
 *   3. el token del sistema (semántico o acento).
 */
function colorEntidad(e: MapEntity, prefs: DashboardPrefs, pal: MapPalette, cob?: Cobertura): string {
  const propio = e.meta?.color;
  if (typeof propio === "string" && propio.trim()) return propio;

  const porTipo = prefs.pinColors?.[e.kind];
  if (porTipo && porTipo !== DEFAULT_PREFS.pinColors[e.kind]) return porTipo;

  const porEstado = prefs.statusColors?.[e.status];
  if (porEstado && porEstado !== DEFAULT_PREFS.statusColors[e.status]) return porEstado;

  if (e.kind === "station") return colorCobertura(cob ?? "sinDatos", pal);
  if (e.kind === "tenant") return pal.brand;
  // Un cliente es CONTEXTO: si llevara verde o rojo competiría con la cobertura
  // de los puestos, que es lo único que de verdad hay que mirar.
  if (e.kind === "client") return pal.inkSoft;
  if (e.kind === "supervisor") return e.status === "patrol" || e.status === "online" ? pal.info : colorEstado(e.status, pal);
  if (e.kind === "incident") return pal.bad;
  return colorEstado(e.status, pal);
}

/** Estilo del mapa. «Estándar» en claro conserva las teselas de Google — es lo
 *  que el usuario pidió al elegirlo; el resto usa el estilo acromático propio. */
function estiloPara(pal: MapPalette, mapTheme: DashboardPrefs["mapTheme"]): any[] | undefined {
  if (mapTheme === "roadmap" && !pal.oscuro) return undefined;
  return estiloMapa(pal);
}

/** Quién se mueve: sólo estos van por el motor de interpolación. */
const VIVO = (k: EntityKind) => k === "guard" || k === "supervisor";

/**
 * ¿Está esta señal VIVA de verdad?
 *
 * El latido es lo único del mapa que dice «esto está pasando ahora». Si late
 * todo el mundo, el latido no significa nada: es el mismo error que pintar de
 * rojo un puesto del que sencillamente no hay datos. Así que late quien reportó
 * hace poco, y punto — sin marca de tiempo NO se late, porque «no sé cuándo fue»
 * no es «acaba de ser».
 *
 * El umbral no se inventa: es el mismo `offlineDeviceWarningMin` con el que el
 * negocio ya declara a partir de cuándo un dispositivo se considera caído.
 */
function senalViva(e: MapEntity, umbralMin: number): boolean {
  if (e.status === "offline") return false;
  const iso = e.meta?.lastSeenAt || e.meta?.punchInTime;
  if (!iso) return false;
  const min = (Date.now() - new Date(iso).getTime()) / 60000;
  return Number.isFinite(min) && min <= Math.max(2, umbralMin);
}

export function OperationsMap({
  entities, prefs, height = 460, onSelect, defaultCenter, hud = true,
}: {
  entities: MapEntity[]; prefs: DashboardPrefs; height?: number;
  onSelect?: (e: MapEntity) => void;
  defaultCenter?: { lat: number; lng: number; zoom?: number };
  /** Paneles de cristal flotantes (estado en vivo + leyenda). */
  hud?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<Record<string, any>>({});
  const cercasRef = useRef<Record<string, any>>({});
  const motorRef = useRef<MotorMapa | null>(null);
  const appliedCenterRef = useRef<string | null>(null);
  const rumbosRef = useRef<Record<string, number>>({});
  const anunciadosRef = useRef<Set<string>>(new Set());
  const rastroLineaRef = useRef<any>(null);
  const cacheRastroRef = useRef<Map<string, Rastro>>(new Map());
  const navigate = useNavigate();

  const [ready, setReady] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [zoom, setZoom] = useState(defaultCenter?.zoom ?? 12);
  const [capas, setCapas] = useState<Capas>(() => leerCapas());
  const [geocercas, setGeocercas] = useState(true);
  const [seguido, setSeguido] = useState<string | null>(null);
  const [rastroDe, setRastroDe] = useState<string | null>(null);
  const seguidoRef = useRef<string | null>(null);
  useEffect(() => { seguidoRef.current = seguido; }, [seguido]);

  const pal = useMapPalette(prefs.mapTheme === "night" ? "noche" : "auto");
  const piel = useMemo(() => pielDe(pal), [pal]);
  const version = useMemo(() => huella(pal), [pal]);
  // `useMapPopup` devuelve un objeto nuevo en cada render; se desestructura para
  // quedarse con `open`, que SÍ es estable. Si el objeto entero entrara en las
  // dependencias del efecto, abrir un globo volvería a montar los marcadores.
  const { open: abrirPop, portal: portalGlobo } = useMapPopup(() => mapRef.current);

  /** La cobertura se calcula SIEMPRE sobre todas las entidades, nunca sobre las
   *  visibles: apagar la capa de vigilantes no puede teñir de rojo los puestos. */
  const cobertura = useMemo(() => calcularCobertura(entities), [entities]);

  const porTipo = useMemo(() => {
    const m = {} as Record<EntityKind, number>;
    ORDEN_CAPAS.forEach((k) => { m[k] = 0; });
    entities.forEach((e) => { m[e.kind] = (m[e.kind] ?? 0) + 1; });
    return m;
  }, [entities]);

  const visibles = useMemo(() => entities.filter((e) => capas[e.kind] !== false), [entities, capas]);

  /** Las sedes de cliente se agrupan cuando se pisan; el resto va suelto. */
  const racimos = useMemo(
    () => agruparPorRejilla(visibles.filter((e) => e.kind === "client"), zoom),
    [visibles, zoom],
  );

  /** Resumen para el panel flotante — la lectura de un vistazo. */
  const resumen = useMemo(() => {
    const puestos = entities.filter((e) => e.kind === "station").length;
    let cubiertos = 0;
    let sinDatos = 0;
    cobertura.forEach((c) => {
      if (c.estado === "cubierto" || c.estado === "riesgo") cubiertos += 1;
      if (c.estado === "sinDatos") sinDatos += 1;
    });
    // Sin una sola posición de GPS no hay porcentaje que enseñar: un 0 % sería
    // afirmar que no hay nadie en ningún puesto, y lo cierto es que no se sabe.
    const medible = puestos - sinDatos;
    const pct = medible > 0 ? Math.round((cubiertos / medible) * 100) : null;
    return {
      puestos,
      vigilantes: porTipo.guard ?? 0,
      supervisores: porTipo.supervisor ?? 0,
      incidentes: porTipo.incident ?? 0,
      cubiertos, sinDatos, pct,
    };
  }, [entities, cobertura, porTipo]);

  // Las capas guardadas en la cuenta ganan a la caché de este navegador.
  useEffect(() => {
    let vivo = true;
    void leerBloqueDeEmpresa("mapLayers").then((guardadas) => {
      if (!vivo || !guardadas) return;
      setCapas({ ...CAPAS_TODAS, ...(guardadas as Partial<Capas>) });
    });
    return () => { vivo = false; };
  }, []);

  const alternarCapa = useCallback((k: EntityKind) => {
    setCapas((prev) => {
      const next = { ...prev, [k]: !prev[k] };
      try { localStorage.setItem(CLAVE_CAPAS(), JSON.stringify(next)); } catch { /* almacenamiento lleno */ }
      void guardarBloqueDeEmpresa("mapLayers", next);
      return next;
    });
  }, []);

  /* ── Acciones que ofrece un globo ──────────────────────────────────────── */

  /** Sólo borra la polilínea del mapa; el estado lo lleva quien llama. */
  const quitarLinea = useCallback(() => {
    try { rastroLineaRef.current?.setMap(null); } catch { /* ya no existe */ }
    rastroLineaRef.current = null;
  }, []);

  const limpiarRastro = useCallback(() => { quitarLinea(); setRastroDe(null); }, [quitarLinea]);

  const mando: MandoGlobo = useMemo(() => ({
    irA: (ruta) => navigate(ruta),
    centrar: (e) => motorRef.current?.camara.volarA({ lat: e.lat, lng: e.lng }, { zoom: Math.max(zoom, 16) }),
    seguir: (e) => {
      setSeguido((prev) => (prev === e.id ? null : e.id));
      motorRef.current?.camara.volarA({ lat: e.lat, lng: e.lng }, { zoom: Math.max(zoom, 16) });
    },
    verRastro: (e) => {
      const id = e.meta?.entityId || e.id;
      pedirRastro(String(id), cacheRastroRef.current).then((r) => {
        const g = (window as any).google;
        if (!g || !mapRef.current) return;
        const puntos = (r?.puntos ?? []).map((p) => ({ lat: p.lat, lng: p.lng }));
        quitarLinea();
        if (puntos.length < 2) { setRastroDe(null); return; }
        rastroLineaRef.current = new g.maps.Polyline({
          map: mapRef.current,
          path: puntos,
          // El rastro es una RUTA, no un estado: va en el acento, que es el color
          // con el que el CRM dibuja recorridos, y por debajo de las chinchetas.
          strokeColor: pal.brand,
          strokeOpacity: 0.9,
          strokeWeight: 3,
          zIndex: 50,
        });
        setRastroDe(e.id);
        motorRef.current?.camara.encuadrar(puntos, { padding: 72, zoomMax: 17 });
      });
    },
    abrirRacimo: (r) => motorRef.current?.camara.encuadrar(
      r.miembros.map((m) => ({ lat: m.lat, lng: m.lng })),
      { padding: 80, zoomMax: 17 },
    ),
    siguiendoId: seguido,
  }), [navigate, zoom, seguido, pal.brand, quitarLinea]);

  const abrirGlobo = useCallback((e: MapEntity, marcador: any, cob?: PuestoEstado) => {
    const base = globoDe(e, cob, mando);
    // El detalle de un vigilante (batería, velocidad, precisión reales) se pide
    // AL PULSAR, nunca en el sondeo: es una consulta por clic, no por segundo.
    // Nada de esto se le pide al servidor en modo demostración: sus
    // identificadores no existen y sólo generarían 404 al abrir cada globo.
    const idCrudo = e.id.startsWith("demo-") ? null : e.meta?.entityId;
    const cargador = e.kind === "guard" && idCrudo
      ? async () => telemetriaDe(await pedirRastro(String(idCrudo), cacheRastroRef.current), base)
      : undefined;
    abrirPop(marcador, base, cargador);
    onSelect?.(e);
  }, [mando, onSelect, abrirPop]);

  /* ── Arranque del mapa ─────────────────────────────────────────────────── */

  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps().then(() => {
      if (cancelled || !ref.current) return;
      const g = (window as any).google;
      const first = entities[0];
      // Default center priority: resolved company/IP center → first entity → fallback.
      const initCenter = defaultCenter
        ? { lat: defaultCenter.lat, lng: defaultCenter.lng }
        : first ? { lat: first.lat, lng: first.lng } : { lat: -0.18, lng: -78.46 };
      if (defaultCenter) appliedCenterRef.current = `${defaultCenter.lat},${defaultCenter.lng},${defaultCenter.zoom ?? 12}`;
      mapRef.current = new g.maps.Map(ref.current, {
        center: initCenter,
        zoom: defaultCenter?.zoom ?? 12, disableDefaultUI: true, gestureHandling: "greedy", clickableIcons: false,
        styles: estiloPara(pal, prefs.mapTheme),
        backgroundColor: pal.tierra,
      });
      motorRef.current = crearMotorMapa(mapRef.current);

      // El zoom SÓLO se publica a React cuando cambia de entero: con el valor
      // continuo, cada muesca de la rueda volvería a montar los marcadores.
      const revisarZoom = () => {
        const z = Math.round(mapRef.current?.getZoom?.() ?? 12);
        setZoom((previo) => (previo === z ? previo : z));
      };
      mapRef.current.addListener("idle", revisarZoom);
      // Arrastrar es tomar el mando: seguir a alguien y que la cámara te pelee
      // el gesto es la forma más rápida de que el mapa se sienta roto.
      mapRef.current.addListener("dragstart", () => {
        motorRef.current?.camara.detener();
        if (seguidoRef.current) setSeguido(null);
      });
      revisarZoom();
      setReady(true);
    }).catch((e) => setErr(e?.message || "No se pudo cargar el mapa"));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Al desmontar: el motor baja sus animaciones y sus capas con él.
  useEffect(() => () => {
    try { motorRef.current?.destruir(); } catch { /* el mapa ya se fue */ }
    motorRef.current = null;
  }, []);

  // Re-estilar en vivo cuando cambia el tema, el acento o el ajuste del usuario.
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    mapRef.current.setOptions({
      styles: estiloPara(pal, prefs.mapTheme),
      backgroundColor: pal.tierra,
    });
  }, [pal, prefs.mapTheme, ready]);

  // recenter when the default center resolves asynchronously (company coords →
  // geocoded address → IP country). Skipped once fitBounds has framed the live
  // entities, so it never fights the operations auto-frame.
  useEffect(() => {
    if (!ready || !mapRef.current || !defaultCenter) return;
    if ((mapRef.current as any).__fitted) return;
    const sig = `${defaultCenter.lat},${defaultCenter.lng},${defaultCenter.zoom ?? 12}`;
    if (appliedCenterRef.current === sig) return;
    appliedCenterRef.current = sig;
    mapRef.current.setCenter({ lat: defaultCenter.lat, lng: defaultCenter.lng });
    if (defaultCenter.zoom) mapRef.current.setZoom(defaultCenter.zoom);
  }, [defaultCenter, ready]);

  /* ── Sincronización de marcadores ──────────────────────────────────────── */

  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const g = (window as any).google;
    const motor = motorRef.current;
    const seen = new Set<string>();
    const vivos = new Set<string>();
    const bounds = new g.maps.LatLngBounds();
    let any = false;

    /** Una entidad suelta (o el representante de un racimo de una sola sede). */
    const pintar = (e: MapEntity) => {
      seen.add(e.id);
      const cob = cobertura.get(e.id);
      const color = colorEntidad(e, prefs, pal, cob?.estado);
      const glifo = iconInnerSvg(prefs.pinIcons[e.kind]);
      const enMovimiento = VIVO(e.kind);

      // ── La FORMA dice qué es; el umbral de zoom, cuánto cabe decir ──
      const conFicha =
        (e.kind === "station" && zoom >= ZOOM_FICHA) ||
        (e.kind === "tenant" && zoom >= 10) ||
        (e.kind === "client" && zoom >= ZOOM_FICHA_SEDE) ||
        (e.kind === "supervisor" && zoom >= ZOOM_FICHA_PERSONA);

      // El latido de un vigilante lo pone el motor (DOM, con tope): si además
      // lo llevara el SVG habría dos halos sobre la misma chincheta.
      const late = !enMovimiento && (cob?.estado === "riesgo" || e.status === "emergency" || e.status === "incident");

      const asset = conFicha
        ? chipPin({
            etiqueta: e.label,
            cifra: e.kind === "station" ? cob?.n ?? 0 : undefined,
            color, glifo, vivo: late, piel, version,
          })
        : orbPin({
            color, glifo, vivo: late, piel, version,
            tamano: e.kind === "guard" || e.kind === "client" ? "sm" : "md",
            rumbo: enMovimiento ? rumbosRef.current[e.id] : undefined,
          });

      const icon = iconoDe(g, asset);
      const zIndex = e.kind === "incident" ? 900
        : e.kind === "supervisor" ? 700
        : e.kind === "guard" ? 600
        : e.kind === "tenant" ? 500
        : e.kind === "station" ? 400
        : 200;

      let m = markersRef.current[e.id];
      const nuevo = !m;
      if (!m) {
        m = new g.maps.Marker({ map: mapRef.current, position: { lat: e.lat, lng: e.lng }, icon, title: e.label, zIndex });
        markersRef.current[e.id] = m;
      } else {
        m.setIcon(icon);
        m.setZIndex(zIndex);
        g.maps.event.clearListeners(m, "click");
      }

      // Lo que se mueve NO se coloca con `setPosition`: lo desliza el motor
      // entre ping y ping. Dos manos escribiendo la misma posición dan tirones.
      if (enMovimiento && motor) {
        vivos.add(e.id);
        motor.seguir(e.id, m, { lat: e.lat, lng: e.lng }, {
          duracion: "auto",
          rumbo: true,
          // Por debajo de esto el GPS es temblor, no marcha: sin el umbral la
          // proa gira sola con el vigilante parado en la garita.
          minMetrosRumbo: 4,
          saltar: nuevo,
          alRumbo: (grados) => {
            rumbosRef.current[e.id] = grados;
            // El rumbo llega cuantizado a 15°: pedir el icono aquí es barato
            // (24 variantes, todas cacheadas en `mapPins`), no por fotograma.
            if (zoom < ZOOM_FICHA_PERSONA || e.kind === "guard") {
              m.setIcon(iconoDe(g, orbPin({
                color, glifo, vivo: false, piel, version,
                tamano: e.kind === "guard" ? "sm" : "md",
                rumbo: grados,
              })));
            }
          },
        });
        // El latido SÓLO por señal fresca (ver `senalViva`): quien lleva media
        // hora mudo se queda quieto, y así el que late significa algo.
        motor.latido(e.id, { lat: e.lat, lng: e.lng }, {
          activo: senalViva(e, prefs.offlineDeviceWarningMin),
          tono: e.status === "emergency" || e.status === "incident" ? "malo"
            : e.status === "delayed" ? "aviso"
            : e.kind === "supervisor" ? "info" : "bien",
        });
      } else {
        m.setPosition({ lat: e.lat, lng: e.lng });
      }

      // Una emergencia o un incidente NUEVO merecen una onda: es un evento, y
      // se anuncia UNA vez (el conjunto recuerda cuáles ya sonaron).
      const gritar = e.status === "emergency" || (e.kind === "incident" && nuevo);
      if (gritar && motor && !anunciadosRef.current.has(e.id)) {
        anunciadosRef.current.add(e.id);
        motor.onda({ lat: e.lat, lng: e.lng }, { tono: "malo", anillos: 2 });
      }
      if (!gritar) anunciadosRef.current.delete(e.id);

      // El escuchador se recrea con el estado del render actual: si se dejara el
      // original, el globo mostraría la cobertura con la que nació el marcador.
      m.addListener("click", () => abrirGlobo(e, m, cob));

      bounds.extend({ lat: e.lat, lng: e.lng });
      any = true;
    };

    visibles.forEach((e) => { if (e.kind !== "client") pintar(e); });

    // ── Sedes de cliente: sueltas o agrupadas ──
    racimos.forEach((r: Racimo) => {
      if (r.miembros.length === 1) { pintar(r.miembros[0]); return; }
      seen.add(r.id);
      const color = pal.inkSoft;
      const asset = chipPin({
        etiqueta: `${r.miembros.length} sedes`,
        cifra: r.miembros.length,
        color, glifo: iconInnerSvg(prefs.pinIcons.client), piel, version,
      });
      let m = markersRef.current[r.id];
      if (!m) {
        m = new g.maps.Marker({ map: mapRef.current, position: { lat: r.lat, lng: r.lng }, icon: iconoDe(g, asset), title: `${r.miembros.length} sedes`, zIndex: 180 });
        markersRef.current[r.id] = m;
      } else {
        m.setPosition({ lat: r.lat, lng: r.lng });
        m.setIcon(iconoDe(g, asset));
        g.maps.event.clearListeners(m, "click");
      }
      m.addListener("click", () => abrirPop(m, globoDeRacimo(r, mando)));
      bounds.extend({ lat: r.lat, lng: r.lng });
      any = true;
    });

    // ── Geocercas de los puestos ──
    // Se dibujan sólo con zoom suficiente: a escala de ciudad son manchas que
    // tapan la geografía y no dicen nada.
    const cercasVivas = new Set<string>();
    if (geocercas && zoom >= ZOOM_GEOCERCA) {
      visibles
        .filter((e) => e.kind === "station" && !e.meta?.isMobile)
        .slice(0, TOPE_GEOCERCAS)
        .forEach((e) => {
          const cob = cobertura.get(e.id);
          const color = colorCobertura(cob?.estado ?? "sinDatos", pal);
          const poly = e.meta?.geofencePolygon;
          const clave = `${e.id}:${poly ? "p" : "c"}`;
          cercasVivas.add(clave);
          let c = cercasRef.current[clave];
          const opciones = {
            strokeColor: color, strokeOpacity: 0.55, strokeWeight: 1.25,
            fillColor: color, fillOpacity: 0.1, clickable: false, zIndex: 1,
          };
          if (!c) {
            c = poly
              ? new g.maps.Polygon({ ...opciones, map: mapRef.current, paths: poly })
              : new g.maps.Circle({ ...opciones, map: mapRef.current, center: { lat: e.lat, lng: e.lng }, radius: radioDe(e) });
            cercasRef.current[clave] = c;
          } else {
            c.setOptions(opciones);
            if (!poly) { c.setCenter({ lat: e.lat, lng: e.lng }); c.setRadius(radioDe(e)); }
          }
        });
    }
    Object.keys(cercasRef.current).forEach((k) => {
      if (cercasVivas.has(k)) return;
      try { cercasRef.current[k].setMap(null); } catch { /* ya desmontada */ }
      delete cercasRef.current[k];
    });

    // remove stale markers
    Object.keys(markersRef.current).forEach((id) => {
      if (seen.has(id)) return;
      markersRef.current[id].setMap(null);
      delete markersRef.current[id];
      delete rumbosRef.current[id];
    });
    // Y las pistas del motor de lo que ya no llega: sin esto un vigilante que
    // ficha salida seguiría deslizándose hacia su última posición conocida.
    motor?.conservar(vivos);

    // Focus on the AREA OF OPERATIONS: frame the live entities (guards/stations)
    // whenever any exist, instead of sitting on the wide company/IP default
    // center. A single point can't be fit-bounded (it zooms to max), so center +
    // a street-level zoom; multiple points fit their bounds with a max-zoom clamp
    // so a tight cluster doesn't zoom in absurdly.
    if (any && !(mapRef.current as any).__fitted) {
      if (visibles.length > 1) {
        motor
          ? motor.camara.encuadrar(visibles.map((e) => ({ lat: e.lat, lng: e.lng })), { padding: 64, zoomMax: 16 })
          : mapRef.current.fitBounds(bounds, 64);
      } else {
        mapRef.current.setCenter(bounds.getCenter());
        mapRef.current.setZoom(15);
      }
      (mapRef.current as any).__fitted = true;
    }
  }, [visibles, racimos, prefs, ready, pal, piel, version, zoom, cobertura, geocercas, abrirGlobo, abrirPop, mando]);

  /* ── Seguimiento ───────────────────────────────────────────────────────── */

  useEffect(() => {
    if (!seguido || !motorRef.current) return;
    const e = entities.find((x) => x.id === seguido);
    // Si a quien se seguía deja de llegar (fichó salida), se suelta el mando en
    // vez de dejar la cámara clavada en su última posición.
    if (!e) { setSeguido(null); return; }
    motorRef.current.camara.volarA({ lat: e.lat, lng: e.lng });
  }, [entities, seguido]);

  const seguidoNombre = useMemo(
    () => (seguido ? entities.find((e) => e.id === seguido)?.label ?? null : null),
    [entities, seguido],
  );

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

      {/* ── CAPAS ────────────────────────────────────────────────────────────
          Un riel a media altura, a la izquierda: en escritorio no pisa el
          resumen (abajo) y en teléfono no pisa ni la barra de arriba ni el
          carrusel de abajo. Por eso vive fuera del `hud`: filtrar el mapa no es
          decoración, es la herramienta.

          Con el mapa vacío no se pinta: un riel de un solo botón sobre un mapa
          sin nada que filtrar es un mando que no manda nada. */}
      {entities.length > 0 && (
      <div className="cc-map-hud" style={{ left: 12, top: "50%", transform: "translateY(-50%)" }}>
        <div className="cg-tarjeta-mapa flex flex-col gap-0.5 p-1">
          {ORDEN_CAPAS.filter((k) => (porTipo[k] ?? 0) > 0).map((k) => {
            const Icono = CAPA_ICONO[k];
            const on = capas[k] !== false;
            return (
              <button
                key={k}
                type="button"
                aria-pressed={on}
                title={`${CAPA_LABEL[k]} (${porTipo[k]})`}
                aria-label={`${on ? "Ocultar" : "Mostrar"} ${CAPA_LABEL[k]}`}
                onClick={() => alternarCapa(k)}
                className="cg-focus grid size-9 place-items-center transition"
                style={{
                  borderRadius: "var(--r-md)",
                  color: on ? "var(--ink)" : "var(--ink-faint)",
                  background: on ? "var(--glass-sunken)" : "transparent",
                  opacity: on ? 1 : 0.55,
                }}
              >
                <Icono className="size-4" />
                <span className="sr-only">{CAPA_LABEL[k]}</span>
              </button>
            );
          })}

          <span className="my-0.5 h-px w-full" style={{ background: "var(--hairline)" }} />

          <button
            type="button"
            aria-pressed={geocercas}
            title={geocercas ? "Ocultar geocercas" : "Mostrar geocercas"}
            aria-label={geocercas ? "Ocultar geocercas" : "Mostrar geocercas"}
            onClick={() => setGeocercas((v) => !v)}
            className="cg-focus grid size-9 place-items-center transition"
            style={{
              borderRadius: "var(--r-md)",
              color: geocercas ? "var(--brand-text)" : "var(--ink-faint)",
              background: geocercas ? "var(--brand-wash)" : "transparent",
            }}
          >
            <Crosshair className="size-4" />
          </button>

          {(seguido || rastroDe) && (
            <button
              type="button"
              title={seguidoNombre ? `Dejar de seguir a ${seguidoNombre}` : "Quitar el recorrido"}
              aria-label={seguidoNombre ? `Dejar de seguir a ${seguidoNombre}` : "Quitar el recorrido"}
              onClick={() => { setSeguido(null); limpiarRastro(); }}
              className="cg-focus grid size-9 place-items-center transition"
              style={{ borderRadius: "var(--r-md)", color: "var(--warn-text)", background: "color-mix(in oklab, var(--warn) 14%, transparent)" }}
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      </div>
      )}

      {/* Quién se está siguiendo, en palabras. Sólo aparece cuando pasa. */}
      {seguidoNombre && (
        <div className="cc-map-hud" style={{ left: 60, top: "50%", transform: "translateY(-50%)", maxWidth: "min(60%, 16rem)" }}>
          <div className="cg-tarjeta-mapa flex items-center gap-2 px-2.5 py-1.5">
            <span className="cc-dot" style={{ background: "var(--brand)" }} />
            <span className="truncate text-[11px] font-semibold">Siguiendo a {seguidoNombre}</span>
          </div>
        </div>
      )}

      {hud && (
        <div className="cc-map-hud" style={{ left: 12, bottom: 30, maxWidth: "min(92%, 30rem)" }}>
          <div className="cc-map-card px-3 py-2.5">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              {/* Anillo de cobertura — la métrica que manda en un puesto de mando. */}
              <div className="cc-map-ring-wrap">
                <div
                  className="cc-map-ring"
                  style={{
                    ["--pct" as any]: resumen.pct ?? 0,
                    ["--anillo" as any]: resumen.pct == null ? "var(--ink-faint)"
                      : resumen.pct >= 80 ? "var(--ok)"
                      : resumen.pct >= 50 ? "var(--warn)" : "var(--bad)",
                  }}
                />
                <span>{resumen.pct == null ? "—" : `${resumen.pct}%`}</span>
              </div>

              <div>
                <div className="cc-map-eyebrow">Cobertura</div>
                <div className="cc-map-metric">
                  {resumen.cubiertos}
                  <span style={{ color: "var(--ink-faint)", fontWeight: 600 }}>/{resumen.puestos}</span>
                </div>
              </div>

              <div className="hidden sm:block">
                <div className="cc-map-eyebrow">En servicio</div>
                <div className="cc-map-metric">{resumen.vigilantes + resumen.supervisores}</div>
              </div>

              {resumen.incidentes > 0 && (
                <div>
                  <div className="cc-map-eyebrow">Incidentes</div>
                  <div className="cc-map-metric" style={{ color: "var(--bad-text)" }}>{resumen.incidentes}</div>
                </div>
              )}

              <div className="ml-auto flex items-center gap-1.5">
                <span className="cc-dot" style={{ background: "var(--ok)" }} />
                <span className="cc-map-eyebrow">En vivo</span>
              </div>
            </div>

            <div className="mt-2 hidden flex-wrap items-center gap-x-3 gap-y-1 border-t pt-2 sm:flex" style={{ borderColor: "var(--hairline)" }}>
              <span className="cc-map-key"><i style={{ color: "var(--ok)" }} />Cubierto</span>
              <span className="cc-map-key"><i style={{ color: "var(--warn)" }} />En riesgo</span>
              <span className="cc-map-key"><i style={{ color: "var(--bad)" }} />Sin cubrir</span>
              {resumen.sinDatos > 0 && (
                <span className="cc-map-key" title="Puestos sin ninguna posición de GPS para confirmar cobertura">
                  <i style={{ color: "var(--ink-faint)" }} />Sin datos ({resumen.sinDatos})
                </span>
              )}
              <span className="cc-map-key"><i style={{ color: "var(--info)" }} />Supervisor</span>
              <span className="cc-map-key"><i style={{ color: "var(--brand)" }} />Sede</span>
            </div>
          </div>
        </div>
      )}

      {/* El globo. Sin este portal, `MapPopup` no se pinta. */}
      {portalGlobo}
    </div>
  );
}
