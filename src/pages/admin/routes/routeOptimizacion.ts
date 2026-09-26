import { localeActual } from "@/lib/localeActual";
import i18n from "@/i18n";
/**
 * ════════════════════════════════════════════════════════════════════════════
 * OPTIMIZACIÓN DE RUTAS — lo que el CRM sabe leer del servidor
 *
 * Aquí vive TODO lo que traduce la respuesta del servidor a algo que se pueda
 * enseñar: el ahorro, el trazado y las coordenadas. Está fuera de las pantallas
 * porque lo consumen cuatro (formulario, ficha, mapa y el tablero de patrulla)
 * y el ahorro tiene que decir exactamente lo mismo en las cuatro — si cada una
 * lo formatea a su manera, la misma ruta enseña dos cifras distintas y ninguna
 * se cree.
 *
 * ── POR QUÉ LA LECTURA ES TOLERANTE ─────────────────────────────────────────
 * `optimizedMeta` es un JSON libre. El contrato dice «distancia y minutos antes
 * y después», no cómo se llaman las claves, así que se aceptan las formas
 * razonables (anidada, plana, en metros, en español) en vez de romper el panel
 * entero por una `s` de más. Lo que NO se hace es inventar: si el dato no
 * viene, se devuelve `null` y quien llama enseña «sin optimizar», no un cero.
 * ════════════════════════════════════════════════════════════════════════════
 */

export interface Coord {
  lat: number;
  lng: number;
}

/**
 * Coordenada venga como venga: número, texto, texto con coma decimal o con la
 * unidad pegada. Los puestos de vigilancia las guardan de las tres formas.
 */
export function parseCoord(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).trim().replace(/,/g, ".");
  const m = s.match(/-?[0-9]+\.?[0-9]*/);

  if (!m) return null;
  const num = Number(m[0]);

  return Number.isFinite(num) ? num : null;
}

/** Par de coordenadas válido, o `null`. */
export function aCoord(lat: unknown, lng: unknown): Coord | null {
  const la = parseCoord(lat);
  const ln = parseCoord(lng);

  if (la == null || ln == null) return null;
  if (la < -90 || la > 90 || ln < -180 || ln > 180) return null;

  return { lat: la, lng: ln };
}

/* ── El trazado por calles ───────────────────────────────────────────────── */

/**
 * Polilínea codificada de Google → lista de coordenadas.
 *
 * Va a mano y no por `google.maps.geometry.encoding`: la biblioteca `geometry`
 * NO se carga en el CRM (mira el `src=` de `loadGoogleMaps`), y añadirla sería
 * bajar otro paquete a CADA pantalla con mapa para veinte líneas de algoritmo
 * que no cambia desde 2007.
 */
