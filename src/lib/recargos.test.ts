import { describe, expect, it } from "vitest";

import { combinar, horaCon, reglaDelPar, turnoDeEjemplo } from "./recargos";

const ec = { feriadoRecargoPct: 100, descansoRecargoPct: 100, domingoRecargoPct: 0, acumulacionDeRecargos: "suma" as const };

describe("recargos · same rule as the server", () => {
  it("day pairs follow the general rule until set one by one", () => {
    expect(reglaDelPar({ acumulacionDeRecargos: "mayor" }, "feriado", "descanso")).toBe("mayor");
    expect(reglaDelPar({ acumulacionDeRecargos: "mayor", combinaciones: { feriadoDescanso: "suma" } }, "feriado", "descanso")).toBe("suma");
    expect(reglaDelPar({ acumulacionDeRecargos: "mayor" }, "nocturno", "feriado")).toBe("suma");
  });

  it("holiday on a rest day: +200 % added, +100 % the higher one", () => {
    expect(horaCon(ec, ["feriado", "descanso"])).toBe(200);
    expect(horaCon({ ...ec, combinaciones: { feriadoDescanso: "mayor" } }, ["feriado", "descanso"])).toBe(100);
  });

  it("mayor pairs group, groups add", () => {
    const p = { combinaciones: { feriadoDescanso: "mayor" as const } };

    expect(combinar(p, [{ clave: "domingo", pct: 25 }, { clave: "feriado", pct: 100 }, { clave: "descanso", pct: 50 }])).toBe(125);
  });

  it("switched-off surcharges count 0", () => {
    expect(horaCon({ ...ec, recargosActivos: { descanso: false } }, ["feriado", "descanso"])).toBe(100);
  });

  it("the 12 h example", () => {
    const r = turnoDeEjemplo({ ...ec, horasOrdinariasDia: 8, tramosExtra: [{ desdeHora: 0, recargoPct: 50 }] });

    expect(r).toMatchObject({ ordinarias: 8, extra: 4, pctOrdinaria: 200, pctExtra: 250, total: 8 * 30 + 4 * 35 });
  });

  it("Saturday: added to the night, with holiday by the general rule, off when switched off", () => {
    const nl = { sabadoRecargoPct: 35, feriadoRecargoPct: 50, nocturno: { recargoPct: 20 }, acumulacionDeRecargos: "mayor" as const };

    expect(horaCon(nl, ["nocturno", "sabado"])).toBe(55);
    expect(horaCon(nl, ["feriado", "sabado"])).toBe(50);
    expect(horaCon({ ...nl, acumulacionDeRecargos: "suma" }, ["feriado", "sabado"])).toBe(85);
    expect(horaCon({ ...nl, recargosActivos: { sabado: false } }, ["sabado"])).toBe(0);
  });
});
