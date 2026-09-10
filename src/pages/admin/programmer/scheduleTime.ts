/**
 * ────────────────────────────────────────────────────────────────────────────
 * LA ARITMÉTICA DE TIEMPO DEL HORARIO — una sola copia, y con pruebas
 *
 * Esto vivía DUPLICADO: `Schedule.tsx` tenía su `fmtDate`/`addDays`/caché de
 * `Intl.DateTimeFormat`, y `ScheduleTimeline.tsx` tenía los suyos más el
 * troceado por medianoche. Dos copias de la misma matemática, ninguna probada,
 * en el sitio donde un error de una hora no se ve hasta que un vigilante ficha.
 *
 * Aquí están una vez, exportadas y cubiertas por `scheduleTime.test.ts`. Son
 * FUNCIONES PURAS a propósito: sin React, sin DOM, sin red — se pueden probar
 * sin montar nada.
 *
 * La regla que gobierna todo el archivo: la zona horaria que manda es la del
 * TENANT, nunca la del navegador. Una empresa de Guayaquil vista desde un
 * portátil en Madrid tiene que enseñar los turnos en hora de Guayaquil.
 * ────────────────────────────────────────────────────────────────────────────
 */

export const pad2 = (n: number): string => String(n).padStart(2, "0");

/** `YYYY-MM-DD` de una fecha, en su hora LOCAL (no UTC: `toISOString` correría
 *  el día para cualquiera al oeste de Greenwich). */
export const fmtDate = (d: Date): string =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

/** Suma días sin arrastrar la hora — respeta cambios de horario de verano. */
export const addDays = (d: Date, n: number): Date => {
  const x = new Date(d);

  x.setDate(x.getDate() + n);

  return x;
};

/**
 * `Intl.DateTimeFormat` es CARO de construir. Se cachea por zona porque esto se
 * llama una vez por turno y por render: con 2.400 turnos, construirlos cada vez
 * costaba entre 50 y 250 ms por guardado.
 */
const DTF_CACHE = new Map<string, Intl.DateTimeFormat>();

export const tzFormatter = (tz: string): Intl.DateTimeFormat => {
  let f = DTF_CACHE.get(tz);

  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    DTF_CACHE.set(tz, f);
  }

  return f;
};

/** Milisegundos que hay que sumar a un instante UTC para leerlo en `tz`. */
export function tzOffsetMs(date: Date, tz?: string): number {
  if (!tz) return -date.getTimezoneOffset() * 60000;
  const p = Object.fromEntries(
    tzFormatter(tz)
      .formatToParts(date)
      .filter((x) => x.type !== "literal")
      .map((x) => [x.type, x.value]),
  ) as Record<string, string>;
  const asUTC = Date.UTC(
    +p.year,
    +p.month - 1,
    +p.day,
    +p.hour % 24,
    +p.minute,
    +p.second,
  );

  return asUTC - date.getTime();
}

/** Un instante real → hora de pared del tenant: `{ día, minutos del día }`. */
export function dateToWall(
  date: Date,
  tz?: string,
): { dateStr: string; minutes: number } {
  if (!tz)
    return {
      dateStr: fmtDate(date),
      minutes: date.getHours() * 60 + date.getMinutes(),
    };
  const shifted = new Date(date.getTime() + tzOffsetMs(date, tz));

  return {
    dateStr: shifted.toISOString().slice(0, 10),
    minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
  };
}

/**
 * Hora de pared del tenant → instante real. La inversa de `dateToWall`.
 *
 * DOS PASADAS a propósito: el desfase se calcula sobre una primera estimación y
 * se corrige con ella. En un cambio de horario de verano la primera respuesta
 * puede caer una hora fuera, y la segunda la endereza.
 */
