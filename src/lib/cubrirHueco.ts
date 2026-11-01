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
 *   no_show, reported           → POST coverage/events/:id/cover  (its novedad)
 *   no_show, not reported yet   → POST coverage/report-and-cover  (falta + cover, one transaction)
 *   empty_slot                  → POST coverage/transfer        (a reinforcement shift there)
 *   any empty seat with an open
 *   vacancy (offered in Dobletes) → POST coverage/events/:id/cover (the vacancy; its offers close)
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
  > & { vacancy?: boolean },
  coveringGuardId: string,
  ok: Confirmaciones = {},
): Peticion {
  const t = `/tenant/${tenantId}`;
  const flags = {
    ...(ok.allowRestDay ? { allowRestDay: true } : {}),
    ...(ok.allowDoubleShift ? { allowDoubleShift: true } : {}),
  };

  // An empty seat already offered in Dobletes is covered through its vacancy:
  // one cover per gap, and the offers still out close.
  if (gap.vacancy && gap.coverageEventId) {
    return {
      method: "POST",
      path: `${t}/coverage/events/${gap.coverageEventId}/cover`,
      body: { data: { coveringGuardId, ...flags } },
    };
  }

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
      /* A falta not reported yet is reported AND covered in one transaction:
         a refused cover («está en su descanso») writes nothing, so the retry
         with the flag is the same call. A reported one, through its novedad. */
      if (!gap.coverageEventId) {
        return {
          method: "POST",
          path: `${t}/coverage/report-and-cover`,
          body: {
            data: {
              guardId: gap.guardId,
              shiftId: gap.shiftId,
              reason: "no_call_no_show",
              coveringGuardId,
              ...flags,
            },
          },
        };
      }

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

/** The gaps with nobody planned on them: offered as a vacancy. */
const ASIENTO_VACIO = new Set(["empty_slot", "open_shift", "archived_guard"]);

/** Is this gap an empty seat (no novedad of its own, offered as a vacancy)? */
export function esAsientoVacio(gap: Pick<Gap, "kind">): boolean {
  return ASIENTO_VACIO.has(gap.kind);
}

/** Can the Dobletes offer be launched for this gap from Sin cubrir? */
export function admiteDobletes(
  gap: Pick<Gap, "kind" | "coverageEventId" | "shiftId" | "guardId" | "ended"> & {
    vacancy?: boolean;
  },
): boolean {
  if (gap.ended) return false;
  // An empty seat is offered through its vacancy (opened on the first offer).
  if (esAsientoVacio(gap)) return true;
  if (gap.coverageEventId) return true;

  // A falta not reported yet: it is reported first, then offered.
  return gap.kind === "no_show" && !!gap.shiftId && !!gap.guardId;
}

/**
 * What the offer starts on: the gap's novedad, or — for an empty seat not
 * offered yet — the seat itself, which the server opens as a vacancy in the
 * same call. A falta not reported yet needs `peticionParaReportarFalta` first.
 */
export function inicioDeOferta(
  gap: Pick<Gap, "kind" | "coverageEventId" | "shiftId" | "stationId" | "startTime" | "endTime"> & {
    vacancy?: boolean;
  },
):
  | { eventId: string }
  | { vacancy: { shiftId: string } | { stationId: string; windowStart: string; windowEnd: string } }
  | null {
  if (gap.vacancy && gap.coverageEventId) return { eventId: gap.coverageEventId };
  if (!esAsientoVacio(gap))
    return gap.coverageEventId ? { eventId: gap.coverageEventId } : null;
  if (gap.kind !== "empty_slot" && gap.shiftId)
    return { vacancy: { shiftId: gap.shiftId } };

  return {
    vacancy: {
      stationId: gap.stationId,
      windowStart: gap.startTime,
      windowEnd: gap.endTime,
    },
  };
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
