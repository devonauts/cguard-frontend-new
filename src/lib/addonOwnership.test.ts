import { describe, expect, it } from "vitest";

import { addonOwnershipOf } from "./addonOwnership";

const store = (modules: Array<{ key: string; owned?: boolean; paused?: boolean }>) => ({ modules });

describe("add-on ownership · addonOwnershipOf", () => {
  it("owned and switched off → paused", () => {
    expect(addonOwnershipOf(store([{ key: "dobletes", owned: true, paused: true }]), "dobletes")).toEqual({
      owned: true,
      paused: true,
      loading: false,
    });
  });

  it("owned and on → owned, not paused", () => {
    expect(addonOwnershipOf(store([{ key: "dobletes", owned: true, paused: false }]), "dobletes")).toEqual({
      owned: true,
      paused: false,
      loading: false,
    });
  });

  it("not owned (never bought, or revoked with a pause left on the row) → neither", () => {
    expect(addonOwnershipOf(store([{ key: "dobletes", owned: false }]), "dobletes")).toMatchObject({
      owned: false,
      paused: false,
    });
    expect(addonOwnershipOf(store([{ key: "dobletes", owned: false, paused: true }]), "dobletes")).toMatchObject({
      owned: false,
      paused: false,
    });
  });

  it("looks only at the asked module", () => {
    const s = store([
      { key: "client_billing", owned: true, paused: true },
      { key: "dobletes", owned: false },
    ]);

    expect(addonOwnershipOf(s, "dobletes").paused).toBe(false);
    expect(addonOwnershipOf(s, "client_billing").paused).toBe(true);
  });

  it("module missing from the store, or no store at all → not owned", () => {
    expect(addonOwnershipOf(store([]), "dobletes")).toEqual({ owned: false, paused: false, loading: false });
    expect(addonOwnershipOf({ modules: null }, "dobletes").owned).toBe(false);
    expect(addonOwnershipOf(null, "dobletes")).toEqual({ owned: false, paused: false, loading: false });
  });

  it("loading only while there is no answer yet", () => {
    expect(addonOwnershipOf(undefined, "dobletes", true)).toEqual({ owned: false, paused: false, loading: true });
    expect(addonOwnershipOf(store([{ key: "dobletes", owned: true, paused: true }]), "dobletes", true).loading).toBe(
      false,
    );
  });
});
