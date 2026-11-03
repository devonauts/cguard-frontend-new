import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fechaCorta } from "./DocumentPacketPublicView";

import { localeActual } from "../../lib/localeActual";

const opciones = (timeZone: string): Intl.DateTimeFormatOptions => ({
  timeZone,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

// The tests run in node: the browser storage the CRM keeps the zone in.
beforeEach(() => {
  const store = new Map<string, string>();

  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("private document link · the company's clock (QA round 7)", () => {
  it("prints the server's company zone, not the zone cached by another company", () => {
    localStorage.setItem("tenantTimeZone", "Asia/Tbilisi");
    const iso = "2026-11-21T05:30:00Z"; // 23:30 on the 20th in Mexico City

    expect(fechaCorta(iso, "America/Mexico_City")).toBe(
      new Date(iso).toLocaleString(localeActual(), opciones("America/Mexico_City")),
    );
    expect(fechaCorta(iso, "America/Mexico_City")).not.toBe(
      new Date(iso).toLocaleString(localeActual(), opciones("Asia/Tbilisi")),
    );
  });

  it("an older server without a zone keeps the previous behaviour", () => {
    localStorage.setItem("tenantTimeZone", "Asia/Tbilisi");
    const iso = "2026-11-21T05:30:00Z";

    expect(fechaCorta(iso, null)).toBe(
      new Date(iso).toLocaleString(localeActual(), opciones("Asia/Tbilisi")),
    );
  });
});
