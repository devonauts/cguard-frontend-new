/**
 * «CUBRIR» A GAP — through the write path that already owns that kind of hole.
 *
 * Sin cubrir does not invent a new way to put someone on a post. Each kind of
 * gap goes through the endpoint the rest of the CRM (and the supervisor app)
 * already uses for it, so every rule those enforce — scope, the company's
 * «no doblar» / «no asignar en descanso» switches, closed payroll days, the
 * one cover per gap — applies unchanged:
 *
 *   open_shift / archived_guard → PATCH shift/:id/assign       (the shift row gets a guard)
 *   leave                       → POST coverage/leave-holes/cover (the absent shift is covered)
 *   no_show                     → POST coverage/events/:id/cover  (its novedad; reported first if needed)
 *   empty_slot                  → POST coverage/transfer        (a reinforcement shift there)
 *
 * The server answers `rest_day` / `double_booking` when the person is resting
 * or already working: the screen asks, then retries with the flag.
 */
import type { Gap } from "@/lib/api/gapService";

export interface Confirmaciones {
  allowRestDay?: boolean;
  allowDoubleShift?: boolean;
}

export interface Peticion {
  method: "PATCH" | "POST";
  path: string;
  body: Record<string, unknown>;
}

export function peticionParaCubrir(
  tenantId: string,
  gap: Pick<
    Gap,
    | "kind"
    | "shiftId"
    | "guardId"
    | "stationId"
    | "startTime"
    | "endTime"
    | "coverageEventId"
  >,
  coveringGuardId: string,
  ok: Confirmaciones = {},
): Peticion {
  const t = `/tenant/${tenantId}`;
  const flags = {
    ...(ok.allowRestDay ? { allowRestDay: true } : {}),
    ...(ok.allowDoubleShift ? { allowDoubleShift: true } : {}),
  };

  switch (gap.kind) {
    case "open_shift":
    case "archived_guard":
      return {
        method: "PATCH",
        path: `${t}/shift/${gap.shiftId}/assign`,
        body: { data: { guard: coveringGuardId } },
      };
    case "leave":
      return {
        method: "POST",
        path: `${t}/coverage/leave-holes/cover`,
        body: {
          data: {
            coveringGuardId,
            absentGuardId: gap.guardId,
            holeShiftIds: [gap.shiftId],
            ...flags,
          },
        },
      };
    case "no_show":
      /* Always through the novedad: a falta not reported yet is reported
         first (`peticionParaReportarFalta`), so a refused cover («está en su
         descanso») can be retried without reporting the falta twice. */
      return {
        method: "POST",
        path: `${t}/coverage/events/${gap.coverageEventId}/cover`,
        body: { data: { coveringGuardId, ...flags } },
      };
    case "empty_slot":
    default:
      return {
        method: "POST",
        path: `${t}/coverage/transfer`,
        body: {
          data: {
            guardId: coveringGuardId,
            toStationId: gap.stationId,
            windowStart: gap.startTime,
            windowEnd: gap.endTime,
            reason: "refuerzo_cliente",
            ...flags,
          },
        },
      };
  }
}

/** A falta nobody reported yet: report it (no replacement), to get its novedad. */
export function peticionParaReportarFalta(
  tenantId: string,
  gap: Pick<Gap, "shiftId" | "guardId">,
): Peticion {
  return {
    method: "POST",
    path: `/tenant/${tenantId}/coverage/absence`,
    body: {
      data: {
        guardId: gap.guardId,
        shiftId: gap.shiftId,
        reason: "no_call_no_show",
      },
    },
  };
}

/** Does covering this gap need its falta reported first? */
export function necesitaReportarFalta(
  gap: Pick<Gap, "kind" | "coverageEventId">,
): boolean {
  return gap.kind === "no_show" && !gap.coverageEventId;
}

/** What the server's refusal asks of the person covering. */
export type Respuesta =
  | { tipo: "confirmar"; flag: keyof Confirmaciones; codigo: string }
  | { tipo: "error"; codigo: string | null; mensaje: string | null };

export function leerRespuestaDeError(e: unknown): Respuesta {
  const data = (e as any)?.data || {};
  const codigo: string | null = data?.error || data?.code || null;
  const mensaje: string | null = data?.message || (e as any)?.message || null;

  if (codigo === "rest_day")
    return { tipo: "confirmar", flag: "allowRestDay", codigo };
  if (codigo === "double_booking")
    return { tipo: "confirmar", flag: "allowDoubleShift", codigo };

  return { tipo: "error", codigo, mensaje };
}

/** Can the Dobletes offer be launched for this gap from Sin cubrir? */
export function admiteDobletes(
  gap: Pick<Gap, "kind" | "coverageEventId" | "shiftId" | "guardId" | "ended">,
): boolean {
  if (gap.ended) return false;
  if (gap.coverageEventId) return true;

  // A falta not reported yet: it is reported first, then offered.
  return gap.kind === "no_show" && !!gap.shiftId && !!gap.guardId;
}

/** Group the page by day, then by station, keeping the server's order. */
export function agruparPorDiaYEstacion<
  T extends Pick<Gap, "date" | "stationId">,
>(
  rows: T[],
): Array<{
  date: string;
  estaciones: Array<{ stationId: string; filas: T[] }>;
}> {
  const dias: Array<{
    date: string;
    estaciones: Array<{ stationId: string; filas: T[] }>;
  }> = [];

  for (const r of rows) {
    let d = dias[dias.length - 1];

    if (!d || d.date !== r.date) {
      d = dias.find((x) => x.date === r.date) as any;
      if (!d) {
        d = { date: r.date, estaciones: [] };
        dias.push(d);
      }
    }
    let e = d.estaciones.find((x) => x.stationId === r.stationId);

    if (!e) {
      e = { stationId: r.stationId, filas: [] };
      d.estaciones.push(e);
    }
    e.filas.push(r);
  }

  return dias;
}
