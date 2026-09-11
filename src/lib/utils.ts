import { localeActual } from "@/lib/localeActual";
export function getServerErrorMessage(
  error: any,
  fallback = "Error desconocido",
) {
  try {
    if (!error) return fallback;
    // Prefer explicit server message
    const serverMessage =
      error?.response?.data?.message ||
      error?.data?.message ||
      error?.data ||
      null;

    if (serverMessage)
      return typeof serverMessage === "string"
        ? serverMessage
        : serverMessage.message || JSON.stringify(serverMessage);
    // Generic message
    if (error?.message) return error.message;

    return fallback;
  } catch (e) {
    return fallback;
  }
}

export default getServerErrorMessage;
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Today's date as YYYY-MM-DD in the operator's LOCAL wall-clock (NOT UTC).
 * `new Date().toISOString()` is UTC, which rolls to the next day in negative-UTC
 * zones (Ecuador UTC-5 after 19:00) — that pushed a guard assigned "today" onto
 * tomorrow's shift. Use this for any startDate/"today" the user picks.
 */
export function localToday(): string {
  const d = new Date();

  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ── Rotation math (mirrors backend shiftGenerationService getRotationStatus) ──
// Kept here so the assign modal + roster can PREVIEW a guard's rest day BEFORE
// shifts are generated — the invisible-rest-day bug is what put a guard's libre
// on the wrong weekday. Epoch = 2024-01-01, UTC-safe (same as backend/Schedule).

export interface RotationCycle {
  dayShifts: number;
  nightShifts: number;
  restDays: number;
}

/** Days since the 2024-01-01 rotation epoch (UTC-safe, matches getGlobalEpoch). */
export function rotationDseOf(d: Date): number {
  return Math.round(
    (Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) -
      Date.UTC(2024, 0, 1)) /
      86400000,
  );
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * LAS DOS REGLAS QUE NO CABEN EN TRES NÚMEROS — ESPEJO DEL SERVIDOR
 *
 * Copia fiel de `estadoDeRotacion` (backend `shiftGenerationService`). Existe
 * porque la rejilla del Programador pinta el mes ANTES de tener los turnos
 * delante, y si aquí se calculara con la aritmética desnuda el cuadro dibujado
 * no sería el que el motor genera: un 7-1 que alterna día y noche saldría como
 * siete «D» seguidas, con la noche del puesto vacía en pantalla y cubierta en
 * la realidad.
 *
 * Si se toca el servidor, se toca ESTO. Las dos reglas:
 *   · `alternatesDayNight` — el fijo cambia de mitad en cada franco.
 *   · `sundayDoubleRest`   — franco en domingo = domingo Y lunes, y el ciclo
 *     se CORRE un día (no es un día suelto), así que hay que caminar desde un
 *     ancla en vez de resolver `dse % ciclo` de un salto.
 * ════════════════════════════════════════════════════════════════════════════
 */
export interface ReglasDeRotacion {
  alternatesDayNight?: boolean | null;
  sundayDoubleRest?: boolean | null;
}

/** ¿Ese día es domingo? `dse` cuenta desde la época 2024-01-01, que fue lunes. */
export function esDomingoDse(dse: number): boolean {
  // 2024-01-01 fue LUNES; el domingo es el 6.º día de esa semana.
  return (((dse % 7) + 7) % 7) === 6;
}

/**
 * El estado de un día aplicando las reglas. `anclaDse` es el día 0 del ciclo
 * (la fecha de inicio de la asignación). Sin reglas activas devuelve
 * exactamente lo mismo que la aritmética de siempre.
 */
export function estadoDeRotacionCliente(
  dse: number,
  anclaDse: number,
  platoonOffset: number,
  dayShifts: number,
  nightShifts: number,
  restDays: number,
  reglas?: ReglasDeRotacion | null,
): "day" | "night" | "rest" {
  const ciclo = dayShifts + nightShifts + restDays;
  if (ciclo <= 0) return "rest";

  const crudo = (d: number): "day" | "night" | "rest" => {
    const a = (((d - platoonOffset) % ciclo) + ciclo) % ciclo;
    if (a < dayShifts) return "day";
    if (a < dayShifts + nightShifts) return "night";

    return "rest";
  };

  const alterna = !!reglas?.alternatesDayNight;
  const dominical = !!reglas?.sundayDoubleRest;
  if (!alterna && !dominical) return crudo(dse);
  if (!Number.isFinite(anclaDse) || dse < anclaDse) return crudo(dse);

  let corrimiento = 0;
  let vueltas = 0;
  let previo: "day" | "night" | "rest" | null = null;
  let estado: "day" | "night" | "rest" = "rest";

  for (let d = anclaDse; d <= dse; d++) {
    const st = crudo(d - corrimiento);
    // La vuelta se cierra al pisar el primer día de trabajo tras el franco.
    if (previo === "rest" && st !== "rest") vueltas += 1;
    if (dominical && st === "rest" && esDomingoDse(d)) corrimiento += 1;
    previo = st;
    estado = st;
  }

  if (estado === "rest" || !alterna) return estado;

  return vueltas % 2 === 1 ? (estado === "day" ? "night" : "day") : estado;
}

/** Rotation status for a calendar date under a cycle + platoonOffset. */
export function rotationStatusOn(
  style: RotationCycle,
  platoonOffset: number,
  date: Date,
): "day" | "night" | "rest" {
  const cycle = style.dayShifts + style.nightShifts + style.restDays;

  if (cycle <= 0) return "rest";
  const adj = (((rotationDseOf(date) - platoonOffset) % cycle) + cycle) % cycle;

  if (adj < style.dayShifts) return "day";
  if (adj < style.dayShifts + style.nightShifts) return "night";

  return "rest";
}

/** The next `count` rest (libre) dates from `from` (inclusive) for a cycle+offset. */
export function nextRestDates(
  style: RotationCycle,
  platoonOffset: number,
  from: Date,
  count = 3,
  horizon = 45,
): Date[] {
  const out: Date[] = [];
  const cycle = style.dayShifts + style.nightShifts + style.restDays;

  if (cycle <= 0) return out;
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());

  for (let i = 0; i < horizon && out.length < count; i++) {
    if (rotationStatusOn(style, platoonOffset, d) === "rest")
      out.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }

  return out;
}

/** platoonOffset that makes `restStartDate` the FIRST day of the rest block
 *  (mirrors the backend rephase: offset ≡ dse(restStart) − (dayShifts+nightShifts)). */
export function offsetForRestStart(
  style: RotationCycle,
  restStartDate: Date,
): number {
  const cycle = style.dayShifts + style.nightShifts + style.restDays;

  if (cycle <= 0) return 0;
  const restStartIdx = style.dayShifts + style.nightShifts;

  return (
    (((rotationDseOf(restStartDate) - restStartIdx) % cycle) + cycle) % cycle
  );
}

/** When the cycle is a whole number of weeks the rest lands on a FIXED weekday —
 *  return its Spanish name (e.g. "lunes"); otherwise null (rest drifts). */
export function weeklyRestWeekday(
  style: RotationCycle,
  platoonOffset: number,
): string | null {
  const cycle = style.dayShifts + style.nightShifts + style.restDays;

  if (cycle <= 0 || cycle % 7 !== 0) return null;
  const d = nextRestDates(style, platoonOffset, new Date(), 1, cycle + 7)[0];

  return d ? d.toLocaleDateString(localeActual(), { weekday: "long" }) : null;
}

/** Short human date, e.g. "lun 27 jul". */
export function shortRestLabel(d: Date): string {
  return d.toLocaleDateString(localeActual(), {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}
