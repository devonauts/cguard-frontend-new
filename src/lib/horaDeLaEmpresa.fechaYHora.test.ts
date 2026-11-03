/**
 * Unit tests — a visit's entry time reads the same on every screen.
 *
 * QA re-test round 3 (N15): /visitors showed the company time and the
 * station's «Registro de visitantes» tab the viewer's clock. Both now go
 * through the company time zone.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { fechaYHora } from "./horaDeLaEmpresa";
import { cacheTenantTimezone } from "../utils/tenantLocation";

const QUITO = "America/Guayaquil"; // UTC-5
const MADRID = "Europe/Madrid";

// The tests run in node: give them the browser storage the CRM keeps the
// company zone in.
beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("fechaYHora · company time zone", () => {
  const instant = "2026-11-02T05:55:14Z";

  it("formats in the company's zone, not the viewer's", () => {
    cacheTenantTimezone(QUITO);
    const shown = fechaYHora(instant, {}, "-");
    expect(shown).toBe(fechaYHora(instant, { timeZone: QUITO }, "-"));
    expect(shown).not.toBe(fechaYHora(instant, { timeZone: "UTC" }, "-"));
    // 05:55 UTC is 00:55 on the 2nd in Ecuador.
    expect(shown).toMatch(/02/);
    expect(shown).toMatch(/12:55|00:55/);
  });

  it("follows the company when it changes zone", () => {
    cacheTenantTimezone(MADRID);
    expect(fechaYHora(instant, {}, "-")).toBe(
      fechaYHora(instant, { timeZone: MADRID }, "-"),
    );
  });

  it("an empty or invalid value shows the placeholder", () => {
    expect(fechaYHora(null, {}, "-")).toBe("-");
    expect(fechaYHora("", {}, "-")).toBe("-");
    expect(fechaYHora("not a date", {}, "-")).toBe("-");
  });
});
