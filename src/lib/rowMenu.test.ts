import { describe, expect, it } from "vitest";

import { rowMenuOpenChange } from "./rowMenu";

/** Apply updaters in order, like React does with queued state updates. */
const run = <T,>(start: T | null, ...ups: ((c: T | null) => T | null)[]) =>
  ups.reduce<T | null>((cur, up) => up(cur), start);

describe("rowMenuOpenChange", () => {
  it("pressing another row's trigger keeps the new row open", () => {
    // Radix order for one press on row B while row A is open: B's trigger
    // reports open first, then A's outside-press handler reports A closed.
    expect(
      run("a", rowMenuOpenChange("b", true), rowMenuOpenChange("a", false)),
    ).toBe("b");
  });

  it("the old plain updater lost the new row (regression)", () => {
    const plain = (id: string, o: boolean) => () => (o ? id : null);
    expect(run("a", plain("b", true), plain("a", false))).toBeNull();
  });

  it("works in the other order too", () => {
    expect(
      run("a", rowMenuOpenChange("a", false), rowMenuOpenChange("b", true)),
    ).toBe("b");
  });

  it("closing the open row clears it", () => {
    expect(run("a", rowMenuOpenChange("a", false))).toBeNull();
  });

  it("opening from nothing", () => {
    expect(run<string>(null, rowMenuOpenChange("a", true))).toBe("a");
  });
});
