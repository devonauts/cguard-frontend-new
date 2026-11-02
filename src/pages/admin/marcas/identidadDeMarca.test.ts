import { describe, expect, it } from "vitest";

import {
  luminancia,
  prefijoValido,
  serieDeFactura,
  tintaSobre,
  webLegible,
  webValida,
} from "./identidadDeMarca";

describe("the series a brand's invoices carry", () => {
  it("the principal keeps the company's", () => {
    expect(serieDeFactura({ isPrincipal: true, invoicePrefix: "X", code: "AND" }, "FAC")).toBe(
      "FAC",
    );
  });

  it("its own prefix, else company prefix + code", () => {
    expect(serieDeFactura({ invoicePrefix: "BG", code: "BETA" }, "FAC")).toBe("BG");
    expect(serieDeFactura({ invoicePrefix: "", code: "BETA" }, "FAC")).toBe("FAC-BETA");
    expect(serieDeFactura({ code: null }, "FAC")).toBe("FAC");
  });
});

describe("ink on a coloured band", () => {
  it("white on dark, dark on light", () => {
    expect(tintaSobre("#0d5c63")).toBe("#ffffff");
    expect(tintaSobre("#fde047")).toBe("#0f172a");
    expect(tintaSobre("not a colour")).toBe("#ffffff");
    expect(luminancia("#ffffff")).toBeCloseTo(1);
  });
});

describe("website and prefix checks", () => {
  it("websites", () => {
    expect(webValida("")).toBe(true);
    expect(webValida("www.andina.com")).toBe(true);
    expect(webValida("https://andina.com.ec/contacto")).toBe(true);
    expect(webValida("andina")).toBe(false);
    expect(webLegible("https://andina.com/")).toBe("andina.com");
  });

  it("prefixes", () => {
    expect(prefijoValido("")).toBe(true);
    expect(prefijoValido("BG-2026")).toBe(true);
    expect(prefijoValido("BG 2026")).toBe(false);
    expect(prefijoValido("ABCDEFGHIJKLM")).toBe(false);
  });
});
