import { describe, expect, it, vi } from "vitest";

import {
  eliminarVigilantes,
  esFrenoPorAgenda,
  esTurnoAbierto,
} from "./eliminarVigilantes";

/** The shape the axios interceptor rejects with (lib/api.ts normalizeError). */
const apiError = (messageCode: string, message: string) => ({
  status: 400,
  code: 400,
  message,
  details: { message, code: 400, messageCode },
});

const g = (n: number) => ({
  id: `row-${n}`,
  realId: `sg-${n}`,
  name: `Vigilante ${n}`,
});

describe("eliminarVigilantes", () => {
  it("one guard with future shifts no longer sinks the rest of the batch", async () => {
    const destroy = vi.fn(async (ids: string[]) => {
      if (ids[0] === "sg-2")
        throw apiError(
          "securityGuard.errors.guardOccupiedByShift_varios",
          "Este vigilante tiene 365 turnos programados por delante…",
        );
      return { deleted: 1, alreadyDeleted: 0, items: [] };
    });

    const r = await eliminarVigilantes([g(1), g(2), g(3)], destroy);

    expect(destroy).toHaveBeenCalledTimes(3);
    expect(r.removed).toEqual(["row-1", "row-3"]);
    expect(r.blockedBySchedule.map((f) => f.guard.id)).toEqual(["row-2"]);
    expect(r.blockedBySchedule[0].message).toMatch(/365 turnos/);
    expect(r.failed).toEqual([]);
  });

  it("only sends freeSchedule when asked, and adds up the cancelled shifts", async () => {
    const destroy = vi.fn(async () => ({
      deleted: 1,
      alreadyDeleted: 0,
      items: [{ status: "deleted", shiftsCancelled: 365 }],
    }));

    await eliminarVigilantes([g(1)], destroy);
    expect(destroy).toHaveBeenLastCalledWith(["sg-1"], undefined);

    const r = await eliminarVigilantes([g(1), g(2)], destroy, {
      freeSchedule: true,
    });
    expect(destroy).toHaveBeenLastCalledWith(["sg-2"], { freeSchedule: true });
    expect(r.shiftsCancelled).toBe(730);
  });

  it("a punched-in guard or any other error is a plain failure (no freeSchedule offer)", async () => {
    const destroy = vi.fn(async (ids: string[]) => {
      if (ids[0] === "sg-1")
        throw apiError(
          "securityGuard.errors.guardOccupiedByGuardShift",
          "Tiene un turno abierto",
        );
      throw { status: 0, message: "Network Error" };
    });

    const r = await eliminarVigilantes([g(1), g(2)], destroy);
    expect(r.removed).toEqual([]);
    expect(r.blockedBySchedule).toEqual([]);
    expect(r.failed.map((f) => f.message)).toEqual([
      "Tiene un turno abierto",
      "Network Error",
    ]);
    expect(r.failed.map((f) => f.openShift)).toEqual([true, false]);
  });

  it("classifies the API codes", () => {
    expect(
      esFrenoPorAgenda(
        apiError("securityGuard.errors.guardOccupiedByShift_uno", ""),
      ),
    ).toBe(true);
    expect(
      esFrenoPorAgenda(
        apiError("securityGuard.errors.guardOccupiedByPatrol_varios", ""),
      ),
    ).toBe(true);
    expect(
      esFrenoPorAgenda(
        apiError("securityGuard.errors.guardOccupiedByGuardShift", ""),
      ),
    ).toBe(false);
    expect(
      esTurnoAbierto(
        apiError("securityGuard.errors.guardOccupiedByGuardShift", ""),
      ),
    ).toBe(true);
    expect(esFrenoPorAgenda(new Error("boom"))).toBe(false);
  });
});
