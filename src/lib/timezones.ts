/**
 * ════════════════════════════════════════════════════════════════════════════
 * ZONAS HORARIAS — TODAS LAS DEL MUNDO, Y UNA SOLA COPIA
 *
 * EL FALLO QUE CIERRA (2026-09-01): la lista de zonas era un literal de OCHO
 * opciones latinoamericanas, escrito DOS veces (en el asistente de alta y en el
 * perfil de empresa). Consecuencias reales:
 *
 *  1. Una empresa de Berlín, Londres o Miami no podía elegir su zona horaria en
 *     NINGÚN sitio del producto.
 *  2. Peor: si ya tenía `Europe/Berlin` guardada, el <Select> no encontraba la
 *     opción, pintaba el marcador de posición vacío y al guardar el perfil la
 *     zona SE PERDÍA. La zona gobierna turnos, rondas e informes: perderla
 *     corre los horarios de toda la operación.
 *  3. El valor por defecto era "America/Guayaquil" a fuego, así que todo el que
 *     no tocaba el selector quedaba en UTC-5 Quito.
 *  4. `tzFromText` buscaba con `hay.includes(key)` sobre la dirección entera y
 *     claves de dos letras ('ec', 'co', 'pe', 'es'…): una calle llamada
 *     «Recoletos» contiene 'co' y resolvía a Bogotá; «Escocia» contiene 'es' y
 *     resolvía a Madrid. Es la misma lotería de subcadenas que se mató en
 *     `lib/validators/id.ts`.
 *
 * Ahora: las opciones salen de `Intl.supportedValuesOf('timeZone')` (~420
 * zonas, las que el navegador realmente sabe convertir), el valor inicial es la
 * zona del equipo de quien se registra, y el país se compara EXACTO.
 * ════════════════════════════════════════════════════════════════════════════
 */

export type TimezoneOption = { value: string; label: string; region: string };

/** Sólo si el navegador no sabe decir su propia zona. No es un valor de negocio. */
const RESPALDO_ULTIMO = "America/Guayaquil";

/** La zona del equipo de quien está usando la aplicación. */
export function browserTimezone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

    if (tz) return tz;
  } catch {
    /* navegador sin Intl completo */
  }

  return RESPALDO_ULTIMO;
}

/**
 * Valor inicial de zona horaria. Sale del equipo de quien se registra, NO de
 * Guayaquil: un cliente de Madrid que no tocaba el selector veía todos los
 * turnos corridos siete horas.
 */
export const DEFAULT_TIMEZONE = browserTimezone();

/** Minutos de desfase respecto a UTC en este instante (con horario de verano ya aplicado). */
function desfaseEnMinutos(tz: string, ahora: Date): number | null {
  try {
    const partes = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).formatToParts(ahora);

    const n = (tipo: string) =>
      Number(partes.find((p) => p.type === tipo)?.value ?? NaN);
    const hora = n("hour") % 24; // en-US con hour12:false devuelve 24 a medianoche
    const comoUtc = Date.UTC(
      n("year"),
      n("month") - 1,
      n("day"),
      hora,
      n("minute"),
      n("second"),
    );

    if (Number.isNaN(comoUtc)) return null;

    // Se redondea al minuto: los segundos vienen del mismo instante y sobran.
    return Math.round((comoUtc - ahora.getTime()) / 60000);
  } catch {
    return null;
  }
}

/** «UTC+2», «UTC-3:30», «UTC». */
export function utcOffsetLabel(tz: string): string {
  const min = desfaseEnMinutos(tz, new Date());

  if (min === null || min === 0) return "UTC";
  const signo = min < 0 ? "-" : "+";
  const abs = Math.abs(min);
  const h = Math.floor(abs / 60);
  const m = abs % 60;

  return `UTC${signo}${h}${m ? `:${String(m).padStart(2, "0")}` : ""}`;
}

/** «Europe/Berlin (UTC+2)» — el identificador IANA se conserva porque es el dato que se guarda. */
export function timezoneLabel(tz: string): string {
  if (tz === "UTC") return "UTC";

  return `${tz} (${utcOffsetLabel(tz)})`;
}

const REGIONES: Record<string, string> = {
  Africa: "África",
  America: "América",
  Antarctica: "Antártida",
  Arctic: "Ártico",
  Asia: "Asia",
  Atlantic: "Atlántico",
  Australia: "Australia",
  Europe: "Europa",
  Indian: "Índico",
  Pacific: "Pacífico",
};

export function timezoneRegion(tz: string): string {
  const prefijo = tz.split("/")[0];

  return REGIONES[prefijo] || "UTC";
}

