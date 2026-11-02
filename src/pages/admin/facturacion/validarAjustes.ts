/**
 * BILLING SETTINGS THAT THE SERVER WOULD CHANGE IN SILENCE.
 *
 * The server clamps what is out of range (0 digits → 3) and drops a reminder
 * that is not a number, and the screen said «Ajustes guardados» (QA
 * 2026-11-01). The same ranges are checked here first, so the person reads
 * which field and why, on its tab. Pure, so it is tested on its own.
 */
export type CampoDeAjustes =
  | "invoicePadding"
  | "defaultTermsDays"
  | "roundingMinutes"
  | "lateFeeBps"
  | "lateFeeGraceDays";

export type ProblemaDeAjustes =
  | { tipo: "rango"; tab: "numeracion" | "reglas"; campo: CampoDeAjustes; min: number; max: number }
  | { tipo: "recordatorio"; tab: "reglas"; valor: string }
  | { tipo: "demasiadosRecordatorios"; tab: "reglas"; max: number };

/** [field, tab, min, max] — the server's ranges (backend clientBilling/settingsService). */
const RANGOS: Array<[CampoDeAjustes, "numeracion" | "reglas", number, number]> = [
  ["invoicePadding", "numeracion", 3, 8],
  ["defaultTermsDays", "numeracion", 0, 180],
  ["roundingMinutes", "numeracion", 0, 60],
  ["lateFeeBps", "reglas", 0, 5000],
  ["lateFeeGraceDays", "reglas", 0, 90],
];

export const MAX_RECORDATORIOS = 8;

/** The reminder days typed as text («-3, 7»): null for a token that is not a whole number of days in range. */
export function diasDeRecordatorio(texto: string): { dias: number[]; malo: string | null } {
  const partes = texto.split(",").map((x) => x.trim()).filter(Boolean);
  const dias: number[] = [];

  for (const p of partes) {
    const n = Number(p);

    if (!/^-?\d+$/.test(p) || n < -30 || n > 180) return { dias, malo: p };
    dias.push(n);
  }

  return { dias, malo: null };
}

export function validarAjustes(
  form: Partial<Record<CampoDeAjustes, number | null | undefined>>,
  textoDeRecordatorios: string,
): ProblemaDeAjustes | null {
  for (const [campo, tab, min, max] of RANGOS) {
    const v = form[campo];

    if (v == null) continue;
    if (!Number.isFinite(v) || v < min || v > max || (campo !== "lateFeeBps" && !Number.isInteger(v))) {
      return { tipo: "rango", tab, campo, min, max };
    }
  }
  const { dias, malo } = diasDeRecordatorio(textoDeRecordatorios);

  if (malo !== null) return { tipo: "recordatorio", tab: "reglas", valor: malo };
  if (new Set(dias).size > MAX_RECORDATORIOS) return { tipo: "demasiadosRecordatorios", tab: "reglas", max: MAX_RECORDATORIOS };

  return null;
}
