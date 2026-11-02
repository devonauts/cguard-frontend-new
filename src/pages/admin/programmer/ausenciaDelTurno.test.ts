import { describe, expect, it } from "vitest";

import { etiquetaDeAusencia, marcasPorDia } from "./ausenciaDelTurno";

describe("Estado de turnos · what an absent shift was", () => {
  it("a vacation is not a falta (QA N3)", () => {
    expect(etiquetaDeAusencia("V").key).toBe("ui.codeTones.vacaciones");
    expect(etiquetaDeAusencia("PM").key).toBe("ui.codeTones.permiso");
    expect(etiquetaDeAusencia("F").key).toBe("ui.ShiftStatus.falta");
    expect(etiquetaDeAusencia("L").key).toBe("ui.codeTones.libre");
  });

  it("without a mark it is a neutral absence", () => {
    expect(etiquetaDeAusencia(undefined).key).toBe("ui.ShiftStatus.ausente");
  });

  it("indexes marks by guard and day, the first one wins", () => {
    const m = marcasPorDia([
      { guardId: "g1", date: "2026-11-24", type: "V" },
      { guardId: "g1", date: "2026-11-24T00:00:00", type: "F" },
      { guardId: null, date: "2026-11-24", type: "F" },
    ]);

    expect(m.get("g1|2026-11-24")).toBe("V");
    expect(m.size).toBe(1);
  });
});
