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
  /** Planned lunch on/off for that day (unpaid, inside the day). */
  almuerzo: boolean;
  /** «13:00». Kept while `almuerzo` is off so ticking it back is one click. */
  breakStart: string;
  breakMinutes: number;
}

/** Seven rows, Monday first. */
export type Jornada = DiaDeJornada[];

export type ErrorDeDia = "horaInvalida" | "mismaHora" | "almuerzoFuera" | null;

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
export const HORA_ALMUERZO = "13:00";
export const MINUTOS_ALMUERZO = 60;
/** The lengths offered in the editor; the server accepts 1–240. */
export const OPCIONES_DE_ALMUERZO = [15, 30, 45, 60, 90, 120] as const;

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
  almuerzo: false,
  breakStart: HORA_ALMUERZO,
  breakMinutes: MINUTOS_ALMUERZO,
});

const minutos = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);

  return h * 60 + m;
};

/**
 * Does the lunch fit INSIDE the day? Same rule as the server
 * (`horarioUnico.almuerzoValido`): it starts after the entry and ends before
 * the exit; a day that crosses midnight is measured from its start.
 */
export function almuerzoCabe(d: Pick<DiaDeJornada, "start" | "end" | "breakStart" | "breakMinutes">): boolean {
  const a = horaLimpia(d.start);
  const b = horaLimpia(d.end);
  const bs = horaLimpia(d.breakStart);
  const bm = Number(d.breakMinutes);

  if (!a || !b || !bs || !Number.isInteger(bm) || bm <= 0 || bm > 240) return false;
  let largo = minutos(b) - minutos(a);

  if (largo <= 0) largo += 1440;
  let desde = minutos(bs) - minutos(a);

  if (desde < 0) desde += 1440;

  return desde > 0 && desde + bm < largo;
}

/** «13:00» + 60 → «14:00». */
export function finDeAlmuerzo(breakStart: string, breakMinutes: number): string {
  const t = (minutos(breakStart) + breakMinutes) % 1440;

  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

/** Paid minutes of a working day: the span minus the planned lunch. 0 when invalid. */
export function minutosNetos(d: DiaDeJornada): number {
  const a = horaLimpia(d.start);
  const b = horaLimpia(d.end);

  if (!d.activo || !a || !b || a === b) return 0;
  let largo = minutos(b) - minutos(a);

  if (largo <= 0) largo += 1440;

  return d.almuerzo && almuerzoCabe(d) ? largo - d.breakMinutes : largo;
}

/** «8 h» / «7 h 30». */
export function textoDeHoras(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;

  return m ? `${h} h ${String(m).padStart(2, "0")}` : `${h} h`;
}

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

  return j.map((d) =>
    d.activo
      ? {
          ...d,
          start: lunes.start,
          end: lunes.end,
          almuerzo: lunes.almuerzo,
          breakStart: lunes.breakStart,
          breakMinutes: lunes.breakMinutes,
        }
      : d,
  );
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
      else if (d.almuerzo && !almuerzoCabe(d)) e = "almuerzoFuera";
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

/** One day as the server stores it. */
export interface DiaDelServidor {
  start: string;
  end: string;
  breakStart?: string;
  breakMinutes?: number;
}

/** The PUT body. Throws nothing: call `validarJornada` first. */
export function cuerpoDeJornada(
  j: Jornada,
  desde?: string | null,
): { schedule: Partial<Record<DiaIso, DiaDelServidor>>; effectiveFrom?: string } {
  const schedule: Partial<Record<DiaIso, DiaDelServidor>> = {};

  for (const d of j)
    if (d.activo)
      schedule[d.dia] = {
        start: horaLimpia(d.start),
        end: horaLimpia(d.end),
        ...(d.almuerzo
          ? { breakStart: horaLimpia(d.breakStart), breakMinutes: Number(d.breakMinutes) }
          : {}),
      };
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
  dias:
    | {
        date: string;
        status: string;
        start?: string | null;
        end?: string | null;
        lunch?: { start: string; end: string } | null;
      }[]
    | null
    | undefined,
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
    j[i] = { ...j[i], activo: true, start: a, end: b, ...almuerzoDeDia(d.lunch) };
    alguno = true;
  }

  return alguno ? j : null;
}

/** A sheet day's `lunch` ({start,end}) as editor fields. */
function almuerzoDeDia(l: { start: string; end: string } | null | undefined): Partial<DiaDeJornada> {
  const s = horaLimpia(l?.start);
  const e = horaLimpia(l?.end);

  if (!s || !e) return {};
  let m = minutos(e) - minutos(s);

  if (m <= 0) m += 1440;

  return { almuerzo: true, breakStart: s, breakMinutes: m };
}

/** A schedule as it comes from the server (`{ mon: {start,end} … }`) → editor rows. */
export function jornadaDesdeServidor(s: unknown): Jornada | null {
  if (!s || typeof s !== "object") return null;
  const o = s as Record<
    string,
    { start?: string; end?: string; breakStart?: string; breakMinutes?: number } | null
  >;
  let alguno = false;
  const j = DIAS_ISO.map((d) => {
    const x = o[d];
    const a = horaLimpia(x?.start);
    const b = horaLimpia(x?.end);

    if (!a || !b) return fila(d, false);
    alguno = true;
    const bs = horaLimpia(x?.breakStart);
    const bm = Number(x?.breakMinutes);

    return bs && bm > 0
      ? { ...fila(d, true, a, b), almuerzo: true, breakStart: bs, breakMinutes: bm }
      : fila(d, true, a, b);
  });

  return alguno ? j : null;
}
