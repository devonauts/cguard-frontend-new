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
