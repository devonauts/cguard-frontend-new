/**
 * ════════════════════════════════════════════════════════════════════════════
 * C-GUARD PRO — MEDIDAS SOBRE EL MAPA
 *
 * Área, perímetro, radio equivalente, tiempo estimado de llegada y la forma de
 * ESCRIBIR todo eso. Es lo que los mapas de TRABAJO (colocar un punto, dibujar
 * una geocerca, despachar a alguien) tienen que enseñar mientras el operador
 * manipula, y lo único que ni `mapMotion` ni `mapPins` cubren.
 *
 * ── DÓNDE ACABA ESTE ARCHIVO ────────────────────────────────────────────────
 * · Movimiento, cámara, ondas, rumbo y distancia entre dos puntos → `mapMotion`
 *   (`metrosEntre`, `rumboEntre`, `motor.camara`). Aquí NO se reimplementan: la
 *   distancia se pide allí y se usa para componer área y perímetro.
 * · Color → `mapTheme`. Globos → `MapPopup`. Chinchetas → `mapPins`.
 *
 * ── POR QUÉ EL ÁREA NO SE LE PIDE A GOOGLE ──────────────────────────────────
 * `google.maps.geometry.spherical` lo haría… pero el cargador pide
 * `libraries=places,marker` (ver `utils/loadGoogleMaps.ts`, que no se toca desde
 * aquí): la biblioteca `geometry` no está en la página. Traerla costaría otra
 * descarga y ataría estas cifras a que el mapa ya esté cargado — y la lista de
 * «quién está más cerca» del despacho se ordena ANTES de que se pinte nada.
 * ════════════════════════════════════════════════════════════════════════════
 */

import { metrosEntre, type Punto } from "@/utils/mapMotion";
import { localeActual } from "@/lib/localeActual";
export type Coord = Punto;

const R_TIERRA = 6_371_008.8; // radio medio de la Tierra, en metros (IUGG)
const RAD = Math.PI / 180;

/** ¿Es una coordenada usable? Filtra cadenas, NaN y el (0,0) del océano. */
export function coordValida(c: unknown): c is Coord {
  const p = c as Coord | null;

  return (
    !!p &&
    typeof p.lat === "number" &&
    typeof p.lng === "number" &&
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lng) &&
    Math.abs(p.lat) <= 90 &&
    Math.abs(p.lng) <= 180 &&
    !(p.lat === 0 && p.lng === 0)
  );
}

/** Convierte lo que venga del servidor (cadena, número, nulo) en coordenada. */
export function aCoord(lat: unknown, lng: unknown): Coord | null {
  const la = typeof lat === "string" ? parseFloat(lat) : (lat as number);
  const ln = typeof lng === "string" ? parseFloat(lng) : (lng as number);
  const c = { lat: la, lng: ln };

  return coordValida(c) ? c : null;
}

/* ── Polígonos ───────────────────────────────────────────────────────────── */

/**
 * Área del polígono sobre la esfera, en metros cuadrados.
 *
 * Es la fórmula del exceso esférico — la misma que usa `computeArea` de Google.
 * Se normaliza cada salto de longitud a ±180° para que un polígono no reviente
 * si cruza el antimeridiano (no pasa dibujando un edificio, pero cuesta nada).
 */
export function areaPoligono(pts: Coord[]): number {
  const p = (pts || []).filter(coordValida);

  if (p.length < 3) return 0;
  let suma = 0;

  for (let i = 0; i < p.length; i++) {
    const a = p[i];
    const b = p[(i + 1) % p.length];
    let dLng = (b.lng - a.lng) * RAD;

    if (dLng > Math.PI) dLng -= 2 * Math.PI;
    if (dLng < -Math.PI) dLng += 2 * Math.PI;
    suma += dLng * (2 + Math.sin(a.lat * RAD) + Math.sin(b.lat * RAD));
  }

  return Math.abs((suma * R_TIERRA * R_TIERRA) / 2);
}

