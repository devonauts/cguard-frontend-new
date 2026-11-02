import { describe, expect, it } from "vitest";

import {
  construirMatriz,
  periodoRapido,
  periodoValido,
  redondearHoras,
  textoDeHoras,
} from "./horasEntreMarcas";

describe("quick periods from the company's today", () => {
  it("last month, also across the new year", () => {
    expect(periodoRapido("mesPasado", "2026-11-01")).toEqual({
      from: "2026-10-01",
      to: "2026-10-31",
    });
    expect(periodoRapido("mesPasado", "2027-01-15")).toEqual({
      from: "2026-12-01",
      to: "2026-12-31",
    });
    expect(periodoRapido("mesPasado", "2028-03-10")).toEqual({
      from: "2028-02-01",
      to: "2028-02-29",
    });
  });

  it("this month and the last 30 days", () => {
    expect(periodoRapido("esteMes", "2026-11-17")).toEqual({
      from: "2026-11-01",
      to: "2026-11-17",
    });
    expect(periodoRapido("ultimos30", "2026-11-30")).toEqual({
      from: "2026-11-01",
      to: "2026-11-30",
    });
  });

  it("a period is valid from ≤ to and up to a year", () => {
    expect(periodoValido("2026-10-01", "2026-10-31")).toBe(true);
    expect(periodoValido("2026-10-31", "2026-10-01")).toBe(false);
    expect(periodoValido("2025-01-01", "2026-10-01")).toBe(false);
    expect(periodoValido("", "2026-10-01")).toBe(false);
  });
});

describe("matrix employer × site brand", () => {
  const pares = [
    { employerBrandId: "B", siteBrandId: "A", hours: 10.1, people: 1, shifts: 2 },
    { employerBrandId: "A", siteBrandId: "B", hours: 7.2, people: 2, shifts: 1 },
    { employerBrandId: "A", siteBrandId: "B", hours: 0.1, people: 1, shifts: 1 },
    { employerBrandId: "A", siteBrandId: "A", hours: 100, people: 9, shifts: 30 },
  ];

  it("orders rows and columns like the brands, merges repeated pairs", () => {
    const m = construirMatriz(pares, ["A", "B"]);

    expect(m.filas).toEqual(["A", "B"]);
    expect(m.columnas).toEqual(["A", "B"]);
    expect(m.celda("A", "B")).toMatchObject({ hours: 7.3, people: 3, shifts: 2 });
    expect(m.celda("B", "B")).toBeNull();
  });

  it("totals per row, column and overall without float noise", () => {
    const m = construirMatriz(pares, ["A", "B"]);

    expect(m.totalFila("A")).toBe(107.3);
    expect(m.totalColumna("A")).toBe(110.1);
    expect(m.total).toBe(117.4);
  });

  it("unknown brands go last", () => {
    expect(construirMatriz(pares, ["B"]).filas).toEqual(["B", "A"]);
  });
});

describe("hours as text", () => {
  it("rounds and localizes; nothing is a dash", () => {
    expect(redondearHoras(7.3000000001)).toBe(7.3);
    expect(textoDeHoras(7.5, "es-EC")).toBe("7,5 h");
    expect(textoDeHoras(0, "es-EC")).toBe("—");
    expect(textoDeHoras(null, "en-US")).toBe("—");
  });
});
