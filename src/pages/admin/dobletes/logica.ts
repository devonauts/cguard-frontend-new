/**
 * DOBLETES — the small pure rules the screens share (tested in
 * `logica.test.ts`): campaign status, placeholder filling, countdowns.
 */
import type { Campaign } from "@/lib/api/dobletesService";

export type EstadoDeCampana =
  "borrador" | "programada" | "activa" | "terminada";

/** Draft until published; then scheduled / live / finished by its dates. */
export function estadoDeCampana(
  c: Pick<Campaign, "active" | "startsAt" | "endsAt">,
  ahora = Date.now(),
): EstadoDeCampana {
  if (!c.active) return "borrador";
  if (c.endsAt && new Date(c.endsAt).getTime() < ahora) return "terminada";
  if (c.startsAt && new Date(c.startsAt).getTime() > ahora) return "programada";

  return "activa";
}

/** Fills the two placeholders a campaign may use. */
export function rellenar(texto: string, empresa: string, bono: string): string {
  return String(texto || "")
    .replace(/\{\{\s*empresa\s*\}\}/g, empresa)
    .replace(/\{\{\s*bono\s*\}\}/g, bono);
}

/** Minutes until an instant (never negative); null without a date. */
export function minutosHasta(
  iso: string | null | undefined,
  ahora = Date.now(),
): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - ahora;

  return Number.isFinite(ms) ? Math.max(0, Math.ceil(ms / 60000)) : null;
}

/** «YYYY-MM» of a «YYYY-MM-DD» day. */
export function mesActual(hoy: string): string {
  return hoy.slice(0, 7);
}

/** A route a campaign button may open: only the guard app's own screens. */
export function rutaDeLaAppValida(ruta: string | null | undefined): boolean {
  return /^\/guard\/[\w\-/]*$/.test(ruta || "");
}
