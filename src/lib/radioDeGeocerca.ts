/**
 * Clock-in geofence radius limits, in meters. The station form always showed
 * min 10 / max 5000, but nothing enforced it: 100 150 m was saved (any phone
 * in the city could clock in) and checkpoints copied it.
 */
export const RADIO_MIN_M = 10;
export const RADIO_MAX_M = 5000;
const METROS_POR_PIE = 0.3048;

/** The typed radius (meters, or feet for US companies) in whole meters; null if not a number. */
export function radioEnMetros(texto: string, usaPies: boolean): number | null {
  const s = String(texto ?? "").trim().replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return Math.round(usaPies ? n * METROS_POR_PIE : n);
}

/** Meters → the unit the company types in (feet for US), rounded. */
export function radioParaMostrar(metros: number, usaPies: boolean): number {
  return Math.round(usaPies ? metros / METROS_POR_PIE : metros);
}

export function radioValido(metros: number | null): metros is number {
  return metros !== null && metros >= RADIO_MIN_M && metros <= RADIO_MAX_M;
}
