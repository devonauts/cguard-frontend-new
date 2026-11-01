/**
 * Pure helpers of the Asistencia pages (Resumen de hoy, Atrasos), apart from
 * the pages so they are tested without a browser.
 */

export interface ResumenDelDia {
  day: string;
  scheduledToday: number;
  presentToday: number;
  lateToday: number;
  noShowsToday: number;
  onLeaveToday: number;
  notYetDue: number;
  clockedInNow: number;
  missedClockouts: number;
  overtimeToday: number;
  pendingApprovals: number;
  attendancePct: number | null;
}

const delDia = (day: string, extra: Record<string, string> = {}) =>
  new URLSearchParams({ from: day, to: day, ...extra }).toString();

/** Where each number of Resumen de hoy comes from, filtered to the day. */
export function enlaceDeTarjeta(key: keyof ResumenDelDia, day: string): string {
  switch (key) {
    case "lateToday":
      return `/nomina/records?${delDia(day, { status: "late" })}`;
    case "overtimeToday":
      return `/nomina/records?${delDia(day, { status: "overtime" })}`;
    case "noShowsToday":
      return "/open-shifts";
    case "onLeaveToday":
      return "/time-off";
    case "clockedInNow":
      return "/coverage";
    case "missedClockouts":
      return "/nomina/exceptions?type=missed_clockout";
    case "pendingApprovals":
      return "/nomina/approvals";
    default:
      return `/nomina/records?${delDia(day)}`;
  }
}

/** What a card shows: «—» when there is no answer, never a made-up zero. */
export function valorDe(data: ResumenDelDia | null, key: keyof ResumenDelDia): string | number {
  if (!data) return "—";
  const v = data[key] as number | null | undefined;
  if (v == null) return "—";

  return key === "attendancePct" ? `${v}%` : v;
}

/** «1 h 25 min» */
export function minutos(n: number): string {
  if (n < 60) return `${n} min`;
  const h = Math.floor(n / 60);
  const m = n % 60;

  return m ? `${h} h ${m} min` : `${h} h`;
}

/** Marcaciones filtered to this person's late marks of the range. */
export function enlaceAMarcaciones(
  p: { personId: string; role: "guard" | "supervisor" | "staff" },
  from: string,
  to: string,
): string {
  const sp = new URLSearchParams({ from, to, status: "late" });
  // One person filter for the three kinds: a guard's id is its guard profile,
  // a supervisor's or office person's is their user id — the server matches
  // each leg by its own key, so the link always carries the person.
  sp.set("guard", p.personId);

  return `/nomina/records?${sp.toString()}`;
}
