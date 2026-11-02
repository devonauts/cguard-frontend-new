/**
 * What a recurring post order (consigna) is missing to ever be due, as an
 * i18n key + Spanish default, or null when it is complete.
 *
 * «Días específicos de la semana» with no day ticked was saved (and pushed to
 * nobody, ever): the server's `isDueOn` only matches the listed days. Same for
 * a monthly order without its day and a one-off without its date.
 */
export function consignaIncompleta(o: {
  recurrence?: string;
  days?: unknown;
  dayOfMonth?: unknown;
  date?: unknown;
}): { key: string; texto: string } | null {
  if (o.recurrence === "weekly" && !(Array.isArray(o.days) && o.days.length))
    return {
      key: "station.orders.needDays",
      texto: "Elige al menos un día de la semana",
    };
  if (o.recurrence === "monthly") {
    const d = Number(o.dayOfMonth);
    if (!Number.isInteger(d) || d < 1 || d > 31)
      return {
        key: "station.orders.needDayOfMonth",
        texto: "Indica el día del mes (1 a 31)",
      };
  }
  if (o.recurrence === "once" && !String(o.date || "").trim())
    return { key: "station.orders.needDate", texto: "Indica la fecha" };
  return null;
}
