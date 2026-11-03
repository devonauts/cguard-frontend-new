/**
 * The state of a shift on «Estado de turnos». Pure, so it can be tested.
 *
 * `transferred_out` has two origins and they are not the same for the post:
 *   · an approved SWAP (`shiftExchangeRequestId`): the colleague who took it
 *     has his own row on that post, so nobody is missing → «Trasladado»,
 *     outside «Cancelados — quedaron sin vigilante» (QA 2026-11-02, N8);
 *   · a TRANSFER from Cobertura en vivo (`transferGuard`): the guard was
 *     pulled to another post and the origin is left waiting for a backfill
 *     (its coverage event stays open, `coveringGuardId` null). That post IS
 *     without its guard, so it still counts there (QA round 7).
 */
import { ESTADOS_ANULADOS } from "@/lib/shiftStatus";

export type EstadoEnLaLista =
  | "completed"
  | "in-progress"
  | "pending"
  | "cancelled"
  /** Handed to a colleague in an approved swap: someone else works it. */
  | "transferred";

export interface FilaDeTurno {
  status?: string | null;
  guardId?: string | null;
  startTime: string;
  endTime: string;
  shiftExchangeRequestId?: string | null;
}

/** A shift handed over in an approved swap (its taker has his own row). */
export const esIntercambiado = (row: FilaDeTurno): boolean =>
  String(row.status || "") === "transferred_out" && !!row.shiftExchangeRequestId;

export function estadoEnLaLista(
  row: FilaDeTurno,
  now: Date = new Date(),
): EstadoEnLaLista {
  if (esIntercambiado(row)) return "transferred";
  /* A voided shift (absent, cancelled, moved to another station) leaves the
     post without that guard whatever the clock says: it was «Pendiente» and
     later «Completado» (QA 2026-11-01). */
  if ((ESTADOS_ANULADOS as readonly string[]).includes(String(row.status || "")))
    return "cancelled";
  const start = new Date(row.startTime);
  const end = new Date(row.endTime);

  if (!row.guardId) return end < now ? "cancelled" : "pending";
  if (now >= start && now <= end) return "in-progress";
  if (end < now) return "completed";

  return "pending";
}
