import { describe, expect, it } from "vitest";

import { payrollAccessMode } from "./access";

describe("payslips gate · payrollAccessMode", () => {
  it("module active → full access, whatever the store says", () => {
    expect(payrollAccessMode({ entitled: true, store: null, storeLoading: true })).toBe("full");
    expect(payrollAccessMode({ entitled: true, store: { owned: true, paused: false }, storeLoading: false })).toBe("full");
  });

  it("owned but switched off → read-only (issued sheets and slips)", () => {
    expect(payrollAccessMode({ entitled: false, store: { owned: true, paused: true }, storeLoading: false })).toBe("readOnly");
  });

  it("session still says active but the server refused a full endpoint and the store says paused → read-only", () => {
    expect(
      payrollAccessMode({ entitled: true, gatedRefused: true, store: { owned: true, paused: true }, storeLoading: false }),
    ).toBe("readOnly");
  });

  it("never owned → presentation", () => {
    expect(payrollAccessMode({ entitled: false, store: { owned: false, paused: false }, storeLoading: false })).toBe("none");
    expect(payrollAccessMode({ entitled: false, store: null, storeLoading: false })).toBe("none");
  });

  it("revoked (not owned, even if a pause was left on the row) → presentation", () => {
    expect(payrollAccessMode({ entitled: false, store: { owned: false, paused: true }, storeLoading: false })).toBe("none");
  });

  it("the read-only endpoint itself answered 402 → presentation", () => {
    expect(
      payrollAccessMode({ entitled: false, readRefused: true, store: { owned: true, paused: true }, storeLoading: false }),
    ).toBe("none");
    expect(payrollAccessMode({ entitled: true, readRefused: true, store: null, storeLoading: false })).toBe("none");
  });

  it("not entitled and the store has not answered yet → loading (no flash of the presentation)", () => {
    expect(payrollAccessMode({ entitled: false, store: undefined, storeLoading: true })).toBe("loading");
  });
});
