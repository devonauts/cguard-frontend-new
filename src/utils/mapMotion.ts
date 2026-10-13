/**
 * ════════════════════════════════════════════════════════════════════════════
 * C-GUARD PRO — MOVIMIENTO DEL MAPA
 *
 * Lo que separa un mapa de operaciones de un tablero de chinchetas no es el
 * brillo: es que las cosas que se mueven se MUEVAN. Cinco piezas, y este archivo
 * las tiene todas:
 *
 *   1. INTERPOLACIÓN — el GPS llega cada N segundos; si el marcador salta, se
 *      lee a trompicones. Aquí se desliza entre la posición vieja y la nueva
 *      durante el hueco entre pings. Es LA diferencia.
 *   2. RUMBO — el vector entre dos posiciones dice hacia dónde va. Un icono que
 *      gira se lee como alguien avanzando; uno que siempre mira al norte, como
 *      una chincheta clavada.
 *   3. ONDA — un pánico, un incidente, un fichaje: un anillo que se expande y se
 *      apaga UNA vez. No en bucle: es un evento, no un estado.
 *   4. CÁMARA — centrar es una transición, no un corte. Y si el destino está
 *      lejos, se aleja, se desplaza y se acerca, en vez de cruzar el mundo de
 *      golpe.
 *   5. LATIDO — sólo lo que está vivo respira. Un vigilante en servicio sí; uno
 *      sin señal, no. Así el latido SIGNIFICA algo.
 *
 * ── POR QUÉ NO SE ANIMAN LOS SVG ────────────────────────────────────────────
 * Las chinchetas (`mapPins.ts`) son SVG en data-URL porque un mapa con `mapId`
 * ignora el array `styles` y perderíamos las teselas acromáticas del CRM. Un SVG
 * servido así se pinta como IMAGEN: no ve las fuentes web, no ve el CSS del
 * documento y no se puede animar desde fuera. Quedaban dos caminos —regenerar el
 * icono por fotograma (carísimo con cientos de marcadores) o poner DOM encima— y
 * este archivo toma el segundo, pero por la puerta que NO cuesta el estilo:
 *
 *   · el DESLIZAMIENTO no necesita DOM propio: se escribe `setPosition` del
 *     marcador que ya existe, fotograma a fotograma;
 *   · el RUMBO se resuelve regenerando el icono SÓLO cuando el ángulo cruza un
 *     escalón de 15° (24 iconos posibles, todos en la caché de `mapPins`), no
 *     por fotograma;
 *   · la ONDA y el LATIDO sí son DOM, pero dentro de UN `OverlayView` —que NO
 *     exige `mapId`— y animados con la API de animaciones del navegador, sin
 *     tocar ninguna hoja de estilo.
 *
 * ── RENDIMIENTO ─────────────────────────────────────────────────────────────
 * Puede haber cientos de marcadores. Reglas que sostienen eso:
 *   · UN solo `requestAnimationFrame` compartido por todos los mapas de la
 *     pestaña, que se apaga solo cuando no queda nada moviéndose;
 *   · las posiciones se escriben DIRECTAMENTE en el marcador — cero `setState`,
 *     cero re-render de React;
 *   · lo que está fuera de la vista no se escribe (sólo se coloca al terminar);
 *   · los latidos tienen tope: pasado el tope no se pintan, porque doscientos
 *     anillos latiendo tiran el desplazamiento del mapa;
 *   · con `prefers-reduced-motion` todo esto se apaga y se coloca en su sitio.
 *
 * ── EJEMPLO ─────────────────────────────────────────────────────────────────
 * ```ts
 * import { crearMotorMapa } from "@/utils/mapMotion";
 * import { orbPin, iconoDe } from "@/utils/mapPins";
 *
 * const motor = crearMotorMapa(map);           // uno por mapa; repetir devuelve el mismo
 *
 * // ── 1+2 · deslizar un vigilante y girarle la proa ───────────────────────
 * vigilantes.forEach((v) => {
 *   let m = marcadores[v.id];
 *   if (!m) m = marcadores[v.id] = new google.maps.Marker({ map, position: v });
 *
 *   motor.seguir(v.id, m, { lat: v.lat, lng: v.lng }, {
 *     duracion: "auto",       // el hueco real entre pings, acotado
 *     rumbo: true,
 *     // sólo se llama cuando el ángulo cruza un escalón de 15°, no por fotograma
 *     alRumbo: (grados) => m.setIcon(iconoDe(google, orbPin({ ...opts, rumbo: grados }))),
 *   });
 *
 *   // ── 5 · latido: SÓLO si la señal está viva de verdad
 *   motor.latido(v.id, { lat: v.lat, lng: v.lng }, { activo: v.enServicio, tono: "bien" });
 * });
 * motor.conservar(vigilantes.map((v) => v.id));   // baja los que ya no vienen
 *
 * // ── 3 · onda: un evento, una vez ────────────────────────────────────────
 * motor.onda({ lat, lng }, { tono: "malo" });            // pánico
 * motor.onda({ lat, lng }, { tono: "bien", radio: 46 }); // fichaje
 *
 * // ── 4 · cámara ──────────────────────────────────────────────────────────
 * motor.camara.volarA({ lat, lng }, { zoom: 16 });       // aleja-desplaza-acerca si está lejos
 * motor.camara.encuadrar(puntos, { zoomMax: 16 });       // fitBounds, pero con transición
 *
 * // al desmontar
 * motor.destruir();
 * ```
 *
 * OJO: quien adopte `seguir()` NO debe seguir llamando a `setPosition` por su
 * cuenta en cada render — serían dos manos escribiendo el mismo valor y el
 * marcador daría tirones. `seguir()` ES la forma de mover el marcador.
 * ════════════════════════════════════════════════════════════════════════════
 */

