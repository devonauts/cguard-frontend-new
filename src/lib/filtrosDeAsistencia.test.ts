import { describe, expect, it } from "vitest";

import {
  conFiltro,
  escribirFiltros,
  leerFiltros,
  mesDe,
  moverRango,
  paginaDe,
  periodoDe,
  semanaDe,
} from "./filtrosDeAsistencia";

describe("filtros de asistencia", () => {
  it("weeks are Monday..Sunday, months whole", () => {
    expect(semanaDe("2026-11-01")).toEqual({ from: "2026-10-26", to: "2026-11-01" });
    expect(mesDe("2026-02-10")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(periodoDe("2026-11-02", "2026-11-08")).toBe("week");
    expect(periodoDe("2026-11-01", "2026-11-30")).toBe("month");
    expect(periodoDe("2026-11-03", "2026-11-03")).toBe("day");
    expect(periodoDe("2026-11-03", "2026-11-05")).toBe("custom");
  });

  it("moves a range by its own kind", () => {
    expect(moverRango("2026-11-02", "2026-11-08", -1)).toEqual({ from: "2026-10-26", to: "2026-11-01" });
    expect(moverRango("2026-11-01", "2026-11-30", 1)).toEqual({ from: "2026-12-01", to: "2026-12-31" });
    expect(moverRango("2026-11-03", "2026-11-05", 1)).toEqual({ from: "2026-11-06", to: "2026-11-08" });
  });

  it("defaults to this company week; a notification date opens its week", () => {
    expect(leerFiltros(new URLSearchParams(), { hoy: "2026-11-04" })).toMatchObject({ from: "2026-11-02", to: "2026-11-08", page: 1, size: 50 });
    expect(leerFiltros(new URLSearchParams("date=2026-10-20"))).toMatchObject({ from: "2026-10-19", to: "2026-10-25" });
  });

  it("round-trips through the URL and keeps unrelated params", () => {
    const f = leerFiltros(new URLSearchParams("from=2026-11-01&to=2026-11-07&guard=g1&status=late&page=3&size=100&focus=x"));
    expect(f).toMatchObject({ guard: "g1", status: "late", page: 3, size: 100 });
    const sp = escribirFiltros(f, new URLSearchParams("focus=x&date=2026-01-01"));
    expect(sp.get("focus")).toBe("x");
    expect(sp.get("date")).toBeNull();
    expect(leerFiltros(sp)).toEqual(f);
  });

  it("a filter change goes back to page 1; bad input falls back", () => {
    const f = leerFiltros(new URLSearchParams("page=4&size=7&from=nope&to=2020-01-01"));
    expect(f.size).toBe(50);
    expect(f.to >= f.from).toBe(true);
    expect(conFiltro({ ...f, page: 4 }, { station: "s1" }).page).toBe(1);
    expect(paginaDe({ ...f, page: 3, size: 25 })).toEqual({ limit: 25, offset: 50 });
  });
});
