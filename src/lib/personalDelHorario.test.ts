import { describe, expect, it } from "vitest";

import {
  disponibilidadDe,
  accionDePersona,
  contarPersonas,
  cubreLaVentana,
  dondeEstaEl,
  filtrarPersonas,
  normalizarPersonas,
  rotuloDeDonde,
  ventanaDePersonal,
  ventanaParaLaHoja,
  tramosDe,
  unirPersonas,
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
    // Office hours that start after these days: already scheduled, no second editor.
    expect(accionDePersona({ kind: "office", hasSchedule: false, assigned: true, nextShiftDate: "2026-11-09" })).toBeNull();
    expect(accionDePersona({ kind: "office", hasSchedule: false, assigned: true })).toBe("asignarHorario");
  });

  it("a supervisor who holds a post never gets «Asignar horario», even in a week with no shift", async () => {
    expect(accionDePersona({ kind: "supervisor", hasSchedule: false, assigned: true })).toBeNull();
    const { normalizarPersonas } = await import("./personalDelHorario");
    const [p] = normalizarPersonas({
      people: [{
        userId: "s1", name: "Ramiro Salas", kind: "supervisor", hasSchedule: false, assigned: true, days: [],
        positions: [{ id: "pos-1", name: "Aguila1" }, { id: "" }], nextShiftDate: "2026-11-02",
      }],
    });
    expect(p.positions).toEqual([{ id: "pos-1", name: "Aguila1" }]);
    expect(p.nextShiftDate).toBe("2026-11-02");
    const [q] = normalizarPersonas({ people: [{ userId: "s2", name: "X", kind: "supervisor", days: [], nextShiftDate: "lunes" }] });
    expect(q.positions).toEqual([]);
    expect(q.nextShiftDate).toBeNull();
  });

  it("the place line never repeats the same name twice", async () => {
    const { rotuloDeDonde } = await import("./personalDelHorario");
    expect(rotuloDeDonde({ stationId: "s", stationName: "Estacionamiento", postSiteId: "p", postSiteName: "Charlie 3" } as any)).toBe("Charlie 3 · Estacionamiento");
    expect(rotuloDeDonde({ stationId: "s", stationName: "Garita", postSiteId: "p", postSiteName: "garita" } as any)).toBe("garita");
  });

  it("asks only for the visible days plus a margin, and then only for what is missing", async () => {
    const { ventanaVisible, tramosQueFaltan } = await import("./personalDelHorario");
    expect(ventanaVisible("2026-11-10", "2026-11-23", "2026-09-01", "2026-11-30")).toEqual({ desde: "2026-11-03", hasta: "2026-11-30" });
    expect(ventanaVisible("2026-09-02", "2026-09-10", "2026-09-01", "2026-11-30")).toEqual({ desde: "2026-09-01", hasta: "2026-09-17" });
    const cargado = { desde: "2026-11-03", hasta: "2026-11-30" };
    expect(tramosQueFaltan(null, cargado)).toBeNull();
    expect(tramosQueFaltan(cargado, { desde: "2026-10-27", hasta: "2026-11-20" })).toEqual([{ desde: "2026-10-27", hasta: "2026-11-02" }]);
    expect(tramosQueFaltan(cargado, { desde: "2026-09-01", hasta: "2026-09-20" })).toBeNull();
    expect(tramosQueFaltan(cargado, { desde: "2026-11-05", hasta: "2026-11-25" })).toEqual([]);
  });

  it("merging chunks keeps the pending chip, the supervisor posts and the next shift date", async () => {
    const { unirPersonas } = await import("./personalDelHorario");
    const a = { userId: "s", name: "S", roles: [], kind: "supervisor" as const, hasSchedule: false, assigned: true, days: [], positions: [], nextShiftDate: null, pendingInvite: false };
    const b = { ...a, positions: [{ id: "p", name: "Aguila1" }], nextShiftDate: "2026-12-07", pendingInvite: true };
    const [m] = unirPersonas([[a], [b]]);
    expect(m.positions).toEqual([{ id: "p", name: "Aguila1" }]);
    expect(m.nextShiftDate).toBe("2026-12-07");
    expect(m.pendingInvite).toBe(true);
  });

  it("the row header: that day's place, else the guard's home, else the first place seen", async () => {
    const { normalizarPersonas, dondeEstaEl, rotuloDeDonde } = await import("./personalDelHorario");
    const [g] = normalizarPersonas({ people: [{
      userId: "g1", name: "Pedro", kind: "guard", hasSchedule: true, assigned: true,
      home: { stationId: "st-a", stationName: "Acceso principal", postSiteId: "ps-a", postSiteName: "Alfa 1" },
      days: [
        { date: "2026-10-31", status: "work", start: "07:00", end: "19:00", where: { stationId: "st-c", stationName: "Estacionamiento", postSiteId: "ps-c", postSiteName: "Charlie 3" } },
        { date: "2026-11-01", status: "off" },
      ],
    }] });
    expect(rotuloDeDonde(dondeEstaEl(g, "2026-11-01"))).toBe("Alfa 1 · Acceso principal");
    expect(rotuloDeDonde(dondeEstaEl(g, "2026-10-31"))).toBe("Charlie 3 · Estacionamiento");
    expect(rotuloDeDonde(dondeEstaEl({ ...g, home: null }, "2026-11-01"))).toBe("Charlie 3 · Estacionamiento");
  });

  it("where they are: that day, else the first place seen", () => {
    const ana = ps.find((p) => p.userId === "g1")!;

    expect(rotuloDeDonde(dondeEstaEl(ana, "2026-10-26"))).toBe("Condominio Sol · Garita Norte");
    expect(dondeEstaEl(ps.find((p) => p.userId === "o1")!, "2026-10-26")).toBeNull();
    // A supervisor is «where» his supervision position is.
    const [sup] = normalizarPersonas({
      people: [{ userId: "s9", name: "S", kind: "supervisor", days: [dia("2026-10-26", { where: { positionId: "sp1", positionName: "Ronda Norte" } })] }],
    });

    expect(rotuloDeDonde(dondeEstaEl(sup, "2026-10-26"))).toBe("Ronda Norte");
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
    // The whole painted range must be loaded (days after the first 62 were left blank).
    expect(cubreLaVentana(w, "2026-01-01", "2026-06-30")).toBe(false);
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

describe("loading a painted sheet wider than 62 days", () => {
  it("loads the whole painted window, split into accepted ranges", () => {
    const w = ventanaParaLaHoja("2026-09-01", "2026-11-30", "2026-11-30");
    expect(w).toEqual({ desde: "2026-09-01", hasta: "2026-11-30" });
    const tr = tramosDe(w.desde, w.hasta);
    expect(tr).toEqual([
      { desde: "2026-09-01", hasta: "2026-11-01" },
      { desde: "2026-11-02", hasta: "2026-11-30" },
    ]);
    expect(ventanaParaLaHoja("2026-10-25", "2026-11-05")).toEqual({ desde: "2026-10-25", hasta: "2026-12-25" });
  });
  it("joins ranges into one row per person with every day once, in order", () => {
    const a = [{ userId: "u", name: "U", roles: [], kind: "office", hasSchedule: false, assigned: true, days: [{ date: "2026-11-01", status: "off", start: null, end: null, where: null, absence: null }] }] as any;
    const b = [{ userId: "u", name: "U", roles: [], kind: "office", hasSchedule: true, assigned: true, days: [{ date: "2026-11-02", status: "work", start: "08:00", end: "17:00", where: null, absence: null }, { date: "2026-11-01", status: "off", start: null, end: null, where: null, absence: null }] }] as any;
    const [u] = unirPersonas([b, a]);
    expect(u.days.map((d: any) => d.date)).toEqual(["2026-11-01", "2026-11-02"]);
    expect(u.hasSchedule).toBe(true);
  });
});

describe("Todo el personal · invitación pendiente y puestos sin turnos", () => {
  it("reads the pending-invite mark defensively; absent = false", async () => {
    const { invitacionPendiente, normalizarPersonas } = await import("./personalDelHorario");

    expect(invitacionPendiente({})).toBe(false);
    expect(invitacionPendiente({ pendingInvite: true })).toBe(true);
    expect(invitacionPendiente({ invitation: { status: "pending" } })).toBe(true);
    expect(invitacionPendiente({ status: "invited" })).toBe(true);
    expect(invitacionPendiente({ status: "active" })).toBe(false);
    const [p] = normalizarPersonas({ people: [{ userId: "u1", name: "Ana", kind: "guard", days: [], invitePending: true }] });

    expect(p.pendingInvite).toBe(true);
  });

  it("a supervisor whose post has no shifts in the range is «sin turnos», not «libre»", async () => {
    const { normalizarPersonas, sinTurnosEnElRango } = await import("./personalDelHorario");
    const dias = (status: string) => ["2026-11-02", "2026-11-03"].map((date) => ({ date, status }));
    const [vacio, conTurno, guardia] = normalizarPersonas({
      people: [
        { userId: "s1", name: "A Sup", kind: "supervisor", assigned: true, days: dias("off") },
        { userId: "s2", name: "B Sup", kind: "supervisor", assigned: true, days: [...dias("off"), { date: "2026-11-04", status: "work" }] },
        { userId: "g1", name: "C Guard", kind: "guard", assigned: true, days: dias("off") },
      ],
    });

    expect(sinTurnosEnElRango(vacio)).toBe(true);
    expect(sinTurnosEnElRango(conTurno)).toBe(false);
    expect(sinTurnosEnElRango(guardia)).toBe(false);
  });
});

describe("disponibilidadDe — el semáforo de cada persona", () => {
  const base = {
    kind: "guard" as const,
    hasSchedule: true,
    assigned: true,
    nextShiftDate: null,
  };
  const dia = (status: "work" | "off" | "absence" | "none") => ({
    date: "2026-11-08",
    status,
    start: null,
    end: null,
    where: null,
    absence: null,
  });

  it("ámbar si le falta puesto u horario", () => {
    expect(disponibilidadDe({ ...base, assigned: false, days: [] }, "2026-11-08")).toBe("falta");
    expect(
      disponibilidadDe({ ...base, kind: "office", hasSchedule: false, days: [] }, "2026-11-08"),
    ).toBe("falta");
    expect(disponibilidadDe({ ...base, hasSchedule: false, days: [] }, "2026-11-08")).toBe("falta");
    expect(disponibilidadDe({ ...base, days: [dia("none")] }, "2026-11-08")).toBe("falta");
  });

  it("gris si ese día trabaja o está ausente", () => {
    expect(disponibilidadDe({ ...base, days: [dia("work")] }, "2026-11-08")).toBe("completo");
    expect(disponibilidadDe({ ...base, days: [dia("absence")] }, "2026-11-08")).toBe("completo");
  });

  it("verde si ese día está libre", () => {
    expect(disponibilidadDe({ ...base, days: [dia("off")] }, "2026-11-08")).toBe("disponible");
  });

  it("un supervisor con puesto y sin turnos visibles no es ámbar", () => {
    expect(
      disponibilidadDe(
        { ...base, kind: "supervisor", hasSchedule: false, days: [] },
        "2026-11-08",
      ),
    ).toBe("completo");
  });
});

describe("normalizarPersonas — el resultado de un día pasado", () => {
  it("conserva un resultado válido y descarta uno desconocido", () => {
    const [p] = normalizarPersonas({
      people: [
        {
          userId: "u1",
          name: "Ana",
          kind: "guard",
          hasSchedule: true,
          assigned: true,
          days: [
            { date: "2026-11-07", status: "work", start: "19:00", end: "07:00", resultado: "completado" },
            { date: "2026-11-08", status: "work", start: "19:00", end: "07:00", resultado: "inventado" },
          ],
        },
      ],
    });

    expect(p.days[0].resultado).toBe("completado");
    expect(p.days[1].resultado).toBeUndefined();
  });
});
