import { describe, expect, it } from "vitest";

import {
  accionDePersona,
  contarPersonas,
  cubreLaVentana,
  dondeEstaEl,
  filtrarPersonas,
  normalizarPersonas,
  rotuloDeDonde,
  ventanaDePersonal,
} from "./personalDelHorario";
import { plazasElegibles } from "../pages/admin/programmer/AsignarAPuestoModal";

const dia = (date: string, extra: Record<string, unknown> = {}) => ({
  date,
  status: "work",
  start: "07:00",
  end: "19:00",
  where: null,
  absence: null,
  ...extra,
});

const respuesta = {
  data: {
    startDate: "2026-10-26",
    endDate: "2026-10-27",
    people: [
      {
        userId: "g1", name: "Ana Pérez", roles: ["securityGuard"], kind: "guard", hasSchedule: true, assigned: true,
        days: [dia("2026-10-27", { where: { stationId: "st1", stationName: "Garita Norte", postSiteId: "ps1", postSiteName: "Condominio Sol" } }),
          dia("2026-10-26", { status: "off", start: null, end: null })],
      },
      { userId: "g2", name: "Beto Ruiz", roles: ["securityGuard"], kind: "guard", hasSchedule: false, assigned: false, days: [dia("2026-10-26", { status: "none" })] },
      { userId: "o1", name: "Carla Díaz", roles: ["admin"], kind: "office", hasSchedule: false, assigned: false, days: [] },
      { userId: "s1", name: "Dario Soto", roles: ["supervisor"], kind: "supervisor", hasSchedule: true, assigned: true, days: [] },
      // The same person twice (two roles): must appear once, days merged.
      { userId: "g1", name: "Ana Pérez", roles: ["securityGuard"], kind: "guard", hasSchedule: true, assigned: true, days: [dia("2026-10-28")] },
      { userId: "", name: "ghost", kind: "guard", days: [] },
      { userId: "o2", name: "Elena", kind: "weird", days: [{ date: "bad" }, { date: "2026-10-26", status: "absence", absence: "V" }] },
    ],
  },
};

describe("Todo el personal · rows", () => {
  const ps = normalizarPersonas(respuesta);

  it("everyone once, nobody without id, supervisor → office → guard", () => {
    expect(ps.map((p) => p.userId)).toEqual(["s1", "o1", "o2", "g1", "g2"]);
    expect(ps.filter((p) => p.userId === "g1")).toHaveLength(1);
  });

  it("merges and sorts days; cleans what came back odd", () => {
    const ana = ps.find((p) => p.userId === "g1")!;

    expect(ana.days.map((d) => d.date)).toEqual(["2026-10-26", "2026-10-27", "2026-10-28"]);
    const elena = ps.find((p) => p.userId === "o2")!;

    expect(elena.kind).toBe("office");
    expect(elena.days).toHaveLength(1);
    expect(elena.days[0]).toMatchObject({ status: "absence", absence: "V" });
  });

  it("counts, with «sin horario»", () => {
    expect(contarPersonas(ps)).toEqual({ total: 5, guard: 2, supervisor: 1, office: 2, sinHorario: 3 });
  });

  it("accepts a bare answer and an empty one", () => {
    expect(normalizarPersonas({ people: [{ userId: "x", name: "X", kind: "guard" }] })).toHaveLength(1);
    expect(normalizarPersonas(null)).toEqual([]);
  });
});

describe("Todo el personal · filters and actions", () => {
  const ps = normalizarPersonas(respuesta);

  it("by kind, by «sin horario», by name or place (accent-insensitive)", () => {
    expect(filtrarPersonas(ps, "guard", "").map((p) => p.userId)).toEqual(["g1", "g2"]);
    expect(filtrarPersonas(ps, "sinHorario", "").map((p) => p.userId)).toEqual(["o1", "o2", "g2"]);
    expect(filtrarPersonas(ps, "all", "perez").map((p) => p.userId)).toEqual(["g1"]);
    expect(filtrarPersonas(ps, "all", "garita").map((p) => p.userId)).toEqual(["g1"]);
  });

  it("office/supervisor without schedule → weekly editor; guard without assignment → a post", () => {
    expect(accionDePersona({ kind: "office", hasSchedule: false, assigned: false })).toBe("asignarHorario");
    expect(accionDePersona({ kind: "supervisor", hasSchedule: false, assigned: false })).toBe("asignarHorario");
    expect(accionDePersona({ kind: "guard", hasSchedule: false, assigned: false })).toBe("asignarPuesto");
    expect(accionDePersona({ kind: "guard", hasSchedule: false, assigned: true })).toBeNull();
    expect(accionDePersona({ kind: "office", hasSchedule: true, assigned: false })).toBeNull();
  });

  it("where they are: that day, else the first place seen", () => {
    const ana = ps.find((p) => p.userId === "g1")!;

    expect(rotuloDeDonde(dondeEstaEl(ana, "2026-10-26"))).toBe("Condominio Sol · Garita Norte");
    expect(dondeEstaEl(ps.find((p) => p.userId === "o1")!, "2026-10-26")).toBeNull();
  });
});

describe("Todo el personal · the range asked for", () => {
  it("never more than 62 days, never past the sheet", () => {
    expect(ventanaDePersonal("2026-01-01")).toEqual({ desde: "2026-01-01", hasta: "2026-03-03" });
    expect(ventanaDePersonal("2026-12-20", "2026-12-31")).toEqual({ desde: "2026-12-20", hasta: "2026-12-31" });
  });

  it("covered when the loaded range holds the visible one (or its first 62 days)", () => {
    const w = { desde: "2026-01-01", hasta: "2026-03-03" };

    expect(cubreLaVentana(w, "2026-01-10", "2026-02-10")).toBe(true);
    expect(cubreLaVentana(w, "2025-12-31", "2026-01-10")).toBe(false);
    expect(cubreLaVentana(w, "2026-02-20", "2026-03-10")).toBe(false);
    expect(cubreLaVentana(w, "2026-01-01", "2026-06-30")).toBe(true);
    expect(cubreLaVentana(null, "2026-01-01", "2026-01-02")).toBe(false);
  });
});

describe("Asignar a un puesto · seats", () => {
  it("vacant seats first, sacafranco and shadows aside", () => {
    const out = plazasElegibles(
      [{ id: "st1", stationName: "Garita", nickname: "P-01" }, { id: "st2", stationName: "Lobby" }],
      [
        { id: "p1", stationId: "st1", name: "Fijo 1", type: "fijo", startTime: "07:00:00", endTime: "19:00:00", guardsNeeded: 1 },
        { id: "p2", stationId: "st2", name: "Fijo 1", type: "fijo", startTime: "08:00", endTime: "17:00", guardsNeeded: 1 },
        { id: "sf", stationId: "st1", name: "SF", type: "sacafranco" },
      ],
      [
        { positionId: "p1", status: "active" },
        { positionId: "p2", status: "active", role: "shadow" },
      ],
    );

    expect(out.map((p) => [p.positionId, p.libres])).toEqual([["p2", 1], ["p1", 0]]);
    expect(out[1]).toMatchObject({ puesto: "P-01 · Garita", horas: "07:00–19:00" });
  });
});
