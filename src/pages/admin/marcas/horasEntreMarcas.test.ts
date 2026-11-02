import { describe, expect, it } from "vitest";

import {
  cambioDeTarifa,
  centavosDe,
  construirMatriz,
  horasSinTarifa,
  importesPorMoneda,
  periodoRapido,
  periodoValido,
  redondearHoras,
  revisarTarifa,
  tarifasPorPar,
  tarifaVigente,
  textoDeHoras,
  textoDeImporte,
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

describe("phase 5 · the money of the hours between brands", () => {
  const par = (o: any) => ({ employerBrandId: "p", siteBrandId: "b", hours: 1, people: 1, shifts: 1, ...o });

  it("amounts per currency; pairs without a rate do not add", () => {
    expect(
      importesPorMoneda([
        par({ amountCents: 22800, currency: "USD" }),
        par({ siteBrandId: "g", amountCents: 1000, currency: "USD" }),
        par({ employerBrandId: "b", siteBrandId: "p", amountCents: null, currency: null }),
        par({ siteBrandId: "x", amountCents: 500, currency: "MXN" }),
      ]),
    ).toEqual([
      { currency: "USD", cents: 23800 },
      { currency: "MXN", cents: 500 },
    ]);
    expect(horasSinTarifa([par({ unratedHours: 12 }), par({ unratedHours: 0.25 }), par({})])).toBe(12.25);
  });

  it("the matrix keeps the money of a pair", () => {
    const m = construirMatriz([par({ hours: 14, amountCents: 22800, currency: "USD", unratedHours: 0 })], ["p", "b"]);

    expect(m.celda("p", "b")?.amountCents).toBe(22800);
  });

  it("formats money in the reader's locale; null stays null", () => {
    expect(textoDeImporte(22800, "USD", "en-US")).toBe("$228.00");
    expect(textoDeImporte(null, "USD", "en-US")).toBeNull();
    expect(textoDeImporte(150, "XXQ", "en-US")).toMatch(/1\.50/);
  });

  it("typed amounts → cents (comma or dot decimals)", () => {
    expect(centavosDe("15")).toBe(1500);
    expect(centavosDe("15,5")).toBe(1550);
    expect(centavosDe("15.50")).toBe(1550);
    expect(centavosDe("1.234,56")).toBe(123456);
    expect(centavosDe("1,234.56")).toBe(123456);
    expect(centavosDe("0")).toBe(0);
    expect(centavosDe("")).toBeNull();
    expect(centavosDe("-3")).toBeNull();
    expect(centavosDe("abc")).toBeNull();
  });

  it("rates grouped by pair, newest first; the one in effect on a day", () => {
    const r = (o: any) => ({ id: o.id, employerBrandId: "p", siteBrandId: "b", rateCents: 1500, currency: "USD", effectiveFrom: "2026-10-01", ...o });
    const lista = [r({ id: "1" }), r({ id: "2", effectiveFrom: "2026-10-15", rateCents: 1800 }), r({ id: "3", employerBrandId: "b", siteBrandId: "p" })];
    const g = tarifasPorPar(lista, ["p", "b"]);

    expect(g.map((x) => [x.employerBrandId, x.tarifas.map((t) => t.id)])).toEqual([
      ["p", ["2", "1"]],
      ["b", ["3"]],
    ]);
    expect(tarifaVigente(lista, "p", "b", "2026-10-14")?.id).toBe("1");
    expect(tarifaVigente(lista, "p", "b", "2026-10-15")?.id).toBe("2");
    expect(tarifaVigente(lista, "p", "b", "2026-09-30")).toBeNull();
  });

  it("the rates form: two different companies, an amount and a date", () => {
    const f = { employerBrandId: "p", siteBrandId: "b", monto: "18,00", desde: "2026-10-15" };

    expect(revisarTarifa(f)).toBeNull();
    expect(revisarTarifa({ ...f, siteBrandId: "" })).toBe("faltanMarcas");
    expect(revisarTarifa({ ...f, siteBrandId: "p" })).toBe("mismaMarca");
    expect(revisarTarifa({ ...f, monto: "x" })).toBe("montoMalo");
    expect(revisarTarifa({ ...f, desde: "" })).toBe("fechaMala");
    expect(cambioDeTarifa({ ...f, moneda: "USD" })).toEqual({ employerBrandId: "p", siteBrandId: "b", rateCents: 1800, currency: "USD", effectiveFrom: "2026-10-15" });
  });
});
