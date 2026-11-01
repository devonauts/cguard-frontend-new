import { describe, expect, it } from "vitest";

import {
  admiteDobletes,
  agruparPorDiaYEstacion,
  inicioDeOferta,
  leerRespuestaDeError,
  necesitaReportarFalta,
  peticionParaCubrir,
  peticionParaReportarFalta,
} from "./cubrirHueco";
import { queryDeHuecos } from "./api/gapService";

const base = {
  shiftId: "s1",
  guardId: "g1",
  stationId: "st1",
  startTime: "2026-11-10T12:00:00.000Z",
  endTime: "2026-11-11T00:00:00.000Z",
  coverageEventId: null as string | null,
};

describe("cubrir un hueco · cada tipo por su camino", () => {
  it("a shift without a guard is assigned", () => {
    const p = peticionParaCubrir(
      "T",
      { ...base, kind: "open_shift", guardId: null },
      "g9",
    );

    expect(p).toEqual({
      method: "PATCH",
      path: "/tenant/T/shift/s1/assign",
      body: { data: { guard: "g9" } },
    });
  });

  it("leave goes through the leave-hole cover with that one shift", () => {
    const p = peticionParaCubrir("T", { ...base, kind: "leave" }, "g9", {
      allowRestDay: true,
    });

    expect(p.path).toBe("/tenant/T/coverage/leave-holes/cover");
    expect(p.body).toEqual({
      data: {
        coveringGuardId: "g9",
        absentGuardId: "g1",
        holeShiftIds: ["s1"],
        allowRestDay: true,
      },
    });
  });

  it("a falta is covered through its novedad, reported first when missing", () => {
    expect(
      necesitaReportarFalta({ kind: "no_show", coverageEventId: null }),
    ).toBe(true);
    expect(
      necesitaReportarFalta({ kind: "no_show", coverageEventId: "e1" }),
    ).toBe(false);
    expect(peticionParaReportarFalta("T", base)).toEqual({
      method: "POST",
      path: "/tenant/T/coverage/absence",
      body: {
        data: { guardId: "g1", shiftId: "s1", reason: "no_call_no_show" },
      },
    });
    const p = peticionParaCubrir(
      "T",
      { ...base, kind: "no_show", coverageEventId: "e1" },
      "g9",
      {
        allowDoubleShift: true,
      },
    );

    expect(p).toEqual({
      method: "POST",
      path: "/tenant/T/coverage/events/e1/cover",
      body: { data: { coveringGuardId: "g9", allowDoubleShift: true } },
    });
  });

  it("a falta not reported yet is reported and covered in ONE call", () => {
    const p = peticionParaCubrir("T", { ...base, kind: "no_show" }, "g9", {
      allowRestDay: true,
    });

    expect(p).toEqual({
      method: "POST",
      path: "/tenant/T/coverage/report-and-cover",
      body: {
        data: {
          guardId: "g1",
          shiftId: "s1",
          reason: "no_call_no_show",
          coveringGuardId: "g9",
          allowRestDay: true,
        },
      },
    });
  });

  it("an empty seat already offered is covered through its vacancy", () => {
    for (const kind of ["empty_slot", "open_shift", "archived_guard"] as const) {
      const p = peticionParaCubrir(
        "T",
        { ...base, kind, coverageEventId: "v1", vacancy: true },
        "g9",
      );

      expect(p.path).toBe("/tenant/T/coverage/events/v1/cover");
      expect(p.body).toEqual({ data: { coveringGuardId: "g9" } });
    }
  });

  it("an empty plaza becomes a reinforcement at that station for that window", () => {
    const p = peticionParaCubrir(
      "T",
      { ...base, kind: "empty_slot", shiftId: null, guardId: null },
      "g9",
    );

    expect(p.path).toBe("/tenant/T/coverage/transfer");
    expect(p.body).toEqual({
      data: {
        guardId: "g9",
        toStationId: "st1",
        windowStart: base.startTime,
        windowEnd: base.endTime,
        reason: "refuerzo_cliente",
      },
    });
  });
});

