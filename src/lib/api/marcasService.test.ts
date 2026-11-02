import { describe, expect, it } from "vitest";

import { codigoDeError, esSinModulo } from "./marcasService";

describe("brand refusals: the machine code wherever the server puts it", () => {
  it("reads code, reason or messageCode", () => {
    expect(codigoDeError({ data: { code: "brand_slots_exhausted" } })).toBe(
      "brand_slots_exhausted",
    );
    expect(codigoDeError({ data: { reason: "brand_has_clients" } })).toBe(
      "brand_has_clients",
    );
    expect(
      codigoDeError({ response: { data: { code: "payroll_brand_required" } } }),
    ).toBe("payroll_brand_required");
    expect(codigoDeError({ data: { messageCode: "brand_is_principal" } })).toBe(
      "brand_is_principal",
    );
  });

  it("a numeric code does not hide the reason (route gates)", () => {
    expect(codigoDeError({ data: { code: 403, reason: "marca_estructura" } })).toBe(
      "marca_estructura",
    );
  });

  it("nothing readable is null", () => {
    expect(codigoDeError(null)).toBeNull();
    expect(codigoDeError({ data: "<html>" })).toBeNull();
    expect(codigoDeError({ data: { code: 409 } })).toBeNull();
  });

  it("a 402 is the module being off", () => {
    expect(esSinModulo({ status: 402 })).toBe(true);
    expect(esSinModulo({ data: { code: "addon_required" } })).toBe(true);
    expect(esSinModulo({ status: 409, data: { code: "brand_has_clients" } })).toBe(
      false,
    );
  });
});