export function decodePolyline(encoded: string): Coord[] {
  const pts: Coord[] = [];
  let i = 0;
  let lat = 0;
  let lng = 0;

  while (i < encoded.length) {
    let b: number;
    let shift = 0;
    let result = 0;

    do {
      b = encoded.charCodeAt(i++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20 && i < encoded.length);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(i++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20 && i < encoded.length);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    pts.push({ lat: lat * 1e-5, lng: lng * 1e-5 });
  }

  return pts;
}

/**
 * `roadPolyline` es «texto» en el contrato, pero un texto puede ser una
 * polilínea codificada o un JSON con las coordenadas. Se admiten las dos y se
 * descarta lo que no dé al menos dos puntos: media línea no es un trazado.
 */
export function leerTrazado(raw: unknown): Coord[] | null {
  if (!raw) return null;

  if (Array.isArray(raw)) {
    const pts = raw
      .map((p: any) =>
        Array.isArray(p) ? aCoord(p[0], p[1]) : aCoord(p?.lat, p?.lng),
      )
      .filter((p): p is Coord => p != null);

    return pts.length > 1 ? pts : null;
  }

  const s = String(raw).trim();

  if (!s) return null;

  if (s.startsWith("[") || s.startsWith("{")) {
    try {
      const parsed = JSON.parse(s);
      const lista = Array.isArray(parsed)
        ? parsed
        : (parsed?.points ?? parsed?.path ?? parsed?.coordinates);

      if (Array.isArray(lista)) return leerTrazado(lista);
      if (typeof parsed?.polyline === "string")
        return leerTrazado(parsed.polyline);

      return null;
    } catch {
      return null;
    }
  }

  try {
    const pts = decodePolyline(s);

    return pts.length > 1 ? pts : null;
  } catch {
    return null;
  }
}

/* ── El ahorro ───────────────────────────────────────────────────────────── */

export interface AhorroRuta {
  /** Kilómetros del orden manual, antes de reordenar. */
  kmAntes: number | null;
  kmDespues: number | null;
  minAntes: number | null;
  minDespues: number | null;
  /** Lo que se ahorra. Positivo = se ahorra; negativo = el nuevo orden es peor. */
  km: number | null;
  min: number | null;
  /** Porcentaje que se recorta, tal cual lo calcula el servidor. */
  porcentaje: number | null;
  /**
   * Paradas que el motor NO pudo colocar por no tener coordenadas. Conservan su
   * posición y las demás se reparten por los huecos — que es exactamente por qué
   * el orden puede no ser el que el operador esperaba. Si es > 0, se dice.
   */
  sinCoordenadas: number | null;
  /** El servidor recortó la ruta por tamaño: el cálculo no la cubre entera. */
  truncado: boolean;
  /** Velocidad efectiva del cálculo. Se enseña como «tráfico urbano». */
  velocidadKmh: number | null;
  /** Hay algo que presumir: al menos una de las dos cifras baja de verdad. */
  hayAhorro: boolean;
}

/** El primer número finito de la lista, o `null`. */
function primerNum(...cands: unknown[]): number | null {
  for (const c of cands) {
    if (c == null) continue;
    const n = typeof c === "number" ? c : Number(String(c).replace(",", "."));

    if (Number.isFinite(n)) return n;
  }

  return null;
}

/** Metros → kilómetros, si lo que llegó estaba en metros. */
function aKm(km: number | null, metros: number | null): number | null {
  if (km != null) return km;
  if (metros != null) return metros / 1000;

  return null;
}

/** Segundos → minutos, si lo que llegó estaba en segundos. */
function aMin(min: number | null, segundos: number | null): number | null {
  if (min != null) return min;
  if (segundos != null) return segundos / 60;

  return null;
}

/**
 * Lee `optimizedMeta` (o la respuesta directa de `POST …/optimize`, que trae lo
 * mismo) y devuelve el ahorro ya normalizado a km y minutos.
 */
export function leerAhorro(raw: unknown): AhorroRuta | null {
  if (!raw) return null;

  let meta: any = raw;

  if (typeof meta === "string") {
    try {
      meta = JSON.parse(meta);
    } catch {
      return null;
    }
  }
  if (typeof meta !== "object") return null;

  // La respuesta de optimizar puede venir envuelta en la ruta entera.
  const m: any = meta.optimizedMeta ?? meta.meta ?? meta;
  const antes: any = m.before ?? m.antes ?? m.previous ?? {};
  const despues: any =
    m.after ?? m.despues ?? m["después"] ?? m.optimized ?? {};

  const kmAntes = aKm(
    primerNum(
      antes.km,
      antes.kilometers,
      antes.distanceKm,
      m.beforeKm,
      m.kmBefore,
      m.kmAntes,
      m.distanceBeforeKm,
    ),
    primerNum(
      antes.meters,
      antes.distance,
      antes.metros,
      m.beforeMeters,
      m.distanceBefore,
      m.metrosAntes,
    ),
  );
  const kmDespues = aKm(
    primerNum(
      despues.km,
      despues.kilometers,
      despues.distanceKm,
      m.afterKm,
      m.kmAfter,
      m.kmDespues,
      m.distanceAfterKm,
    ),
    primerNum(
      despues.meters,
      despues.distance,
      despues.metros,
      m.afterMeters,
      m.distanceAfter,
      m.metrosDespues,
    ),
  );
  const minAntes = aMin(
    primerNum(
      antes.min,
      antes.minutes,
      antes.minutos,
      antes.durationMin,
      m.beforeMin,
      m.minBefore,
      m.minAntes,
      m.durationBeforeMin,
    ),
    primerNum(
      antes.seconds,
      antes.duration,
      antes.segundos,
      m.beforeSeconds,
      m.durationBefore,
    ),
  );
  const minDespues = aMin(
    primerNum(
      despues.min,
      despues.minutes,
      despues.minutos,
      despues.durationMin,
      m.afterMin,
      m.minAfter,
      m.minDespues,
      m.durationAfterMin,
    ),
    primerNum(
      despues.seconds,
      despues.duration,
      despues.segundos,
      m.afterSeconds,
      m.durationAfter,
    ),
  );

  // El ahorro viene ya calculado en `savings`. Se prefiere el explícito: es el
  // que el servidor considera correcto, y restar por nuestra cuenta podría
  // discrepar en el último decimal y enseñar dos cifras distintas del mismo dato.
  const ahorroDe: any = m.savings ?? m.saved ?? m.ahorro ?? {};
  const kmDirecto = aKm(
    primerNum(
      ahorroDe.km,
      ahorroDe.kilometers,
      m.savedKm,
      m.ahorroKm,
      m.savingsKm,
      m.deltaKm,
    ),
    primerNum(ahorroDe.meters, ahorroDe.metros, m.savedMeters, m.ahorroMetros),
  );
  const minDirecto = aMin(
    primerNum(
      ahorroDe.minutes,
      ahorroDe.min,
      ahorroDe.minutos,
      m.savedMin,
      m.ahorroMin,
      m.savingsMin,
      m.deltaMin,
    ),
    primerNum(ahorroDe.seconds, ahorroDe.segundos, m.savedSeconds),
  );

  const km =
    kmDirecto ??
    (kmAntes != null && kmDespues != null ? kmAntes - kmDespues : null);
  const min =
    minDirecto ??
    (minAntes != null && minDespues != null ? minAntes - minDespues : null);

  if (km == null && min == null && kmDespues == null && minDespues == null)
    return null;

  return {
    kmAntes,
    kmDespues,
    minAntes,
    minDespues,
    km,
    min,
    porcentaje: primerNum(ahorroDe.percent, ahorroDe.porcentaje, m.percent),
    sinCoordenadas: primerNum(m.stopsWithoutCoords, m.sinCoordenadas),
    truncado: Boolean(m.truncated ?? m.truncado),
    velocidadKmh: primerNum(m.speedKmh, m.velocidadKmh),
    // Medio kilómetro o un minuto: por debajo de eso el ahorro está dentro del
    // margen de error de la estimación y presumirlo sería vender humo.
    hayAhorro: (km != null && km >= 0.05) || (min != null && min >= 0.5),
  };
}

const nf = (dec: number) =>
  new Intl.NumberFormat(localeActual(), {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  });

/** «8,4 km» · «14 km». */
export function km(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const abs = Math.abs(v);

  return `${nf(abs < 10 ? 1 : 0).format(abs)} km`;
}

/** «22 min» · «1 h 10 min». */
export function minutos(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const m = Math.round(Math.abs(v));

  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;

  return r ? `${h} h ${r} min` : `${h} h`;
}

/**
 * La frase que justifica el botón: «-8,4 km · -22 min frente al orden manual».
 *
 * Es lo ÚNICO que convierte «optimizar» en una decisión de negocio en vez de un
 * botón mágico, así que nunca se abrevia ni se esconde detrás de un icono.
 */
export function fraseAhorro(a: AhorroRuta | null): string | null {
  if (!a || !a.hayAhorro) return null;
  const trozos: string[] = [];

  if (a.km != null && a.km >= 0.05) trozos.push(`-${km(a.km)}`);
  if (a.min != null && a.min >= 0.5) trozos.push(`-${minutos(a.min)}`);
  if (!trozos.length) return null;

  return i18n.t("ui.routeOptimizacion.frenteAlOrdenManual", {
    defaultValue: "{{ahorro}} frente al orden manual",
    ahorro: trozos.join(" · "),
  });
}

/** «12 de agosto, 14:30» — cuándo se optimizó. */
export function fechaOptimizacion(iso: unknown): string | null {
  if (!iso) return null;
  const d = new Date(String(iso));

  if (Number.isNaN(d.getTime())) return null;

  return d.toLocaleString(localeActual(), {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/* ── Origen y destino ────────────────────────────────────────────────────── */

/** Un extremo del recorrido. Los dos son OPCIONALES por contrato. */
export interface ExtremoRuta {
  lat: number;
  lng: number;
  label: string;
}

/**
 * Lee el origen/destino de una ruta del servidor. `null` si no está puesto.
 *
 * Las coordenadas llegan como CADENA (son decimales en la base de datos), así
 * que pasan por `parseCoord` igual que las de los puestos. Compararlas como
 * texto sería el error clásico: `'-0.36'` y `-0.36` son el mismo sitio.
 */
export function leerExtremo(
  lat: unknown,
  lng: unknown,
  label: unknown,
): ExtremoRuta | null {
  const c = aCoord(lat, lng);

  if (!c) return null;
  const texto = String(label ?? "").trim();

  return { ...c, label: texto || `${c.lat.toFixed(5)}, ${c.lng.toFixed(5)}` };
}

/**
 * ¿Es el mismo punto? Se compara POR NÚMERO, como hace el servidor: reenviar el
 * mismo origen escrito de otra forma no debe apagar la marca de optimizada.
 * Cinco decimales ≈ un metro, de sobra para dos direcciones distintas.
 */
export function mismoExtremo(
  a: ExtremoRuta | null,
  b: ExtremoRuta | null,
): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;

  return Math.abs(a.lat - b.lat) < 1e-5 && Math.abs(a.lng - b.lng) < 1e-5;
}

/**
 * Lo que se manda en el `PUT` para un extremo.
 *
 * La cadena vacía es la que BORRA: mandar el campo ausente no lo toca, así que
 * «quitar el origen» sólo funciona si se envía `''`. Es la diferencia entre que
 * el operador vea desaparecer el origen y que reaparezca al recargar.
 */
export function valorExtremo(e: ExtremoRuta | null) {
  return {
    lat: e ? e.lat : "",
    lng: e ? e.lng : "",
    label: e ? e.label : "",
  };
}

/**
 * Por qué no hay trazado por calles. El servidor NUNCA falla aquí: devuelve
 * `polyline: null` con su motivo, y la pantalla sigue con la línea recta.
 */
export function motivoTrazado(reason: unknown): string {
  const r = String(reason ?? "").trim();
  const clave = r.toLowerCase();

  if (clave.includes("key") || clave.includes("clave")) {
    return i18n.t("ui.routeOptimizacion.mapasNoConfigurado", "El servicio de mapas no está configurado, así que el recorrido se sigue mostrando en línea recta.");
  }
  if (
    clave.includes("stop") ||
    clave.includes("many") ||
    clave.includes("limit") ||
    clave.includes("parada")
  ) {
    return i18n.t("ui.routeOptimizacion.demasiadasParadas", "La ruta tiene demasiadas paradas para trazarla por calles. Se sigue mostrando en línea recta.");
  }
  // Si vino una frase de verdad, se enseña tal cual antes que taparla.
  if (r && /\s/.test(r)) return r;

  return i18n.t("ui.routeOptimizacion.noSePudoTrazar", "No se pudo trazar el recorrido por calles. Se sigue mostrando en línea recta.");
}
