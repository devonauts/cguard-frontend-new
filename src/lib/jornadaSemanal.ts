import { DIAS_ISO, type DiaIso } from "@/lib/secuenciaDeRotacion";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * OFFICE HOURS, DAY BY DAY.
 *
 * The office editor used to take ONE start/end for every ticked weekday, so
 * «Monday to Friday 08:00–17:00 and Saturday 08:00–12:00» could not be written —
 * exactly the administrative schedule Mike asked for. Now each weekday has its
 * own on/off and hours, and the server receives
 *
 *   { schedule: { mon: { start, end }, …, sat: { start, end } }, effectiveFrom? }
 *
 * where an absent day is a day off, and `{ schedule: null }` clears it.
 * Pure functions only: the modal (`OfficeHoursEditor`) and the tests share them.
 * ════════════════════════════════════════════════════════════════════════════
 */

export interface DiaDeJornada {
  dia: DiaIso;
  activo: boolean;
  start: string;
  end: string;
}

/** Seven rows, Monday first. */
export type Jornada = DiaDeJornada[];

export type ErrorDeDia = "horaInvalida" | "mismaHora" | null;

export interface Validacion {
  ok: boolean;
  porDia: Record<DiaIso, ErrorDeDia>;
  /** No day is on: that is «Quitar horario», not a schedule. */
  ningunDia: boolean;
  /** `effectiveFrom` is not a valid YYYY-MM-DD date. */
  fechaInvalida: boolean;
}

export const HORA_ENTRADA = "08:00";
export const HORA_SALIDA = "17:00";
export const HORA_SALIDA_MEDIO_DIA = "12:00";

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** «8:00» / «08:00:00» → «08:00»; anything else → "". */
export function horaLimpia(v: unknown): string {
  const m = String(v ?? "")
    .trim()
    .match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);

  if (!m) return "";
  const h = m[1].padStart(2, "0");
  const out = `${h}:${m[2]}`;

  return HHMM.test(out) ? out : "";
}

const fila = (dia: DiaIso, activo: boolean, start = HORA_ENTRADA, end = HORA_SALIDA): DiaDeJornada => ({
  dia,
  activo,
  start,
  end,
});

/** Every day off (hours pre-filled, so ticking a day is one click). */
export function jornadaVacia(): Jornada {
  return DIAS_ISO.map((d) => fila(d, false));
}

/** «Lunes a viernes 08:00–17:00». */
export function presetLunesAViernes(): Jornada {
  return DIAS_ISO.map((d, i) => fila(d, i < 5));
}

/** «Lunes a viernes + sábado medio día (08:00–12:00)». */
export function presetConSabadoMedio(): Jornada {
  return DIAS_ISO.map((d, i) =>
    i < 5
      ? fila(d, true)
      : i === 5
        ? fila(d, true, HORA_ENTRADA, HORA_SALIDA_MEDIO_DIA)
        : fila(d, false),
  );
}

/** «Copiar el lunes a todos»: Monday's hours on every day that is on. */
export function copiarLunesATodos(j: Jornada): Jornada {
  const lunes = j[0];

  if (!lunes) return j;

  return j.map((d) => (d.activo ? { ...d, start: lunes.start, end: lunes.end } : d));
}

export function validarJornada(j: Jornada, desde?: string | null): Validacion {
  const porDia = {} as Record<DiaIso, ErrorDeDia>;
  let ok = true;

  for (const d of j) {
    let e: ErrorDeDia = null;

    if (d.activo) {
      const a = horaLimpia(d.start);
      const b = horaLimpia(d.end);

      if (!a || !b) e = "horaInvalida";
      // Overnight is allowed (a night receptionist 22:00–06:00); a zero-length day is not.
      else if (a === b) e = "mismaHora";
    }
    porDia[d.dia] = e;
    if (e) ok = false;
  }
  const ningunDia = !j.some((d) => d.activo);
  const fechaInvalida =
    !!desde && !/^\d{4}-\d{2}-\d{2}$/.test(desde.trim());

  return {
    ok: ok && !ningunDia && !fechaInvalida,
    porDia,
    ningunDia,
    fechaInvalida,
  };
}

/** The PUT body. Throws nothing: call `validarJornada` first. */
export function cuerpoDeJornada(
  j: Jornada,
  desde?: string | null,
): { schedule: Partial<Record<DiaIso, { start: string; end: string }>>; effectiveFrom?: string } {
  const schedule: Partial<Record<DiaIso, { start: string; end: string }>> = {};

  for (const d of j)
    if (d.activo)
      schedule[d.dia] = { start: horaLimpia(d.start), end: horaLimpia(d.end) };
  const out: { schedule: typeof schedule; effectiveFrom?: string } = { schedule };

  if (desde && desde.trim()) out.effectiveFrom = desde.trim();

  return out;
}

/** The PUT body that clears the schedule. */
export const cuerpoSinJornada = () => ({ schedule: null });

/**
 * Pre-fill the editor from what the attendance sheet already shows: for each
 * weekday, the hours of the first worked date of that weekday in the range.
 * Null when nothing in the range is a worked day.
 */
export function jornadaDesdeDias(
  dias: { date: string; status: string; start?: string | null; end?: string | null }[] | null | undefined,
): Jornada | null {
  const j = jornadaVacia();
  let alguno = false;

  for (const d of Array.isArray(dias) ? dias : []) {
    if (d?.status !== "work") continue;
    const m = String(d.date || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);

    if (!m) continue;
    const fecha = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    const i = (fecha.getDay() + 6) % 7;
    const a = horaLimpia(d.start);
    const b = horaLimpia(d.end);

    if (j[i].activo || !a || !b) continue;
    j[i] = { ...j[i], activo: true, start: a, end: b };
    alguno = true;
  }

  return alguno ? j : null;
}

/** A schedule as it comes from the server (`{ mon: {start,end} … }`) → editor rows. */
export function jornadaDesdeServidor(s: unknown): Jornada | null {
  if (!s || typeof s !== "object") return null;
  const o = s as Record<string, { start?: string; end?: string } | null>;
  let alguno = false;
  const j = DIAS_ISO.map((d) => {
    const x = o[d];
    const a = horaLimpia(x?.start);
    const b = horaLimpia(x?.end);

    if (!a || !b) return fila(d, false);
    alguno = true;

    return fila(d, true, a, b);
  });

  return alguno ? j : null;
}
