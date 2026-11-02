import { describe, expect, it } from "vitest";

import { courseScoreProblem } from "./trainingConstants";

describe("courseScoreProblem", () => {
  it("rejects the values QA managed to save", () => {
    for (const passingScore of [70150, 250, -20, 0, 70.5]) {
      expect(courseScoreProblem({ passingScore })).not.toBeNull();
    }
    expect(courseScoreProblem({ pointsValue: -7 })).not.toBeNull();
  });

  it("accepts the bounds and missing fields", () => {
    expect(courseScoreProblem({ passingScore: 1, pointsValue: 0 })).toBeNull();
    expect(courseScoreProblem({ passingScore: 100, pointsValue: 100000 })).toBeNull();
    expect(courseScoreProblem({})).toBeNull();
  });
});