export function wallToDate(
  y: number,
  m: number,
  d: number,
  minutes: number,
  tz?: string,
): Date {
  // SIN ZONA, HORA LOCAL — porque `dateToWall` sin zona TAMBIÉN lee local
  // (`getHours`). Las dos tienen que ser inversas. Al extraer esta función puse
  // aquí `Date.UTC` y rompí esa simetría: un turno leído a las 08:00 locales se
  // volvía a escribir como 08:00 UTC, y en una pantalla a UTC-5 reaparecía a las
  // 03:00. En producción no se veía porque la zona del tenant siempre llega;
  // saltó al probar en local, donde no hay ninguna configurada.
  if (!tz)
    return new Date(y, m - 1, d, Math.floor(minutes / 60), minutes % 60, 0);
  const utcGuess = Date.UTC(
    y,
    m - 1,
    d,
    Math.floor(minutes / 60),
    minutes % 60,
    0,
  );
  let off = tzOffsetMs(new Date(utcGuess), tz);

  off = tzOffsetMs(new Date(utcGuess - off), tz);

  return new Date(utcGuess - off);
}

/** `HH:mm` de unos minutos absolutos del lienzo. */
export const minLabel = (abs: number): string =>
  `${pad2(Math.floor((((abs % 1440) + 1440) % 1440) / 60))}:${pad2(((abs % 60) + 60) % 60)}`;

export interface Segment {
  dayIdx: number;
  /** Minutos desde el inicio de ESE día. */
  top: number;
  bottom: number;
  /** ¿Es el primer trozo del turno? (lleva la etiqueta y el tirador de entrada) */
  first: boolean;
  /** ¿El último? (lleva el tirador de salida) */
  last: boolean;
}

/**
 * Trocea un rango de minutos absolutos en trozos POR DÍA.
 *
 * Es la función más delicada del Horario: un turno de 19:00 a 07:00 no es un
 * rectángulo, son dos —el final de un día y el principio del siguiente—, y de
 * aquí salen tanto el dibujo como los tiradores de arrastre. Un fallo aquí
 * dibuja turnos en el día equivocado.
 */
export function segmentize(
  aAbs: number,
  bAbs: number,
  dayCount: number,
): Segment[] {
  const segs: Segment[] = [];
  // SE RECORTA AL LIENZO. Un turno que empieza antes de la primera columna o
  // acaba después de la última se dibuja sólo en el trozo que se ve; `first` y
  // `last` marcan los extremos VISIBLES, no los reales. Es lo que hace que las
  // esquinas redondeadas cierren la caja en el borde de la semana en vez de
  // dejarla abierta contra el aire.
  const a = Math.max(0, aAbs);
  const b = Math.min(dayCount * 1440, bAbs);

  if (b <= a) return segs;
  for (let di = Math.floor(a / 1440); di * 1440 < b && di < dayCount; di++) {
    const top = Math.max(a - di * 1440, 0);
    const bottom = Math.min(b - di * 1440, 1440);

    if (bottom <= top) continue;
    segs.push({
      dayIdx: di,
      top,
      bottom,
      first: segs.length === 0,
      last: false,
    });
  }
  if (segs.length) segs[segs.length - 1].last = true;

  return segs;
}

/**
 * Cuántos MINUTOS se ha movido el puntero en vertical, redondeado al paso de la
 * rejilla.
 *
 * Va aquí, pura y probada, porque la primera versión de esto vivía dentro del
 * componente y derivaba el desplazamiento de `pointTo`, que acota los minutos a
 * [0, 1440] y saca el DÍA de la coordenada X. Con eso, arrastrar un bloque hacia
 * abajo lo adelantaba tres horas y media: el valor no era un desplazamiento, era
 * una posición recortada. Restando dos coordenadas de pantalla no hay nada que
 * recortar ni ejes que mezclar.
 */
export function minutosArrastrados(
  yInicial: number,
  yActual: number,
  pxPorMinuto: number,
  paso: number,
): number {
  if (!(pxPorMinuto > 0) || !(paso > 0)) return 0;
  const crudo = (yActual - yInicial) / pxPorMinuto;

  return Math.round(crudo / paso) * paso;
}

export default {
  pad2,
  fmtDate,
  addDays,
  tzFormatter,
  tzOffsetMs,
  dateToWall,
  wallToDate,
  minLabel,
  segmentize,
  minutosArrastrados,
};