/** Perímetro del polígono cerrado, en metros. */
export function perimetroPoligono(pts: Coord[]): number {
  const p = (pts || []).filter(coordValida);

  if (p.length < 2) return 0;
  let total = 0;

  for (let i = 0; i < p.length; i++)
    total += metrosEntre(p[i], p[(i + 1) % p.length]);

  return total;
}

/** Centro del polígono — media de los vértices, suficiente para encuadrar. */
export function centroide(pts: Coord[]): Coord | null {
  const p = (pts || []).filter(coordValida);

  if (!p.length) return null;

  return {
    lat: p.reduce((s, c) => s + c.lat, 0) / p.length,
    lng: p.reduce((s, c) => s + c.lng, 0) / p.length,
  };
}

/**
 * El radio del círculo de la MISMA área. Es la cifra que de verdad entiende un
 * jefe de operaciones: «esta geocerca es como un radio de 40 m», que se compara
 * de un vistazo con el error del GPS de un teléfono (5-20 m a cielo abierto).
 */
export function radioEquivalente(areaM2: number): number {
  return areaM2 > 0 ? Math.sqrt(areaM2 / Math.PI) : 0;
}

/** Distancia del vértice más lejano al centro — el «alcance» real del recinto. */
export function radioMaximo(pts: Coord[]): number {
  const c = centroide(pts);

  if (!c) return 0;

  return pts
    .filter(coordValida)
    .reduce((m, p) => Math.max(m, metrosEntre(c, p)), 0);
}

/* ── Presentación ────────────────────────────────────────────────────────── */

const nf = (dec: number) =>
  new Intl.NumberFormat(localeActual(), {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  });

/** «34 m», «780 m», «1,2 km», «14 km». */
export function formatearDistancia(metros: number): string {
  if (!Number.isFinite(metros)) return "—";
  if (metros < 1000) return `${Math.round(metros)} m`;
  const km = metros / 1000;

  return `${nf(km < 10 ? 1 : 0).format(km)} km`;
}

/** «850 m²», «1,2 ha», «34 ha». */
export function formatearArea(m2: number): string {
  if (!Number.isFinite(m2) || m2 <= 0) return "—";
  if (m2 < 10_000) return `${nf(0).format(Math.round(m2))} m²`;
  const ha = m2 / 10_000;

  return `${nf(ha < 10 ? 1 : 0).format(ha)} ha`;
}

/** Coordenada con seis decimales — poco más de 10 cm, el límite útil de un GPS. */
export function formatearCoord(lat: number, lng: number): string {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return "—";

  return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
}

/** «4 min», «1 h 10 min». */
export function formatearMinutos(min: number): string {
  if (!Number.isFinite(min) || min <= 0) return "—";
  const m = Math.max(1, Math.round(min));

  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;

  return r ? `${h} h ${r} min` : `${h} h`;
}

/**
 * Tiempo de llegada ESTIMADO a partir de la distancia en línea recta.
 *
 * ── POR QUÉ NO SE PREGUNTA A GOOGLE ────────────────────────────────────────
 * La respuesta exacta la daría la Matriz de Distancias, y se factura por cada
 * par origen-destino: una pantalla de despacho con ocho puestos cerca costaría
 * ocho peticiones CADA VEZ que se abre un incidente. Aquí se estima y se ETIQUETA
 * como estimación, que es lo honesto y lo que ya hacen las radios.
 *
 * El factor 1,35 es el rodeo típico de una malla urbana (la calle nunca va en
 * línea recta) y los 26 km/h la velocidad media real en ciudad con semáforos.
 * Se suman 2 minutos de reacción: nadie sale corriendo en el segundo cero.
 */
export function estimarMinutos(metros: number, kmhMedia = 26): number {
  if (!Number.isFinite(metros) || metros < 0) return NaN;

  return 2 + ((metros * 1.35) / 1000 / kmhMedia) * 60;
}
