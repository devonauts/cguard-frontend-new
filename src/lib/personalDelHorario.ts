/**
 * ════════════════════════════════════════════════════════════════════════════
 * «TODO EL PERSONAL» — THE ATTENDANCE SHEET OF EVERYONE.
 *
 * Mike: «debe salir la lista de todos los trabajadores, y dónde están con su
 * horario». The Schedule listed POSTS (one row per seat), so a guard with no
 * assignment, an office person with no hours or a supervisor without a
 * supervision post simply did not exist on that screen.
 *
 * `GET /tenant/:t/scheduler/people?startDate&endDate` returns every active
 * person (customers aside) once, with one cell per day. These helpers turn that
 * answer into rows — defensively: the list must never show someone twice, and
 * nobody may vanish because a field came back odd.
 * ════════════════════════════════════════════════════════════════════════════
 */

export type TipoDePersona = "guard" | "supervisor" | "office";
export type EstadoDelDia = "work" | "off" | "absence" | "none";
export type CodigoDeAusencia = "V" | "PM" | "F";

export interface DondeEsta {
  stationId: string | null;
  stationName: string | null;
  postSiteId: string | null;
  postSiteName: string | null;
  /** Supervisors: their supervision position. */
  positionId?: string | null;
  positionName?: string | null;
}

export interface DiaDePersona {
  date: string;
  status: EstadoDelDia;
  start: string | null;
  end: string | null;
  where: DondeEsta | null;
  absence: CodigoDeAusencia | null;
}

export interface PersonaDelHorario {
  userId: string;
  name: string;
  roles: string[];
  kind: TipoDePersona;
  hasSchedule: boolean;
  assigned: boolean;
  days: DiaDePersona[];
}

export interface Cuentas {
  total: number;
  guard: number;
  supervisor: number;
  office: number;
  sinHorario: number;
}

export type FiltroDeTipo = "all" | TipoDePersona | "sinHorario";

/** The endpoint accepts at most this many days per request. */
export const MAX_DIAS_PERSONAL = 62;

const TIPOS: TipoDePersona[] = ["guard", "supervisor", "office"];
const ESTADOS: EstadoDelDia[] = ["work", "off", "absence", "none"];
const AUSENCIAS: CodigoDeAusencia[] = ["V", "PM", "F"];
/** Reading order of the sheet: who supervises, who runs the office, who is on post. */
const ORDEN_TIPO: Record<TipoDePersona, number> = {
  supervisor: 0,
  office: 1,
  guard: 2,
};

const texto = (v: unknown): string | null => {
  const s = v == null ? "" : String(v).trim();

  return s ? s : null;
};
const hora = (v: unknown): string | null => {
  const m = String(v ?? "").match(/^(\d{1,2}):(\d{2})/);

  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : null;
};

function diaLimpio(d: any): DiaDePersona | null {
  const date = String(d?.date ?? "").slice(0, 10);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const status: EstadoDelDia = ESTADOS.includes(d?.status) ? d.status : "none";
  const w = d?.where;
  const where: DondeEsta | null =
    w &&
    typeof w === "object" &&
    (texto(w.stationId) || texto(w.postSiteId) || texto(w.positionId))
      ? {
          stationId: texto(w.stationId),
          stationName: texto(w.stationName),
          postSiteId: texto(w.postSiteId),
          postSiteName: texto(w.postSiteName),
          positionId: texto(w.positionId),
          positionName: texto(w.positionName),
        }
      : null;

  return {
    date,
    status,
    start: hora(d?.start),
    end: hora(d?.end),
    where,
    absence: AUSENCIAS.includes(d?.absence) ? d.absence : null,
  };
}

/**
 * The server answer → rows: unwrapped (`{data}` or bare), ONE row per userId
 * (a duplicate merges its days into the first), sorted supervisor → office →
 * guard, then by name.
 */
