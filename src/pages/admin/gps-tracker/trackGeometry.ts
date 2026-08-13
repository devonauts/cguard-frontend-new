/**
 * ════════════════════════════════════════════════════════════════════════════
 * C-GUARD PRO — GEOMETRÍA DEL RECORRIDO
 *
 * Todo lo que hay que saber de una miga de pan del GPS ANTES de dibujarla:
 * cuánto se simplifica, dónde se paró, a qué velocidad iba y qué punto cae bajo
 * el dedo. Sin nada de Google dentro — son funciones puras y se pueden probar.
 *
 * ── POR QUÉ SE SIMPLIFICA ───────────────────────────────────────────────────
 * Un turno de 12 h pingueando cada 20 s son ~2.200 puntos; el tope del servidor
 * es 5.000. Dibujar un marcador por punto cuelga el navegador, y una polilínea
 * con 5.000 vértices redibujada en cada desplazamiento del mapa arrastra igual.
 * Douglas-Peucker quita los puntos que NO cambian la forma del trazo: en un
 * recorrido real baja de miles a unos cientos sin que se note a la vista. Lo que
 * NO se simplifica es el array original — las paradas, el globo de cada punto,
 * el CSV y la reproducción siguen leyendo el dato crudo.
 *
 * La tolerancia no es fija: se sube hasta que el trazo cabe en el presupuesto de
 * vértices (`simplificarConPresupuesto`), porque un recorrido en coche por
 * carretera y otro a pie por un patio necesitan escalas distintas.
 *
 * ── DISTANCIAS ──────────────────────────────────────────────────────────────
 * Las de verdad salen de `metrosEntre` (Haversine, en `utils/mapMotion.ts`). La
 * proyección plana de aquí dentro se usa SÓLO para la distancia perpendicular
 * de Douglas-Peucker, donde el error de un plano local a pocos km es
 * irrelevante y ahorra un Haversine por punto y por iteración.
 * ════════════════════════════════════════════════════════════════════════════
 */

import { metrosEntre, rumboEntre, type Punto } from "@/utils/mapMotion";

/** Un ping del GPS tal y como lo entrega `securityGuardService.trail()`. */
export interface PuntoRecorrido extends Punto {
  at: string;
  /** m/s, tal cual lo manda el dispositivo. */
  speed?: number;
  /** Radio de incertidumbre en metros. */
  accuracy?: number;
  /** 0..100. */
  battery?: number;
}

/* ── Simplificación ──────────────────────────────────────────────────────── */

/**
 * Douglas-Peucker. Devuelve los ÍNDICES que se conservan (no los puntos), para
 * que quien dibuje pueda seguir yendo al array original a por la hora, la
 * batería y la precisión de cada vértice.
 *
 * Iterativo con pila explícita a propósito: la versión recursiva revienta la
 * pila de llamadas con un recorrido casi recto de miles de puntos.
 */
export function simplificar(pts: ReadonlyArray<Punto>, toleranciaM: number): number[] {
  const n = pts.length;
  if (n <= 2) return pts.map((_, i) => i);

  // Plano local: a la latitud del primer punto, un grado de longitud mide menos
  // que uno de latitud. Sin ese coseno el trazo se simplificaría más en el eje
  // este-oeste que en el norte-sur.
  const kx = Math.cos((pts[0].lat * Math.PI) / 180) * 111320;
  const ky = 110540;
  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    xs[i] = pts[i].lng * kx;
    ys[i] = pts[i].lat * ky;
  }

  const conservar = new Uint8Array(n);
  conservar[0] = 1;
  conservar[n - 1] = 1;

  const tol2 = Math.max(0, toleranciaM) ** 2;
  const pila: number[] = [0, n - 1];

  while (pila.length) {
    const b = pila.pop() as number;
    const a = pila.pop() as number;
    if (b <= a + 1) continue;

    const ax = xs[a];
    const ay = ys[a];
    const dx = xs[b] - ax;
    const dy = ys[b] - ay;
    const largo2 = dx * dx + dy * dy;

    let peor = -1;
    let peorD2 = 0;
    for (let i = a + 1; i < b; i += 1) {
      const px = xs[i] - ax;
      const py = ys[i] - ay;
      let d2: number;
      if (largo2 <= 0) {
        d2 = px * px + py * py;
      } else {
        let t = (px * dx + py * dy) / largo2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const ex = px - dx * t;
        const ey = py - dy * t;
        d2 = ex * ex + ey * ey;
      }
      if (d2 > peorD2) {
        peorD2 = d2;
        peor = i;
      }
    }

    if (peor >= 0 && peorD2 > tol2) {
      conservar[peor] = 1;
      pila.push(a, peor, peor, b);
    }
  }

  const salida: number[] = [];
  for (let i = 0; i < n; i += 1) if (conservar[i]) salida.push(i);
  return salida;
}

