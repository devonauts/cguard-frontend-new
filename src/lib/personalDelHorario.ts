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

import { EVENTOS_DEL_HORARIO, type EventoDelHorario } from "./coloresDelHorario";

export type TipoDePersona = "guard" | "supervisor" | "office";
export type EstadoDelDia = "work" | "off" | "absence" | "none";
export type CodigoDeAusencia = "V" | "PM" | "F";

export interface DondeEsta {
  stationId: string | null;
  stationName: string | null;
  /** El nominativo de la estación («Bravo 14»): lo que cabe en la celda. */
  stationNickname?: string | null;
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
  /** Office staff: the planned lunch of that day. */
  lunch?: { start: string; end: string } | null;
  /** Ya pasó: qué pasó contra el fichaje (Colores del horario). */
  resultado?: EventoDelHorario;
  /** Con incidencia: por qué (códigos de attendanceException.type). */
  motivos?: string[];
}

export interface PersonaDelHorario {
  userId: string;
  name: string;
  roles: string[];
  kind: TipoDePersona;
  hasSchedule: boolean;
  assigned: boolean;
  days: DiaDePersona[];
  /** Invited and not yet signed in («invitación pendiente»). Optional: the
   *  server field arrives with the staff sign-up work; absent = false. */
  pendingInvite?: boolean;
  /** Guards: the place of their active assignment (their «home»). */
  home?: DondeEsta | null;
  /** Supervisors: the posts they hold (names may be null). */
  positions?: Array<{ id: string; name: string | null }>;
  /** Supervisors with a post and no shift in the range: local date of the
   *  next one after it, or null. */
  nextShiftDate?: string | null;
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

function dondeLimpio(w: any): DondeEsta | null {
  return w &&
    typeof w === "object" &&
    (texto(w.stationId) || texto(w.postSiteId) || texto(w.positionId))
    ? {
        stationId: texto(w.stationId),
        stationName: texto(w.stationName),
        stationNickname: texto(w.stationNickname),
        postSiteId: texto(w.postSiteId),
        postSiteName: texto(w.postSiteName),
        positionId: texto(w.positionId),
        positionName: texto(w.positionName),
      }
    : null;
}

function diaLimpio(d: any): DiaDePersona | null {
  const date = String(d?.date ?? "").slice(0, 10);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const status: EstadoDelDia = ESTADOS.includes(d?.status) ? d.status : "none";
  const where = dondeLimpio(d?.where);

  return {
    date,
    status,
    start: hora(d?.start),
    end: hora(d?.end),
    where,
    absence: AUSENCIAS.includes(d?.absence) ? d.absence : null,
    ...(EVENTOS_DEL_HORARIO.includes(d?.resultado)
      ? { resultado: d.resultado as EventoDelHorario }
      : {}),
    ...(Array.isArray(d?.motivos) && d.motivos.length
      ? { motivos: d.motivos.filter((m: unknown) => typeof m === "string").slice(0, 8) }
      : {}),
  };
}

/** Reads the «invited, not signed in yet» mark whatever shape the server uses. */
export function invitacionPendiente(p: any): boolean {
  if (!p || typeof p !== "object") return false;
  const flag =
    p.pendingInvite ?? p.invitePending ?? p.invitationPending ?? p.pending;

  if (typeof flag === "boolean") return flag;
  const st = String(p.invitation?.status ?? p.inviteStatus ?? p.status ?? "")
    .trim()
    .toLowerCase();

  return st === "pending" || st === "invited";
}

/**
 * A supervisor on a post with NO shifts at all in the loaded days: the post
 * generates nothing yet (e.g. «Sin rotación»). That is not «Libre» every day —
 * it is «no shifts», and the sheet says so.
 */
export function sinTurnosEnElRango(p: PersonaDelHorario): boolean {
  return (
    p.kind === "supervisor" &&
    p.assigned &&
    p.days.length > 0 &&
    !p.days.some((d) => d.status === "work" || d.status === "absence")
  );
}

function puestosDe(p: any): Array<{ id: string; name: string | null }> {
  return (Array.isArray(p?.positions) ? p.positions : [])
    .map((x: any) => ({ id: texto(x?.id) || "", name: texto(x?.name) || null }))
    .filter((x: { id: string }) => !!x.id);
}

function proximoDe(p: any): string | null {
  const v = texto(p?.nextShiftDate) || "";
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
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
      ya.pendingInvite = ya.pendingInvite || invitacionPendiente(p);
      if (!ya.positions?.length) ya.positions = puestosDe(p);
      if (!ya.home) ya.home = dondeLimpio(p?.home);
      ya.nextShiftDate = ya.nextShiftDate || proximoDe(p);
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
      pendingInvite: invitacionPendiente(p),
      positions: puestosDe(p),
      nextShiftDate: proximoDe(p),
      home: dondeLimpio(p?.home),
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
 * A supervisor who holds a post has a schedule (the post's rotation), even in
 * a week with no shift: the row shows the post, not «Asignar horario».
 */
export function accionDePersona(
  p: Pick<PersonaDelHorario, "kind" | "hasSchedule" | "assigned"> &
    Partial<Pick<PersonaDelHorario, "nextShiftDate">>,
): "asignarHorario" | "asignarPuesto" | null {
  if (p.kind === "guard") return p.assigned ? null : "asignarPuesto";
  if (p.kind === "supervisor" && p.assigned) return null;
  // Office hours that begin after these days: already scheduled («desde …»).
  if (p.kind === "office" && !p.hasSchedule && p.nextShiftDate) return null;

  return p.hasSchedule ? null : "asignarHorario";
}

/**
 * Lo que cabe DENTRO de la celda de un día (Mike, 2026-11-08: «en la vista
 * general sólo veo la hora, no en qué estación está»): el nominativo de la
 * estación si lo tiene, si no su nombre, y para un supervisor su puesto de
 * supervisión. El rótulo completo («Sede · Estación») va en el título.
 */
export function rotuloCortoDeDonde(w: DondeEsta | null | undefined): string | null {
  if (!w) return null;

  return w.stationNickname || w.stationName || w.positionName || w.postSiteName || null;
}

/** «Sitio · Estación» of a day, or null. */
export function rotuloDeDonde(w: DondeEsta | null | undefined): string | null {
  if (!w) return null;
  const partes = [w.postSiteName, w.stationName || w.positionName].filter(
    Boolean,
  ) as string[];
  // «Charlie 3 · Charlie 3» says nothing twice.
  const unicas = partes.filter((x, i) => partes.findIndex((y) => y.trim().toLowerCase() === x.trim().toLowerCase()) === i);

  return unicas.length ? unicas.join(" · ") : null;
}

/**
 * Where the person is, for the row header: that day's place if the day is in
 * range, otherwise the first place seen in the range.
 */
export function dondeEstaEl(
  p: Pick<PersonaDelHorario, "days"> & { home?: DondeEsta | null },
  fecha: string,
): DondeEsta | null {
  const hoy = p.days.find((d) => d.date === fecha);

  if (hoy?.where) return hoy.where;
  // Where they belong (their assignment) before any place they only covered.
  if (p.home) return p.home;

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
 * Does the loaded range already cover the painted one? The sheet paints more
 * than fits on screen (overscan), and the whole painted range must be loaded:
 * covering only its first `MAX_DIAS_PERSONAL` days left the days after it
 * blank (seen 2026-10-28: everything after Nov 1 empty after «Hoy»).
 */
export function cubreLaVentana(
  cargado: { desde: string; hasta: string } | null,
  desde: string,
  hasta: string,
): boolean {
  if (!cargado) return false;

  return cargado.desde <= desde && cargado.hasta >= hasta;
}

/**
 * The range to load for a painted window: at least the whole window, and at
 * least `MAX_DIAS_PERSONAL` days so a short scroll does not refetch, never past
 * `limiteFin` (the last day the sheet paints).
 */
export function ventanaParaLaHoja(
  desde: string,
  hasta: string,
  limiteFin?: string,
): { desde: string; hasta: string } {
  const minimo = ventanaDePersonal(desde, limiteFin).hasta;
  let fin = hasta > minimo ? hasta : minimo;

  if (limiteFin && fin > limiteFin) fin = limiteFin < desde ? desde : limiteFin;

  return { desde, hasta: fin };
}

/**
 * The days «Todo el personal» asks for: what is on screen plus a small margin,
 * inside the painted range. A 2,000-person company used to download the whole
 * painted sheet (three months, ~29 MB) the moment the Horario opened.
 */
export function ventanaVisible(
  desde: string,
  hasta: string,
  primero?: string,
  ultimo?: string,
  margen = 7,
): { desde: string; hasta: string } {
  let a = sumarDias(desde, -margen);
  let b = sumarDias(hasta, margen);

  if (primero && a < primero) a = primero;
  if (ultimo && b > ultimo) b = ultimo;
  if (b < a) b = a;

  return { desde: a, hasta: b };
}

/**
 * What of `w` is still missing next to what is loaded: at most one piece on
 * each side. `null` when `w` doesn't touch the loaded range (a jump far away):
 * then the caller loads `w` alone and forgets the rest.
 */
export function tramosQueFaltan(
  cargado: { desde: string; hasta: string } | null,
  w: { desde: string; hasta: string },
): Array<{ desde: string; hasta: string }> | null {
  if (!cargado) return null;
  const toca = w.desde <= sumarDias(cargado.hasta, 1) && w.hasta >= sumarDias(cargado.desde, -1);

  if (!toca) return null;
  const out: Array<{ desde: string; hasta: string }> = [];

  if (w.desde < cargado.desde) out.push({ desde: w.desde, hasta: sumarDias(cargado.desde, -1) });
  if (w.hasta > cargado.hasta) out.push({ desde: sumarDias(cargado.hasta, 1), hasta: w.hasta });

  return out;
}

/** Splits a range into requests the endpoint accepts (≤ `MAX_DIAS_PERSONAL` days each). */
export function tramosDe(desde: string, hasta: string): Array<{ desde: string; hasta: string }> {
  const out: Array<{ desde: string; hasta: string }> = [];
  let a = desde;

  while (a <= hasta) {
    const b = sumarDias(a, MAX_DIAS_PERSONAL - 1);
    const fin = b < hasta ? b : hasta;

    out.push({ desde: a, hasta: fin });
    a = sumarDias(fin, 1);
  }

  return out;
}

/** Joins the people of several ranges: one row per person, days in date order, no repeats. */
export function unirPersonas(listas: PersonaDelHorario[][]): PersonaDelHorario[] {
  const porId = new Map<string, PersonaDelHorario>();

  for (const lista of listas) {
    for (const p of lista) {
      const ya = porId.get(p.userId);

      if (!ya) {
        porId.set(p.userId, { ...p, days: [...p.days] });
        continue;
      }
      const fechas = new Set(ya.days.map((d) => d.date));

      for (const d of p.days) if (!fechas.has(d.date)) ya.days.push(d);
      ya.hasSchedule = ya.hasSchedule || p.hasSchedule;
      ya.assigned = ya.assigned || p.assigned;
      ya.pendingInvite = ya.pendingInvite || p.pendingInvite;
      if (!ya.positions?.length && p.positions?.length) ya.positions = p.positions;
      if (!ya.nextShiftDate && p.nextShiftDate) ya.nextShiftDate = p.nextShiftDate;
      if (!ya.home && p.home) ya.home = p.home;
    }
  }
  const out = [...porId.values()];

  for (const p of out) p.days.sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0));

  return out;
}

/**
 * The traffic light of a row (Mike, 2026-11-08):
 *  · «falta»      amber — needs a schedule or a post;
 *  · «completo»   grey  — scheduled and busy that day (working or on leave);
 *  · «disponible» green — scheduled and free that day: can be called to cover.
 * `fecha` is the day being looked at (today, or the first visible day).
 */
export type Disponibilidad = "falta" | "completo" | "disponible";

export function disponibilidadDe(
  p: Pick<PersonaDelHorario, "kind" | "hasSchedule" | "assigned" | "days"> &
    Partial<Pick<PersonaDelHorario, "nextShiftDate">>,
  fecha: string,
): Disponibilidad {
  if (accionDePersona(p)) return "falta";
  const conHorario =
    p.hasSchedule ||
    (p.kind === "supervisor" && p.assigned) ||
    (p.kind === "office" && !!p.nextShiftDate);

  if (!conHorario) return "falta";
  const dia = p.days.find((d) => d.date === fecha);

  if (!dia) return "completo";
  if (dia.status === "off") return "disponible";
  if (dia.status === "none") return p.kind === "guard" ? "falta" : "completo";

  return "completo";
}

export function contarDisponibilidad(
  ps: PersonaDelHorario[],
  fecha: string,
): Record<Disponibilidad, number> {
  const c: Record<Disponibilidad, number> = { falta: 0, completo: 0, disponible: 0 };

  for (const p of ps) c[disponibilidadDe(p, fecha)] += 1;

  return c;
}
