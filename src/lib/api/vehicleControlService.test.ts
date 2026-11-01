import { describe, expect, it } from "vitest";
import { parseBays } from "./vehicleControlService";

describe("parseBays", () => {
  it("splits on commas and trims each bay", () => {
    expect(parseBays("QA-1, QA-2, QA-3")).toEqual(["QA-1", "QA-2", "QA-3"]);
  });

  it("drops blanks and repeats", () => {
    expect(parseBays(" A-01 ,, A-01, B-01, ")).toEqual(["A-01", "B-01"]);
  });

  it("returns an empty list for an empty field", () => {
    expect(parseBays("")).toEqual([]);
    expect(parseBays("  ,  ")).toEqual([]);
  });
});
