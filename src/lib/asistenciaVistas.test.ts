import { describe, expect, it } from "vitest";

import { enlaceAMarcaciones, enlaceDeTarjeta, minutos, valorDe, type ResumenDelDia } from "./asistenciaVistas";

const dato: ResumenDelDia = {
  day: "2026-11-01", scheduledToday: 10, presentToday: 7, lateToday: 2, noShowsToday: 1, onLeaveToday: 1,
  notYetDue: 2, clockedInNow: 6, missedClockouts: 0, overtimeToday: 1, pendingApprovals: 3, attendancePct: 88,
};

describe("Resumen de hoy", () => {
  it("no answer is «—», never a zero that reads as a quiet day", () => {
    expect(valorDe(null, "scheduledToday")).toBe("—");
    expect(valorDe({ ...dato, attendancePct: null }, "attendancePct")).toBe("—");
    expect(valorDe(dato, "attendancePct")).toBe("88%");
    expect(valorDe(dato, "missedClockouts")).toBe(0);
  });

  it("each number opens its list, filtered to the company day", () => {
    expect(enlaceDeTarjeta("lateToday", "2026-11-01")).toBe("/nomina/records?from=2026-11-01&to=2026-11-01&status=late");
    expect(enlaceDeTarjeta("scheduledToday", "2026-11-01")).toBe("/nomina/records?from=2026-11-01&to=2026-11-01");
    expect(enlaceDeTarjeta("onLeaveToday", "x")).toBe("/time-off");
  });
});

describe("Atrasos", () => {
  it("minutes read as hours and minutes", () => {
    expect(minutos(45)).toBe("45 min");
    expect(minutos(60)).toBe("1 h");
    expect(minutos(85)).toBe("1 h 25 min");
  });

  it("a guard opens Marcaciones filtered to their late marks of the range", () => {
    const u = new URL(`http://x${enlaceAMarcaciones({ personId: "g1", role: "guard" }, "2026-11-02", "2026-11-08")}`);
    expect(u.pathname).toBe("/nomina/records");
    expect(Object.fromEntries(u.searchParams)).toEqual({ from: "2026-11-02", to: "2026-11-08", status: "late", guard: "g1" });
  });

  it("supervisors and office staff open the range without a guard filter", () => {
    const u = new URL(`http://x${enlaceAMarcaciones({ personId: "u1", role: "staff" }, "2026-11-02", "2026-11-08")}`);
    expect(u.searchParams.get("guard")).toBeNull();
    expect(u.searchParams.get("status")).toBe("late");
  });
});
