import { describe, expect, it } from "vitest";

import { FRANCO as F, REGLAS_POR_DEFECTO, copiar, type Plan } from "./motor";
import { contextoEnLaEmpresa, planificarPublicacion } from "./publicar";
import type { Enlace } from "./real";
import { rebasePlan, touchedBy } from "./rebase";
import { instanteEnLaEmpresa } from "../horaDeLaEmpresa";

const rep = (c: string, n: number) => Array<string>(n).fill(c);

/** Two posts, three guards: enough to merge two people's edits. */
function base(): Plan {
  return {
    franjas: {
      D: { id: "D", nombre: "Diurna", ini: 420, fin: 1140 },
      N: { id: "N", nombre: "Nocturna", ini: 1140, fin: 420 },
    },
    puestos: [
      { id: "st1", nombre: "Bravo 4", franjas: ["D", "N"], pide: { D: [1, 1, 1, 1, 1, 1, 1], N: [1, 1, 1, 1, 1, 1, 1] } },
      { id: "st2", nombre: "Bravo 9", franjas: ["D"], pide: { D: [1, 1, 1, 1, 1, 1, 1] } },
    ],
    personas: [
      { id: "a", nombre: "Ana", puesto: "st1", patron: [...rep("D", 4), ...rep(F, 4)], desfase: 0, manual: {}, ausencias: [] },
      { id: "b", nombre: "Beto", puesto: "st1", patron: [...rep("N", 4), ...rep(F, 4)], desfase: 0, manual: {}, ausencias: [] },
      { id: "c", nombre: "Carla", puesto: "st2", patron: [...rep("D", 5), ...rep(F, 2)], desfase: 0, manual: {}, ausencias: [] },
    ],
    cubre: {},
    auto: {},
    no: {},
    reglas: { ...REGLAS_POR_DEFECTO },
  };
}

describe("rebase · the draft survives changes under it", () => {
  it("what I did not touch takes the newer value; what I touched keeps mine", () => {
    const b = base();
    const mine = copiar(b);
    const theirs = copiar(b);

    mine.personas[0].desfase = 2; // I run Ana's cycle
    theirs.personas[2].desfase = 1; // someone runs Carla's

    const r = rebasePlan(b, mine, theirs);

    expect(r.plan.personas.find((p) => p.id === "a")!.desfase).toBe(2);
    expect(r.plan.personas.find((p) => p.id === "c")!.desfase).toBe(1);
    expect(r.conflicts).toEqual([]);
    expect(r.kept).toBe(1);
  });

  it("two managers covering different days of the same post do not collide", () => {
    const b = base();
    const mine = copiar(b);
    const theirs = copiar(b);

    mine.cubre["st2|D|3"] = ["a"];
    theirs.cubre["st2|D|5"] = ["b"];
    const r = rebasePlan(b, mine, theirs);

    expect(r.plan.cubre).toEqual({ "st2|D|3": ["a"], "st2|D|5": ["b"] });
    expect(r.conflicts).toEqual([]);
  });

  it("both changed the same cell or person: mine is kept and it is named", () => {
    const b = base();
    const mine = copiar(b);
    const theirs = copiar(b);

    mine.cubre["st2|D|3"] = ["a"];
    theirs.cubre["st2|D|3"] = ["b"];
    mine.personas[1].desfase = 3;
    theirs.personas[1].desfase = 5;
    const r = rebasePlan(b, mine, theirs);

    expect(r.plan.cubre["st2|D|3"]).toEqual(["a"]);
    expect(r.plan.personas.find((p) => p.id === "b")!.desfase).toBe(3);
    expect(r.conflicts).toEqual(expect.arrayContaining(["Beto", "Bravo 9 · 3"]));
  });

  it("I removed a cover they did not touch: it stays removed; they removed a guard I edited: dropped and named", () => {
    const b = base();

    b.cubre["st2|D|4"] = ["a"];
    const mine = copiar(b);
    const theirs = copiar(b);

    delete mine.cubre["st2|D|4"];
    mine.personas[2].desfase = 4;
    theirs.personas = theirs.personas.filter((p) => p.id !== "c");
    const r = rebasePlan(b, mine, theirs);

    expect(r.plan.cubre["st2|D|4"]).toBeUndefined();
    expect(r.plan.personas.map((p) => p.id)).toEqual(["a", "b"]);
    expect(r.dropped).toEqual(["Carla"]);
  });

  it("is pure: none of the three plans is modified", () => {
    const b = base();
    const mine = copiar(b);
    const theirs = copiar(b);

    mine.personas[0].desfase = 1;
    const snap = JSON.stringify([b, mine, theirs]);

    rebasePlan(b, mine, theirs);
    expect(JSON.stringify([b, mine, theirs])).toBe(snap);
  });
});

describe("touchedBy · what the server checks for someone else's changes", () => {
  it("lists the guards and stations the draft changes, nothing else", () => {
    const b = base();
    const p = copiar(b);

    p.personas[0].desfase = 1; // Ana (st1)
    p.cubre["st2|D|2"] = ["b"]; // Beto covers Bravo 9
    const people = {
      a: { guardId: "gA", stationId: "st1" },
      b: { guardId: "gB", stationId: "st1" },
      c: { guardId: "gC", stationId: "st2" },
    };

    expect(touchedBy(b, p, people)).toEqual({ guardIds: ["gA", "gB"], stationIds: ["st1", "st2"] });
    expect(touchedBy(b, copiar(b), people)).toEqual({ guardIds: [], stationIds: [] });
  });
});

describe("publish context · overnight shifts across a DST change", () => {
  const enlace: Enlace = {
    personas: { a: { guardId: "gA", stationId: "st1", assignmentId: "asA", relevo: false, rotationStyleId: null } },
    puestos: { st1: { postSiteId: "site1", scheduleType: "24h" } },
    turnos: { a: {} },
    cargadas: {},
    novedades: {},
    eventos: {},
    turnosTodos: {},
  };
  // A guard OFF on Saturday 31 Oct 2026 (day 5 from Monday 26 Oct) is put on the night: 19:00–07:00.
  function nightOn(zona: string) {
    const b = base();

    b.personas = [{ id: "a", nombre: "Ana", puesto: "st1", patron: rep(F, 7), desfase: 0, manual: {}, ausencias: [] }];
    const p = copiar(b);

    p.personas[0].manual[5] = "N";
    const ctx = contextoEnLaEmpresa("T", "2026-10-26", 0, 14, (dia, h, m) => instanteEnLaEmpresa(dia, h, m, 0, 0, zona));
    const pub = planificarPublicacion(b, p, enlace, ctx);
    const body = pub.cambios.find((c) => c.tipo === "turno")!.llamadas[0].cuerpo.data;

    return { start: body.startTime, end: body.endTime, hours: (Date.parse(body.endTime) - Date.parse(body.startTime)) / 3_600_000 };
  }

  it("Texas (America/Chicago): 19:00 CDT to 07:00 CST is 13 hours, both ends on the wall clock", () => {
    const n = nightOn("America/Chicago");

    expect(n.start).toBe("2026-11-01T00:00:00.000Z"); // 19:00 CDT (UTC-5)
    expect(n.end).toBe("2026-11-01T13:00:00.000Z"); // 07:00 CST (UTC-6)
    expect(n.hours).toBe(13);
  });

  it("Ecuador (no DST): always 12 hours", () => {
    const n = nightOn("America/Guayaquil");

    expect(n.start).toBe("2026-11-01T00:00:00.000Z");
    expect(n.end).toBe("2026-11-01T12:00:00.000Z");
    expect(n.hours).toBe(12);
  });
});