/**
 * Simplifica subiendo la tolerancia hasta que el trazo cabe en `maxVertices`.
 * Devuelve también la tolerancia con la que se logró: es lo que se enseña en el
 * panel para que nadie crea que se perdieron puntos por el camino.
 */
export function simplificarConPresupuesto(
  pts: ReadonlyArray<Punto>,
  maxVertices = 900,
  toleranciaInicial = 5,
): { indices: number[]; toleranciaM: number } {
  if (pts.length <= maxVertices) {
    return { indices: pts.map((_, i) => i), toleranciaM: 0 };
  }
  let tol = Math.max(1, toleranciaInicial);
  let indices = simplificar(pts, tol);
  // 12 vueltas como tope: con factor 1,8 eso son ya kilómetros de tolerancia —
  // si a esas alturas no cabe, el recorrido es ruido y se recorta por las bravas.
  for (let i = 0; i < 12 && indices.length > maxVertices; i += 1) {
    tol *= 1.8;
    indices = simplificar(pts, tol);
  }
  return { indices, toleranciaM: Math.round(tol) };
}

/* ── Paradas ─────────────────────────────────────────────────────────────── */

export interface Parada {
  /** Índices en el array ORIGINAL. */
  desde: number;
  hasta: number;
  /** Centro del racimo. */
  lat: number;
  lng: number;
  inicio: string;
  fin: string;
  /** Duración en milisegundos. */
  ms: number;
}

export interface OpcionesParada {
  /** Radio dentro del cual se considera que no se movió. */
  radioM?: number;
  /** Tiempo mínimo quieto para que cuente como parada. */
  minMs?: number;
  /** Tope de paradas devueltas — se quedan las más largas. */
  max?: number;
}

/**
 * Racimos de puntos consecutivos que no salen de un radio durante el tiempo
 * mínimo. Es lo que convierte una línea muerta en una historia: aquí estuvo
 * media hora, aquí pasó de largo.
 *
 * El ancla es el primer punto del racimo (no el centroide móvil): así una deriva
 * lenta —caminar despacio— acaba saliendo del radio y NO se cuenta como parada,
 * que es justo lo que se quiere.
 */
export function detectarParadas(
  pts: ReadonlyArray<PuntoRecorrido>,
  opts: OpcionesParada = {},
): Parada[] {
  const radioM = opts.radioM ?? 30;
  const minMs = opts.minMs ?? 4 * 60000;
  const max = opts.max ?? 40;
  const n = pts.length;
  const fuera: Parada[] = [];

  let i = 0;
  while (i < n - 1) {
    const ancla = pts[i];
    let j = i;
    while (j + 1 < n && metrosEntre(ancla, pts[j + 1]) <= radioM) j += 1;

    const ms = new Date(pts[j].at).getTime() - new Date(pts[i].at).getTime();
    if (j > i && Number.isFinite(ms) && ms >= minMs) {
      let sLat = 0;
      let sLng = 0;
      for (let k = i; k <= j; k += 1) {
        sLat += pts[k].lat;
        sLng += pts[k].lng;
      }
      const cuantos = j - i + 1;
      fuera.push({
        desde: i,
        hasta: j,
        lat: sLat / cuantos,
        lng: sLng / cuantos,
        inicio: pts[i].at,
        fin: pts[j].at,
        ms,
      });
      i = j + 1;
    } else {
      i += 1;
    }
  }

  if (fuera.length <= max) return fuera;
  // Se quedan las más largas, pero devueltas en orden cronológico: las etiquetas
  // del mapa se numeran por orden de paso, no por duración.
  return fuera
    .slice()
    .sort((a, b) => b.ms - a.ms)
    .slice(0, max)
    .sort((a, b) => a.desde - b.desde);
}

