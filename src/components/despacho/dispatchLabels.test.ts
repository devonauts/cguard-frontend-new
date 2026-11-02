import { describe, expect, it } from "vitest";

import { callerTypeLabel, personName } from "./dispatchLabels";

describe("callerTypeLabel", () => {
  it("names the same caller the same way whatever was stored", () => {
    expect(callerTypeLabel("guard")).toBe(callerTypeLabel("vigilante"));
    expect(callerTypeLabel("Cliente")).toBe(callerTypeLabel("client"));
    expect(callerTypeLabel("guard")).not.toBe("guard");
  });

  it("keeps values it does not know, and empty as empty", () => {
    expect(callerTypeLabel("central")).toBe("central");
    expect(callerTypeLabel(null)).toBe("");
    expect(callerTypeLabel({ name: "supervisor" })).toBe(callerTypeLabel("supervisor"));
  });
});

describe("personName", () => {
  it("reads a user relation", () => {
    expect(personName({ fullName: " Ana Pérez " })).toBe("Ana Pérez");
    expect(personName({ firstName: "Luis", lastName: "Mora" })).toBe("Luis Mora");
    expect(personName(null)).toBe("");
  });
});
