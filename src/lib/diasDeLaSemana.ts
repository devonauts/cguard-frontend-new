/**
 * WEEKDAYS IN ONE SHORT TEXT — «lun–vie», «lun, mié, vie» (or «Mon–Fri»),
 * from the post\'s day codes (`lun`…`dom`, accents tolerated). Every day or
 * none → null: nothing to say.
 */
const ORDEN = ["lun", "mar", "mie", "jue", "vie", "sab", "dom"] as const;
const LUNES = Date.UTC(2024, 0, 1, 12); // 2024-01-01 was a Monday

export const codigoDeDia = (d: unknown): string =>
  String(d ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .slice(0, 3);

/** Short weekday name in the viewer\'s language («lun», «Mon»). */
export function nombreCortoDeDia(codigo: string, locale: string): string {
  const i = ORDEN.indexOf(codigoDeDia(codigo) as any);

  if (i < 0) return codigo;
  try {
    return new Intl.DateTimeFormat(locale || "es", { weekday: "short", timeZone: "UTC" })
      .format(new Date(LUNES + i * 86400000))
      .replace(/\.$/, "");
  } catch {
    return codigo;
  }
}

export function diasCompactos(dias: unknown, locale: string): string | null {
  const set = new Set(
    (Array.isArray(dias) ? dias : []).map(codigoDeDia).filter((d) => (ORDEN as readonly string[]).includes(d)),
  );

  if (set.size === 0 || set.size === 7) return null;
  const idx = ORDEN.map((d, i) => (set.has(d) ? i : -1)).filter((i) => i >= 0);
  const seguidos = idx.every((v, k) => k === 0 || v === idx[k - 1] + 1);

  if (seguidos && idx.length >= 3)
    return `${nombreCortoDeDia(ORDEN[idx[0]], locale)}–${nombreCortoDeDia(ORDEN[idx[idx.length - 1]], locale)}`;

  return idx.map((i) => nombreCortoDeDia(ORDEN[i], locale)).join(", ");
}

/** The days a set of posts open: the union, or [] when any of them opens every day. */
export function diasDeLasPlazas(plazas: Array<{ type?: string; days?: unknown }>): string[] {
  const fijas = plazas.filter((p) => p.type !== "sacafranco");

  if (!fijas.length || fijas.some((p) => !Array.isArray(p.days) || (p.days as unknown[]).length === 0)) return [];

  return [...new Set(fijas.flatMap((p) => (p.days as unknown[]).map(codigoDeDia)))];
}
