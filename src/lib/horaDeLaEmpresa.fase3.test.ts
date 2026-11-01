/**
 * Phase 3 · the screens fixed to the company clock (extend-shift input, D/N
 * letter of a real shift, «today» of the leave calendar) rely on these
 * helpers: the same instant reads the same in the company zone whatever the
 * viewer's device zone, including the night of the US clock change.
 */
import { describe, expect, it } from "vitest";
import {
  desdeInputFechaHora,
  horaDeLaEmpresa,
  paraInputFechaHora,
  diaDeLaEmpresa,
} from "./horaDeLaEmpresa";

describe("company clock · Chicago, Guayaquil, Madrid", () => {
  it("a datetime input round-trips in the company zone, across the 1 Nov 2026 change in Chicago", () => {
    // 01:30 happens twice in Chicago on 1 Nov 2026; 03:00 CST is 09:00Z.
    expect(desdeInputFechaHora("2026-11-01T03:00", "America/Chicago")).toBe("2026-11-01T09:00:00.000Z");
    expect(paraInputFechaHora("2026-11-01T09:00:00.000Z", "America/Chicago")).toBe("2026-11-01T03:00");
    // The day before, still CDT (UTC-5).
    expect(desdeInputFechaHora("2026-10-31T19:00", "America/Chicago")).toBe("2026-11-01T00:00:00.000Z");
    // Guayaquil never changes (UTC-5); Madrid went back on 25 Oct 2026 (UTC+1).
    expect(desdeInputFechaHora("2026-11-01T07:00", "America/Guayaquil")).toBe("2026-11-01T12:00:00.000Z");
    expect(desdeInputFechaHora("2026-11-01T07:00", "Europe/Madrid")).toBe("2026-11-01T06:00:00.000Z");
  });

  it("the hour that decides D or N is the company's, not the device's", () => {
    const entrada = "2026-11-02T00:30:00.000Z"; // 19:30 in Guayaquil → a night shift
    expect(Number(horaDeLaEmpresa(entrada, "America/Guayaquil").slice(0, 2))).toBe(19);
    expect(Number(horaDeLaEmpresa(entrada, "Europe/Madrid").slice(0, 2))).toBe(1);
    expect(Number(horaDeLaEmpresa(entrada, "America/Chicago").slice(0, 2))).toBe(18);
  });

  it("«today» flips at the company's midnight", () => {
    const tarde = new Date("2026-11-02T03:30:00.000Z"); // 22:30 in Guayaquil, 04:30 in Madrid
    expect(diaDeLaEmpresa(tarde, "America/Guayaquil")).toBe("2026-11-01");
    expect(diaDeLaEmpresa(tarde, "Europe/Madrid")).toBe("2026-11-02");
  });
});
