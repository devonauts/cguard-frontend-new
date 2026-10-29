/**
 * Planner · weekly styles («por días de la semana»): the phase is the
 * calendar, the optimizer never moves it and publishing never «runs» it.
 */
import { describe, expect, it } from "vitest";

import { FRANCO, copiar, propio, acomodar } from "./motor";
import { planificarPublicacion } from "./publicar";
import { planDesdeHorarioReal } from "./real";

const BASE = "2026-10-05"; // Monday

function overview() {
  return {
    stations: [{ id: "ofi", stationName: "Recepción", scheduleType: "12h-day", rotationStyleId: "wk" }],
    positions: [{ id: "p1", stationId: "ofi", type: "fijo", startTime: "08:00", endTime: "17:00" }],
    assignments: [
      { id: "a1", guardId: "g1", stationId: "ofi", positionId: "p1", status: "active", rotationStyleId: "wk", startDate: "2026-10-08", guard: { fullName: "Ana" } },
    ],
    shifts: [],
  };
}
const rotaciones = [{ id: "wk", name: "Lunes a viernes", weekly: true, sequence: "DDDDDLL", dayShifts: 5, nightShifts: 0, restDays: 2 }];

describe("planner · weekly style", () => {
  it("reads the 7 letters by weekday, whatever the start date", () => {
    const { plan, enlace } = planDesdeHorarioReal(overview() as any, rotaciones, BASE, "UTC", 14);
    const p = plan.personas[0];

    expect(p.semanal).toBe(true);
    expect(enlace.personas[p.id].semanal).toBe(true);
    const semana = Array.from({ length: 7 }, (_, d) => propio(p, d));

    expect(semana.slice(0, 5).every((c) => c !== FRANCO)).toBe(true);
    expect(semana.slice(5)).toEqual([FRANCO, FRANCO]);
  });

  it("a base that is not a Monday still lands Saturday and Sunday off", () => {
    // 2026-10-07 is a Wednesday: day 3 is Saturday.
    const { plan } = planDesdeHorarioReal(overview() as any, rotaciones, "2026-10-07", "UTC", 14);
    const p = plan.personas[0];

    expect([propio(p, 3), propio(p, 4)]).toEqual([FRANCO, FRANCO]);
    expect(propio(p, 5)).not.toBe(FRANCO);
  });

  it("publishing a moved phase is refused, never sent as a cycle run", () => {
    const { plan, enlace } = planDesdeHorarioReal(overview() as any, rotaciones, BASE, "UTC", 14);
    const borrador = copiar(plan);

    borrador.personas[0].desfase += 1;
    const pub = planificarPublicacion(plan, borrador, enlace, {
      tenantId: "T",
      base: BASE,
      hoy: 0,
      dias: 14,
      fechaDe: (d: number) => new Date(Date.UTC(2026, 9, 5 + d)).toISOString().slice(0, 10),
      instanteDe: (d: number, min: number) =>
        new Date(Date.UTC(2026, 9, 5 + d, Math.floor(min / 60), min % 60)).toISOString(),
    });

    expect(pub.cambios.filter((c) => c.tipo === "rotacion")).toEqual([]);
    expect(pub.noPublicables.some((m) => m.includes("días de la semana"))).toBe(true);
  });

  it("the optimizer leaves it where the calendar put it", () => {
    const { plan } = planDesdeHorarioReal(overview() as any, rotaciones, BASE, "UTC", 14);
    const antes = plan.personas[0].desfase;

    acomodar(plan, 0, 14, [plan.personas[0].id]);
    expect(plan.personas[0].desfase).toBe(antes);
  });
});