export function normalizarPersonas(res: unknown): PersonaDelHorario[] {
  const r: any = res && typeof res === "object" ? res : {};
  const lista: any[] = Array.isArray(r.people)
    ? r.people
    : Array.isArray(r.data?.people)
      ? r.data.people
      : Array.isArray(r)
        ? r
        : [];
  const porId = new Map<string, PersonaDelHorario>();

  for (const p of lista) {
    const userId = texto(p?.userId);

    if (!userId) continue;
    const dias = (Array.isArray(p?.days) ? p.days : [])
      .map(diaLimpio)
      .filter(Boolean) as DiaDePersona[];
    const ya = porId.get(userId);

    if (ya) {
      const fechas = new Set(ya.days.map((d) => d.date));

      for (const d of dias) if (!fechas.has(d.date)) ya.days.push(d);
      ya.hasSchedule = ya.hasSchedule || !!p?.hasSchedule;
      ya.assigned = ya.assigned || !!p?.assigned;
      continue;
    }
    porId.set(userId, {
      userId,
      name: texto(p?.name) || "—",
      roles: Array.isArray(p?.roles) ? p.roles.map(String) : [],
      kind: TIPOS.includes(p?.kind) ? p.kind : "office",
      hasSchedule: !!p?.hasSchedule,
      assigned: !!p?.assigned,
      days: dias,
    });
  }
  const out = [...porId.values()];

  for (const p of out) p.days.sort((a, b) => a.date.localeCompare(b.date));

  return out.sort(
    (a, b) =>
      ORDEN_TIPO[a.kind] - ORDEN_TIPO[b.kind] ||
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
}

export function contarPersonas(ps: PersonaDelHorario[]): Cuentas {
  const c: Cuentas = { total: 0, guard: 0, supervisor: 0, office: 0, sinHorario: 0 };

  for (const p of ps) {
    c.total += 1;
    c[p.kind] += 1;
    if (!p.hasSchedule) c.sinHorario += 1;
  }

  return c;
}

/** Accent- and case-insensitive. */
const plano = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

export function filtrarPersonas(
  ps: PersonaDelHorario[],
  tipo: FiltroDeTipo,
  q: string,
): PersonaDelHorario[] {
  const buscado = plano(q.trim());

  return ps.filter((p) => {
    if (tipo === "sinHorario" ? p.hasSchedule : tipo !== "all" && p.kind !== tipo)
      return false;
    if (!buscado) return true;
    if (plano(p.name).includes(buscado)) return true;

    // Also by where they are: «¿quién está en Garita Norte?».
    return p.days.some(
      (d) =>
        !!d.where &&
        (plano(d.where.stationName || "").includes(buscado) ||
          plano(d.where.postSiteName || "").includes(buscado)),
    );
  });
}

/**
 * What the row offers when the person has no schedule:
 *  · office / supervisor → «Asignar horario» (the weekly editor);
 *  · a guard with no assignment → «Asignar a un puesto».
 */
export function accionDePersona(
  p: Pick<PersonaDelHorario, "kind" | "hasSchedule" | "assigned">,
): "asignarHorario" | "asignarPuesto" | null {
  if (p.kind === "guard") return p.assigned ? null : "asignarPuesto";

  return p.hasSchedule ? null : "asignarHorario";
}

/** «Sitio · Estación» of a day, or null. */
export function rotuloDeDonde(w: DondeEsta | null | undefined): string | null {
  if (!w) return null;
  const partes = [w.postSiteName, w.stationName || w.positionName].filter(
    Boolean,
  ) as string[];

  return partes.length ? partes.join(" · ") : null;
}

/**
 * Where the person is, for the row header: that day's place if the day is in
 * range, otherwise the first place seen in the range.
 */
export function dondeEstaEl(
  p: Pick<PersonaDelHorario, "days">,
  fecha: string,
): DondeEsta | null {
  const hoy = p.days.find((d) => d.date === fecha);

  if (hoy?.where) return hoy.where;

  return p.days.find((d) => d.where)?.where || null;
}

const sumarDias = (ymd: string, n: number): string => {
  const [y, m, d] = ymd.split("-").map(Number);

  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

/**
 * The range to ask the server for, starting at the first visible day: the
 * longest the endpoint allows (so a short scroll does not refetch), never past
 * `limiteFin` (the last day the sheet paints).
 */
export function ventanaDePersonal(
  desde: string,
  limiteFin?: string,
): { desde: string; hasta: string } {
  let hasta = sumarDias(desde, MAX_DIAS_PERSONAL - 1);

  if (limiteFin && hasta > limiteFin) hasta = limiteFin < desde ? desde : limiteFin;

  return { desde, hasta };
}

/**
 * Does the loaded range already cover the visible one? A visible window wider
 * than the endpoint allows counts as covered once its first
 * `MAX_DIAS_PERSONAL` days are — otherwise it would refetch forever.
 */
export function cubreLaVentana(
  cargado: { desde: string; hasta: string } | null,
  desde: string,
  hasta: string,
): boolean {
  if (!cargado) return false;
  const tope = sumarDias(desde, MAX_DIAS_PERSONAL - 1);
  const fin = hasta < tope ? hasta : tope;

  return cargado.desde <= desde && cargado.hasta >= fin;
}
