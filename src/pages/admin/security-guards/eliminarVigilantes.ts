/**
 * ELIMINAR VIGILANTES — one place for the single «Remover» dialog and the bulk
 * action, so the two cannot drift again.
 *
 * What was wrong (ENTEC / GTR, 2026-10-08, «desaparecen momentáneamente, pero
 * al recargar la página vuelven a aparecer»):
 *
 *   · The bulk action sent every id in ONE request, inside one transaction. One
 *     guard with future shifts (the normal case: a fixed assignment books a year
 *     ahead) made the whole batch a 400, and the `catch` only did
 *     `console.error` on a request marked `silentError` — nothing on screen.
 *   · Neither path offered a way out of that brake, so people worked around it
 *     by hand (deleting an assignment and 121 shifts).
 *
 * Now each guard is deleted on its own request, so one refusal does not sink
 * the rest and the screen can say WHO could not be deleted and why. Refusals
 * because of the agenda (future shifts / pending rounds) are separated from the
 * rest: those the person can resolve right there with «cancel their shifts and
 * delete» (`freeSchedule`), which the API only honours on that explicit flag.
 */

export interface VigilanteAEliminar {
  /** Row id in the list (what the table filters by). */
  id: string;
  /** securityGuard id sent to the API. */
  realId: string;
  name: string;
}

export interface FalloAlEliminar {
  guard: VigilanteAEliminar;
  message: string;
  /** Punched in right now: only «Archivar» resolves it (closes and settles the shift). */
  openShift: boolean;
}

export interface ResultadoEliminar {
  /** Row ids that are gone (deleted now, or already deleted before). */
  removed: string[];
  /** Shifts cancelled across the whole run (freeSchedule only). */
  shiftsCancelled: number;
  /** Refused because of future shifts / pending rounds — resolvable with freeSchedule. */
  blockedBySchedule: FalloAlEliminar[];
  /** Anything else (punched in right now, permissions, network…). */
  failed: FalloAlEliminar[];
}

type Destroy = (
  ids: string[],
  options?: { freeSchedule?: boolean },
) => Promise<any>;

/** messageCode the API attaches to the 400 (see ApiResponseHandler.error). */
function codigoDelError(err: any): string {
  return String(
    err?.details?.messageCode ??
      err?.messageCode ??
      err?.response?.data?.messageCode ??
      "",
  );
}

/** Future shifts or pending rounds: the brake that `freeSchedule` resolves. */
export function esFrenoPorAgenda(err: any): boolean {
  return /^securityGuard\.errors\.guardOccupiedBy(Shift|Patrol)/.test(
    codigoDelError(err),
  );
}

/** Punched in right now: only «Archivar» (it closes and settles the shift). */
export function esTurnoAbierto(err: any): boolean {
  return (
    codigoDelError(err) === "securityGuard.errors.guardOccupiedByGuardShift"
  );
}

export function mensajeDelError(err: any): string {
  return String(err?.message || err || "");
}

export async function eliminarVigilantes(
  guards: VigilanteAEliminar[],
  destroy: Destroy,
  options: { freeSchedule?: boolean } = {},
): Promise<ResultadoEliminar> {
  const out: ResultadoEliminar = {
    removed: [],
    shiftsCancelled: 0,
    blockedBySchedule: [],
    failed: [],
  };

  // Sequential on purpose: each delete frees an agenda and writes the audit
  // log; firing 30 at once against the same tenant only buys lock waits.
  for (const guard of guards) {
    try {
      const r = await destroy(
        [guard.realId],
        options.freeSchedule ? { freeSchedule: true } : undefined,
      );
      out.removed.push(guard.id);
      const items = Array.isArray(r?.items) ? r.items : [];
      for (const it of items)
        out.shiftsCancelled += Number(it?.shiftsCancelled) || 0;
    } catch (err: any) {
      const fallo = {
        guard,
        message: mensajeDelError(err),
        openShift: esTurnoAbierto(err),
      };
      if (esFrenoPorAgenda(err)) out.blockedBySchedule.push(fallo);
      else out.failed.push(fallo);
    }
  }

  return out;
}