import { useEffect, useRef, useState } from "react";

import { tokenHex } from "./mapTheme";

/* ── Tipos públicos ──────────────────────────────────────────────────────── */

export interface Punto {
  lat: number;
  lng: number;
}

/**
 * El rumbo se CUANTIZA a escalones de 15°.
 *
 * Es la pieza que hace que girar sea barato: una chincheta es un SVG en
 * data-URL, así que girarla obliga a regenerar el icono. Con 15° hay 24 iconos
 * posibles por combinación de color y tamaño —todos en la caché de
 * `mapPins.ts`— y el marcador sólo se redibuja cuando el ángulo cruza un
 * escalón, no en cada fotograma. A ojo, 15° es indistinguible de continuo.
 */
export const PASO_RUMBO = 15;

/**
 * Cualquier cosa a la que se le pueda escribir una posición: el `Marker` de
 * siempre, un `AdvancedMarkerElement`, un `Circle` (geocerca que sigue a su
 * vigilante) o una función propia.
 */
export type Movible =
  | { setPosition: (p: Punto) => void }
  | { setCenter: (p: Punto) => void }
  | { position: any }
  | ((p: Punto) => void);

/** Los semánticos del sistema. FIJOS: un pánico es `--bad` aunque el acento sea rojo. */
export type Tono = "bien" | "aviso" | "malo" | "info" | "marca" | "tenue";

const TOKEN_TONO: Record<Tono, [string, string]> = {
  bien: ["--ok", "#3f9e6b"],
  aviso: ["--warn", "#c98a2a"],
  malo: ["--bad", "#c04a3d"],
  info: ["--info", "#4a7fc0"],
  marca: ["--brand", "#c8a020"],
  tenue: ["--ink-faint", "#6f6f6f"],
};

/** Color de un tono, resuelto del sistema de diseño en tiempo de ejecución. */
export function colorDeTono(tono: Tono = "info", explicito?: string): string {
  if (explicito && explicito.trim()) return explicito;
  const [token, respaldo] = TOKEN_TONO[tono] ?? TOKEN_TONO.info;

  return tokenHex(token, respaldo);
}

/* ── La regla de calma ───────────────────────────────────────────────────── */

let mq: MediaQueryList | null | undefined;

/**
 * `true` si el usuario pidió movimiento reducido. Se consulta en el momento (no
 * se cachea el booleano) para que cambiar la preferencia del sistema surta
 * efecto sin recargar.
 */
export function calma(): boolean {
  try {
    if (mq === undefined)
      mq = window.matchMedia?.("(prefers-reduced-motion: reduce)") ?? null;

    return !!mq?.matches;
  } catch {
    return false;
  }
}

/* ── El único bucle de fotogramas ────────────────────────────────────────── */

type Paso = (ahora: number) => void;
const abonados = new Set<Paso>();
let raf = 0;

function bombear(ahora: number) {
  raf = 0;
  // Copia: un motor puede darse de baja a sí mismo dentro de su propio paso.
  Array.from(abonados).forEach((fn) => {
    try {
      fn(ahora);
    } catch {
      /* un mapa roto no puede parar a los demás */
    }
  });
  if (abonados.size) raf = requestAnimationFrame(bombear);
}

function abonar(fn: Paso) {
  if (abonados.has(fn)) return;
  abonados.add(fn);
  // `requestAnimationFrame` no dispara con la pestaña oculta: el bucle se
  // suspende solo y no hay que vigilar `document.hidden`.
  if (!raf) raf = requestAnimationFrame(bombear);
}

function desabonar(fn: Paso) {
  abonados.delete(fn);
  if (!abonados.size && raf) {
    cancelAnimationFrame(raf);
    raf = 0;
  }
}

/* ── Geodesia mínima ─────────────────────────────────────────────────────── */

const RAD = Math.PI / 180;
const GRA = 180 / Math.PI;
const R_TIERRA = 6371000;

/** Metros entre dos coordenadas (Haversine). */
export function metrosEntre(a: Punto, b: Punto): number {
  const dLat = (b.lat - a.lat) * RAD;
  const dLng = (b.lng - a.lng) * RAD;
  const la1 = a.lat * RAD;
  const la2 = b.lat * RAD;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;

  return 2 * R_TIERRA * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Rumbo inicial de `a` a `b`, en grados 0..360 con 0 = norte. */
export function rumboEntre(a: Punto, b: Punto): number {
  const la1 = a.lat * RAD;
  const la2 = b.lat * RAD;
  const dLng = (b.lng - a.lng) * RAD;
  const y = Math.sin(dLng) * Math.cos(la2);
  const x =
    Math.cos(la1) * Math.sin(la2) -
    Math.sin(la1) * Math.cos(la2) * Math.cos(dLng);

  return (Math.atan2(y, x) * GRA + 360) % 360;
}

/** Interpola dos ángulos por el camino CORTO (de 350° a 10° son 20°, no 340°). */
function acercarAngulo(desde: number, hasta: number, k: number): number {
  const d = ((hasta - desde + 540) % 360) - 180;

  return (desde + d * k + 360) % 360;
}

/* Mercator del mundo a 256 px — para la cámara. No se usa `map.getProjection()`
   porque no existe hasta que el mapa está quieto, y la cámara se pide antes. */
const MUNDO = 256;

function aMundo(p: Punto): { x: number; y: number } {
  const s = Math.min(0.9999, Math.max(-0.9999, Math.sin(p.lat * RAD)));

  return {
    x: MUNDO * (0.5 + p.lng / 360),
    y: MUNDO * (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)),
  };
}
function deMundo(x: number, y: number): Punto {
  const lng = (x / MUNDO - 0.5) * 360;
  const n = Math.PI * (1 - (2 * y) / MUNDO);

  return { lat: Math.atan(Math.sinh(n)) * GRA, lng };
}

