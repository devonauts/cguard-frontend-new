/**
 * THE STATION REQUIREMENT, AS PEOPLE SAY IT: «07:00–19:00, two at once,
 * Monday to Friday». It is stored as plazas (one row per seat and per person
 * who takes turns on it); these helpers go back and forth, and say before
 * saving who keeps their plaza, who moves to other hours and who leaves.
 *
 * The server is the one that writes (`auto-positions` with `franjas`); this
 * mirrors its rules so the preview matches what will happen.
 */
import { emparejarPlazas, type PlazaVieja } from "@/lib/emparejarPlazas";

export const DIAS_REQ = [
  "lun",
  "mar",
  "mie",
  "jue",
  "vie",
  "sab",
  "dom",
] as const;

export interface FranjaReq {
  id: string;
  start: string;
  end: string;
  /** People at once. */
  guards: number;
  /** Days the post operates in this window; empty = every day. */
  days: string[];
}

export interface PlazaReq {
  id: string;
  type?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  days?: string[] | null;
  sortOrder?: number | null;
  rotationStyleId?: string | null;
}

const hhmm = (s: unknown) => String(s || "").slice(0, 5);
const minutos = (s: string) => {
  const [h, m] = s.split(":").map((x) => parseInt(x, 10) || 0);

  return h * 60 + m;
};
const diasNormales = (d: unknown): string[] => {
  const l = Array.isArray(d) ? d.map(String) : [];
  const set = new Set(l);

  return set.size === 0 || set.size === 7
    ? []
    : DIAS_REQ.filter((x) => set.has(x));
};
let n = 0;
const nuevoId = () => `f${Date.now().toString(36)}${(n++).toString(36)}`;

/**
 * Plazas → windows. `personasPorAsiento(p)` = how many plazas one seat takes
 * with that plaza's cycle (a 1-1 is two people taking turns on one seat).
 */
export function franjasDesdePlazas(
  plazas: PlazaReq[],
  personasPorAsiento: (p: PlazaReq) => number = () => 1,
): FranjaReq[] {
  const porClave = new Map<
    string,
    { f: FranjaReq; peso: number; orden: number }
  >();

  for (const p of plazas) {
    if ((p.type || "fijo") === "sacafranco") continue;
    const start = hhmm(p.startTime);
    const end = hhmm(p.endTime);

    if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) continue;
    const days = diasNormales(p.days);
    const clave = `${start}|${end}|${days.join(",")}`;
    const k = Math.max(1, personasPorAsiento(p) || 1);
    const ya = porClave.get(clave);

    if (ya) ya.peso += 1 / k;
    else
      porClave.set(clave, {
        f: { id: nuevoId(), start, end, guards: 0, days },
        peso: 1 / k,
        orden: Number(p.sortOrder) || 0,
      });
  }

  return [...porClave.values()]
    .sort((a, b) => a.orden - b.orden)
    .map((x) => ({ ...x.f, guards: Math.max(1, Math.round(x.peso)) }));
}

/** The order the server lays the windows in (clock order, unless they chain). */
export function ordenDelServidor(franjas: FranjaReq[]): FranjaReq[] {
  const encadenadas =
    franjas.length > 1 &&
    franjas.every((f, i) => i === 0 || franjas[i - 1].end === f.start);

  return encadenadas
    ? franjas
    : [...franjas].sort((a, b) => minutos(a.start) - minutos(b.start));
}

/** Windows → the plazas the server will write (seat × people who take turns). */
export function plazasDeFranjas(
  franjas: FranjaReq[],
  personasPorAsiento: number,
) {
  const k = Math.max(1, personasPorAsiento || 1);

  return ordenDelServidor(franjas).flatMap((f) =>
    Array.from({ length: Math.max(1, f.guards) * k }, () => ({
      startTime: f.start,
      endTime: f.end,
    })),
  );
}

export interface Ocupante {
  positionId: string;
  guardName: string;
}

export interface Consecuencias {
  /** People whose plaza disappears: they leave the station. */
  salen: Array<{ nombre: string; ventana: string }>;
  /** People who keep their plaza with other hours. */
  cambian: Array<{ nombre: string; de: string; a: string }>;
  /** New empty plazas. */
  nuevas: number;
}

export function consecuencias(
  plazas: PlazaReq[],
  franjas: FranjaReq[],
  personasPorAsiento: number,
  ocupantes: Ocupante[],
): Consecuencias {
  const fijas = plazas.filter((p) => (p.type || "fijo") !== "sacafranco");
  const viejas: PlazaVieja[] = fijas.map((p) => ({
    id: String(p.id),
    startTime: hhmm(p.startTime),
    endTime: hhmm(p.endTime),
    sortOrder: p.sortOrder,
  }));
  const nuevas = plazasDeFranjas(franjas, personasPorAsiento);
  const quien = new Map<string, string>();

  for (const o of ocupantes) quien.set(String(o.positionId), o.guardName);
  const plan = emparejarPlazas(viejas, nuevas, new Set(quien.keys()));
  const porId = new Map(viejas.map((v) => [v.id, v]));
  const out: Consecuencias = { salen: [], cambian: [], nuevas: 0 };

  plan.nuevas.forEach((id, i) => {
    if (!id) {
      out.nuevas++;

      return;
    }
    const v = porId.get(id)!;
    const nombre = quien.get(id);
    const de = `${v.startTime}–${v.endTime}`;
    const a = `${nuevas[i].startTime}–${nuevas[i].endTime}`;

    if (nombre && de !== a) out.cambian.push({ nombre, de, a });
  });
  for (const id of plan.sobrantes) {
    const nombre = quien.get(id);
    const v = porId.get(id)!;

    if (nombre)
      out.salen.push({ nombre, ventana: `${v.startTime}–${v.endTime}` });
  }

  return out;
}

/** What `auto-positions` receives. */
export function cuerpoDelRequisito(
  franjas: FranjaReq[],
  rotationStyleId?: string | null,
) {
  return {
    franjas: franjas.map((f) => ({
      start: f.start,
      end: f.end,
      guards: f.guards,
      days: f.days,
    })),
    ...(rotationStyleId ? { rotationStyleId } : {}),
  };
}

export function mismoRequisito(a: FranjaReq[], b: FranjaReq[]): boolean {
  const firma = (l: FranjaReq[]) =>
    ordenDelServidor(l)
      .map(
        (f) =>
          `${f.start}|${f.end}|${f.guards}|${diasNormales(f.days).join(",")}`,
      )
      .join(";");

  return firma(a) === firma(b);
}

export function validarFranjas(franjas: FranjaReq[]): string | null {
  if (!franjas.length) return "vacio";
  for (const f of franjas) {
    if (!/^\d{2}:\d{2}$/.test(f.start) || !/^\d{2}:\d{2}$/.test(f.end))
      return "hora";
    if (!Number.isInteger(f.guards) || f.guards < 1 || f.guards > 20)
      return "personas";
  }

  return null;
}
