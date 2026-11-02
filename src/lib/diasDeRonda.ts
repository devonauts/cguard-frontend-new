/**
 * Days of a round (`scheduledDays`) as numbers 0-6, Sunday = 0.
 *
 * Production stores three shapes, and the server (rondaScheduleService)
 * accepts all of them: numbers (station wizard), English names (post-site
 * «Rondas» form: "monday") and Spanish names. Reading only numbers made a
 * round saved from the post site look like «every day» on the station tab,
 * and saving it there would have turned it into every day for real.
 */
const DAY_BY_NAME: Record<string, number> = {
  sunday: 0, sun: 0, domingo: 0, dom: 0,
  monday: 1, mon: 1, lunes: 1, lun: 1,
  tuesday: 2, tue: 2, martes: 2, mar: 2,
  wednesday: 3, wed: 3, miercoles: 3, "miércoles": 3, mie: 3, "mié": 3,
  thursday: 4, thu: 4, jueves: 4, jue: 4,
  friday: 5, fri: 5, viernes: 5, vie: 5,
  saturday: 6, sat: 6, sabado: 6, "sábado": 6, sab: 6, "sáb": 6,
};

function toDay(d: unknown): number | null {
  if (d === null || d === undefined) return null;
  const key = String(d).trim().toLowerCase();
  if (!key) return null;
  const n = Number(key);
  if (Number.isInteger(n)) return n >= 0 && n <= 6 ? n : null;
  return key in DAY_BY_NAME ? DAY_BY_NAME[key] : null;
}

export function leerDias(raw: unknown): number[] {
  let bruto: any = raw;

  if (typeof bruto === "string") {
    const s = bruto.trim();

    if (!s) return [];
    try {
      bruto = JSON.parse(s);
    } catch {
      bruto = s.split(/[,;|]/);
    }
  }
  if (!Array.isArray(bruto)) return [];

  const out: number[] = [];
  for (const d of bruto) {
    const n = toDay(d);
    if (n !== null && !out.includes(n)) out.push(n);
  }
  return out;
}

/** English day codes by number (Sunday = 0), as used by the day pickers. */
export const DAY_CODES = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;