const acotar = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, n));

/* ── Escritura de posición ───────────────────────────────────────────────── */

function escribirPos(m: Movible, lat: number, lng: number): void {
  const p = { lat, lng };

  try {
    if (typeof m === "function") return m(p);
    const any = m as any;

    if (typeof any.setPosition === "function") return any.setPosition(p);
    if (typeof any.setCenter === "function") return any.setCenter(p);
    if ("position" in any) {
      any.position = p;

      return;
    }
  } catch {
    /* el marcador ya no está en el mapa */
  }
}

/* ── Capa de efectos (un solo OverlayView por mapa) ──────────────────────── */

interface Efecto {
  el: HTMLDivElement;
  punto: any; // google.maps.LatLng
  lat: number;
  lng: number;
}

interface Capa {
  agregar: (el: HTMLDivElement, lat: number, lng: number) => number;
  mover: (id: number, lat: number, lng: number) => void;
  quitar: (id: number) => void;
  destruir: () => void;
}

/**
 * La capa DOM donde viven ondas y latidos.
 *
 * `OverlayView` NO exige `mapId` —a diferencia de `AdvancedMarkerElement`—, así
 * que se puede tener DOM animado ENCIMA del mapa sin renunciar al array
 * `styles`. Va en el panel `overlayLayer`, por DEBAJO de los marcadores: la onda
 * envuelve la chincheta, no la tapa. Y sin eventos de puntero, para no robarle
 * los clics al marcador que hay debajo.
 */
function crearCapa(map: any): Capa | null {
  const g = (window as any).google;

  if (!g?.maps?.OverlayView) return null;

  const raiz = document.createElement("div");

  raiz.setAttribute("aria-hidden", "true");
  raiz.style.cssText =
    "position:absolute;left:0;top:0;width:0;height:0;pointer-events:none";

  const items = new Map<number, Efecto>();
  let siguienteId = 1;

  const ov = new g.maps.OverlayView();

  ov.onAdd = function () {
    const panes = this.getPanes?.();

    (
      panes?.overlayLayer ||
      panes?.overlayMouseTarget ||
      panes?.floatPane
    )?.appendChild(raiz);
  };
  ov.onRemove = function () {
    raiz.parentNode?.removeChild(raiz);
  };
  /** Google la llama en CADA fotograma de desplazamiento y zoom. */
  ov.draw = function () {
    const proj = this.getProjection?.();

    if (!proj) return;
    items.forEach((it) => colocar(proj, it));
  };
  ov.setMap(map);

  function colocar(proj: any, it: Efecto) {
    const p = proj.fromLatLngToDivPixel(it.punto);

    if (!p) return;
    // `translate3d` y no `left/top`: la posición se resuelve en el compositor y
    // no obliga a recalcular el diseño de la página en cada fotograma.
    it.el.style.transform = `translate3d(${Math.round(p.x)}px,${Math.round(p.y)}px,0)`;
  }

  return {
    agregar(el, lat, lng) {
      const id = siguienteId++;
      const it: Efecto = { el, punto: new g.maps.LatLng(lat, lng), lat, lng };

      items.set(id, it);
      el.style.position = "absolute";
      el.style.left = "0";
      el.style.top = "0";
      el.style.willChange = "transform";
      raiz.appendChild(el);
      const proj = ov.getProjection?.();

      if (proj) colocar(proj, it);

      return id;
    },
    mover(id, lat, lng) {
      const it = items.get(id);

      if (!it) return;
      // Medio metro de umbral: seguir a un GPS quieto no debe costar una
      // proyección por fotograma.
      if (Math.abs(it.lat - lat) < 4e-6 && Math.abs(it.lng - lng) < 4e-6)
        return;
      it.lat = lat;
      it.lng = lng;
      it.punto = new g.maps.LatLng(lat, lng);
      const proj = ov.getProjection?.();

      if (proj) colocar(proj, it);
    },
    quitar(id) {
      const it = items.get(id);

      if (!it) return;
      items.delete(id);
      it.el.parentNode?.removeChild(it.el);
    },
    destruir() {
      items.clear();
      raiz.replaceChildren();
      try {
        ov.setMap(null);
      } catch {
        /* el mapa ya se fue */
      }
    },
  };
}

/* ── Pistas (lo que se está deslizando) ──────────────────────────────────── */

export interface OpcionesSeguir {
  /**
   * Cuánto dura el deslizamiento hasta la nueva posición.
   * `"auto"` (por defecto) mide el hueco REAL entre este ping y el anterior y lo
   * usa acotado a [250 ms, 4 s]: con pings cada segundo desliza un segundo, y
   * con un ping perdido no se queda arrastrándose medio minuto.
   */
  duracion?: number | "auto";
  /** Calcular el rumbo del vector recorrido. */
  rumbo?: boolean;
  /**
   * Desplazamiento mínimo para dar por bueno un rumbo nuevo. Por debajo de esto
   * el GPS es ruido, y sin el umbral la proa gira sola con el marcador quieto.
   */
  minMetrosRumbo?: number;
  /**
   * Se llama cuando el rumbo cruza un escalón de 15° — NUNCA por fotograma. Es
   * el momento de pedir el icono girado a `mapPins` (que lo tiene cacheado).
   */
  alRumbo?: (grados: number) => void;
  /** Colocar sin deslizar (primera aparición, o un salto que no es movimiento real). */
  saltar?: boolean;
}

interface Pista {
  marcador: Movible;
  deLat: number;
  deLng: number;
  aLat: number;
  aLng: number;
  curLat: number;
  curLng: number;
  t0: number;
  dur: number;
  ultimoPing: number;
  viva: boolean;
  quiereRumbo: boolean;
  minMetros: number;
  alRumbo?: (g: number) => void;
  rumbo: number;
  rumboDe: number;
  rumboA: number;
  rumboT0: number;
  rumboDur: number;
  cubo: number;
  latido?: number; // id del efecto de latido enganchado a esta pista
}

