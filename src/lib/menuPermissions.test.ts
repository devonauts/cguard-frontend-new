import { describe, expect, it } from "vitest";

import menu from "../data/sidebar-menu.json";
import { makeMenuGate } from "./menuPermissions";

const gateFor = (perms: string[]) =>
  makeMenuGate((wanted) => wanted.some((p) => perms.includes(p)));

describe("makeMenuGate", () => {
  it("hides an entry whose permission the user lacks", () => {
    const allowed = gateFor(["userRead", "stationRead", "businessInfoRead"]);

    expect(allowed({ permission: ["attendanceRead"] })).toBe(false);
    expect(allowed({ permission: ["stationRead"] })).toBe(true);
  });

  it("accepts any one of several permissions", () => {
    const allowed = gateFor(["userRead", "securityGuardRead"]);

    expect(allowed({ permission: ["businessInfoRead", "securityGuardRead"] })).toBe(true);
  });

  it("keeps entries without a declared permission", () => {
    expect(gateFor(["userRead"])({})).toBe(true);
  });

  it("fails open while the permission list is not loaded", () => {
    expect(gateFor([])({ permission: ["attendanceRead"] })).toBe(true);
  });

  it("every declared permission in the menu is a non-empty id list", () => {
    for (const item of menu as any[]) {
      for (const e of [item, ...(item.subItems ?? [])]) {
        if (e.permission === undefined) continue;
        expect(Array.isArray(e.permission) && e.permission.length > 0).toBe(true);
        for (const p of e.permission) expect(p).toMatch(/^[a-z][A-Za-z]+$/);
      }
    }
  });
});
