import type { TimeOffRecord } from "@/lib/api/timeOffRequestService";

/** One row of the month calendar: a person or a post, and its leaves by day. */
export interface FilaDeCalendario {
  key: string;
  label: string;
  byDay: Map<string, TimeOffRecord[]>;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** YYYY-MM-DD of every day of a month (YYYY-MM). Pure calendar math, no zone. */
export function diasDelMes(month: string): string[] {
  const [y, m] = month.split("-").map(Number);
  if (!y || !m) return [];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();

  return Array.from({ length: last }, (_, i) => `${y}-${pad(m)}-${pad(i + 1)}`);
}

/** The month before/after (delta = ±1). */
export function mesSiguiente(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));

  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

/** First and last day of a month, for the server's date filter. */
export function rangoDelMes(month: string): { from: string; to: string } {
  const days = diasDelMes(month);

  return { from: days[0], to: days[days.length - 1] };
}

/** Days of a leave (inclusive), as the server counts them. */
export function diasDePermiso(r: Pick<TimeOffRecord, "startDate" | "endDate">): string[] {
  const a = String(r.startDate || "").slice(0, 10);
  const b = String(r.endDate || r.startDate || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a) || !/^\d{4}-\d{2}-\d{2}$/.test(b) || b < a) return [];
  const out: string[] = [];
  for (let t = Date.parse(`${a}T00:00:00Z`); t <= Date.parse(`${b}T00:00:00Z`) && out.length < 366; t += 86400000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }

  return out;
}

/** Rejected and cancelled leaves are history, not days off: the calendar skips them. */
const cuenta = (r: TimeOffRecord) => r.status === "approved" || r.status === "pending";

function poner(fila: FilaDeCalendario, d: string, r: TimeOffRecord) {
  const list = fila.byDay.get(d) || [];

  // Approved first: a pending request on a day already approved is secondary.
  list.push(r);
  list.sort((x, y) => (x.status === "approved" ? 0 : 1) - (y.status === "approved" ? 0 : 1));
  fila.byDay.set(d, list);
}

export function filasPorPersona(records: TimeOffRecord[], month: string): FilaDeCalendario[] {
  const inMonth = new Set(diasDelMes(month));
  const filas = new Map<string, FilaDeCalendario>();

  for (const r of records) {
    if (!cuenta(r)) continue;
    const key = r.guardId || r.guard?.id || r.id;
    const label = r.guard?.fullName ?? r.guardName ?? "—";

    for (const d of diasDePermiso(r)) {
      if (!inMonth.has(d)) continue;
      const fila = filas.get(key) || { key, label, byDay: new Map() };

      poner(fila, d, r);
      filas.set(key, fila);
    }
  }

  return [...filas.values()].sort((a, b) => a.label.localeCompare(b.label));
}

export function filasPorPuesto(
  records: (TimeOffRecord & { stations?: Array<{ id: string; name: string | null }> })[],
  month: string,
): FilaDeCalendario[] {
  const inMonth = new Set(diasDelMes(month));
  const filas = new Map<string, FilaDeCalendario>();

  for (const r of records) {
    if (!cuenta(r)) continue;
    const posts = r.stations && r.stations.length ? r.stations : [{ id: "", name: null }];

    for (const p of posts) {
      const key = p.id || "—";
      const label = p.name || (p.id ? p.id.slice(0, 8) : "—");

      for (const d of diasDePermiso(r)) {
        if (!inMonth.has(d)) continue;
        const fila = filas.get(key) || { key, label, byDay: new Map() };
        const list = fila.byDay.get(d) || [];

        // One count per person and day, even with two leaves.
        if (!list.some((x: TimeOffRecord) => (x.guardId || x.id) === (r.guardId || r.id))) poner(fila, d, r);
        filas.set(key, fila);
      }
    }
  }

  return [...filas.values()].sort((a, b) => (a.key === "—" ? 1 : b.key === "—" ? -1 : a.label.localeCompare(b.label)));
}