/** `Intl.supportedValuesOf` es ES2022 y el proyecto compila contra ES2020: se declara aquí. */
type IntlConValores = typeof Intl & {
  supportedValuesOf?: (clave: "timeZone") => string[];
};

/** Lo mínimo para que un navegador antiguo siga pudiendo elegir algo coherente. */
const ZONAS_DE_RESPALDO = [
  "America/Guayaquil",
  "America/Bogota",
  "America/Lima",
  "America/Mexico_City",
  "America/Santiago",
  "America/Buenos_Aires",
  "America/New_York",
  "America/Los_Angeles",
  "Europe/Madrid",
  "Europe/London",
  "Europe/Berlin",
  "UTC",
];

function todasLasZonas(): string[] {
  let zonas: string[] = [];

  try {
    const soportadas = (Intl as IntlConValores).supportedValuesOf;

    if (typeof soportadas === "function")
      zonas = soportadas.call(Intl, "timeZone");
  } catch {
    zonas = [];
  }
  if (!zonas.length) zonas = ZONAS_DE_RESPALDO;

  // `supportedValuesOf` NO incluye 'UTC', y es una elección legítima para una
  // empresa multinacional; y la zona del equipo tiene que poder elegirse aunque
  // la lista venga del respaldo.
  return Array.from(new Set([...zonas, "UTC", browserTimezone()]));
}

function construirOpciones(zonas: string[]): TimezoneOption[] {
  return zonas
    .map((tz) => ({
      value: tz,
      label: timezoneLabel(tz),
      region: timezoneRegion(tz),
    }))
    .sort(
      (a, b) =>
        a.region.localeCompare(b.region, "es") ||
        a.value.localeCompare(b.value, "es"),
    );
}

/** Todas las zonas que el navegador sabe convertir, ordenadas por región. */
export const TIMEZONE_OPTIONS: TimezoneOption[] =
  construirOpciones(todasLasZonas());

/**
 * Las opciones GARANTIZANDO que la zona ya guardada esté entre ellas.
 *
 * Sin esto vuelve el fallo original por otra puerta: los identificadores
 * antiguos ('America/Buenos_Aires' frente al canónico
 * 'America/Argentina/Buenos_Aires') no siempre están en la lista del navegador,
 * el selector se pintaría vacío y al guardar se perdería la zona del cliente.
 */
export function timezoneOptions(actual?: string): TimezoneOption[] {
  const tz = (actual || "").trim();

  if (!tz || TIMEZONE_OPTIONS.some((o) => o.value === tz))
    return TIMEZONE_OPTIONS;

  return construirOpciones([...TIMEZONE_OPTIONS.map((o) => o.value), tz]);
}

/** Sin tildes, sin mayúsculas y sin espacios sobrantes, para comparar países. */
function normalizar(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

/**
 * País (código ISO-2 o nombre) → zona horaria de su capital.
 *
 * Las claves se comparan EXACTAS, nunca con `includes`. Sólo cubre los países
 * donde el producto ya opera; para el resto se usa la zona del equipo, que
 * acierta mucho más que adivinar por subcadenas.
 */
export const COUNTRY_TZ: Record<string, string> = {
  ec: "America/Guayaquil",
  ecuador: "America/Guayaquil",
  co: "America/Bogota",
  colombia: "America/Bogota",
  pe: "America/Lima",
  peru: "America/Lima",
  mx: "America/Mexico_City",
  mexico: "America/Mexico_City",
  pa: "America/Panama",
  panama: "America/Panama",
  cl: "America/Santiago",
  chile: "America/Santiago",
  ar: "America/Buenos_Aires",
  argentina: "America/Buenos_Aires",
  ve: "America/Caracas",
  venezuela: "America/Caracas",
  bo: "America/La_Paz",
  bolivia: "America/La_Paz",
  es: "Europe/Madrid",
  espana: "Europe/Madrid",
  spain: "Europe/Madrid",
};

/** Zona de ese país, o `null` si no lo modelamos. Comparación exacta. */
export function tzForCountry(country?: string): string | null {
  const p = normalizar(country || "");

  if (!p) return null;

  return COUNTRY_TZ[p] ?? null;
}

/**
 * Zona horaria a partir del país. Siempre devuelve algo: si el país no está
 * modelado se usa la zona del equipo en vez de `null`, que era lo que hacía que
 * «Detectar por la dirección» contestara «No se pudo detectar» a media
 * humanidad.
 *
 * OJO: sólo se mira el PAÍS. Antes se concatenaba también la dirección y se
 * buscaban subcadenas: «Recoletos» resolvía a Bogotá.
 */
export function tzFromText(...vals: (string | undefined)[]): string {
  for (const v of vals) {
    const tz = tzForCountry(v);

    if (tz) return tz;
  }

  return browserTimezone();
}
