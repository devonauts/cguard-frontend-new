import { describe, expect, it } from "vitest";

import {
  diasDelMes,
  diasDePermiso,
  filasPorPersona,
  filasPorPuesto,
  mesSiguiente,
  rangoDelMes,
} from "./ausenciasCalendario";

const leave = (x: any) => ({
  id: x.id,
  requestDate: "2026-10-01",
  type: x.type ?? "vacation",
  startDate: x.startDate,
  startTime: null,
  endDate: x.endDate ?? x.startDate,
  endTime: null,
  reason: null,
  comment: null,
  status: x.status ?? "approved",
  isPaid: true,
  guardId: x.guardId,
  guard: { id: x.guardId, fullName: x.name ?? x.guardId },
  stations: x.stations,
});

describe("calendario de ausencias", () => {
  it("days of a month, including February of a leap year", () => {
    expect(diasDelMes("2026-11")).toHaveLength(30);
    expect(diasDelMes("2028-02")).toHaveLength(29);
    expect(diasDelMes("2026-11")[0]).toBe("2026-11-01");
    expect(rangoDelMes("2026-12")).toEqual({ from: "2026-12-01", to: "2026-12-31" });
  });

  it("moves across the year", () => {
    expect(mesSiguiente("2026-12", 1)).toBe("2027-01");
    expect(mesSiguiente("2027-01", -1)).toBe("2026-12");
  });

  it("a leave is inclusive and crosses the DST change without losing a day", () => {
    expect(diasDePermiso({ startDate: "2026-10-31", endDate: "2026-11-02" })).toEqual([
      "2026-10-31",
      "2026-11-01",
      "2026-11-02",
    ]);
    expect(diasDePermiso({ startDate: "2026-11-02", endDate: null })).toEqual(["2026-11-02"]);
  });

  it("by person: only the days inside the month, rejected and cancelled skipped", () => {
    const rows = filasPorPersona(
      [
        leave({ id: "a", guardId: "g1", name: "Ana", startDate: "2026-10-30", endDate: "2026-11-02" }),
        leave({ id: "b", guardId: "g2", name: "Beto", startDate: "2026-11-10", status: "rejected" }),
        leave({ id: "c", guardId: "g2", name: "Beto", startDate: "2026-11-12", status: "pending" }),
      ] as any,
      "2026-11",
    );

    expect(rows.map((r) => r.label)).toEqual(["Ana", "Beto"]);
    expect([...rows[0].byDay.keys()]).toEqual(["2026-11-01", "2026-11-02"]);
    expect([...rows[1].byDay.keys()]).toEqual(["2026-11-12"]);
  });

  it("by post: one count per person and day, people without a post grouped last", () => {
    const st = [{ id: "s1", name: "Garita" }];
    const rows = filasPorPuesto(
      [
        leave({ id: "a", guardId: "g1", startDate: "2026-11-03", stations: st }),
        leave({ id: "b", guardId: "g2", startDate: "2026-11-03", stations: st }),
        leave({ id: "c", guardId: "g1", startDate: "2026-11-03", status: "pending", stations: st }),
        leave({ id: "d", guardId: "g3", startDate: "2026-11-04", stations: [] }),
      ] as any,
      "2026-11",
    );

    expect(rows.map((r) => r.label)).toEqual(["Garita", "—"]);
    expect(rows[0].byDay.get("2026-11-03")).toHaveLength(2);
  });
});
