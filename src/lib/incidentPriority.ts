import i18n from "@/i18n";

/**
 * Incident priority is free text in the database: the guard app writes
 * `high`/`medium`/`critical`, older screens wrote `alta`/`baja`. Shown raw,
 * one report mixed «high» with «alta», and the «Incidentes por prioridad»
 * chart counted the same priority in two bars.
 */
export type IncidentPriority = "critical" | "high" | "medium" | "low";

const ALIASES: Record<string, IncidentPriority> = {
  critical: "critical",
  critica: "critical",
  urgent: "critical",
  urgente: "critical",
  high: "high",
  alta: "high",
  medium: "medium",
  media: "medium",
  normal: "medium",
  low: "low",
  baja: "low",
};

const LABELS: Record<IncidentPriority, [key: string, es: string]> = {
  critical: ["ui.incidentPriority.critical", "Crítica"],
  high: ["ui.incidentPriority.high", "Alta"],
  medium: ["ui.incidentPriority.medium", "Media"],
  low: ["ui.incidentPriority.low", "Baja"],
};

export function incidentPriorityKey(raw: unknown): IncidentPriority | null {
  const k = String(raw ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

  return ALIASES[k] ?? null;
}

/** The priority in the reader's language; an unknown value as it is. */
export function incidentPriorityLabel(raw: unknown): string {
  const k = incidentPriorityKey(raw);

  if (k) return i18n.t(LABELS[k][0], LABELS[k][1]);
  const s = String(raw ?? "").trim();

  if (!s || s === "sin prioridad")
    return i18n.t("ui.incidentPriority.none", "Sin prioridad");

  return s;
}

/** Merges `{ label, count }` rows whose labels are the same priority. */
export function mergeByIncidentPriority(
  rows: Array<{ label: string; count: number }>,
): Array<{ label: string; count: number }> {
  const out = new Map<string, number>();

  for (const r of rows || []) {
    const label = incidentPriorityLabel(r.label);

    out.set(label, (out.get(label) || 0) + (Number(r.count) || 0));
  }

  return Array.from(out, ([label, count]) => ({ label, count })).sort(
    (a, b) => b.count - a.count,
  );
}
