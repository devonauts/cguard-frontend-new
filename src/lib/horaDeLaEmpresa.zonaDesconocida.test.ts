/**
 * A company zone this browser does not know (QA round 7).
 *
 * The server validates the zone with Node's tz database; an older browser
 * may not know a newer zone («America/Ciudad_Juarez», 2022: two companies in
 * production). Every helper threw a RangeError and the screen went down.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { hoyEnLaEmpresa, soloFecha, zonaDeLaEmpresa, zonaUsable } from "./horaDeLaEmpresa";
import { cacheTenantTimezone } from "../utils/tenantLocation";

beforeEach(() => {
  const store = new Map<string, string>();

  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("company zone unknown to this browser", () => {
  const dispositivo = Intl.DateTimeFormat().resolvedOptions().timeZone;

  it("falls back to the device zone instead of throwing", () => {
    cacheTenantTimezone("Mars/Olympus_Mons");
    expect(() => hoyEnLaEmpresa()).not.toThrow();
    expect(zonaDeLaEmpresa()).toBe(dispositivo);
    expect(soloFecha("2026-11-02T05:55:14Z")).toBe(
      soloFecha("2026-11-02T05:55:14Z", { timeZone: dispositivo }),
    );
  });

  it("a known zone is kept", () => {
    cacheTenantTimezone("America/Mexico_City");
    expect(zonaDeLaEmpresa()).toBe("America/Mexico_City");
    expect(zonaUsable("America/Mexico_City")).toBe(true);
    expect(zonaUsable("")).toBe(false);
  });
});

describe("getTenantTimezone · the raw reader used by the schedule screens", () => {
  it("an unknown zone reads as unset", async () => {
    const { getTenantTimezone } = await import("../utils/tenantLocation");

    cacheTenantTimezone("Mars/Olympus_Mons");
    expect(getTenantTimezone()).toBeUndefined();
    cacheTenantTimezone("America/Ciudad_Juarez");
    expect(getTenantTimezone()).toBe("America/Ciudad_Juarez");
  });
});