/* ── Análisis ────────────────────────────────────────────────────────────── */

export interface AnalisisRecorrido {
  /** Épocas en ms, una por punto — la base de la línea de tiempo. */
  tiempos: Float64Array;
  /** Metros recorridos hasta cada punto. */
  acumulado: Float64Array;
  /** m/s por punto: el del dispositivo si viene, si no el derivado. */
  velocidades: Float64Array;
  metros: number;
  ms: number;
  velMediaKmh: number;
  velMaxKmh: number;
  /** Última batería conocida, o `null`. */
  bateria: number | null;
}

const VACIO: AnalisisRecorrido = {
  tiempos: new Float64Array(0),
  acumulado: new Float64Array(0),
  velocidades: new Float64Array(0),
  metros: 0,
  ms: 0,
  velMediaKmh: 0,
  velMaxKmh: 0,
  bateria: null,
};

/**
 * Una sola pasada por el recorrido. La velocidad de un punto es la que mandó el
 * dispositivo cuando existe; si no, la del tramo anterior.
 *
 * El máximo se acota a 200 km/h: un ping con la precisión disparada produce un
 * salto de kilómetros en un segundo, y sin el tope el panel anunciaría que un
 * vigilante a pie iba a 4.000 km/h.
 */
export function analizar(pts: ReadonlyArray<PuntoRecorrido>): AnalisisRecorrido {
  const n = pts.length;
  if (!n) return VACIO;

  const tiempos = new Float64Array(n);
  const acumulado = new Float64Array(n);
  const velocidades = new Float64Array(n);

  for (let i = 0; i < n; i += 1) {
    const t = new Date(pts[i].at).getTime();
    tiempos[i] = Number.isFinite(t) ? t : i > 0 ? tiempos[i - 1] : 0;
  }

  let metros = 0;
  let maxMs = 0;
  for (let i = 0; i < n; i += 1) {
    if (i > 0) {
      const d = metrosEntre(pts[i - 1], pts[i]);
      metros += d;
      const dt = (tiempos[i] - tiempos[i - 1]) / 1000;
      const derivada = dt > 0.5 ? d / dt : 0;
      const propia = pts[i].speed;
      const v = typeof propia === "number" && Number.isFinite(propia) && propia >= 0 ? propia : derivada;
      velocidades[i] = v;
      if (v > maxMs && v < 55.6) maxMs = v; // 55,6 m/s ≈ 200 km/h
    } else {
      const propia = pts[0].speed;
      velocidades[0] = typeof propia === "number" && Number.isFinite(propia) && propia >= 0 ? propia : 0;
    }
    acumulado[i] = metros;
  }

  const ms = n > 1 ? Math.max(0, tiempos[n - 1] - tiempos[0]) : 0;
  let bateria: number | null = null;
  for (let i = n - 1; i >= 0; i -= 1) {
    const b = pts[i].battery;
    if (typeof b === "number" && Number.isFinite(b)) {
      bateria = Math.round(b);
      break;
    }
  }

  return {
    tiempos,
    acumulado,
    velocidades,
    metros,
    ms,
    velMediaKmh: ms > 0 ? (metros / (ms / 1000)) * 3.6 : 0,
    velMaxKmh: maxMs * 3.6,
    bateria,
  };
}

/* ── Búsquedas ───────────────────────────────────────────────────────────── */

/** Último índice cuyo instante es <= `t`. Binaria: la línea de tiempo se
 *  consulta en cada fotograma de la reproducción. */
