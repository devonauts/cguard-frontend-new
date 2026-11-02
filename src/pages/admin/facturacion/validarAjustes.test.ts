import { describe, expect, it } from "vitest";

import { diasDeRecordatorio, validarAjustes } from "./validarAjustes";

const ok = { invoicePadding: 5, defaultTermsDays: 30, roundingMinutes: 15, lateFeeBps: 150, lateFeeGraceDays: 5 };

describe("billing settings · validarAjustes (QA 2026-11-01)", () => {
  it("valid settings pass", () => {
    expect(validarAjustes(ok, "-3, 0, 7")).toBeNull();
    expect(validarAjustes(ok, "")).toBeNull();
  });

  it("0 digits is refused on its tab instead of becoming 3 in silence", () => {
    expect(validarAjustes({ ...ok, invoicePadding: 0 }, "")).toEqual({ tipo: "rango", tab: "numeracion", campo: "invoicePadding", min: 3, max: 8 });
  });

  it("«abc» as reminders is refused instead of clearing every reminder", () => {
    expect(validarAjustes(ok, "abc")).toEqual({ tipo: "recordatorio", tab: "reglas", valor: "abc" });
    expect(validarAjustes(ok, "-3, 2.5")).toEqual({ tipo: "recordatorio", tab: "reglas", valor: "2.5" });
    expect(validarAjustes(ok, "200")).toEqual({ tipo: "recordatorio", tab: "reglas", valor: "200" });
  });

  it("more than eight distinct reminders is refused", () => {
    expect(validarAjustes(ok, "1,2,3,4,5,6,7,8,9")?.tipo).toBe("demasiadosRecordatorios");
  });

  it("a late fee over 50 % and a grace over 90 days are refused", () => {
    expect(validarAjustes({ ...ok, lateFeeBps: 6000 }, "")?.tipo).toBe("rango");
    expect(validarAjustes({ ...ok, lateFeeGraceDays: 91 }, "")).toMatchObject({ campo: "lateFeeGraceDays", tab: "reglas" });
  });

  it("reads the reminder text the person typed", () => {
    expect(diasDeRecordatorio(" -3 , 7,, ")).toEqual({ dias: [-3, 7], malo: null });
  });
});