const DUR_MIN = 250;
const DUR_MAX = 4000;
const DUR_POR_DEFECTO = 900;
/** Los latidos son DOM: pasado este tope se dejan de pintar. */
const TOPE_LATIDOS = 80;

/* ── Cámara ──────────────────────────────────────────────────────────────── */

export interface OpcionesVuelo {
  /** Zoom de destino. Si se omite, se conserva el actual. */
  zoom?: number;
  /** Duración del tramo continuo (sólo en mapas con zoom fraccionario). */
  duracion?: number;
  alLlegar?: () => void;
}

export interface OpcionesEncuadre {
  /** Margen en píxeles alrededor del grupo. */
  padding?: number;
  /** Tope de acercamiento: sin él, dos puntos juntos acaban en la acera. */
  zoomMax?: number;
  zoomMin?: number;
  alLlegar?: () => void;
}

export interface Camara {
  volarA: (destino: Punto, opts?: OpcionesVuelo) => void;
  encuadrar: (puntos: Punto[], opts?: OpcionesEncuadre) => void;
  /** Corta cualquier vuelo en curso (lo llama solo cuando el usuario arrastra). */
  detener: () => void;
}

/* ── El motor ────────────────────────────────────────────────────────────── */

export interface OpcionesOnda {
  tono?: Tono;
  /** Color explícito; gana al tono. Úsalo si ya tienes la paleta en la mano. */
  color?: string;
  /** Radio final del anillo en píxeles. */
  radio?: number;
  duracion?: number;
  /** Cuántos anillos salen, escalonados. Dos leen como «pulso»; uno, como «toque». */
  anillos?: number;
}

export interface OpcionesLatido {
  /** El latido SÓLO se pinta si esto es `true`. Es el sentido de la pieza. */
  activo: boolean;
  tono?: Tono;
  color?: string;
  radio?: number;
}

export interface MotorMapa {
  /** Registra/actualiza el destino de un marcador. Ver `OpcionesSeguir`. */
  seguir: (
    id: string,
    marcador: Movible,
    destino: Punto,
    opts?: OpcionesSeguir,
  ) => void;
  /** Da de baja una pista y todo lo que colgaba de ella. */
  soltar: (id: string) => void;
  /** Baja todas las pistas cuyo id NO esté en la lista. El barrido de siempre. */
  conservar: (ids: Iterable<string>) => void;
  /** Posición interpolada AHORA (no la del último ping). Para anclar un globo. */
  posicionDe: (id: string) => Punto | null;
  /** Último rumbo conocido en grados, o `null` si aún no se movió. */
  rumboDe: (id: string) => number | null;
  /** Onda de un evento: se expande y se apaga UNA vez. */
  onda: (pos: Punto, opts?: OpcionesOnda) => void;
  /** Latido de estado en vivo. `activo: false` lo apaga y lo retira. */
  latido: (id: string, pos: Punto, opts: OpcionesLatido) => void;
  camara: Camara;
  destruir: () => void;
}

const motores = new WeakMap<object, MotorMapa>();

/**
 * Devuelve el motor de movimiento de un mapa; el mismo mapa siempre devuelve el
 * mismo motor, así que se puede pedir desde varios sitios sin coordinarse.
 */
