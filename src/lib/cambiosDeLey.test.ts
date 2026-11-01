import { describe, expect, it } from "vitest";

import { cambioDelCampo, conOmitido, eleccionDe, estadoDeLosCambios, type CambioDeLey } from "./cambiosDeLey";

const MX: CambioDeLey[] = [
  { id: "MX-2027", country: "MX", effectiveFrom: "2027-01-01", field: "horasOrdinariasSemana", from: 48, to: 46, sources: [] },
  { id: "MX-2028", country: "MX", effectiveFrom: "2028-01-01", field: "horasOrdinariasSemana", from: 46, to: 44, sources: [] },
];
const ON = { seguirCambios: true, omitidos: [] };

describe("cambios de ley en la pantalla", () => {
  it("a 48 h sigue la escalera; el próximo cambio es el de 2027", () => {
    const c = estadoDeLosCambios({ horasOrdinariasSemana: 48 }, MX, ON, "2026-11-01");
    expect(c.map((x) => x.estado)).toEqual(["seAplica", "seAplica"]);
    expect(cambioDelCampo(c, "horasOrdinariasSemana")?.id).toBe("MX-2027");
    // Once 2027 is in force, the next one shows.
    const luego = estadoDeLosCambios({ horasOrdinariasSemana: 48 }, MX, ON, "2027-02-01");
    expect(cambioDelCampo(luego, "horasOrdinariasSemana")?.id).toBe("MX-2028");
  });

  it("un valor propio se mantiene, y cambiarlo en pantalla cambia el estado al momento", () => {
    expect(estadoDeLosCambios({ horasOrdinariasSemana: 40 }, MX, ON, "2026-11-01").every((x) => x.estado === "valorPropio")).toBe(true);
    expect(cambioDelCampo(estadoDeLosCambios({ horasOrdinariasSemana: 40 }, MX, ON, "2026-11-01"), "horasOrdinariasSemana")).toBeNull();
  });

  it("apagado y omitido", () => {
    expect(estadoDeLosCambios({ horasOrdinariasSemana: 48 }, MX, { seguirCambios: false, omitidos: [] }, "2026-11-01")[0].estado).toBe("apagado");
    const omit = conOmitido(ON, "MX-2027", true);
    const c = estadoDeLosCambios({ horasOrdinariasSemana: 48 }, MX, omit, "2026-11-01");
    expect(c.map((x) => x.estado)).toEqual(["omitido", "valorPropio"]);
    expect(conOmitido(omit, "MX-2027", false).omitidos).toEqual([]);
  });

  it("la elección por defecto sigue los cambios", () => {
    expect(eleccionDe(undefined)).toEqual({ seguirCambios: true, omitidos: [] });
    expect(eleccionDe({ seguirCambios: false, omitidos: ["a", "a"] })).toEqual({ seguirCambios: false, omitidos: ["a"] });
  });
});