export function indiceEnTiempo(tiempos: Float64Array, t: number): number {
  const n = tiempos.length;
  if (!n) return -1;
  if (t <= tiempos[0]) return 0;
  if (t >= tiempos[n - 1]) return n - 1;
  let lo = 0;
  let hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (tiempos[mid] <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

export interface PosicionEnTiempo extends Punto {
  /** Índice del punto anterior o igual. */
  indice: number;
  /** Rumbo del tramo en curso, o `null` si no hay tramo. */
  rumbo: number | null;
}

/** Posición INTERPOLADA en un instante — el corazón de la reproducción. */
export function posicionEnTiempo(
  pts: ReadonlyArray<PuntoRecorrido>,
  tiempos: Float64Array,
  t: number,
): PosicionEnTiempo | null {
  const n = pts.length;
  if (!n) return null;
  const i = indiceEnTiempo(tiempos, t);
  if (i < 0) return null;
  if (i >= n - 1) {
    const previo = n > 1 ? pts[n - 2] : null;
    return {
      lat: pts[n - 1].lat,
      lng: pts[n - 1].lng,
      indice: n - 1,
      rumbo: previo ? rumboEntre(previo, pts[n - 1]) : null,
    };
  }
  const a = pts[i];
  const b = pts[i + 1];
  const span = tiempos[i + 1] - tiempos[i];
  const k = span > 0 ? Math.min(1, Math.max(0, (t - tiempos[i]) / span)) : 0;
  return {
    lat: a.lat + (b.lat - a.lat) * k,
    lng: a.lng + (b.lng - a.lng) * k,
    indice: i,
    rumbo: metrosEntre(a, b) >= 3 ? rumboEntre(a, b) : null,
  };
}

/** El punto más cercano a una coordenada — para que pulsar el TRAZO abra el
 *  globo del ping real que hay debajo, sin un marcador por punto. */
export function indiceMasCercano(pts: ReadonlyArray<PuntoRecorrido>, p: Punto): number {
  let mejor = -1;
  let mejorD = Infinity;
  for (let i = 0; i < pts.length; i += 1) {
    const dLat = pts[i].lat - p.lat;
    const dLng = pts[i].lng - p.lng;
    // Comparación en grados al cuadrado: para elegir el mínimo no hace falta
    // convertir a metros, y así es un recorrido sin trigonometría.
    const d = dLat * dLat + dLng * dLng;
    if (d < mejorD) {
      mejorD = d;
      mejor = i;
    }
  }
  return mejor;
}

/* ── Formato ─────────────────────────────────────────────────────────────── */
/* Viven aquí porque los DOS mapas de rastreo dicen las mismas cosas y tienen que
   decirlas igual: «hace 3 min», «12,4 km/h», «1 h 20 min». */

export function hora(iso: string | number | Date | null | undefined): string {
  if (iso == null) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleTimeString("es-EC", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function fechaHora(iso: string | number | Date | null | undefined): string {
  if (iso == null) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("es-EC");
}

/** «hace 40 s», «hace 12 min», «hace 3 h». Sin `Intl.RelativeTimeFormat` para
 *  no depender de la conjugación de la configuración regional del navegador. */
export function haceCuanto(iso: string | number | Date | null | undefined): string {
  if (iso == null) return "sin dato";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "sin dato";
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 45) return "ahora mismo";
  const m = Math.round(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h${m % 60 ? ` ${m % 60} min` : ""}`;
  const d = Math.floor(h / 24);
  return `hace ${d} d`;
}

/** Milisegundos → «1 h 20 min» / «45 min» / «30 s». */
export function duracion(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "0 min";
  const min = Math.round(ms / 60000);
  if (min < 1) return `${Math.round(ms / 1000)} s`;
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const r = min % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

/** m/s → «12,4 km/h». */
export function kmh(ms: number | null | undefined): string {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms < 0) return "—";
  const v = ms * 3.6;
  return `${v.toLocaleString("es-EC", { minimumFractionDigits: v < 10 ? 1 : 0, maximumFractionDigits: 1 })} km/h`;
}

/** Metros → «820 m» / «12,4 km». */
export function distancia(m: number): string {
  if (!Number.isFinite(m) || m < 0) return "—";
  if (m < 1000) return `${Math.round(m)} m`;
  const km = m / 1000;
  return `${km.toLocaleString("es-EC", { minimumFractionDigits: km < 10 ? 2 : 1, maximumFractionDigits: 2 })} km`;
}
