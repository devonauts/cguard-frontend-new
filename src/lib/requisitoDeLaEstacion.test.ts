import { describe, expect, it } from "vitest";

import {
  consecuencias,
  cuerpoDelRequisito,
  franjasDesdePlazas,
  mismoRequisito,
  plazasDeFranjas,
  validarFranjas,
} from "./requisitoDeLaEstacion";
import { emparejarPlazas } from "./emparejarPlazas";

const P = (
  id: string,
  startTime: string,
  endTime: string,
  sortOrder: number,
  extra: object = {},
) => ({
  id,
  type: "fijo",
  startTime,
  endTime,
  sortOrder,
  ...extra,
});

describe("requisito · de plazas a lo que dice la gente", () => {
  it("groups same window and days, counts people at once, ignores sacafrancos", () => {
    const f = franjasDesdePlazas([
      P("a", "07:00:00", "19:00:00", 0),
      P("b", "07:00", "19:00", 1),
      P("c", "19:00", "07:00", 2, {
        days: ["lun", "mar", "mie", "jue", "vie"],
      }),
      {
        id: "s",
        type: "sacafranco",
        startTime: "07:00",
        endTime: "19:00",
        sortOrder: 3,
      },
    ]);

    expect(f.map((x) => [x.start, x.end, x.guards, x.days])).toEqual([
      ["07:00", "19:00", 2, []],
      ["19:00", "07:00", 1, ["lun", "mar", "mie", "jue", "vie"]],
    ]);
  });

  it("two people taking turns on one seat (1-1) are ONE at once", () => {
    const f = franjasDesdePlazas(
      [P("a", "07:00", "07:00", 0), P("b", "07:00", "07:00", 1)],
      () => 2,
    );

    expect(f[0].guards).toBe(1);
    expect(plazasDeFranjas(f, 2)).toHaveLength(2);
  });

  it("all seven days is the same as every day", () => {
    const f = franjasDesdePlazas([
      P("a", "07:00", "19:00", 0, {
        days: ["lun", "mar", "mie", "jue", "vie", "sab", "dom"],
      }),
    ]);

    expect(f[0].days).toEqual([]);
  });
});

describe("requisito · qué pasa al guardar", () => {
  const plazas = [
    P("d", "07:00", "19:00", 0),
    P("n", "19:00", "07:00", 1),
    P("x", "07:00", "19:00", 2),
  ];
  const ocupantes = [
    { positionId: "d", guardName: "Ana" },
    { positionId: "n", guardName: "Luis" },
  ];

  it("lowering the day window to one person drops the EMPTY plaza, nobody leaves", () => {
    const c = consecuencias(
      plazas,
      [
        { id: "1", start: "07:00", end: "19:00", guards: 1, days: [] },
        { id: "2", start: "19:00", end: "07:00", guards: 1, days: [] },
      ],
      1,
      ocupantes,
    );

    expect(c).toEqual({ salen: [], cambian: [], nuevas: 0 });
  });

  it("removing the night window says Luis leaves", () => {
    const c = consecuencias(
      plazas,
      [{ id: "1", start: "07:00", end: "19:00", guards: 2, days: [] }],
      1,
      ocupantes,
    );

    expect(c.salen).toEqual([{ nombre: "Luis", ventana: "19:00–07:00" }]);
  });

  it("changing the hours says who moves", () => {
    const c = consecuencias(
      [P("d", "07:00", "19:00", 0), P("n", "19:00", "07:00", 1)],
      [
        { id: "1", start: "06:00", end: "18:00", guards: 1, days: [] },
        { id: "2", start: "18:00", end: "06:00", guards: 1, days: [] },
      ],
      1,
      ocupantes,
    );

    expect(c.cambian).toEqual([
      { nombre: "Ana", de: "07:00–19:00", a: "06:00–18:00" },
      { nombre: "Luis", de: "19:00–07:00", a: "18:00–06:00" },
    ]);
  });

  it("a second person at once is a new empty plaza", () => {
    const c = consecuencias(
      [P("d", "07:00", "19:00", 0)],
      [{ id: "1", start: "07:00", end: "19:00", guards: 2, days: [] }],
      1,
      [{ positionId: "d", guardName: "Ana" }],
    );

    expect(c).toEqual({ salen: [], cambian: [], nuevas: 1 });
  });

  it("the body the server takes, and when nothing changed", () => {
    const f = [
      { id: "1", start: "07:00", end: "19:00", guards: 2, days: ["lun"] },
    ];

    expect(cuerpoDelRequisito(f, "rot1")).toEqual({
      franjas: [{ start: "07:00", end: "19:00", guards: 2, days: ["lun"] }],
      rotationStyleId: "rot1",
    });
    expect(mismoRequisito(f, [{ ...f[0], id: "other" }])).toBe(true);
    expect(mismoRequisito(f, [{ ...f[0], guards: 1 }])).toBe(false);
    expect(validarFranjas([{ ...f[0], guards: 21 }])).toBe("personas");
    expect(validarFranjas([])).toBe("vacio");
  });
});

describe("emparejarPlazas · espejo del servidor", () => {
  it("drops the window that was removed, not the last one", () => {
    const r = emparejarPlazas(
      [
        { id: "a", startTime: "07:00", endTime: "15:00", sortOrder: 0 },
        { id: "b", startTime: "15:00", endTime: "23:00", sortOrder: 1 },
        { id: "c", startTime: "23:00", endTime: "07:00", sortOrder: 2 },
      ],
      [
        { startTime: "15:00", endTime: "23:00" },
        { startTime: "23:00", endTime: "07:00" },
      ],
      new Set(["a", "b", "c"]),
    );

    expect(r).toEqual({ nuevas: ["b", "c"], sobrantes: ["a"] });
  });
});
