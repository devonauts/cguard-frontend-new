import { describe, expect, it } from "vitest";

import { firstDepartmentId, policyBody } from "./policyBody";

describe("policyBody", () => {
  it("sends the department the way the server reads it (departmentIds)", () => {
    expect(
      policyBody(
        { title: "  Reglamento ", content: "x", departmentId: "d1", guards: [] },
        "draft",
      ),
    ).toEqual({ title: "Reglamento", content: "x", departmentIds: ["d1"], status: "draft" });
  });

  it("no department = the whole company", () => {
    expect(
      policyBody({ title: "A", content: "", guards: [] }, "published").departmentIds,
    ).toEqual([]);
  });
});

describe("firstDepartmentId", () => {
  it("reads arrays and JSON text, tolerates garbage", () => {
    expect(firstDepartmentId(["a", "b"])).toBe("a");
    expect(firstDepartmentId('["z"]')).toBe("z");
    expect(firstDepartmentId("not json")).toBeUndefined();
    expect(firstDepartmentId(null)).toBeUndefined();
  });
});
