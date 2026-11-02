import { describe, expect, it } from "vitest";

import { camposConError, primerPasoConErrores } from "./registroPasos";

describe("registro del vigilante · qué falta y en qué paso", () => {
  it("names the missing fields in form order", () => {
    expect(
      camposConError({ address: "x", gender: "x", firstName: "x", phone: "" }),
    ).toEqual(["firstName", "gender", "address"]);
  });

  it("a blank message does not count as an error", () => {
    expect(camposConError({ governmentId: " " })).toEqual([]);
  });

  it("goes back to the first step with a missing field", () => {
    expect(primerPasoConErrores({ bloodType: "x", birthPlace: "x" })).toBe(2);
    expect(primerPasoConErrores({ confirm: "x" })).toBe(3);
    expect(primerPasoConErrores({})).toBeNull();
  });
});