export function crearMotorMapa(map: any): MotorMapa {
  const previo = map && motores.get(map);

  if (previo) return previo;

  const pistas = new Map<string, Pista>();
  const latidos = new Map<string, { id: number; color: string }>();
  let capa: Capa | null | undefined;
  let vivo = true;

  function laCapa(): Capa | null {
    if (capa === undefined) capa = crearCapa(map);

    return capa;
  }

  /* ── el paso de fotograma ─────────────────────────────────────────────── */

  const paso: Paso = (ahora) => {
    if (!vivo) return desabonar(paso);

    // La caja de la vista se pide UNA vez por fotograma, no una por marcador.
    let caja: { n: number; s: number; e: number; o: number } | null = null;

    try {
      const b = map?.getBounds?.();

      if (b) {
        const j = b.toJSON();
        // 15 % de margen: un marcador que va a entrar en pantalla ya viene
        // deslizándose, no aparece de golpe en el borde.
        const mLat = (j.north - j.south) * 0.15;

        caja = { n: j.north + mLat, s: j.south - mLat, e: j.east, o: j.west };
      }
    } catch {
      /* mapa aún sin proyección */
    }

    let queda = false;

    pistas.forEach((p) => {
      // La proa puede seguir girando después de que el tramo haya aterrizado
      // (el giro dura 420 ms y un tramo puede durar 250): mientras quede una de
      // las dos cosas, la pista sigue en el bucle.
      if (!p.viva && p.rumboDur <= 0) return;

      if (p.viva) {
        const t = p.dur > 0 ? Math.min(1, (ahora - p.t0) / p.dur) : 1;

        // LINEAL a propósito. Una suavización por tramo haría que el vigilante
        // frenase y arrancase en cada ping: velocidad constante entre dos puntos
        // conocidos es lo que de verdad se lee como «va andando».
        const lat = p.deLat + (p.aLat - p.deLat) * t;
        const lng = p.deLng + (p.aLng - p.deLng) * t;

        p.curLat = lat;
        p.curLng = lng;

        // Lo que está fuera de la vista no se escribe: sólo se coloca al
        // terminar. Con trescientos vigilantes y una ciudad en pantalla, la
        // mayoría de los fotogramas se los ahorra esta línea.
        const dentro = !caja || enCaja(lat, lng, caja);

        if (dentro || t >= 1) escribirPos(p.marcador, lat, lng);
        if (p.latido != null && dentro) laCapa()?.mover(p.latido, lat, lng);

        if (t >= 1) p.viva = false;
        else queda = true;
      }

      // El rumbo gira más rápido que el trayecto: girar durante todo el tramo
      // hace que la proa vaya siempre mirando a donde YA estuvo.
      if (p.quiereRumbo && p.rumboDur > 0) {
        const k = Math.min(1, (ahora - p.rumboT0) / p.rumboDur);

        p.rumbo = acercarAngulo(p.rumboDe, p.rumboA, 1 - Math.pow(1 - k, 3));
        const cubo =
          Math.round(p.rumbo / PASO_RUMBO) % Math.round(360 / PASO_RUMBO);

        if (cubo !== p.cubo) {
          p.cubo = cubo;
          try {
            p.alRumbo?.(cubo * PASO_RUMBO);
          } catch {
            /* el consumidor se desmontó */
          }
        }
        if (k >= 1) p.rumboDur = 0;
        else queda = true;
      }
    });

    if (!queda) desabonar(paso);
  };

  function enCaja(
    lat: number,
    lng: number,
    c: { n: number; s: number; e: number; o: number },
  ): boolean {
    if (lat < c.s || lat > c.n) return false;

    // Con el antimeridiano de por medio la caja viene «del revés».
    return c.o <= c.e ? lng >= c.o && lng <= c.e : lng >= c.o || lng <= c.e;
  }

  /* ── seguir ───────────────────────────────────────────────────────────── */

  function seguir(
    id: string,
    marcador: Movible,
    destino: Punto,
    opts: OpcionesSeguir = {},
  ) {
    if (
      !vivo ||
      !Number.isFinite(destino?.lat) ||
      !Number.isFinite(destino?.lng)
    )
      return;
    const ahora = performance.now();
    const previa = pistas.get(id);

    // Primera vez, marcador reemplazado, salto pedido o movimiento reducido:
    // se COLOCA, no se desliza.
    const nueva = !previa || previa.marcador !== marcador;
    const quieto = calma() || opts.saltar === true;

    if (nueva) {
      const p: Pista = {
        marcador,
        deLat: destino.lat,
        deLng: destino.lng,
        aLat: destino.lat,
        aLng: destino.lng,
        curLat: destino.lat,
        curLng: destino.lng,
        t0: ahora,
        dur: 0,
        ultimoPing: ahora,
        viva: false,
        quiereRumbo: !!opts.rumbo,
        minMetros: opts.minMetrosRumbo ?? 4,
        alRumbo: opts.alRumbo,
        rumbo: 0,
        rumboDe: 0,
        rumboA: 0,
        rumboT0: ahora,
        rumboDur: 0,
        cubo: -1,
        latido: previa?.latido,
      };

      pistas.set(id, p);
      escribirPos(marcador, destino.lat, destino.lng);

      return;
    }

    const p = previa!;

    p.quiereRumbo = !!opts.rumbo;
    p.minMetros = opts.minMetrosRumbo ?? p.minMetros;
    if (opts.alRumbo) p.alRumbo = opts.alRumbo;

    const movido = metrosEntre({ lat: p.aLat, lng: p.aLng }, destino);

    if (movido < 0.4) {
      // El GPS repitió la misma coordenada: no hay nada que animar y desde luego
      // no hay rumbo nuevo que calcular.
      p.ultimoPing = ahora;

      return;
    }

    // Rumbo del tramo que empieza.
    if (p.quiereRumbo && movido >= p.minMetros) {
      p.rumboDe = p.rumbo;
      p.rumboA = rumboEntre({ lat: p.aLat, lng: p.aLng }, destino);
      p.rumboT0 = ahora;
      p.rumboDur = 420;
      if (p.cubo < 0) {
        // Primer rumbo conocido: se adopta entero, sin girar desde el norte.
        p.rumbo = p.rumboDe = p.rumboA;
        p.rumboDur = 1;
        p.cubo =
          Math.round(p.rumbo / PASO_RUMBO) % Math.round(360 / PASO_RUMBO);
        try {
          p.alRumbo?.(p.cubo * PASO_RUMBO);
        } catch {
          /* consumidor desmontado */
        }
      }
    }

    if (quieto) {
      p.deLat = p.aLat = p.curLat = destino.lat;
      p.deLng = p.aLng = p.curLng = destino.lng;
      p.dur = 0;
      p.viva = false;
      p.ultimoPing = ahora;
      escribirPos(marcador, destino.lat, destino.lng);
      if (p.latido != null) laCapa()?.mover(p.latido, destino.lat, destino.lng);

      return;
    }

    const hueco = ahora - p.ultimoPing;
    const dur =
      opts.duracion === undefined || opts.duracion === "auto"
        ? acotar(hueco > 0 ? hueco : DUR_POR_DEFECTO, DUR_MIN, DUR_MAX)
        : Math.max(0, opts.duracion);

    // Se arranca desde donde el marcador ESTÁ, no desde el ping anterior: si
    // llega un ping a mitad del tramo, el salto sería visible.
    p.deLat = p.curLat;
    p.deLng = p.curLng;
    p.aLat = destino.lat;
    p.aLng = destino.lng;
    p.t0 = ahora;
    p.dur = dur;
    p.ultimoPing = ahora;
    p.viva = dur > 0;
    if (!p.viva) escribirPos(marcador, destino.lat, destino.lng);
    if (p.viva || p.rumboDur > 0) abonar(paso);
  }

  /* ── ondas y latidos ──────────────────────────────────────────────────── */

  function onda(pos: Punto, opts: OpcionesOnda = {}) {
    const c = laCapa();

    if (!c || !Number.isFinite(pos?.lat)) return;

    const color = colorDeTono(opts.tono ?? "info", opts.color);
    const radio = opts.radio ?? 58;
    const dur = opts.duracion ?? 1500;
    const anillos = Math.max(1, Math.min(3, opts.anillos ?? 2));
    const quieto = calma();

    const caja = document.createElement("div");

    caja.style.cssText = "position:absolute;pointer-events:none";
    const id = c.agregar(caja, pos.lat, pos.lng);

    const anillo = (borde: number, relleno: string) => {
      const el = document.createElement("div");

      el.style.cssText =
        `position:absolute;left:${-radio}px;top:${-radio}px;width:${radio * 2}px;height:${radio * 2}px;` +
        `border-radius:9999px;border:${borde}px solid ${color};background:${relleno};` +
        `box-shadow:0 0 ${Math.round(radio / 3)}px 0 ${color}`;
      caja.appendChild(el);

      return el;
    };

    if (quieto) {
      // Con movimiento reducido el evento se marca con un anillo QUIETO que se
      // retira solo. Sin escalar y sin desvanecer: la noticia llega igual y
      // nadie se marea.
      const el = anillo(2, "transparent");

      el.style.opacity = "0.55";
      el.style.transform = "scale(0.62)";
      window.setTimeout(() => c.quitar(id), 1200);

      return;
    }

    const suave = "cubic-bezier(0.22, 1, 0.36, 1)";

    for (let i = 0; i < anillos; i++) {
      const el = anillo(i === 0 ? 2.5 : 1.5, "transparent");

      el.animate(
        [
          { transform: "scale(0.18)", opacity: 0.95 },
          { transform: "scale(1)", opacity: 0 },
        ],
        {
          duration: dur,
          delay: i * Math.round(dur * 0.22),
          easing: suave,
          fill: "both",
        },
      );
    }
    // Un disco tenue detrás: el anillo solo se pierde sobre teselas oscuras.
    const disco = anillo(0, color);

    disco.style.opacity = "0";
    disco.animate(
      [
        { transform: "scale(0.12)", opacity: 0.3 },
        { transform: "scale(0.72)", opacity: 0 },
      ],
      { duration: Math.round(dur * 0.8), easing: suave, fill: "both" },
    );

    window.setTimeout(
      () => c.quitar(id),
      dur + anillos * Math.round(dur * 0.22) + 120,
    );
  }

  function latido(id: string, pos: Punto, opts: OpcionesLatido) {
    const previo = latidos.get(id);
    const c = opts.activo ? laCapa() : (capa ?? null);
    const color = colorDeTono(opts.tono ?? "bien", opts.color);

    if (!opts.activo || !c) {
      if (previo) {
        (capa ?? null)?.quitar(previo.id);
        latidos.delete(id);
        const p = pistas.get(id);

        if (p) p.latido = undefined;
      }

      return;
    }

    if (previo) {
      // Sólo hay que rehacerlo si cambió el color (tema, acento o estado).
      if (previo.color !== color) {
        c.quitar(previo.id);
        latidos.delete(id);
      } else {
        c.mover(previo.id, pos.lat, pos.lng);

        return;
      }
    }

    // Tope duro: doscientos anillos latiendo a la vez tiran el desplazamiento
    // del mapa, y a partir de cierta cantidad el latido ya no informa de nada.
    if (latidos.size >= TOPE_LATIDOS) return;

    const radio = opts.radio ?? 26;
    const caja = document.createElement("div");

    caja.style.cssText = "position:absolute;pointer-events:none";
    const idEfecto = c.agregar(caja, pos.lat, pos.lng);

    const quieto = calma();
    const n = quieto ? 1 : 2;

    for (let i = 0; i < n; i++) {
      const el = document.createElement("div");

      el.style.cssText =
        `position:absolute;left:${-radio}px;top:${-radio}px;width:${radio * 2}px;height:${radio * 2}px;` +
        `border-radius:9999px;border:1.5px solid ${color}`;
      caja.appendChild(el);
      if (quieto) {
        // Movimiento reducido: el halo se queda QUIETO. Sigue diciendo «esto
        // está vivo», que es lo que significa, sin latir.
        el.style.opacity = "0.3";
        el.style.transform = "scale(0.72)";
      } else {
        el.animate(
          [
            { transform: "scale(0.42)", opacity: 0.5 },
            { transform: "scale(1)", opacity: 0 },
          ],
          {
            duration: 2200,
            delay: i * 1100,
            easing: "cubic-bezier(0.4, 0, 0.6, 1)",
            iterations: Infinity,
          },
        );
      }
    }

    latidos.set(id, { id: idEfecto, color });
    const p = pistas.get(id);

    if (p) p.latido = idEfecto;
  }

  /* ── cámara ───────────────────────────────────────────────────────────── */

  let vueloToken = 0;
  const pendientes: Array<{ cancelar: () => void }> = [];

  function detenerVuelo() {
    vueloToken++;
    while (pendientes.length) pendientes.pop()!.cancelar();
    desabonar(pasoCamara);
  }

  /** Espera a que el mapa se quede quieto, con red de seguridad por tiempo. */
  function alQuedarQuieto(cb: () => void, msMax = 700) {
    const g = (window as any).google;
    let hecho = false;
    let lis: any = null;
    const disparar = () => {
      if (hecho) return;
      hecho = true;
      limpiar();
      cb();
    };
    const t = window.setTimeout(disparar, msMax);
    const limpiar = () => {
      window.clearTimeout(t);
      if (lis) g?.maps?.event?.removeListener(lis);
      lis = null;
    };

    try {
      lis = g.maps.event.addListenerOnce(map, "idle", disparar);
    } catch {
      /* sin API de eventos: queda el temporizador */
    }
    pendientes.push({
      cancelar: () => {
        hecho = true;
        limpiar();
      },
    });
  }

  function tras(ms: number, cb: () => void) {
    const t = window.setTimeout(cb, ms);

    pendientes.push({ cancelar: () => window.clearTimeout(t) });
  }

  /** ¿El mapa admite zoom fraccionario? Sólo entonces cabe una cámara continua. */
  function camaraContinua(): boolean {
    try {
      if (typeof map?.moveCamera !== "function") return false;
      const frac = map.get?.("isFractionalZoomEnabled");

      return frac === true || !!map.get?.("mapId");
    } catch {
      return false;
    }
  }

  let vuelo: {
    t0: number;
    dur: number;
    x0: number;
    y0: number;
    x1: number;
    y1: number;
    z0: number;
    z1: number;
    zBaja: number;
    alLlegar?: () => void;
    token: number;
  } | null = null;

  /**
   * El tramo continuo: mueve centro y zoom por fotograma con `moveCamera`. El
   * zoom no va en línea recta — se hunde hacia `zBaja` en mitad del trayecto,
   * que es el arco de «alejar, cruzar, acercar» hecho de una pieza.
   */
  const pasoCamara: Paso = (ahora) => {
    if (!vuelo || !vivo) return desabonar(pasoCamara);
    if (vuelo.token !== vueloToken) {
      vuelo = null;

      return desabonar(pasoCamara);
    }
    const t = Math.min(1, (ahora - vuelo.t0) / vuelo.dur);
    const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; // easeInOutCubic
    const x = vuelo.x0 + (vuelo.x1 - vuelo.x0) * e;
    const y = vuelo.y0 + (vuelo.y1 - vuelo.y0) * e;
    const recto = vuelo.z0 + (vuelo.z1 - vuelo.z0) * e;
    const hundido = Math.min(vuelo.z0, vuelo.z1, vuelo.zBaja);
    const arco = Math.sin(Math.PI * t) * Math.max(0, recto - hundido);

    try {
      map.moveCamera({ center: deMundo(x, y), zoom: recto - arco });
    } catch {
      /* el mapa se desmontó a media transición */
    }
    if (t >= 1) {
      const fin = vuelo.alLlegar;

      vuelo = null;
      desabonar(pasoCamara);
      fin?.();
    }
  };

  function centroActual(): Punto | null {
    try {
      const c = map?.getCenter?.();

      if (!c) return null;

      return { lat: c.lat(), lng: c.lng() };
    } catch {
      return null;
    }
  }

  function tamanoVista(): { w: number; h: number } {
    const div = map?.getDiv?.();

    return { w: div?.offsetWidth || 800, h: div?.offsetHeight || 500 };
  }

  /** Zoom al que dos puntos del mundo caben a la vez en la vista. */
  function zoomQueContiene(
    a: { x: number; y: number },
    b: { x: number; y: number },
    w: number,
    h: number,
  ): number {
    const dx = Math.max(1e-6, Math.abs(b.x - a.x) * 1.6);
    const dy = Math.max(1e-6, Math.abs(b.y - a.y) * 1.6);

    return Math.log2(Math.min(w / dx, h / dy));
  }

  function volarA(destino: Punto, opts: OpcionesVuelo = {}) {
    if (!vivo || !map || !Number.isFinite(destino?.lat)) return;
    detenerVuelo();
    const token = vueloToken;

    const zActual = Number(map.getZoom?.() ?? 12);
    const zDestino = acotar(opts.zoom ?? zActual, 2, 21);
    const centro = centroActual();

    /* Con la pestaña oculta `requestAnimationFrame` no dispara: el vuelo se
       quedaba congelado en el origen (una dirección de Texas elegida con el
       mapa aún sobre Ciudad de México). Sin nadie mirando, se salta al destino. */
    const oculta =
      typeof document !== "undefined" && document.visibilityState === "hidden";

    if (!centro || calma() || oculta) {
      try {
        map.setCenter(destino);
        if (opts.zoom != null) map.setZoom(zDestino);
      } catch {
        /* mapa muerto */
      }
      opts.alLlegar?.();

      return;
    }

    const { w, h } = tamanoVista();
    const a = aMundo(centro);
    const b = aMundo(destino);
    const esc = Math.pow(2, zActual);
    const dx = Math.abs(b.x - a.x) * esc;
    const dy = Math.abs(b.y - a.y) * esc;
    const cerca = dx <= w * 0.85 && dy <= h * 0.85;
    const zBaja = Math.floor(
      acotar(zoomQueContiene(a, b, w, h), 2, Math.min(zActual, zDestino)),
    );

    if (camaraContinua()) {
      const lejania = Math.max(0, Math.min(zActual, zDestino) - zBaja);

      vuelo = {
        t0: performance.now(),
        dur: opts.duracion ?? acotar(520 + lejania * 130, 420, 1600),
        x0: a.x,
        y0: a.y,
        x1: b.x,
        y1: b.y,
        z0: zActual,
        z1: zDestino,
        zBaja: cerca ? Math.min(zActual, zDestino) : zBaja,
        alLlegar: opts.alLlegar,
        token,
      };
      abonar(pasoCamara);

      return;
    }

    // ── Mapa de teselas (el nuestro: con `styles`, sin `mapId`) ────────────
    // `panTo` sólo anima si el destino cae dentro de la vista; si está lejos, es
    // un corte. Por eso el trayecto se hace por etapas: primero se aleja hasta
    // que ambos puntos caben, luego se desplaza —ya animado— y al final se
    // acerca de un escalón en un escalón, que Google anima por su cuenta.
    if (cerca) {
      try {
        map.panTo(destino);
      } catch {
        /* mapa muerto */
      }
      if (zDestino !== zActual)
        tras(280, () => escalera(zActual, zDestino, token, opts.alLlegar));
      else tras(320, () => opts.alLlegar?.());

      return;
    }

    const necesitaAlejar = zBaja < zActual - 0.5;
    const irYAcercar = () => {
      if (token !== vueloToken) return;
      try {
        map.panTo(destino);
      } catch {
        return;
      }
      alQuedarQuieto(() => {
        if (token !== vueloToken) return;
        escalera(
          Number(map.getZoom?.() ?? zBaja),
          zDestino,
          token,
          opts.alLlegar,
        );
      }, 900);
    };

    if (necesitaAlejar) {
      try {
        map.setZoom(zBaja);
      } catch {
        /* mapa muerto */
      }
      alQuedarQuieto(irYAcercar, 700);
    } else {
      irYAcercar();
    }
  }

  /** Acerca de escalón en escalón: cada `setZoom` lo anima Google. */
  function escalera(
    desde: number,
    hasta: number,
    token: number,
    alLlegar?: () => void,
  ) {
    const d = Math.round(desde);
    const objetivo = Math.round(hasta);

    if (token !== vueloToken || d === objetivo) {
      alLlegar?.();

      return;
    }
    // Más de seis escalones de un solo nivel se hace largo: se agrupan de dos.
    const salto = Math.abs(objetivo - d) > 6 ? 2 : 1;
    const siguiente =
      d < objetivo
        ? Math.min(objetivo, d + salto)
        : Math.max(objetivo, d - salto);

    try {
      map.setZoom(siguiente);
    } catch {
      return;
    }
    tras(115, () => escalera(siguiente, objetivo, token, alLlegar));
  }

  function encuadrar(puntos: Punto[], opts: OpcionesEncuadre = {}) {
    const validos = (puntos || []).filter(
      (p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lng),
    );

    if (!validos.length) return;
    const zMax = opts.zoomMax ?? 16;
    const zMin = opts.zoomMin ?? 2;

    if (validos.length === 1) {
      volarA(validos[0], { zoom: Math.min(zMax, 15), alLlegar: opts.alLlegar });

      return;
    }

    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;

    validos.forEach((p) => {
      const m = aMundo(p);

      minX = Math.min(minX, m.x);
      maxX = Math.max(maxX, m.x);
      minY = Math.min(minY, m.y);
      maxY = Math.max(maxY, m.y);
    });

    const { w, h } = tamanoVista();
    const pad = opts.padding ?? 64;
    const dispW = Math.max(80, w - pad * 2);
    const dispH = Math.max(80, h - pad * 2);
    const dx = Math.max(1e-6, maxX - minX);
    const dy = Math.max(1e-6, maxY - minY);
    const zoom = acotar(
      Math.floor(Math.log2(Math.min(dispW / dx, dispH / dy))),
      zMin,
      zMax,
    );

    volarA(deMundo((minX + maxX) / 2, (minY + maxY) / 2), {
      zoom,
      alLlegar: opts.alLlegar,
    });
  }

  // Si el usuario agarra el mapa, manda él: cualquier vuelo pendiente se corta.
  let lisArrastre: any = null;

  try {
    lisArrastre = (window as any).google?.maps?.event?.addListener(
      map,
      "dragstart",
      detenerVuelo,
    );
  } catch {
    /* sin eventos */
  }

  /* ── bajas ────────────────────────────────────────────────────────────── */

  function soltar(id: string) {
    const l = latidos.get(id);

    if (l) {
      capa?.quitar(l.id);
      latidos.delete(id);
    }
    pistas.delete(id);
    if (!pistas.size) desabonar(paso);
  }

  function conservar(ids: Iterable<string>) {
    const vivos = ids instanceof Set ? ids : new Set(ids);

    Array.from(pistas.keys()).forEach((id) => {
      if (!vivos.has(id)) soltar(id);
    });
    Array.from(latidos.keys()).forEach((id) => {
      if (!vivos.has(id)) soltar(id);
    });
  }

  const motor: MotorMapa = {
    seguir,
    soltar,
    conservar,
    posicionDe(id) {
      const p = pistas.get(id);

      return p ? { lat: p.curLat, lng: p.curLng } : null;
    },
    rumboDe(id) {
      const p = pistas.get(id);

      return p && p.cubo >= 0 ? p.rumbo : null;
    },
    onda,
    latido,
    camara: { volarA, encuadrar, detener: detenerVuelo },
    destruir() {
      vivo = false;
      detenerVuelo();
      desabonar(paso);
      pistas.clear();
      latidos.clear();
      capa?.destruir();
      capa = undefined;
      try {
        if (lisArrastre)
          (window as any).google?.maps?.event?.removeListener(lisArrastre);
      } catch {
        /* ya no hay API */
      }
      if (map) motores.delete(map);
    },
  };

  if (map) motores.set(map, motor);

  return motor;
}

/* ── Envoltorio de React ─────────────────────────────────────────────────── */

/**
 * El motor del mapa, atado al ciclo de vida del componente.
 * Devuelve `null` mientras el mapa no exista; en cuanto existe, devuelve SIEMPRE
 * el mismo motor y lo destruye al desmontar.
 *
 * ```tsx
 * const motor = useMotorMapa(mapRef.current, listo);
 * useEffect(() => { motor?.seguir(id, marcador, pos, { rumbo: true }); }, [motor, pos]);
 * ```
 */
export function useMotorMapa(map: any, listo = true): MotorMapa | null {
  const [motor, setMotor] = useState<MotorMapa | null>(null);
  const ref = useRef<MotorMapa | null>(null);

  useEffect(() => {
    if (!listo || !map) return;
    const m = crearMotorMapa(map);

    ref.current = m;
    setMotor(m);

    return () => {
      ref.current = null;
      setMotor(null);
      m.destruir();
    };
  }, [map, listo]);

  return motor;
}
