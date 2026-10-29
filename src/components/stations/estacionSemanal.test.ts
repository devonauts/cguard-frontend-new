/**
 * Station form · «Por días de la semana»: the payloads it sends.
 */
import { describe, expect, it } from "vitest";

import i18n from "../../i18n";

import {
  cuerpoDePatron,
  franjasParaGuardar,
  personasQueSeTurnan,
  rotacionDe,
  rotacionSemanal,
} from "./StationCreateForm";

const t = i18n.t.bind(i18n);

describe("station form · weekly mode", () => {
  it("weekdays → a weekly rotation named by its days", () => {
    const r = rotacionSemanal(["lun", "mar", "mie", "jue", "vie"], t)!;

    expect(r).toMatchObject({
      semanal: true,
      secuencia: "DDDDDLL",
      dayShifts: 5,
      restDays: 2,
      largo: 7,
      nombre: "Lunes a viernes",
      diasIso: ["mon", "tue", "wed", "thu", "fri"],
    });
    expect(rotacionSemanal([], t)).toBeNull();
  });

  it("creates the style with { weekly, weekdays } — nothing cyclic", () => {
    const r = rotacionSemanal(["vie", "lun", "mie"], t)!;

    expect(cuerpoDePatron(r)).toEqual({ weekly: true, weekdays: ["mon", "wed", "fri"] });
  });

  it("a cyclic rotation keeps its old body", () => {
    const r = rotacionDe({ D: 4, T: 0, N: 4, L: 2 }, ["D", "N"], false, false)!;

    expect(cuerpoDePatron(r)).toMatchObject({ dayShifts: 4, nightShifts: 4, restDays: 2, reuseIfExists: true });
    expect(cuerpoDePatron(r)).not.toHaveProperty("weekly");
  });

  it("every slot opens on the chosen weekdays; all seven = every day", () => {
    const franjas = [
      { start: "07:00", end: "15:00", guards: 1, days: [] as string[] },
      { start: "15:00", end: "23:00", guards: 0, days: ["sab"] },
    ];

    expect(franjasParaGuardar(franjas, ["vie", "lun"])).toEqual([
      { start: "07:00", end: "15:00", guards: 1, days: ["lun", "vie"] },
      { start: "15:00", end: "23:00", guards: 1, days: ["lun", "vie"] },
    ]);
    expect(franjasParaGuardar(franjas, ["lun", "mar", "mie", "jue", "vie", "sab", "dom"])[0].days).toEqual([]);
    // Not weekly: each slot keeps its own days.
    expect(franjasParaGuardar(franjas, null)[1].days).toEqual(["sab"]);
  });

  it("one guard per seat, no relief guard", () => {
    expect(personasQueSeTurnan(rotacionSemanal(["lun", "mar", "mie", "jue", "vie"], t))).toBe(1);
  });
});
