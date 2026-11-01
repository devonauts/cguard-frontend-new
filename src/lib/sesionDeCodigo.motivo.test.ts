import { describe, expect, it } from "vitest";

import { motivoDe } from "./sesionDeCodigo";

describe("why the server refuses the CRM code", () => {
  it("reads only the known reasons from a 403 body", () => {
    for (const m of [
      "review",
      "rejected",
      "suspended",
      "field",
      "customer",
      "noCompany",
    ]) {
      expect(motivoDe({ code: `codigo.${m}`, motivo: m })).toBe(m);
    }
    expect(motivoDe({ motivo: "<script>" })).toBeNull();
    expect(motivoDe({})).toBeNull();
    expect(motivoDe(null)).toBeNull();
    expect(motivoDe("review")).toBeNull();
  });
});
