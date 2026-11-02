import { describe, expect, it } from "vitest";

import { fechaDePago } from "./fechaDePago";

import { soloFecha, soloFechaCivil } from "../../../lib/horaDeLaEmpresa";

describe("billing · fechaDePago (QA retest 2026-11-02)", () => {
  it("a date the office picked (UTC midnight) is that civil day, not the day before", () => {
    expect(fechaDePago("2026-11-01T00:00:00.000Z")).toBe(soloFechaCivil("2026-11-01"));
    expect(fechaDePago("2026-11-01T00:00:00Z")).toBe(soloFechaCivil("2026-11-01"));
    expect(fechaDePago(new Date("2026-10-31T00:00:00Z"))).toBe(soloFechaCivil("2026-10-31"));
    expect(fechaDePago("2026-11-01")).toBe(soloFechaCivil("2026-11-01"));
    expect(soloFechaCivil("2026-11-01")).toMatch(/01.*11.*2026/);
  });

  it("a gateway instant is read in the company day", () => {
    expect(fechaDePago("2026-11-01T02:30:00.000Z")).toBe(soloFecha("2026-11-01T02:30:00.000Z"));
  });

  it("nothing → the empty mark", () => {
    expect(fechaDePago(null)).toBe("—");
  });
});