describe("cubrir un hueco · lo que contesta el servidor", () => {
  it("rest day and double booking become questions", () => {
    expect(leerRespuestaDeError({ data: { error: "rest_day" } })).toEqual({
      tipo: "confirmar",
      flag: "allowRestDay",
      codigo: "rest_day",
    });
    expect(
      leerRespuestaDeError({ data: { error: "double_booking" } }),
    ).toMatchObject({ flag: "allowDoubleShift" });
  });
  it("a forbidden rule is an error, not a question", () => {
    expect(
      leerRespuestaDeError({
        data: { error: "rest_day_forbidden", message: "No" },
      }),
    ).toEqual({
      tipo: "error",
      codigo: "rest_day_forbidden",
      mensaje: "No",
    });
  });
});

describe("sin cubrir · dobletes y agrupado", () => {
  it("offers only what has (or can get) a novedad, and never a gap already over", () => {
    expect(
      admiteDobletes({
        kind: "leave",
        coverageEventId: "e",
        shiftId: "s",
        guardId: "g",
        ended: false,
      }),
    ).toBe(true);
    expect(
      admiteDobletes({
        kind: "no_show",
        coverageEventId: null,
        shiftId: "s",
        guardId: "g",
        ended: false,
      }),
    ).toBe(true);
    // An empty seat is offered as a vacancy (opened on the first offer).
    expect(
      admiteDobletes({
        kind: "empty_slot",
        coverageEventId: null,
        shiftId: null,
        guardId: null,
        ended: false,
      }),
    ).toBe(true);
    expect(
      admiteDobletes({
        kind: "empty_slot",
        coverageEventId: null,
        shiftId: null,
        guardId: null,
        ended: true,
      }),
    ).toBe(false);
    expect(
      admiteDobletes({
        kind: "no_show",
        coverageEventId: "e",
        shiftId: "s",
        guardId: "g",
        ended: true,
      }),
    ).toBe(false);
  });
  it("the offer starts on the novedad, or on the seat for an empty one", () => {
    expect(
      inicioDeOferta({ ...base, kind: "leave", coverageEventId: "e1" }),
    ).toEqual({ eventId: "e1" });
    expect(
      inicioDeOferta({
        ...base,
        kind: "empty_slot",
        shiftId: null,
        guardId: null,
      }),
    ).toEqual({
      vacancy: {
        stationId: "st1",
        windowStart: base.startTime,
        windowEnd: base.endTime,
      },
    });
    expect(
      inicioDeOferta({ ...base, kind: "open_shift", guardId: null }),
    ).toEqual({ vacancy: { shiftId: "s1" } });
    // A stale event on an archived guard's shift is not the vacancy.
    expect(
      inicioDeOferta({ ...base, kind: "archived_guard", coverageEventId: "old" }),
    ).toEqual({ vacancy: { shiftId: "s1" } });
    expect(
      inicioDeOferta({
        ...base,
        kind: "empty_slot",
        coverageEventId: "v1",
        vacancy: true,
      }),
    ).toEqual({ eventId: "v1" });
    // An unreported falta has nothing to start on yet: it is reported first.
    expect(inicioDeOferta({ ...base, kind: "no_show" })).toBeNull();
  });
  it("groups by day then station, in the server's order", () => {
    const g = agruparPorDiaYEstacion([
      { date: "2026-11-10", stationId: "A", k: 1 },
      { date: "2026-11-10", stationId: "B", k: 2 },
      { date: "2026-11-10", stationId: "A", k: 3 },
      { date: "2026-11-11", stationId: "A", k: 4 },
    ] as any[]);

    expect(
      g.map((d) => [
        d.date,
        d.estaciones.map((e) => [e.stationId, e.filas.map((f: any) => f.k)]),
      ]),
    ).toEqual([
      [
        "2026-11-10",
        [
          ["A", [1, 3]],
          ["B", [2]],
        ],
      ],
      ["2026-11-11", [["A", [4]]]],
    ]);
  });
  it("builds the query the server pages on", () => {
    expect(
      queryDeHuecos({
        from: "2026-11-01",
        to: "2026-11-14",
        kinds: ["leave", "no_show"],
        page: 2,
      }),
    ).toBe(
      "from=2026-11-01&to=2026-11-14&kind=leave%2Cno_show&page=2&pageSize=50",
    );
  });
});
